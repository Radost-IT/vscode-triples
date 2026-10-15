import { bnode, iri, literal, type Subject, type Term, type Triple } from '../../rdf';
import { OWL, XSD, owl, rdf, rdfs } from '../../vocab';
import { ParseError } from '../errors';
import type { ParsedGraph } from '../types';
import { isCall, type OwlArg, type OwlCall, type OwlDocument } from './tree';

const ENTITY_TYPES: Readonly<Record<string, string>> = {
  Class: owl.Class,
  Datatype: rdfs.Datatype,
  ObjectProperty: owl.ObjectProperty,
  DataProperty: owl.DatatypeProperty,
  AnnotationProperty: owl.AnnotationProperty,
  NamedIndividual: owl.NamedIndividual,
};

const CHARACTERISTICS: Readonly<Record<string, string>> = {
  FunctionalObjectProperty: `${OWL}FunctionalProperty`,
  FunctionalDataProperty: `${OWL}FunctionalProperty`,
  InverseFunctionalObjectProperty: `${OWL}InverseFunctionalProperty`,
  ReflexiveObjectProperty: `${OWL}ReflexiveProperty`,
  IrreflexiveObjectProperty: `${OWL}IrreflexiveProperty`,
  SymmetricObjectProperty: `${OWL}SymmetricProperty`,
  AsymmetricObjectProperty: `${OWL}AsymmetricProperty`,
  TransitiveObjectProperty: `${OWL}TransitiveProperty`,
};

const BOOLEAN_CLASSES: Readonly<Record<string, [type: string, predicate: string]>> = {
  ObjectIntersectionOf: [owl.Class, owl.intersectionOf],
  ObjectUnionOf: [owl.Class, owl.unionOf],
  ObjectOneOf: [owl.Class, owl.oneOf],
  DataIntersectionOf: [rdfs.Datatype, owl.intersectionOf],
  DataUnionOf: [rdfs.Datatype, owl.unionOf],
  DataOneOf: [rdfs.Datatype, owl.oneOf],
};

const VALUE_RESTRICTIONS: Readonly<Record<string, string>> = {
  ObjectSomeValuesFrom: owl.someValuesFrom,
  DataSomeValuesFrom: owl.someValuesFrom,
  ObjectAllValuesFrom: owl.allValuesFrom,
  DataAllValuesFrom: owl.allValuesFrom,
  ObjectHasValue: owl.hasValue,
  DataHasValue: owl.hasValue,
};

const CARDINALITIES: Readonly<Record<string, [plain: string, qualified: string]>> = {
  ObjectMinCardinality: [owl.minCardinality, owl.minQualifiedCardinality],
  DataMinCardinality: [owl.minCardinality, owl.minQualifiedCardinality],
  ObjectMaxCardinality: [owl.maxCardinality, owl.maxQualifiedCardinality],
  DataMaxCardinality: [owl.maxCardinality, owl.maxQualifiedCardinality],
  ObjectExactCardinality: [owl.cardinality, owl.qualifiedCardinality],
  DataExactCardinality: [owl.cardinality, owl.qualifiedCardinality],
};

const EQUIVALENCES: Readonly<Record<string, string>> = {
  EquivalentClasses: owl.equivalentClass,
  EquivalentObjectProperties: owl.equivalentProperty,
  EquivalentDataProperties: owl.equivalentProperty,
  SameIndividual: owl.sameAs,
};

const DISJOINTNESS: Readonly<Record<string, [pair: string, all: string, members: string]>> = {
  DisjointClasses: [owl.disjointWith, owl.AllDisjointClasses, owl.members],
  DisjointObjectProperties: [owl.propertyDisjointWith, owl.AllDisjointProperties, owl.members],
  DisjointDataProperties: [owl.propertyDisjointWith, owl.AllDisjointProperties, owl.members],
  DifferentIndividuals: [owl.differentFrom, owl.AllDifferent, owl.distinctMembers],
};

const BINARY_AXIOMS: Readonly<Record<string, string>> = {
  SubClassOf: rdfs.subClassOf,
  SubDataPropertyOf: rdfs.subPropertyOf,
  SubAnnotationPropertyOf: rdfs.subPropertyOf,
  InverseObjectProperties: owl.inverseOf,
  ObjectPropertyDomain: rdfs.domain,
  DataPropertyDomain: rdfs.domain,
  AnnotationPropertyDomain: rdfs.domain,
  ObjectPropertyRange: rdfs.range,
  DataPropertyRange: rdfs.range,
  AnnotationPropertyRange: rdfs.range,
  DatatypeDefinition: owl.equivalentClass,
};

/**
 * Turns an OWL 2 document into RDF triples following the W3C "OWL 2 Mapping to RDF Graphs",
 * so Functional Syntax, OWL/XML and Manchester files look the same as their Turtle version.
 * Axioms with no RDF mapping in the views, such as SWRL rules, are skipped.
 */
export function owlToTriples(document: OwlDocument): ParsedGraph {
  return { triples: new OwlMapper().map(document.ontology), prefixes: document.prefixes };
}

