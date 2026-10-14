import type { ParsedGraph } from '../parse/types';
import type { Literal, Term, Triple } from '../rdf';
import { owl, rdf, rdfs } from '../vocab';
import { indexBySubject, structuralBlankIds, subjectKey, type TriplesBySubject } from './blank';
import {
  expressionShape,
  expressionText,
  isAxiomNode,
  isListNode,
  readList,
  type ExpressionShape,
} from './expressions';
import {
  LABEL_PREDICATES,
  META_TYPES,
  PROPERTY_KINDS,
  isBuiltin,
  isDatatypeIri,
  isWellKnownAnnotation,
  strongerKind,
} from './kinds';
import { pickLabel } from './labels';
import { createCompactor, localName, type IriCompactor } from './names';
import type {
  Edge,
  EdgeKind,
  Entity,
  EntityKind,
  LiteralFact,
  OntologyHeader,
  OntologyModel,
} from './types';

export interface BuildOptions {
  /** BCP 47 tag of the UI language, used to choose between labels. */
  readonly language: string;
}

export const ANONYMOUS_LABEL = 'anonymous';

type BlankRole = 'list' | 'axiom' | 'expression' | 'generic';

const STRUCTURAL_EDGES: Readonly<Record<string, EdgeKind>> = {
  [rdfs.subClassOf]: 'subClassOf',
  [rdfs.subPropertyOf]: 'subPropertyOf',
  [rdf.type]: 'type',
  [rdfs.domain]: 'domain',
  [rdfs.range]: 'range',
  [owl.equivalentClass]: 'equivalent',
  [owl.equivalentProperty]: 'equivalent',
  [owl.sameAs]: 'equivalent',
  [owl.disjointWith]: 'disjoint',
  [owl.propertyDisjointWith]: 'disjoint',
  [owl.differentFrom]: 'disjoint',
  [owl.inverseOf]: 'inverse',
};

const MEMBER_PREDICATES: Readonly<Record<Exclude<ExpressionShape['type'], 'restriction'>, string>> =
  {
    union: owl.unionOf,
    intersection: owl.intersectionOf,
    oneOf: owl.oneOf,
    complement: owl.complementOf,
    allDisjoint: owl.members,
    allDifferent: owl.distinctMembers,
  };

export function buildModel(graph: ParsedGraph, options: BuildOptions): OntologyModel {
  return new ModelBuilder(graph, options).build();
}

class ModelBuilder {
  private readonly bySubject: TriplesBySubject;
  private readonly blankIds: Map<string, string>;
  private readonly compactor: IriCompactor;
  private readonly kinds = new Map<string, EntityKind>();
  private readonly blankRoles = new Map<string, BlankRole>();
  private readonly shapes = new Map<string, ExpressionShape>();
  private readonly entities: Record<string, Entity> = {};
  private readonly edges = new Map<string, Edge>();
  private readonly referencedBlanks = new Set<string>();
  private readonly ontologyIris = new Set<string>();

  constructor(
    private readonly graph: ParsedGraph,
    private readonly options: BuildOptions,
  ) {
    this.bySubject = indexBySubject(graph.triples);
    this.blankIds = structuralBlankIds(this.bySubject);
    this.compactor = createCompactor(graph.prefixes);
  }

  build(): OntologyModel {
    this.classifyBlankNodes();
    this.inferKinds();
    for (const triple of this.graph.triples) {
      this.addTriple(triple);
    }
    for (const key of this.bySubject.keys()) {
      const label = key.startsWith('_:') ? key.slice(2) : undefined;
      if (
        label &&
        !this.referencedBlanks.has(label) &&
        this.blankRoles.get(label) === 'expression'
      ) {
        this.ensureBlankEntity(label);
      }
    }
    return {
      entities: this.entities,
      edges: [...this.edges.values()],
      prefixes: this.graph.prefixes,
      ontology: this.ontologyHeader(),
      tripleCount: this.graph.triples.length,
    };
  }

