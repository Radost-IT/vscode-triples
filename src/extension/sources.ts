import * as vscode from 'vscode';
import type { SourceDocument } from '../core/analyze';
import { extensionOf, SUPPORTED_EXTENSIONS } from '../core/parse/format';
import { strings } from './strings';

export function baseName(uri: vscode.Uri): string {
  return uri.path.split('/').pop() ?? uri.path;
}

export function isOntology(uri: vscode.Uri): boolean {
  return SUPPORTED_EXTENSIONS.includes(extensionOf(uri.path));
}

export function requireOntology(uri: vscode.Uri): void {
  if (!isOntology(uri)) throw new Error(strings.unsupportedFile(baseName(uri)));
}

/** Reads the editor buffer when the file is open, so unsaved edits show up. */
export async function readText(uri: vscode.Uri): Promise<string> {
  const open = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString(),
  );
  if (open) return open.getText();
  if (uri.scheme === 'file' || uri.scheme === 'vscode-remote' || uri.scheme === 'untitled') {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  }
  return (await vscode.workspace.openTextDocument(uri)).getText();
}

export function sourceDocument(
  text: string,
  uri: vscode.Uri,
  title: string,
  baseIri: vscode.Uri = uri,
): SourceDocument {
  return { text, fileName: baseName(uri), uri: uri.toString(), baseIri: baseIri.toString(), title };
}

export async function readSource(uri: vscode.Uri, title = baseName(uri)): Promise<SourceDocument> {
  return sourceDocument(await readText(uri), uri, title);
}
