import * as vscode from 'vscode';
import type { AnalysisRequest } from '../core/analyze';
import type { HostMessage, ViewMode, WebviewMessage } from '../core/protocol';
import { strings } from './strings';

/** What a visualizer shows and which files make it refresh. */
export interface VisualizerInput {
  /** Identifies the view in workspace state, so the Graph/Hierarchy choice is remembered per file. */
  readonly key: string;
  readonly watched: readonly vscode.Uri[];
  readonly load: () => Promise<AnalysisRequest>;
}

const REFRESH_DELAY_MS = 400;

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
      vscode.Uri.joinPath(extensionUri, 'media'),
    ],
  };
}

/** Connects a webview to an input and keeps it in sync until the webview closes. */
export function attachVisualizer(
  context: vscode.ExtensionContext,
  log: vscode.LogOutputChannel,
  webview: vscode.Webview,
  input: VisualizerInput,
): vscode.Disposable {
  webview.options = webviewOptions(context.extensionUri);
  webview.html = renderHtml(webview, context.extensionUri);

  const viewModeKey = `viewMode:${input.key}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shownSources: readonly string[] = [];

  const send = async () => {
    const request = await input.load();
    shownSources = sourceUris(request);
    const message: HostMessage = {
      type: 'analyze',
      request,
      viewMode: context.workspaceState.get<ViewMode>(viewModeKey, 'graph'),
    };
    await webview.postMessage(message);
  };
  const refresh = () => {
    send().catch((error: unknown) => reportError(log, error));
  };
  const scheduleRefresh = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, REFRESH_DELAY_MS);
  };

  const isWatched = (uri: vscode.Uri) =>
    input.watched.some((watched) => watched.toString() === uri.toString());
  const watchers = input.watched
    .filter((uri) => uri.scheme === 'file')
    .map((uri) => {
      const folder = vscode.Uri.joinPath(uri, '..');
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, uri.path.split('/').pop() ?? ''),
      );
      watcher.onDidChange(scheduleRefresh);
      watcher.onDidCreate(scheduleRefresh);
      watcher.onDidDelete(scheduleRefresh);
      return watcher;
    });

  const subscriptions: vscode.Disposable[] = [
    ...watchers,
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length > 0 && isWatched(event.document.uri)) scheduleRefresh();
    }),
    webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message.type === 'ready') {
        refresh();
        return;
      }
      handleMessage(context, message, viewModeKey, shownSources).catch((error: unknown) =>
        reportError(log, error),
      );
    }),
    { dispose: () => clearTimeout(timer) },
  ];
  return vscode.Disposable.from(...subscriptions);
}

async function handleMessage(
  context: vscode.ExtensionContext,
  message: Exclude<WebviewMessage, { type: 'ready' }>,
  viewModeKey: string,
  shownSources: readonly string[],
): Promise<void> {
  switch (message.type) {
    case 'viewMode':
      await context.workspaceState.update(viewModeKey, message.mode);
      return;
    case 'revealLine':
      // The webview renders untrusted ontology text, so it may only open the documents it was given.
      if (!shownSources.includes(message.uri)) return;
      await revealLine(vscode.Uri.parse(message.uri), message.line, message.column);
      return;
    case 'export':
      await saveExport(message.format, message.data, message.suggestedName);
      return;
  }
}

function sourceUris(request: AnalysisRequest): string[] {
  const sources = request.kind === 'single' ? [request.source] : [request.before, request.after];
  return sources.flatMap((source) => (source ? [source.uri] : []));
}

async function revealLine(uri: vscode.Uri, line: number, column = 1): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const position = document.validatePosition(
    new vscode.Position(Math.max(line - 1, 0), Math.max(column - 1, 0)),
  );
  const visible = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.toString() === uri.toString(),
  );
  await vscode.window.showTextDocument(document, {
    viewColumn: visible?.viewColumn ?? vscode.ViewColumn.One,
    selection: new vscode.Range(position, position),
  });
}

async function saveExport(
  format: 'svg' | 'png',
  data: string,
  suggestedName: string,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const target = await vscode.window.showSaveDialog({
    title: strings.exportTitle,
    defaultUri: folder ? vscode.Uri.joinPath(folder, suggestedName) : undefined,
    filters: format === 'svg' ? { SVG: ['svg'] } : { PNG: ['png'] },
  });
  if (!target) return;
  const bytes =
    format === 'svg'
      ? new TextEncoder().encode(data)
      : Uint8Array.from(atob(data.replace(/^data:[^,]*,/, '')), (char) => char.charCodeAt(0));
  await vscode.workspace.fs.writeFile(target, bytes);
  void vscode.window.showInformationMessage(
    strings.exported(vscode.workspace.asRelativePath(target)),
  );
}

export function reportError(log: vscode.LogOutputChannel, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  log.error(error instanceof Error ? error : message);
  void vscode.window.showErrorMessage(strings.commandFailed(message));
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = createNonce();
  const resource = (...path: string[]) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...path)).toString();
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src ${webview.cspSource} 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
    `connect-src ${webview.cspSource}`,
    'worker-src blob:',
  ].join('; ');
  // Cytoscape adds this stylesheet itself unless it already exists; shipping it with a nonce keeps style-src strict.
  return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}" id="__________cytoscape_stylesheet">.__________cytoscape_container { position: relative; }</style>
<link rel="stylesheet" href="${resource('media', 'webview.css')}">
</head>
<body data-worker-uri="${resource('dist', 'webview', 'worker.js')}">
<script type="application/json" id="l10n">${webviewBundle()}</script>
<script nonce="${nonce}" src="${resource('dist', 'webview', 'main.js')}"></script>
</body>
</html>`;
}

/** The webview has no `vscode.l10n`, so it gets the loaded translations as data. `<` is escaped so the JSON cannot close the tag. */
function webviewBundle(): string {
  return JSON.stringify(vscode.l10n.bundle ?? {}).replace(/</g, '\\u003c');
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
