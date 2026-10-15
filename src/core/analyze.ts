import { diffGraphs, type DiffResult } from './diff/diff';
import { buildModel } from './model/build';
import type { OntologyModel } from './model/types';
import { bnode, type Prefixes } from './rdf';
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
  | {
      readonly kind: 'single';
      readonly language: string;
      /** Drawn together as one graph; usually one file. */
      readonly sources: readonly SourceDocument[];
    }
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
    const parsed = await Promise.all(request.sources.map(parseSource));
    const problems = parsed.flatMap((result) => ('problem' in result ? [result.problem] : []));
    if (problems.length > 0) return { kind: 'problems', problems };
    const graphs = parsed.flatMap((result) => ('graph' in result ? [result.graph] : []));
    return { kind: 'single', model: buildModel(mergeGraphs(graphs), options) };
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

/**
 * Blank node labels are local to their file, so two files can both use `_:b0` for different
 * things. Each file's blank nodes get a prefix before the triples are joined.
 */
function mergeGraphs(graphs: readonly ParsedGraph[]): ParsedGraph {
  const [only] = graphs;
  if (graphs.length === 1 && only) return only;
  const prefixes: Prefixes = {};
  const triples = graphs.flatMap((graph, index) => {
    Object.assign(prefixes, graph.prefixes);
    const local = (value: string) => bnode(`f${index}_${value}`);
    return graph.triples.map(({ subject, predicate, object }) => ({
      subject: subject.kind === 'bnode' ? local(subject.value) : subject,
      predicate,
      object: object.kind === 'bnode' ? local(object.value) : object,
    }));
  });
  return { triples, prefixes };
}
