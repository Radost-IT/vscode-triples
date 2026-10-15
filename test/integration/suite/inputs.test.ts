import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { AnalysisRequest } from '../../../src/core/analyze';
import type { HostMessage, WebviewMessage } from '../../../src/core/protocol';
import { revisionInput, singleFileInput } from '../../../src/extension/inputs';
import { attachVisualizer } from '../../../src/extension/panel';

const workspaceFolder = () => vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('/');
const fixture = (name: string) => vscode.Uri.joinPath(workspaceFolder(), name);
const scratchFile = () => fixture('refresh.tmp.ttl');

const TURTLE = (label: string) =>
  `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<http://example.org/A> rdfs:label "${label}" .\n`;

/** Stands in for a real webview, so the test can read every message the extension sends. */
function recordingWebview() {
  const received: HostMessage[] = [];
  const listeners: ((message: WebviewMessage) => void)[] = [];
  const webview = {
    options: {},
    html: '',
    cspSource: 'test',
    asWebviewUri: (uri: vscode.Uri) => uri,
    postMessage: (message: HostMessage) => {
      received.push(message);
      return Promise.resolve(true);
    },
    onDidReceiveMessage: (listener: (message: WebviewMessage) => void) => {
      listeners.push(listener);
      return { dispose: () => undefined };
    },
  };
  const send = (message: WebviewMessage) => listeners.forEach((listener) => listener(message));
  const sendReady = () => send({ type: 'ready' });
  return { webview: webview as unknown as vscode.Webview, received, send, sendReady };
}

const fakeContext = {
  extensionUri: vscode.Uri.file('/'),
  workspaceState: { get: <T>(_key: string, fallback: T) => fallback, update: async () => {} },
} as unknown as vscode.ExtensionContext;

const silentLog = { error: () => undefined } as unknown as vscode.LogOutputChannel;

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(condition(), 'condition not met within 5 seconds');
}

function sourceText(request: AnalysisRequest | undefined): string | undefined {
  return request?.kind === 'single' ? request.sources[0]?.text : undefined;
}

suite('Refresh', () => {
  let connection: vscode.Disposable | undefined;

  setup(() =>
    vscode.workspace.fs.writeFile(scratchFile(), new TextEncoder().encode(TURTLE('one'))),
  );
  teardown(async () => {
    connection?.dispose();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.workspace.fs.delete(scratchFile());
  });

  test('sends the edited text while typing, before the file is saved', async () => {
    const { webview, received, sendReady } = recordingWebview();
    connection = attachVisualizer(fakeContext, silentLog, webview, singleFileInput(scratchFile()));
    sendReady();
    await waitFor(() => received.length === 1);

    const editor = await vscode.window.showTextDocument(scratchFile());
    await editor.edit((edit) =>
      edit.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), TURTLE('two')),
    );
    await waitFor(() => sourceText(received.at(-1)?.request)?.includes('"two"') === true);
    // Closing a dirty editor would ask whether to save.
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  test('sends the new text when the file changes on disk', async () => {
    const { webview, received, sendReady } = recordingWebview();
    connection = attachVisualizer(fakeContext, silentLog, webview, singleFileInput(scratchFile()));
    sendReady();
    await waitFor(() => received.length === 1);

    const refreshed = () => sourceText(received.at(-1)?.request)?.includes('"three"') === true;
    // On macOS the file watcher needs a moment to start, so a single early write can go unseen.
    for (let attempt = 0; attempt < 5 && !refreshed(); attempt++) {
      await vscode.workspace.fs.writeFile(scratchFile(), new TextEncoder().encode(TURTLE('three')));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await waitFor(refreshed);
  });
});

suite('Go to line', () => {
  let connection: vscode.Disposable | undefined;

  teardown(async () => {
    connection?.dispose();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  const openEditors = () => vscode.window.visibleTextEditors.map((editor) => editor.document.uri);

  test('opens the shown document at the line', async () => {
    const { webview, received, send, sendReady } = recordingWebview();
    connection = attachVisualizer(
      fakeContext,
      silentLog,
      webview,
      singleFileInput(fixture('pizza.ttl')),
    );
    sendReady();
    await waitFor(() => received.length === 1);

    send({ type: 'revealLine', uri: fixture('pizza.ttl').toString(), line: 3 });
    await waitFor(() => vscode.window.activeTextEditor?.selection.active.line === 2);
  });

  test('ignores documents the view was not given', async () => {
    const { webview, received, send, sendReady } = recordingWebview();
    connection = attachVisualizer(
      fakeContext,
      silentLog,
      webview,
      singleFileInput(fixture('pizza.ttl')),
    );
    sendReady();
    await waitFor(() => received.length === 1);

    send({ type: 'revealLine', uri: fixture('people.jsonld').toString(), line: 1 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(!openEditors().some((uri) => uri.path.endsWith('people.jsonld')));
  });
});

suite('Git comparison', () => {
  suiteSetup(async () => {
    // The fixtures folder sits inside the repository, and Git does not open parent repositories on its own.
    const repositoryRoot = vscode.Uri.joinPath(workspaceFolder(), '..', '..');
    await vscode.commands.executeCommand('git.openRepository', repositoryRoot.fsPath);
  });
  teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  test('compares a committed file with HEAD', async () => {
    const request = await revisionInput(fixture('pizza.ttl'), 'HEAD', 'HEAD').load();
    assert.equal(request.kind, 'diff');
    if (request.kind !== 'diff') return;
    assert.ok(request.before && request.after, 'both sides are present');
    assert.equal(request.before.title, 'HEAD');
    assert.equal(request.before.text.length > 0, true);
  });

  test('treats a file that is not in HEAD as added', async () => {
    await vscode.workspace.fs.writeFile(scratchFile(), new TextEncoder().encode(TURTLE('new')));
    try {
      const request = await revisionInput(scratchFile(), 'HEAD', 'HEAD').load();
      assert.equal(request.kind === 'diff' && request.before, null);
    } finally {
      await vscode.workspace.fs.delete(scratchFile());
    }
  });

  test('opens the comparison with HEAD from the command', async () => {
    await vscode.window.showTextDocument(fixture('pizza.ttl'));
    await vscode.commands.executeCommand('triples.compareWithHead');
    await waitFor(() =>
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .some((tab) => tab.label === 'Triples: pizza.ttl (HEAD) ↔ pizza.ttl'),
    );
  });
});
