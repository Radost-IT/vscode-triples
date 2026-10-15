import * as vscode from 'vscode';
import { strings } from './strings';

/** The part of the built-in Git extension API (version 1) that Triples uses. */
interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

interface GitApi {
  readonly state: 'uninitialized' | 'initialized';
  getRepository(uri: vscode.Uri): Repository | null;
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

export const RefType = { Head: 0, RemoteHead: 1, Tag: 2 } as const;

export interface Ref {
  readonly type: (typeof RefType)[keyof typeof RefType];
  readonly name?: string;
  readonly commit?: string;
}

export interface Commit {
  readonly hash: string;
  readonly message: string;
  readonly authorDate?: Date;
}

export interface Repository {
  readonly rootUri: vscode.Uri;
  show(ref: string, path: string): Promise<string>;
  getRefs(query: { pattern?: string; sort?: 'alphabetically' | 'committerdate' }): Promise<Ref[]>;
  log(options: { maxEntries?: number; path?: string }): Promise<Commit[]>;
}

export async function gitApi(): Promise<GitApi> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) throw new Error(strings.gitUnavailable);
  const exports = extension.isActive ? extension.exports : await extension.activate();
  if (!exports.enabled) throw new Error(strings.gitUnavailable);
  return exports.getAPI(1);
}

export async function repositoryOf(
  uri: vscode.Uri,
): Promise<{ api: GitApi; repository: Repository }> {
  const api = await gitApi();
  const repository = api.getRepository(uri);
  if (!repository) throw new Error(strings.notInRepository(vscode.workspace.asRelativePath(uri)));
  return { api, repository };
}

/** Returns null when the file does not exist at that revision, such as a file added after it. */
export async function showAtRef(
  repository: Repository,
  ref: string,
  uri: vscode.Uri,
): Promise<string | null> {
  try {
    return await repository.show(ref, uri.fsPath);
  } catch (error) {
    if (isMissingAtRef(error)) return null;
    throw error;
  }
}

function isMissingAtRef(error: unknown): boolean {
  const stderr = (error as { stderr?: unknown }).stderr;
  return typeof stderr === 'string' && /does not exist|exists on disk, but not in/.test(stderr);
}
