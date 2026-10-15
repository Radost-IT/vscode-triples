import type { Prefixes, Term } from '../../rdf';
import { OWL, RDF, RDFS, XSD } from '../../vocab';

/**
 * One OWL 2 construct, such as `SubClassOf(:A :B)`. Functional Syntax and OWL/XML use the same
 * construct names, so both parse into this tree and share one mapping to RDF.
 * Bare parenthesized groups, as in `HasKey(:C (:p) ())`, have an empty name.
 */
export interface OwlCall {
  readonly name: string;
  readonly args: readonly OwlArg[];
}

export type OwlArg = OwlCall | Term;

export interface OwlDocument {
  readonly prefixes: Prefixes;
  /** The `Ontology(...)` call: optional ontology and version IRI, imports, annotations, axioms. */
  readonly ontology: OwlCall;
}

export function isCall(arg: OwlArg | undefined): arg is OwlCall {
  return arg !== undefined && 'name' in arg;
}

/** OWL 2 declares these prefixes implicitly. */
export const DEFAULT_PREFIXES: Prefixes = { rdf: RDF, rdfs: RDFS, xsd: XSD, owl: OWL };

/** `new URL` would also normalize absolute IRIs, such as lowercasing the host, and change their identity. */
export function resolveIri(base: string, value: string): string {
  return /^[A-Za-z][\w+.-]*:/.test(value) ? value : new URL(value, base).href;
}
