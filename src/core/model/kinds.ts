import { DC, DCTERMS, OWL, RDF, RDFS, XSD, owl, rdf, rdfs, skos } from '../vocab';
import type { EntityKind } from './types';

/** rdf:type objects that classify a resource instead of being drawn as a class. */
export const META_TYPES: Readonly<Record<string, EntityKind | 'ontology' | 'skip'>> = {
  [owl.Class]: 'class',
  [rdfs.Class]: 'class',
  [owl.Restriction]: 'class',
  [owl.ObjectProperty]: 'objectProperty',
  [`${OWL}TransitiveProperty`]: 'objectProperty',
  [`${OWL}SymmetricProperty`]: 'objectProperty',
  [`${OWL}AsymmetricProperty`]: 'objectProperty',
  [`${OWL}ReflexiveProperty`]: 'objectProperty',
  [`${OWL}IrreflexiveProperty`]: 'objectProperty',
  [`${OWL}InverseFunctionalProperty`]: 'objectProperty',
  [`${OWL}FunctionalProperty`]: 'property',
  [owl.DatatypeProperty]: 'datatypeProperty',
  [owl.AnnotationProperty]: 'annotationProperty',
  [owl.OntologyProperty]: 'annotationProperty',
  [rdf.Property]: 'property',
  [rdfs.Datatype]: 'datatype',
  [owl.NamedIndividual]: 'individual',
  [owl.Ontology]: 'ontology',
  [owl.Axiom]: 'skip',
  [owl.AllDisjointClasses]: 'skip',
  [owl.AllDifferent]: 'skip',
  [owl.AllDisjointProperties]: 'skip',
};

const KIND_PRIORITY: readonly EntityKind[] = [
  'class',
  'objectProperty',
  'datatypeProperty',
  'annotationProperty',
  'property',
  'datatype',
  'individual',
  'expression',
  'resource',
];

export function strongerKind(a: EntityKind | undefined, b: EntityKind): EntityKind {
  if (!a) return b;
  return KIND_PRIORITY.indexOf(a) <= KIND_PRIORITY.indexOf(b) ? a : b;
}

export const PROPERTY_KINDS: ReadonlySet<EntityKind> = new Set([
  'objectProperty',
  'datatypeProperty',
  'annotationProperty',
  'property',
]);

const BUILTIN_NAMESPACES = [RDF, RDFS, OWL, XSD];

export function isBuiltin(iri: string): boolean {
  return BUILTIN_NAMESPACES.some((namespace) => iri.startsWith(namespace));
}

export function isDatatypeIri(iri: string): boolean {
  return (
    iri.startsWith(XSD) ||
    iri === rdfs.Literal ||
    iri === rdf.langString ||
    iri === `${RDF}PlainLiteral` ||
    iri === `${RDF}XMLLiteral` ||
    iri === `${RDF}HTML` ||
    iri === `${RDF}JSON`
  );
}

const ANNOTATION_PREDICATES: ReadonlySet<string> = new Set([
  rdfs.label,
  rdfs.comment,
  rdfs.seeAlso,
  rdfs.isDefinedBy,
  `${OWL}versionInfo`,
  `${OWL}versionIRI`,
  `${OWL}priorVersion`,
  `${OWL}backwardCompatibleWith`,
  `${OWL}incompatibleWith`,
  `${OWL}deprecated`,
  `${OWL}imports`,
  skos.prefLabel,
  'http://www.w3.org/2004/02/skos/core#altLabel',
  'http://www.w3.org/2004/02/skos/core#hiddenLabel',
  'http://www.w3.org/2004/02/skos/core#definition',
  'http://www.w3.org/2004/02/skos/core#note',
  'http://www.w3.org/2004/02/skos/core#scopeNote',
  'http://www.w3.org/2004/02/skos/core#example',
  'http://www.w3.org/2004/02/skos/core#editorialNote',
  'http://www.w3.org/2004/02/skos/core#changeNote',
  'http://www.w3.org/2004/02/skos/core#historyNote',
]);

export function isWellKnownAnnotation(predicate: string): boolean {
  return (
    ANNOTATION_PREDICATES.has(predicate) ||
    predicate.startsWith(DC) ||
    predicate.startsWith(DCTERMS)
  );
}

export const LABEL_PREDICATES: readonly string[] = [rdfs.label, skos.prefLabel];