class OwlMapper {
  private readonly triples: Triple[] = [];
  private blankCount = 0;

  map(ontology: OwlCall): Triple[] {
    const [ontologyIri, versionIri] = ontology.args.filter((arg): arg is Term => !isCall(arg));
    const subject = ontologyIri?.kind === 'iri' ? ontologyIri : this.fresh();
    this.add(subject, rdf.type, iri(owl.Ontology));
    if (versionIri) this.add(subject, `${OWL}versionIRI`, versionIri);
    for (const arg of ontology.args) {
      if (!isCall(arg)) continue;
      if (arg.name === 'Import') this.add(subject, `${OWL}imports`, this.term(arg.args[0]));
      else if (arg.name === 'Annotation') this.annotate(subject, arg);
      else this.axiom(arg);
    }
    return this.triples;
  }

  private axiom(call: OwlCall): void {
    const annotations = call.args.filter((arg) => isCall(arg) && arg.name === 'Annotation');
    const args = call.args.filter((arg) => !annotations.includes(arg));
    for (const main of this.axiomTriples(call.name, args)) {
      if (annotations.length === 0) continue;
      const axiom = this.reify(main);
      for (const annotation of annotations) this.annotate(axiom, annotation as OwlCall);
    }
  }

  /** Returns the triples that axiom annotations attach to. */
  private axiomTriples(name: string, args: readonly OwlArg[]): Triple[] {
    const [first, second, third] = args;
    if (name === 'Declaration' && isCall(first)) {
      return [this.add(this.subject(first), rdf.type, iri(this.entityType(first)))];
    }
    const binary = BINARY_AXIOMS[name];
    if (binary) return [this.add(this.subject(first), binary, this.term(second))];
    const characteristic = CHARACTERISTICS[name];
    if (characteristic) return [this.add(this.subject(first), rdf.type, iri(characteristic))];
    const equivalence = EQUIVALENCES[name];
    if (equivalence) {
      return args
        .slice(1)
        .map((arg, index) => this.add(this.subject(args[index]), equivalence, this.term(arg)));
    }
    const disjointness = DISJOINTNESS[name];
    if (disjointness) return [this.disjoint(args, ...disjointness)];
    switch (name) {
      case 'SubObjectPropertyOf':
        return isCall(first) && first.name === 'ObjectPropertyChain'
          ? [this.add(this.subject(second), `${OWL}propertyChainAxiom`, this.list(first.args))]
          : [this.add(this.subject(first), rdfs.subPropertyOf, this.term(second))];
      case 'DisjointUnion':
        return [this.add(this.subject(first), `${OWL}disjointUnionOf`, this.list(args.slice(1)))];
      case 'HasKey':
        return [
          this.add(
            this.subject(first),
            `${OWL}hasKey`,
            this.list(
              args.slice(1).flatMap((arg) => (isCall(arg) && !arg.name ? arg.args : [arg])),
            ),
          ),
        ];
      case 'ClassAssertion':
        return [this.add(this.subject(second), rdf.type, this.term(first))];
      case 'ObjectPropertyAssertion':
        return isCall(first) && first.name === 'ObjectInverseOf'
          ? [this.add(this.subject(third), this.predicate(first.args[0]), this.term(second))]
          : [this.add(this.subject(second), this.predicate(first), this.term(third))];
      case 'DataPropertyAssertion':
      case 'AnnotationAssertion':
        return [this.add(this.subject(second), this.predicate(first), this.term(third))];
      case 'NegativeObjectPropertyAssertion':
      case 'NegativeDataPropertyAssertion':
        return [this.negativeAssertion(name, args)];
      default:
        return [];
    }
  }

  private expression(call: OwlCall): Subject {
    const node = this.fresh();
    const [first, second, third] = call.args;
    const booleanClass = BOOLEAN_CLASSES[call.name];
    if (booleanClass) {
      this.add(node, rdf.type, iri(booleanClass[0]));
      this.add(node, booleanClass[1], this.list(call.args));
      return node;
    }
    const valueRestriction = VALUE_RESTRICTIONS[call.name];
    if (valueRestriction) {
      this.add(node, rdf.type, iri(owl.Restriction));
      if (call.args.length > 2) {
        this.add(node, `${OWL}onProperties`, this.list(call.args.slice(0, -1)));
      } else {
        this.add(node, owl.onProperty, this.term(first));
      }
      this.add(node, valueRestriction, this.term(call.args[call.args.length - 1]));
      return node;
    }
    const cardinality = CARDINALITIES[call.name];
    if (cardinality) {
      this.add(node, rdf.type, iri(owl.Restriction));
      this.add(node, owl.onProperty, this.term(second));
      const count = this.term(first);
      const number = literal(count.value, `${XSD}nonNegativeInteger`);
      if (!third) {
        this.add(node, cardinality[0], number);
        return node;
      }
      this.add(node, cardinality[1], number);
      const onFiller = call.name.startsWith('Object') ? owl.onClass : owl.onDataRange;
      this.add(node, onFiller, this.term(third));
      return node;
    }
    switch (call.name) {
      case 'ObjectComplementOf':
        this.add(node, rdf.type, iri(owl.Class));
        this.add(node, owl.complementOf, this.term(first));
        return node;
      case 'DataComplementOf':
        this.add(node, rdf.type, iri(rdfs.Datatype));
        this.add(node, `${OWL}datatypeComplementOf`, this.term(first));
        return node;
      case 'ObjectHasSelf':
        this.add(node, rdf.type, iri(owl.Restriction));
        this.add(node, owl.onProperty, this.term(first));
        this.add(node, owl.hasSelf, literal('true', `${XSD}boolean`));
        return node;
      case 'ObjectInverseOf':
        this.add(node, owl.inverseOf, this.term(first));
        return node;
      case 'DatatypeRestriction':
        this.add(node, rdf.type, iri(rdfs.Datatype));
        this.add(node, `${OWL}onDatatype`, this.term(first));
        this.add(node, `${OWL}withRestrictions`, this.list(this.facets(call.args.slice(1))));
        return node;
      default:
        throw new ParseError(`Unknown OWL construct "${call.name}".`);
    }
  }

