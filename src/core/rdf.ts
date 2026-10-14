export interface NamedNode {
  readonly kind: 'iri';
  readonly value: string;
}

export interface BlankNode {
  readonly kind: 'bnode';
  readonly value: string;
}

export interface Literal {
  readonly kind: 'literal';
  readonly value: string;
  readonly language: string;
  readonly datatype: string;
}

export type Term = NamedNode | BlankNode | Literal;
export type Subject = NamedNode | BlankNode;

export interface Triple {
  readonly subject: Subject;
  readonly predicate: string;
  readonly object: Term;
}

export type Prefixes = Record<string, string>;

export const iri = (value: string): NamedNode => ({ kind: 'iri', value });
export const bnode = (value: string): BlankNode => ({ kind: 'bnode', value });
export const literal = (value: string, datatype: string, language = ''): Literal => ({
  kind: 'literal',
  value,
  language,
  datatype,
});
