import { UnsupportedFormatError } from './errors';
import { detectFormat } from './format';
import { parseJsonLd } from './jsonld';
import { parseWithN3 } from './n3';
import { parseOwlFunctional } from './owl/functional';
import { parseRdfXml } from './rdfxml';
import type { ParsedGraph } from './types';

export { ParseError, UnsupportedFormatError } from './errors';
export { detectFormat, type RdfFormat } from './format';
export type { ParsedGraph } from './types';

/**
 * Parses any supported RDF serialization into plain triples. Named graphs in
 * TriG and N-Quads are merged into one graph.
 */
export async function parseRdf(
  text: string,
  fileName: string,
  baseIri: string,
): Promise<ParsedGraph> {
  const format = detectFormat(fileName, text);
  switch (format) {
    case 'rdfxml':
      return parseRdfXml(text, baseIri);
    case 'jsonld':
      return parseJsonLd(text, baseIri);
    case 'owlfunctional':
      return parseOwlFunctional(text, baseIri);
    case 'turtle':
    case 'trig':
    case 'ntriples':
    case 'nquads':
    case 'n3':
      return parseWithN3(text, format, baseIri);
    default:
      throw new UnsupportedFormatError(`Unknown format "${format satisfies never}".`);
  }
}