  /** Functional Syntax lists facets as pairs, OWL/XML wraps each pair in `FacetRestriction`. */
  private facets(args: readonly OwlArg[]): Subject[] {
    const pairs = args.flatMap((arg) =>
      isCall(arg) && arg.name === 'FacetRestriction' ? arg.args : [arg],
    );
    const facets: Subject[] = [];
    for (let index = 0; index + 1 < pairs.length; index += 2) {
      const facet = this.fresh();
      this.add(facet, this.predicate(pairs[index]), this.term(pairs[index + 1]));
      facets.push(facet);
    }
    return facets;
  }

  private disjoint(args: readonly OwlArg[], pair: string, all: string, members: string): Triple {
    if (args.length === 2) return this.add(this.subject(args[0]), pair, this.term(args[1]));
    const node = this.fresh();
    const typed = this.add(node, rdf.type, iri(all));
    this.add(node, members, this.list(args));
    return typed;
  }

  private negativeAssertion(name: string, [property, source, target]: readonly OwlArg[]): Triple {
    const node = this.fresh();
    const typed = this.add(node, rdf.type, iri(`${OWL}NegativePropertyAssertion`));
    this.add(node, `${OWL}sourceIndividual`, this.term(source));
    this.add(node, `${OWL}assertionProperty`, this.term(property));
    const targetPredicate = name.startsWith('NegativeObject') ? 'targetIndividual' : 'targetValue';
    this.add(node, `${OWL}${targetPredicate}`, this.term(target));
    return typed;
  }

  private annotate(subject: Subject, annotation: OwlCall): void {
    const nested = annotation.args.filter((arg) => isCall(arg) && arg.name === 'Annotation');
    const [property, value] = annotation.args.filter((arg) => !nested.includes(arg));
    const main = this.add(subject, this.predicate(property), this.term(value));
    if (nested.length === 0) return;
    const reified = this.reify(main);
    for (const inner of nested) this.annotate(reified, inner as OwlCall);
  }

  private reify(main: Triple): Subject {
    const axiom = this.fresh();
    this.add(axiom, rdf.type, iri(owl.Axiom));
    this.add(axiom, owl.annotatedSource, main.subject);
    this.add(axiom, `${OWL}annotatedProperty`, iri(main.predicate));
    this.add(axiom, `${OWL}annotatedTarget`, main.object);
    return axiom;
  }

  private list(items: readonly OwlArg[]): Term {
    let rest: Term = iri(rdf.nil);
    for (const item of [...items].reverse()) {
      const cell = this.fresh();
      this.add(cell, rdf.first, this.term(item));
      this.add(cell, rdf.rest, rest);
      rest = cell;
    }
    return rest;
  }

  /** An IRI, literal or blank node; entity wrappers such as `Class(:A)` stand for their IRI. */
  private term(arg: OwlArg | undefined): Term {
    if (!arg) throw new ParseError('An OWL construct is missing an argument.');
    if (!isCall(arg)) return arg;
    const [entityIri] = arg.args;
    if (ENTITY_TYPES[arg.name] && entityIri && !isCall(entityIri)) return entityIri;
    return this.expression(arg);
  }

  private subject(arg: OwlArg | undefined): Subject {
    const term = this.term(arg);
    if (term.kind === 'literal')
      throw new ParseError(`A literal cannot be a subject: "${term.value}".`);
    return term;
  }

  private predicate(arg: OwlArg | undefined): string {
    const term = this.term(arg);
    if (term.kind !== 'iri') throw new ParseError('A property must be an IRI.');
    return term.value;
  }

  private entityType(entity: OwlCall): string {
    const type = ENTITY_TYPES[entity.name];
    if (!type) throw new ParseError(`Unknown entity type "${entity.name}" in a declaration.`);
    return type;
  }

  private fresh(): Subject {
    this.blankCount += 1;
    return bnode(`owl${this.blankCount}`);
  }

  private add(subject: Subject, predicate: string, object: Term): Triple {
    const triple = { subject, predicate, object };
    this.triples.push(triple);
    return triple;
  }
}
