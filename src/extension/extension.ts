import * as vscode from 'vscode';
import { RefType, repositoryOf } from './git';
import {
  diffEditorInput,
  mergedInput,
  revisionInput,
  stagedInput,
  unstagedInput,
  singleFileInput,
  twoFilesInput,
  type TitledInput,
} from './inputs';
import { attachVisualizer, reportError, webviewOptions } from './panel';
import { isOntology, requireOntology } from './sources';
import { strings } from './strings';
import { SUPPORTED_EXTENSIONS } from '../core/parse/format';

export const CUSTOM_EDITOR_VIEW_TYPE = 'triples.visualizer';

/** Commands receive a Uri from editor and explorer menus, and a resource state from the SCM view. */
type CommandTarget = vscode.Uri | { readonly resourceUri: vscode.Uri } | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Triples', { log: true });
  const panels = new Map<string, vscode.WebviewPanel>();

  const show = (input: TitledInput) => {
    const existing = panels.get(input.key);
    if (existing) {
      existing.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'triples.panel',
      input.title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { ...webviewOptions(context.extensionUri), retainContextWhenHidden: true },
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    const connection = attachVisualizer(context, log, panel.webview, input);
    panels.set(input.key, panel);
    panel.onDidDispose(() => {
      connection.dispose();
      panels.delete(input.key);
    });
  };

  const command = (id: string, run: (...args: never[]) => Promise<void> | void) =>
    vscode.commands.registerCommand(id, async (...args: never[]) => {
      try {
        await run(...args);
      } catch (error) {
        reportError(log, error);
      }
    });

  context.subscriptions.push(
    log,
    command('triples.openVisualizer', (target: CommandTarget, selection?: vscode.Uri[]) => {
      if (selection && selection.length > 1) {
        selection.forEach(requireOntology);
        show(mergedInput(selection));
        return;
      }
      show(singleFileInput(ontologyTarget(target)));
    }),
    command('triples.compareWithHead', (target: CommandTarget) => {
      const uri = ontologyTarget(target);
      show(revisionInput(uri, 'HEAD', 'HEAD'));
    }),
    command('triples.compareWithRevision', async (target: CommandTarget) => {
      const uri = ontologyTarget(target);
      const ref = await pickRevision(uri);
      if (ref) show(revisionInput(uri, ref.ref, ref.label));
    }),
    command('triples.compareTwoFiles', async (target: CommandTarget, selection?: vscode.Uri[]) => {
      const files = await pickTwoFiles(target, selection);
      if (files) show(twoFilesInput(files[0], files[1]));
    }),
    command('triples.viewOntologyChanges', (target: CommandTarget) => {
      const input =
        target && !(target instanceof vscode.Uri)
          ? unstagedInput(target.resourceUri)
          : activeDiffInput();
      show(input);
    }),
    command('triples.viewStagedOntologyChanges', (target: CommandTarget) => {
      show(stagedInput(ontologyTarget(target)));
    }),
    command('triples.viewPullRequestChanges', async (fileNode: { resourceUri?: vscode.Uri }) => {
      if (fileNode.resourceUri) requireOntology(fileNode.resourceUri);
      // The GitHub Pull Requests extension knows the PR base and head; let it open its diff, then read both sides.
      await vscode.commands.executeCommand('pr.openDiffView', fileNode);
      show(activeDiffInput());
    }),
    vscode.window.registerCustomEditorProvider(
      CUSTOM_EDITOR_VIEW_TYPE,
      {
        resolveCustomTextEditor: (document, panel) => {
          const connection = attachVisualizer(
            context,
            log,
            panel.webview,
            singleFileInput(document.uri),
          );
          panel.onDidDispose(() => connection.dispose());
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
}

function ontologyTarget(target: CommandTarget): vscode.Uri {
  const uri =
    target instanceof vscode.Uri
      ? target
      : (target?.resourceUri ?? vscode.window.activeTextEditor?.document.uri);
  if (!uri) throw new Error(strings.noFile);
  requireOntology(uri);
  return uri;
}

function activeDiffInput(): TitledInput {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (
    !(input instanceof vscode.TabInputTextDiff) ||
    !(isOntology(input.original) || isOntology(input.modified))
  ) {
    throw new Error(strings.noDiffEditor);
  }
  return diffEditorInput(input.original, input.modified);
}

interface RevisionPick extends vscode.QuickPickItem {
  readonly ref: string;
}

async function pickRevision(uri: vscode.Uri): Promise<{ ref: string; label: string } | undefined> {
  const { repository } = await repositoryOf(uri);
  const [refs, commits] = await Promise.all([
    repository.getRefs({ sort: 'committerdate' }),
    repository.log({ maxEntries: 50, path: uri.fsPath }),
  ]);
  const refItems = (type: number, icon: string): RevisionPick[] =>
    refs
      .filter((ref) => ref.type === type && ref.name)
      .map((ref) => ({
        label: `$(${icon}) ${ref.name}`,
        description: ref.commit?.slice(0, 8),
        ref: ref.name as string,
      }));
  const separator = (label: string): RevisionPick => ({
    label,
    kind: vscode.QuickPickItemKind.Separator,
    ref: '',
  });
  const items: RevisionPick[] = [
    separator(strings.branches),
    ...refItems(RefType.Head, 'git-branch'),
    ...refItems(RefType.RemoteHead, 'cloud'),
    separator(strings.tags),
    ...refItems(RefType.Tag, 'tag'),
    separator(strings.commits),
    ...commits.map((commit) => ({
      label: `$(git-commit) ${commit.hash.slice(0, 8)}`,
      description: commit.message.split('\n')[0],
      detail: commit.authorDate?.toLocaleString(),
      ref: commit.hash,
    })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: strings.pickRevision,
    matchOnDescription: true,
  });
  if (!picked) return undefined;
  return { ref: picked.ref, label: picked.ref.length === 40 ? picked.ref.slice(0, 8) : picked.ref };
}

async function pickTwoFiles(
  target: CommandTarget,
  selection?: vscode.Uri[],
): Promise<[vscode.Uri, vscode.Uri] | undefined> {
  const selected =
    selection && selection.length > 1 ? selection : target instanceof vscode.Uri ? [target] : [];
  if (selected.length > 2) throw new Error(strings.needTwoFiles);
  const filters = { [strings.ontologyFiles]: SUPPORTED_EXTENSIONS };
  if (selected.length === 2) {
    selected.forEach(requireOntology);
    return [selected[0] as vscode.Uri, selected[1] as vscode.Uri];
  }
  if (selected.length === 1) {
    const current = selected[0] as vscode.Uri;
    requireOntology(current);
    const other = await vscode.window.showOpenDialog({
      title: strings.pickSecondFile,
      canSelectMany: false,
      filters,
    });
    if (!other?.[0]) return undefined;
    requireOntology(other[0]);
    return [other[0], current];
  }
  const files = await vscode.window.showOpenDialog({
    title: strings.pickTwoFiles,
    canSelectMany: true,
    filters,
  });
  if (!files) return undefined;
  if (files.length !== 2) throw new Error(strings.needTwoFiles);
  files.forEach(requireOntology);
  return [files[0] as vscode.Uri, files[1] as vscode.Uri];
}
