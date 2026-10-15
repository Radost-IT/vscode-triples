import * as vscode from 'vscode';

export const strings = {
  panelTitle: (name: string) => vscode.l10n.t('Triples: {0}', name),
  diffTitle: (before: string, after: string) => vscode.l10n.t('{0} ↔ {1}', before, after),
  missingSide: vscode.l10n.t('(none)'),
  staged: vscode.l10n.t('Staged'),
  noFile: vscode.l10n.t('Open an ontology file first.'),
  unsupportedFile: (name: string) =>
    vscode.l10n.t(
      'Triples cannot open {0}. Supported extensions: {1}.',
      name,
      '.ttl, .owl, .rdf, .nt, .nq, .n3, .trig, .jsonld, .ofn, .owx',
    ),
  gitUnavailable: vscode.l10n.t('The built-in Git extension is disabled or not ready.'),
  notInRepository: (name: string) => vscode.l10n.t('{0} is not inside a Git repository.', name),
  pickRevision: vscode.l10n.t('Compare with a branch, tag or commit'),
  branches: vscode.l10n.t('Branches'),
  tags: vscode.l10n.t('Tags'),
  commits: vscode.l10n.t('Recent commits of this file'),
  pickSecondFile: vscode.l10n.t('Select the ontology to compare with'),
  pickTwoFiles: vscode.l10n.t('Select two ontologies to compare'),
  needTwoFiles: vscode.l10n.t('Select exactly two ontology files.'),
  ontologyFiles: vscode.l10n.t('Ontologies'),
  noDiffEditor: vscode.l10n.t('Open a diff of an ontology file first.'),
  exportTitle: vscode.l10n.t('Export view'),
  exported: (name: string) => vscode.l10n.t('Saved {0}.', name),
  commandFailed: (message: string) => vscode.l10n.t('Triples: {0}', message),
};