  private classifyBlankNodes(): void {
    for (const key of this.bySubject.keys()) {
      if (!key.startsWith('_:')) continue;
      const label = key.slice(2);
      const shape = expressionShape(this.bySubject, label);
      if (shape) this.shapes.set(label, shape);
      this.blankRoles.set(label, this.roleOf(label, shape));
    }
    for (const triple of this.graph.triples) {
      if (triple.object.kind === 'bnode' && triple.predicate !== rdf.rest) {
        this.referencedBlanks.add(triple.object.value);
      }
    }
  }

  private roleOf(label: string, shape: ExpressionShape | undefined): BlankRole {
    if (isListNode(this.bySubject, label)) return 'list';
    if (isAxiomNode(this.bySubject, label)) return 'axiom';
    return shape ? 'expression' : 'generic';
  }

  private inferKinds(): void {
    for (const { subject, predicate, object } of this.graph.triples) {
      const s = subjectKey(subject);
      if (predicate === rdf.type && object.kind === 'iri') {
        const meta = META_TYPES[object.value];
        if (meta === 'ontology') this.ontologyIris.add(s);
        else if (meta && meta !== 'skip') this.setKind(s, meta);
        else if (!meta) {
          this.setKind(s, 'individual');
          this.setKind(object.value, 'class');
        }
        continue;
      }
      this.inferFromPredicate(s, predicate, object);
    }
    this.refineGenericProperties();
  }

  private inferFromPredicate(subject: string, predicate: string, object: Term): void {
    const target = object.kind === 'literal' ? undefined : subjectKey(object);
    const classOrDatatype = (key: string) =>
      this.setKind(key, isDatatypeIri(key) ? 'datatype' : 'class');
    switch (predicate) {
      case rdfs.subClassOf:
      case owl.equivalentClass:
      case owl.disjointWith:
        this.setKind(subject, 'class');
        if (target) this.setKind(target, 'class');
        break;
      case rdfs.subPropertyOf:
      case owl.equivalentProperty:
        this.setKind(subject, 'property');
        if (target) this.setKind(target, 'property');
        break;
      case owl.inverseOf:
        this.setKind(subject, 'objectProperty');
        if (target) this.setKind(target, 'objectProperty');
        break;
      case rdfs.domain:
        this.setKind(subject, 'property');
        if (target) this.setKind(target, 'class');
        break;
      case rdfs.range:
        this.setKind(subject, 'property');
        if (target) classOrDatatype(target);
        break;
      case owl.onProperty:
        if (target) this.setKind(target, 'property');
        break;
      case owl.someValuesFrom:
      case owl.allValuesFrom:
      case owl.onClass:
        if (target) classOrDatatype(target);
        break;
    }
  }

  private refineGenericProperties(): void {
    for (const [key, kind] of this.kinds) {
      if (kind !== 'property') continue;
      const ranges = (this.bySubject.get(key) ?? [])
        .filter((triple) => triple.predicate === rdfs.range && triple.object.kind === 'iri')
        .map((triple) => triple.object.value);
      if (ranges.length === 0) continue;
      if (ranges.every(isDatatypeIri)) this.kinds.set(key, 'datatypeProperty');
      else if (!ranges.some(isDatatypeIri)) this.kinds.set(key, 'objectProperty');
    }
  }

  private setKind(key: string, kind: EntityKind): void {
    if (key.startsWith('_:')) return;
    if (isDatatypeIri(key)) {
      this.kinds.set(key, 'datatype');
      return;
    }
    const current = this.kinds.get(key);
    if (kind === 'property' && current && PROPERTY_KINDS.has(current)) return;
    if (current === 'property' && PROPERTY_KINDS.has(kind)) {
      this.kinds.set(key, kind);
      return;
    }
    this.kinds.set(key, strongerKind(current, kind));
  }

