import type { Prefixes, Triple } from '../rdf';

export interface ParsedGraph {
  readonly triples: Triple[];
  readonly prefixes: Prefixes;
}
