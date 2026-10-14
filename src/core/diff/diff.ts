import { buildModel, type BuildOptions } from '../model/build';
import { indexBySubject, structuralBlankIds, type TriplesBySubject } from '../model/blank';
import { expressionShape, expressionText } from '../model/expressions';
import { createCompactor, localName, type IriCompactor } from '../model/names';
import type { Entity, EntityKind, OntologyModel } from '../model/types';
import type { ParsedGraph } from '../parse/types';
import type { Term, Triple } from '../rdf';
import { XSD } from '../vocab';

export type ChangeStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface TripleChange {
  readonly status: 'added' | 'removed';
  readonly predicate: string;
  readonly text: string;
}

export interface EntityChange {
  readonly id: string;
  readonly label: string;
  readonly kind: EntityKind | 'ontology';
  readonly status: Exclude<ChangeStatus, 'unchanged'>;
  readonly changes: TripleChange[];
}

export type SummaryCategory = 'classes' | 'properties' | 'individuals' | 'other';

export type DiffSummary = Record<
  SummaryCategory,
  Record<Exclude<ChangeStatus, 'unchanged'>, number>
>;

export interface DiffResult {
  /** Union of both versions, so removed entities can still be drawn. */
  readonly model: OntologyModel;
  readonly entityStatus: Record<string, ChangeStatus>;
  readonly edgeStatus: Record<string, ChangeStatus>;
  readonly changes: EntityChange[];
  readonly summary: DiffSummary;
  readonly addedTriples: number;
  readonly removedTriples: number;
}

const EMPTY_GRAPH: ParsedGraph = { triples: [], prefixes: {} };

interface KeyedTriple {
  readonly key: string;
  readonly owner: string | undefined;
  readonly triple: Triple;
}

interface Side {
  readonly model: OntologyModel;
  readonly bySubject: TriplesBySubject;
  readonly keyed: Map<string, KeyedTriple>;
  readonly blankIds: Map<string, string>;
}

/**
 * Compares two RDF graphs triple by triple. Blank nodes are matched by structure,
 * so reordering, prefix changes and syntax conversions produce no changes.
 * Renamed IRIs show up as one removed and one added entity.
 */
export function diffGraphs(
  before: ParsedGraph | null,
  after: ParsedGraph | null,
  options: BuildOptions,
): DiffResult {
  const old = describeSide(before ?? EMPTY_GRAPH, options);
  const next = describeSide(after ?? EMPTY_GRAPH, options);
  const compactor = createCompactor({ ...old.model.prefixes, ...next.model.prefixes });

  const tripleChanges = new Map<string, TripleChange[]>();
  const record = (side: Side, keyed: KeyedTriple, status: TripleChange['status']) => {
    if (!keyed.owner) return;
    const list = tripleChanges.get(keyed.owner) ?? [];
    list.push({
      status,
      predicate: keyed.triple.predicate,
      text: describeTriple(keyed.triple, side, compactor),
    });
    tripleChanges.set(keyed.owner, list);
  };
  let removedTriples = 0;
  let addedTriples = 0;
  for (const [key, keyed] of old.keyed) {
    if (next.keyed.has(key)) continue;
    removedTriples++;
    record(old, keyed, 'removed');
  }
  for (const [key, keyed] of next.keyed) {
    if (old.keyed.has(key)) continue;
    addedTriples++;
    record(next, keyed, 'added');
  }

  const model = mergeModels(old.model, next.model);
  const entityStatus: Record<string, ChangeStatus> = {};
  for (const id of Object.keys(model.entities)) {
    entityStatus[id] = entityChangeStatus(id, old.model, next.model, tripleChanges);
  }
  const edgeStatus: Record<string, ChangeStatus> = {};
  const oldEdges = new Set(old.model.edges.map((edge) => edge.id));
  const nextEdges = new Set(next.model.edges.map((edge) => edge.id));
  for (const edge of model.edges) {
    edgeStatus[edge.id] = !oldEdges.has(edge.id)
      ? 'added'
      : !nextEdges.has(edge.id)
        ? 'removed'
        : 'unchanged';
  }

  const changes = collectChanges(model, entityStatus, tripleChanges, old.model, next.model);
  return {
    model,
    entityStatus,
    edgeStatus,
    changes,
    summary: summarize(changes),
    addedTriples,
    removedTriples,
  };
}

function describeSide(graph: ParsedGraph, options: BuildOptions): Side {
  const bySubject = indexBySubject(graph.triples);
  const blankIds = structuralBlankIds(bySubject);
  const parents = new Map<string, Triple['subject']>();
  for (const triple of graph.triples) {
    if (triple.object.kind === 'bnode' && !parents.has(triple.object.value)) {
      parents.set(triple.object.value, triple.subject);
    }
  }
  const termKey = (term: Term): string => {
    if (term.kind === 'iri') return `<${term.value}>`;
    if (term.kind === 'bnode') return blankIds.get(term.value) ?? `_:${term.value}`;
    return JSON.stringify([term.value, term.language, term.datatype]);
  };
  const keyed = new Map<string, KeyedTriple>();
  for (const triple of graph.triples) {
    const key = `${termKey(triple.subject)} <${triple.predicate}> ${termKey(triple.object)}`;
    keyed.set(key, { key, owner: ownerOf(triple.subject, parents, blankIds), triple });
  }
  return { model: buildModel(graph, options), bySubject, keyed, blankIds };
}

