export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export const OWL = 'http://www.w3.org/2002/07/owl#';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const SKOS = 'http://www.w3.org/2004/02/skos/core#';
export const DC = 'http://purl.org/dc/elements/1.1/';
export const DCTERMS = 'http://purl.org/dc/terms/';

export const WELL_KNOWN_PREFIXES: Readonly<Record<string, string>> = {
  rdf: RDF,
  rdfs: RDFS,
  owl: OWL,
  xsd: XSD,
  skos: SKOS,
  dc: DC,
  dcterms: DCTERMS,
};

export const rdf = {
  type: `${RDF}type`,
  first: `${RDF}first`,
  rest: `${RDF}rest`,
  nil: `${RDF}nil`,
  Property: `${RDF}Property`,
  langString: `${RDF}langString`,
} as const;

export const rdfs = {
  label: `${RDFS}label`,
  comment: `${RDFS}comment`,
  subClassOf: `${RDFS}subClassOf`,
  subPropertyOf: `${RDFS}subPropertyOf`,
  domain: `${RDFS}domain`,
  range: `${RDFS}range`,
  Class: `${RDFS}Class`,
  Datatype: `${RDFS}Datatype`,
  Literal: `${RDFS}Literal`,
  Resource: `${RDFS}Resource`,
  seeAlso: `${RDFS}seeAlso`,
  isDefinedBy: `${RDFS}isDefinedBy`,
} as const;

export const owl = {
  Thing: `${OWL}Thing`,
  Nothing: `${OWL}Nothing`,
  Class: `${OWL}Class`,
  Ontology: `${OWL}Ontology`,
  Restriction: `${OWL}Restriction`,
  ObjectProperty: `${OWL}ObjectProperty`,
  DatatypeProperty: `${OWL}DatatypeProperty`,
  AnnotationProperty: `${OWL}AnnotationProperty`,
  OntologyProperty: `${OWL}OntologyProperty`,
  NamedIndividual: `${OWL}NamedIndividual`,
  Axiom: `${OWL}Axiom`,
  AllDisjointClasses: `${OWL}AllDisjointClasses`,
  AllDifferent: `${OWL}AllDifferent`,
  AllDisjointProperties: `${OWL}AllDisjointProperties`,
  onProperty: `${OWL}onProperty`,
  someValuesFrom: `${OWL}someValuesFrom`,
  allValuesFrom: `${OWL}allValuesFrom`,
  hasValue: `${OWL}hasValue`,
  hasSelf: `${OWL}hasSelf`,
  cardinality: `${OWL}cardinality`,
  minCardinality: `${OWL}minCardinality`,
  maxCardinality: `${OWL}maxCardinality`,
  qualifiedCardinality: `${OWL}qualifiedCardinality`,
  minQualifiedCardinality: `${OWL}minQualifiedCardinality`,
  maxQualifiedCardinality: `${OWL}maxQualifiedCardinality`,
  onClass: `${OWL}onClass`,
  onDataRange: `${OWL}onDataRange`,
  unionOf: `${OWL}unionOf`,
  intersectionOf: `${OWL}intersectionOf`,
  complementOf: `${OWL}complementOf`,
  oneOf: `${OWL}oneOf`,
  equivalentClass: `${OWL}equivalentClass`,
  equivalentProperty: `${OWL}equivalentProperty`,
  disjointWith: `${OWL}disjointWith`,
  inverseOf: `${OWL}inverseOf`,
  sameAs: `${OWL}sameAs`,
  differentFrom: `${OWL}differentFrom`,
  propertyDisjointWith: `${OWL}propertyDisjointWith`,
  annotatedSource: `${OWL}annotatedSource`,
  members: `${OWL}members`,
  distinctMembers: `${OWL}distinctMembers`,
} as const;

export const skos = {
  prefLabel: `${SKOS}prefLabel`,
} as const;
