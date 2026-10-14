import type { Prefixes } from '../rdf';

export const ENTITY_KINDS = [
  'class',
  'objectProperty',
  'datatypeProperty',
  'annotationProperty',
  'property',
  'individual',
  'datatype',
  'expression',
  'resource',
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface LiteralFact {
  readonly predicate: string;
  readonly predicateLabel: string;
  readonly value: string;
  readonly language: string;
  readonly datatype: string;
  readonly isAnnotation: boolean;
}

export interface Entity {
  /** The IRI for named resources, `_:<structural hash>` for blank nodes. */
  readonly id: string;
  readonly iri: string | null;
  readonly kind: EntityKind;
  readonly label: string;
  /** Compact name such as `foaf:Person`, or the expression text for blank nodes. */
  readonly displayName: string;
  readonly namespace: string;
  readonly builtin: boolean;
  /** True when the file only mentions the resource and says nothing about it. */
  readonly referencedOnly: boolean;
  readonly literals: LiteralFact[];
}

export const EDGE_KINDS = [
  'subClassOf',
  'subPropertyOf',
  'type',
  'domain',
  'range',
  'restriction',
  'equivalent',
  'disjoint',
  'inverse',
  'member',
  'relation',
  'annotation',
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export interface Edge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** IRI of the predicate, or of the restricted property for restriction edges. */
  readonly predicate: string;
  readonly label: string;
  readonly kind: EdgeKind;
}

export interface OntologyHeader {
  readonly iri: string;
  readonly label: string;
  readonly literals: LiteralFact[];
}

export interface OntologyModel {
  readonly entities: Record<string, Entity>;
  readonly edges: Edge[];
  readonly prefixes: Prefixes;
  readonly ontology: OntologyHeader | null;
  readonly tripleCount: number;
}