/**
 * Attributes a triple to the entity a reader would call "changed". Triples inside a
 * nested blank node are skipped because the top-level triple pointing at that blank
 * node already changes key, and reports the change once in readable form.
 */
function ownerOf(
  subject: Triple['subject'],
  parents: Map<string, Triple['subject']>,
  blankIds: Map<string, string>,
): string | undefined {
  if (subject.kind === 'iri') return subject.value;
  if (parents.has(subject.value)) return undefined;
  return blankIds.get(subject.value);
}

function describeTriple(triple: Triple, side: Side, compactor: IriCompactor): string {
  return `${compactor.compact(triple.predicate)} ${describeTerm(triple.object, side, compactor)}`;
}

function describeTerm(term: Term, side: Side, compactor: IriCompactor): string {
  if (term.kind === 'iri') return compactor.compact(term.value);
  if (term.kind === 'literal') {
    const quoted = JSON.stringify(term.value);
    if (term.language) return `${quoted}@${term.language}`;
    if (term.datatype && term.datatype !== `${XSD}string`)
      return `${quoted}^^${compactor.compact(term.datatype)}`;
    return quoted;
  }
  const shapeOf = (label: string) => expressionShape(side.bySubject, label);
  const shape = shapeOf(term.value);
  if (!shape) return side.model.entities[side.blankIds.get(term.value) ?? '']?.label ?? '[ ]';
  const nameOf = (named: Term) =>
    named.kind === 'literal'
      ? JSON.stringify(named.value)
      : (side.model.entities[named.value]?.label ?? localName(named.value));
  return `[ ${expressionText(shape, nameOf, shapeOf)} ]`;
}

function mergeModels(old: OntologyModel, next: OntologyModel): OntologyModel {
  const edges = new Map(old.edges.map((edge) => [edge.id, edge]));
  for (const edge of next.edges) edges.set(edge.id, edge);
  return {
    entities: { ...old.entities, ...next.entities },
    edges: [...edges.values()],
    prefixes: { ...old.prefixes, ...next.prefixes },
    ontology: next.ontology ?? old.ontology,
    tripleCount: next.tripleCount,
  };
}

function entityChangeStatus(
  id: string,
  old: OntologyModel,
  next: OntologyModel,
  tripleChanges: Map<string, TripleChange[]>,
): ChangeStatus {
  const before = old.entities[id];
  const after = next.entities[id];
  if (!before) return 'added';
  if (!after) return 'removed';
  if (tripleChanges.has(id) || before.kind !== after.kind || before.label !== after.label)
    return 'modified';
  return 'unchanged';
}

const SUMMARY_CATEGORY: Readonly<Record<EntityKind, SummaryCategory | undefined>> = {
  class: 'classes',
  objectProperty: 'properties',
  datatypeProperty: 'properties',
  annotationProperty: 'properties',
  property: 'properties',
  individual: 'individuals',
  datatype: 'other',
  resource: 'other',
  expression: undefined,
};

function collectChanges(
  model: OntologyModel,
  entityStatus: Record<string, ChangeStatus>,
  tripleChanges: Map<string, TripleChange[]>,
  old: OntologyModel,
  next: OntologyModel,
): EntityChange[] {
  const changes: EntityChange[] = [];
  for (const entity of Object.values(model.entities)) {
    const status = entityStatus[entity.id];
    if (!status || status === 'unchanged' || !isReportable(entity, tripleChanges)) continue;
    changes.push({
      id: entity.id,
      label: entity.label,
      kind: entity.kind,
      status,
      changes: tripleChanges.get(entity.id) ?? [],
    });
  }
  const ontologyIri = next.ontology?.iri ?? old.ontology?.iri;
  const ontologyChanges = ontologyIri ? tripleChanges.get(ontologyIri) : undefined;
  if (ontologyIri && ontologyChanges) {
    const status = !old.ontology ? 'added' : !next.ontology ? 'removed' : 'modified';
    const label = next.ontology?.label ?? old.ontology?.label ?? ontologyIri;
    changes.push({ id: ontologyIri, label, kind: 'ontology', status, changes: ontologyChanges });
  }
  return changes.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

function isReportable(entity: Entity, tripleChanges: Map<string, TripleChange[]>): boolean {
  if (entity.kind === 'expression' || entity.builtin) return false;
  return !entity.referencedOnly || tripleChanges.has(entity.id);
}

function summarize(changes: readonly EntityChange[]): DiffSummary {
  const empty = () => ({ added: 0, removed: 0, modified: 0 });
  const summary: DiffSummary = {
    classes: empty(),
    properties: empty(),
    individuals: empty(),
    other: empty(),
  };
  for (const change of changes) {
    const category = change.kind === 'ontology' ? 'other' : SUMMARY_CATEGORY[change.kind];
    if (category) summary[category][change.status]++;
  }
  return summary;
}