  private addTriple(triple: Triple): void {
    const { subject, predicate, object } = triple;
    if (subject.kind === 'bnode' && this.blankRoles.get(subject.value) !== 'generic') return;
    const subjectId = this.entityIdOf(subject);
    if (this.ontologyIris.has(subjectKey(subject))) return;
    if (predicate === rdf.type && object.kind === 'iri' && META_TYPES[object.value]) return;

    if (object.kind === 'literal') {
      this.ensureEntity(subjectId, subject).literals.push(this.literalFact(predicate, object));
      return;
    }
    this.ensureEntity(subjectId, subject);
    const targets =
      object.kind === 'bnode' && this.blankRoles.get(object.value) === 'list'
        ? readList(this.bySubject, object)
        : [object];
    for (const target of targets) {
      this.addLink(subjectId, predicate, target);
    }
  }

  private addLink(sourceId: string, predicate: string, target: Term): void {
    if (target.kind === 'literal') {
      this.entities[sourceId]?.literals.push(this.literalFact(predicate, target));
      return;
    }
    if (target.kind === 'iri') {
      if (this.ontologyIris.has(target.value)) return;
      this.ensureEntity(target.value, target);
      this.addEdge(
        sourceId,
        predicate,
        target.value,
        this.edgeKind(predicate),
        this.predicateLabel(predicate),
      );
      return;
    }
    const shape = this.shapes.get(target.value);
    if (
      predicate === rdfs.subClassOf &&
      shape?.type === 'restriction' &&
      shape.filler?.kind === 'iri'
    ) {
      this.addRestrictionEdge(sourceId, shape.property, shape.quantifier, shape.filler.value);
      return;
    }
    const targetId = this.ensureBlankEntity(target.value);
    if (targetId) {
      this.addEdge(
        sourceId,
        predicate,
        targetId,
        this.edgeKind(predicate),
        this.predicateLabel(predicate),
      );
    }
  }

  private addRestrictionEdge(
    sourceId: string,
    property: string,
    quantifier: string,
    fillerIri: string,
  ): void {
    this.ensureEntity(fillerIri, { kind: 'iri', value: fillerIri });
    const label = `${this.predicateLabel(property)} ${quantifier}`;
    this.addEdge(sourceId, property, fillerIri, 'restriction', label, quantifier);
  }

  private addEdge(
    source: string,
    predicate: string,
    target: string,
    kind: EdgeKind,
    label: string,
    qualifier = '',
  ): void {
    const id = `${source} ${predicate}${qualifier ? `#${qualifier}` : ''} ${target}`;
    if (!this.edges.has(id)) this.edges.set(id, { id, source, target, predicate, label, kind });
  }

  private edgeKind(predicate: string): EdgeKind {
    const structural = STRUCTURAL_EDGES[predicate];
    if (structural) return structural;
    if (this.kinds.get(predicate) === 'annotationProperty' || isWellKnownAnnotation(predicate)) {
      return 'annotation';
    }
    return 'relation';
  }

  private entityIdOf(subject: Triple['subject']): string {
    return subject.kind === 'iri'
      ? subject.value
      : (this.blankIds.get(subject.value) ?? `_:${subject.value}`);
  }

  private ensureEntity(id: string, term: Term): Entity {
    const existing = this.entities[id];
    if (existing) return existing;
    const entity =
      term.kind === 'iri' ? this.namedEntity(term.value) : this.genericBlankEntity(id, term.value);
    this.entities[id] = entity;
    return entity;
  }

  private ensureBlankEntity(label: string): string | undefined {
    const role = this.blankRoles.get(label) ?? 'generic';
    if (role === 'axiom' || role === 'list') return undefined;
    const id = this.blankIds.get(label) ?? `_:${label}`;
    if (this.entities[id]) return id;
    const shape = this.shapes.get(label);
    if (!shape) {
      this.ensureEntity(id, { kind: 'bnode', value: label });
      return id;
    }
    const text = this.expressionText(shape);
    this.entities[id] = {
      id,
      iri: null,
      kind: 'expression',
      label: text,
      displayName: text,
      namespace: '',
      builtin: false,
      referencedOnly: false,
      literals: [],
    };
    this.addExpressionEdges(id, shape);
    return id;
  }

