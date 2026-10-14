import * as vscode from 'vscode';
import type { SourceDocument } from '../core/analyze';
import { repositoryOf, showAtRef } from './git';
import type { VisualizerInput } from './panel';
import { baseName, readSource, readText, sourceDocument } from './sources';
import { strings } from './strings';

export interface TitledInput extends VisualizerInput {
  readonly title: string;
}

const language = () => vscode.env.language;

export function singleFileInput(uri: vscode.Uri): TitledInput {
  return {
    key: uri.toString(),
    title: strings.panelTitle(baseName(uri)),
    watched: [uri],
    load: async () => ({ kind: 'single', language: language(), source: await readSource(uri) }),
  };
}

/** Compares the file at a Git revision (before) with the working copy (after). */
export function revisionInput(uri: vscode.Uri, ref: string, label: string): TitledInput {
  return {
    key: `diff:${uri.toString()}`,
    title: strings.panelTitle(strings.diffTitle(`${baseName(uri)} (${label})`, baseName(uri))),
    watched: [uri],
    load: async () => {
      const { api, repository } = await repositoryOf(uri);
      const [old, current] = await Promise.all([
        showAtRef(repository, ref, uri),
        readTextIfExists(uri),
      ]);
      const before = old === null ? null : sourceDocument(old, api.toGitUri(uri, ref), label, uri);
      const after = current === null ? null : sourceDocument(current, uri, baseName(uri));
      return { kind: 'diff', language: language(), before, after };
    },
  };
}

export function twoFilesInput(before: vscode.Uri, after: vscode.Uri): TitledInput {
  return {
    key: `diff:${before.toString()}|${after.toString()}`,
    title: strings.panelTitle(strings.diffTitle(baseName(before), baseName(after))),
    watched: [before, after],
    load: async () => {
      const [oldText, newText] = await Promise.all([readText(before), readText(after)]);
      return {
        kind: 'diff',
        language: language(),
        // Relative IRIs in both files resolve against the newer file, so they compare equal.
        before: sourceDocument(oldText, before, baseName(before), after),
        after: sourceDocument(newText, after, baseName(after)),
      };
    },
  };
}

/**
 * Compares the two sides of an open diff editor, which covers Git, SCM and pull request diffs.
 * Diff providers show a missing side as an empty document, so blank text means "no file".
 */
export function diffEditorInput(original: vscode.Uri, modified: vscode.Uri): TitledInput {
  const titleOf = (uri: vscode.Uri) =>
    uri.scheme === 'file' ? baseName(uri) : `${baseName(uri)} (${uri.scheme})`;
  return {
    key: `diff:${original.toString()}|${modified.toString()}`,
    title: strings.panelTitle(strings.diffTitle(titleOf(original), titleOf(modified))),
    watched: [original, modified],
    load: async () => {
      const [before, after] = await Promise.all(
        [original, modified].map((uri) => readNonEmpty(uri, titleOf(uri), modified)),
      );
      return { kind: 'diff', language: language(), before: before ?? null, after: after ?? null };
    },
  };
}

async function readNonEmpty(
  uri: vscode.Uri,
  title: string,
  baseIri: vscode.Uri,
): Promise<SourceDocument | null> {
  const text = await readText(uri);
  return text.trim() === '' ? null : sourceDocument(text, uri, title, baseIri);
}

async function readTextIfExists(uri: vscode.Uri): Promise<string | null> {
  try {
    return await readText(uri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return null;
    throw error;
  }
}
