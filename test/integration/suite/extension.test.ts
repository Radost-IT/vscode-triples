import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const fixture = (name: string) =>
  vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('/'), name);

function webviewTabLabels(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview || tab.input instanceof vscode.TabInputCustom,
    )
    .map((tab) => tab.label);
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(condition(), 'condition not met within 5 seconds');
}

suite('Triples extension', () => {
  teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  test('activates and registers its commands', async () => {
    await vscode.extensions.getExtension('radost-it.triples')?.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'openVisualizer',
      'compareWithHead',
      'compareWithRevision',
      'compareTwoFiles',
      'viewOntologyChanges',
    ]) {
      assert.ok(commands.includes(`triples.${id}`), `missing triples.${id}`);
    }
  });

  test('opens the visualizer beside a Turtle file', async () => {
    await vscode.window.showTextDocument(fixture('pizza.ttl'));
    await vscode.commands.executeCommand('triples.openVisualizer');
    await waitFor(() => webviewTabLabels().includes('Triples: pizza.ttl'));
  });

  test('opens a comparison of two files', async () => {
    await vscode.commands.executeCommand('triples.compareTwoFiles', undefined, [
      fixture('diff/entities/before.ttl'),
      fixture('diff/entities/after.ttl'),
    ]);
    await waitFor(() => webviewTabLabels().includes('Triples: before.ttl ↔ after.ttl'));
  });

  test('offers the visualizer as a custom editor', async () => {
    await vscode.commands.executeCommand(
      'vscode.openWith',
      fixture('pizza.owl'),
      'triples.visualizer',
    );
    await waitFor(() => webviewTabLabels().includes('pizza.owl'));
  });
});
