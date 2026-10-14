import { diffGraphs, type DiffResult } from './diff/diff';
import { buildModel } from './model/build';
import type { OntologyModel } from './model/types';
import { ParseError, UnsupportedFormatError, parseRdf, type ParsedGraph } from './parse';

export interface SourceDocument {
  readonly text: string;
  readonly fileName: string;
  /** Where the text came from; "go to line" opens this. */
  readonly uri: string;
  /** Resolves relative IRIs. Both sides of a diff share one, so relative IRIs compare equal. */
  readonly baseIri: string;
  /** Short name shown to the user, such as "HEAD" or "pizza.ttl". */
  readonly title: string;
}

export type AnalysisRequest =
  | { readonly kind: 'single'; readonly language: string; readonly source: SourceDocument }
  | {
      readonly kind: 'diff';
      readonly language: string;
      readonly before: SourceDocument | null;
      readonly after: SourceDocument | null;
    };

export interface SourceProblem {
  readonly title: string;
  readonly uri: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export type AnalysisResult =
  | { readonly kind: 'single'; readonly model: OntologyModel }
  | { readonly kind: 'diff'; readonly diff: DiffResult }
  | { readonly kind: 'problems'; readonly problems: SourceProblem[] };

type Parsed = { readonly graph: ParsedGraph } | { readonly problem: SourceProblem };

async function parseSource(source: SourceDocument): Promise<Parsed> {
  try {
    return { graph: await parseRdf(source.text, source.fileName, source.baseIri) };
  } catch (error) {
    if (!(error instanceof ParseError || error instanceof UnsupportedFormatError)) throw error;
    const position = error instanceof ParseError ? { line: error.line, column: error.column } : {};
    return {
      problem: { title: source.title, uri: source.uri, message: error.message, ...position },
    };
  }
}

export async function analyze(request: AnalysisRequest): Promise<AnalysisResult> {
  const options = { language: request.language };
  if (request.kind === 'single') {
    const parsed = await parseSource(request.source);
    if ('problem' in parsed) return { kind: 'problems', problems: [parsed.problem] };
    return { kind: 'single', model: buildModel(parsed.graph, options) };
  }
  const [before, after] = await Promise.all(
    [request.before, request.after].map((source) => (source ? parseSource(source) : null)),
  );
  const problems = [before, after].flatMap((parsed) =>
    parsed && 'problem' in parsed ? [parsed.problem] : [],
  );
  if (problems.length > 0) return { kind: 'problems', problems };
  const graphOf = (parsed: Parsed | null | undefined) =>
    parsed && 'graph' in parsed ? parsed.graph : null;
  return { kind: 'diff', diff: diffGraphs(graphOf(before), graphOf(after), options) };
}
