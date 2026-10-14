import { Parser } from 'n3';
import type { Prefixes, Triple } from '../rdf';
import { ParseError } from './errors';
import type { RdfFormat } from './format';
import { fromRdfJsQuad } from './rdfjs';
import type { ParsedGraph } from './types';

const N3_FORMAT_NAMES: Partial<Record<RdfFormat, string>> = {
  turtle: 'Turtle',
  trig: 'TriG',
  ntriples: 'N-Triples',
  nquads: 'N-Quads',
  n3: 'N3',
};

export function parseWithN3(text: string, format: RdfFormat, baseIri: string): ParsedGraph {
  const parser = new Parser({ format: N3_FORMAT_NAMES[format], baseIRI: baseIri });
  const prefixes: Prefixes = {};
  let quads;
  try {
    quads = parser.parse(text, null, (prefix, namespace) => {
      prefixes[prefix] = namespace.value;
    });
  } catch (error) {
    throw toParseError(error);
  }
  const triples: Triple[] = [];
  for (const quad of quads) {
    const triple = fromRdfJsQuad(quad);
    if (triple) triples.push(triple);
  }
  return { triples, prefixes };
}

function toParseError(error: unknown): ParseError {
  if (!(error instanceof Error)) {
    return new ParseError(String(error));
  }
  const context = (error as { context?: { line?: unknown } }).context;
  const line =
    typeof context?.line === 'number'
      ? context.line
      : Number(/on line (\d+)/.exec(error.message)?.[1]);
  return new ParseError(error.message, Number.isFinite(line) ? line : undefined);
}