  private addExpressionEdges(id: string, shape: ExpressionShape): void {
    if (shape.type === 'restriction') {
      if (shape.filler?.kind === 'iri')
        this.addRestrictionEdge(id, shape.property, shape.quantifier, shape.filler.value);
      return;
    }
    for (const member of shape.members) {
      if (member.kind === 'iri') {
        this.ensureEntity(member.value, member);
        this.addEdge(id, MEMBER_PREDICATES[shape.type], member.value, 'member', '');
        continue;
      }
      const nested = member.kind === 'bnode' ? this.shapes.get(member.value) : undefined;
      if (nested?.type === 'restriction' && nested.filler?.kind === 'iri') {
        this.addRestrictionEdge(id, nested.property, nested.quantifier, nested.filler.value);
      }
    }
  }

  private expressionText(shape: ExpressionShape): string {
    return expressionText(
      shape,
      (term) => (term.kind === 'literal' ? JSON.stringify(term.value) : this.labelOf(term.value)),
      (label) => this.shapes.get(label),
    );
  }

  private namedEntity(iriValue: string): Entity {
    const triples = this.bySubject.get(iriValue) ?? [];
    const kind = this.kinds.get(iriValue) ?? (isDatatypeIri(iriValue) ? 'datatype' : 'resource');
    return {
      id: iriValue,
      iri: iriValue,
      kind,
      label: this.labelOf(iriValue),
      displayName: this.compactor.compact(iriValue),
      namespace: this.compactor.namespaceOf(iriValue),
      builtin: isBuiltin(iriValue),
      referencedOnly: triples.length === 0,
      literals: [],
    };
  }

  private genericBlankEntity(id: string, label: string): Entity {
    const triples = this.bySubject.get(`_:${label}`) ?? [];
    const typeIri = triples.find(
      (triple) => triple.predicate === rdf.type && triple.object.kind === 'iri',
    )?.object.value;
    const name = pickLabel(this.labelLiterals(`_:${label}`), this.options.language);
    const display =
      name ?? (typeIri ? `${ANONYMOUS_LABEL} ${this.labelOf(typeIri)}` : ANONYMOUS_LABEL);
    return {
      id,
      iri: null,
      kind: blankKind(typeIri),
      label: display,
      displayName: display,
      namespace: '',
      builtin: false,
      referencedOnly: triples.length === 0,
      literals: [],
    };
  }

  private labelLiterals(key: string): Literal[] {
    const triples = this.bySubject.get(key) ?? [];
    for (const predicate of LABEL_PREDICATES) {
      const literals = triples
        .filter((triple) => triple.predicate === predicate && triple.object.kind === 'literal')
        .map((triple) => triple.object as Literal);
      if (literals.length > 0) return literals;
    }
    return [];
  }

  private labelOf(iriValue: string): string {
    return pickLabel(this.labelLiterals(iriValue), this.options.language) ?? localName(iriValue);
  }

  private predicateLabel(predicate: string): string {
    return this.labelOf(predicate);
  }

  private literalFact(predicate: string, object: Literal): LiteralFact {
    return {
      predicate,
      predicateLabel: this.compactor.compact(predicate),
      value: object.value,
      language: object.language,
      datatype: object.datatype,
      isAnnotation: this.kinds.get(predicate) !== 'datatypeProperty',
    };
  }

  private ontologyHeader(): OntologyHeader | null {
    const [ontologyIri] = [...this.ontologyIris].sort();
    if (!ontologyIri) return null;
    const literals = (this.bySubject.get(ontologyIri) ?? []).flatMap((triple) => {
      if (triple.predicate === rdf.type) return [];
      const value = triple.object;
      return [
        this.literalFact(
          triple.predicate,
          value.kind === 'literal'
            ? value
            : { kind: 'literal', value: value.value, language: '', datatype: '' },
        ),
      ];
    });
    return { iri: ontologyIri, label: this.labelOf(ontologyIri), literals };
  }
}

function blankKind(typeIri: string | undefined): EntityKind {
  if (!typeIri) return 'resource';
  const meta = META_TYPES[typeIri];
  if (!meta) return 'individual';
  return meta === 'ontology' || meta === 'skip' ? 'resource' : meta;
}
