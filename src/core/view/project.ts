import type { ChangeStatus } from '../diff/diff';
import { PROPERTY_KINDS } from '../model/kinds';
import type { Edge, EdgeKind, Entity, EntityKind, OntologyModel } from '../model/types';
import { owl } from '../vocab';
import { distinctLabels } from './labels';

export interface ViewOptions {
  readonly showOwlThing: boolean;
  readonly showAnnotationLinks: boolean;
  readonly showLiterals: boolean;
  readonly showBusyTypeLinks: boolean;
  readonly groupIndividuals: boolean;
  /** Classes whose individuals are drawn one by one although grouping is on. */
  readonly expandedGroups: readonly string[];
  readonly propertiesAsEdges: boolean;
  readonly onlyChanges: boolean;
  readonly hiddenKinds: readonly EntityKind[];
  readonly hiddenNamespaces: readonly string[];
  readonly hiddenPredicates: readonly string[];
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  showOwlThing: false,
  showAnnotationLinks: false,
  showLiterals: false,
  showBusyTypeLinks: false,
  groupIndividuals: true,
  expandedGroups: [],
  propertiesAsEdges: true,
  onlyChanges: false,
  hiddenKinds: [],
  hiddenNamespaces: [],
  hiddenPredicates: [],
};

export type NodeKind = EntityKind | 'literal';

export interface VisibleNode {
  readonly id: string;
  /** The entity shown in the details panel when this node is selected. */
  readonly entityId: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly status: ChangeStatus;
  /** Unchanged neighbor kept for orientation in "only changes" mode. */
  readonly context: boolean;
}

export interface VisibleEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
  readonly kind: EdgeKind | 'property';
  readonly predicate: string;
  readonly status: ChangeStatus;
}

export interface ProjectedGraph {
  readonly nodes: VisibleNode[];
  readonly edges: VisibleEdge[];
  readonly hiddenEntityCount: number;
  /** Individuals drawn inside their class node, mapped to that class. */
  readonly groupedInto: ReadonlyMap<string, string>;
}

export interface DiffStatuses {
  readonly entityStatus: Readonly<Record<string, ChangeStatus>>;
  readonly edgeStatus: Readonly<Record<string, ChangeStatus>>;
}

/** A class with more instances than this pulls so many dotted lines together that they hide the rest. */
export const BUSY_CLASS_INSTANCES = 15;

/** Past this many individuals the graph shows each class once with a count instead. */
export const GROUP_INDIVIDUALS_ABOVE = 100;

const TOP_AND_BOTTOM: ReadonlySet<string> = new Set([owl.Thing, owl.Nothing]);

/** Decides what the graph view draws. Pure, so the declutter rules can be unit tested. */
export function projectGraph(
  model: OntologyModel,
  options: ViewOptions,
  diff?: DiffStatuses,
): ProjectedGraph {
  const entityStatus = (id: string): ChangeStatus => diff?.entityStatus[id] ?? 'unchanged';
  const edgeStatus = (id: string): ChangeStatus => diff?.edgeStatus[id] ?? 'unchanged';
  const entities = Object.values(model.entities);
  const labelOf = distinctLabels(model);
  const candidates = new Set(
    entities.filter((entity) => isCandidate(entity, options)).map((entity) => entity.id),
  );

  let edges: VisibleEdge[] = model.edges
    .filter(
      (edge) =>
        candidates.has(edge.source) && candidates.has(edge.target) && isEdgeShown(edge, options),
    )
    .map((edge) => ({ ...edge, status: edgeStatus(edge.id) }));

  if (!options.showBusyTypeLinks) edges = withoutBusyTypeLinks(edges);

  const hiddenProperties = new Set<string>();
  if (options.propertiesAsEdges) {
    edges = foldPropertiesIntoEdges(model, edges, hiddenProperties);
  }

  const groupedInto = options.groupIndividuals
    ? groupIndividuals(model, candidates, options.expandedGroups)
    : new Map<string, string>();
  if (groupedInto.size > 0) edges = edgesBetweenGroups(edges, groupedInto);
  const members = membersByGroup(groupedInto);

  // An open group keeps its class on screen, so a second double-click can close it.
  const anchored = new Set([
    ...edges.flatMap((edge) => [edge.source, edge.target]),
    ...members.keys(),
    ...options.expandedGroups,
  ]);
  let nodes: VisibleNode[] = entities
    .filter((entity) => candidates.has(entity.id) && !hiddenProperties.has(entity.id))
    .filter((entity) => !groupedInto.has(entity.id))
    .filter((entity) => !entity.referencedOnly || anchored.has(entity.id))
    .map((entity) => {
      const group = members.get(entity.id) ?? [];
      return {
        id: entity.id,
        entityId: entity.id,
        kind: entity.kind,
        label: group.length > 0 ? `${labelOf(entity)} ×${group.length}` : labelOf(entity),
        status: groupStatus(entityStatus(entity.id), group.map(entityStatus)),
        context: false,
      };
    });

  if (options.showLiterals) {
    const literalGraph = literalNodes(model, nodes);
    nodes = nodes.concat(literalGraph.nodes);
    edges = edges.concat(literalGraph.edges);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  edges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  if (options.onlyChanges && diff) {
    ({ nodes, edges } = keepChangesWithContext(nodes, edges));
  }
  return {
    nodes,
    edges,
    hiddenEntityCount:
      entities.length - groupedInto.size - nodes.filter((node) => node.kind !== 'literal').length,
    groupedInto,
  };
}

function isCandidate(entity: Entity, options: ViewOptions): boolean {
  if (!options.showOwlThing && entity.iri && TOP_AND_BOTTOM.has(entity.iri)) return false;
  if (options.hiddenKinds.includes(entity.kind)) return false;
  return !options.hiddenNamespaces.includes(entity.namespace);
}

function isEdgeShown(edge: Edge, options: ViewOptions): boolean {
  if (edge.kind === 'annotation' && !options.showAnnotationLinks) return false;
  return !options.hiddenPredicates.includes(edge.predicate);
}

/** Changed type links stay, so a diff still shows them. */
function withoutBusyTypeLinks(edges: VisibleEdge[]): VisibleEdge[] {
  const instanceCounts = new Map<string, number>();
  for (const edge of edges) {
    if (edge.kind === 'type')
      instanceCounts.set(edge.target, (instanceCounts.get(edge.target) ?? 0) + 1);
  }
  return edges.filter(
    (edge) =>
      edge.kind !== 'type' ||
      edge.status !== 'unchanged' ||
      (instanceCounts.get(edge.target) ?? 0) <= BUSY_CLASS_INSTANCES,
  );
}

/**
 * Draws a property with a domain and a range as an arrow from domain to range,
 * the way people sketch ontologies on a whiteboard. The property node is dropped
 * when nothing else connects to it.
 */
function foldPropertiesIntoEdges(
  model: OntologyModel,
  edges: VisibleEdge[],
  hiddenProperties: Set<string>,
): VisibleEdge[] {
  const domainsOf = groupTargets(edges, 'domain');
  const rangesOf = groupTargets(edges, 'range');
  const folded: VisibleEdge[] = [];
  const foldedProperties = new Set<string>();

  for (const [propertyId, domains] of domainsOf) {
    const property = model.entities[propertyId];
    const ranges = rangesOf.get(propertyId);
    if (!property || !ranges || !PROPERTY_KINDS.has(property.kind)) continue;
    foldedProperties.add(propertyId);
    for (const domain of domains) {
      for (const range of ranges) {
        folded.push({
          id: `property ${propertyId} ${domain.target} ${range.target}`,
          source: domain.target,
          target: range.target,
          label: property.label,
          kind: 'property',
          predicate: propertyId,
          status: combineStatus(domain.status, range.status),
        });
      }
    }
  }

  const remaining = edges.filter(
    (edge) =>
      !(foldedProperties.has(edge.source) && (edge.kind === 'domain' || edge.kind === 'range')),
  );
  const stillConnected = new Set(remaining.flatMap((edge) => [edge.source, edge.target]));
  for (const propertyId of foldedProperties) {
    if (!stillConnected.has(propertyId)) hiddenProperties.add(propertyId);
  }
  return remaining.concat(folded);
}

function groupTargets(edges: readonly VisibleEdge[], kind: EdgeKind): Map<string, VisibleEdge[]> {
  const groups = new Map<string, VisibleEdge[]>();
  for (const edge of edges) {
    if (edge.kind !== kind) continue;
    const list = groups.get(edge.source) ?? [];
    list.push(edge);
    groups.set(edge.source, list);
  }
  return groups;
}

/**
 * Puts each individual into the first class it is typed with, unless that class is expanded.
 * Small graphs stay as they are: the counts only pay off once individuals crowd the view.
 */
function groupIndividuals(
  model: OntologyModel,
  candidates: ReadonlySet<string>,
  expandedGroups: readonly string[],
): Map<string, string> {
  const groupedInto = new Map<string, string>();
  const individuals = [...candidates].filter((id) => model.entities[id]?.kind === 'individual');
  if (individuals.length <= GROUP_INDIVIDUALS_ABOVE) return groupedInto;
  const individualIds = new Set(individuals);
  const expanded = new Set(expandedGroups);
  for (const edge of model.edges) {
    if (edge.kind !== 'type' || !individualIds.has(edge.source) || groupedInto.has(edge.source))
      continue;
    if (!candidates.has(edge.target) || model.entities[edge.target]?.kind !== 'class') continue;
    individualIds.delete(edge.source);
    if (!expanded.has(edge.target)) groupedInto.set(edge.source, edge.target);
  }
  // A group of one saves nothing and hides the individual's name.
  for (const [group, members] of membersByGroup(groupedInto)) {
    if (members.length === 1) groupedInto.delete(members[0] ?? group);
  }
  return groupedInto;
}

/** Redraws edges between individuals as edges between their groups, one per relation, with a count. */
function edgesBetweenGroups(
  edges: readonly VisibleEdge[],
  groupedInto: ReadonlyMap<string, string>,
): VisibleEdge[] {
  const merged = new Map<string, { edge: VisibleEdge; count: number }>();
  for (const edge of edges) {
    const source = groupedInto.get(edge.source) ?? edge.source;
    const target = groupedInto.get(edge.target) ?? edge.target;
    if (edge.kind === 'type' && source === target) continue;
    if (source === edge.source && target === edge.target) {
      merged.set(edge.id, { edge, count: 1 });
      continue;
    }
    const id = `group ${source} ${edge.kind} ${edge.predicate} ${target}`;
    const existing = merged.get(id);
    if (existing) {
      existing.count += 1;
      existing.edge = {
        ...existing.edge,
        status: combineStatus(existing.edge.status, edge.status),
      };
    } else merged.set(id, { edge: { ...edge, id, source, target }, count: 1 });
  }
  return [...merged.values()].map(({ edge, count }) =>
    count > 1 ? { ...edge, label: `${edge.label} ×${count}` } : edge,
  );
}

function membersByGroup(groupedInto: ReadonlyMap<string, string>): Map<string, string[]> {
  const members = new Map<string, string[]>();
  for (const [member, group] of groupedInto) {
    const list = members.get(group) ?? [];
    list.push(member);
    members.set(group, list);
  }
  return members;
}

/** A group whose class is unchanged still shows that some of its individuals changed. */
function groupStatus(classStatus: ChangeStatus, memberStatuses: ChangeStatus[]): ChangeStatus {
  if (classStatus !== 'unchanged') return classStatus;
  return memberStatuses.some((status) => status !== 'unchanged') ? 'modified' : 'unchanged';
}

function combineStatus(a: ChangeStatus, b: ChangeStatus): ChangeStatus {
  if (a === b) return a;
  if (a === 'removed' || b === 'removed')
    return a === 'added' || b === 'added' ? 'modified' : 'removed';
  return a === 'unchanged' ? b : b === 'unchanged' ? a : 'modified';
}

function literalNodes(
  model: OntologyModel,
  nodes: readonly VisibleNode[],
): Pick<ProjectedGraph, 'nodes' | 'edges'> {
  const literalNodeList: VisibleNode[] = [];
  const literalEdges: VisibleEdge[] = [];
  for (const node of nodes) {
    const entity = model.entities[node.entityId];
    entity?.literals.forEach((fact, index) => {
      if (fact.isAnnotation) return;
      const id = `literal ${entity.id} ${index}`;
      literalNodeList.push({
        id,
        entityId: entity.id,
        kind: 'literal',
        label: fact.value,
        status: node.status === 'modified' ? 'unchanged' : node.status,
        context: false,
      });
      literalEdges.push({
        id: `${id} edge`,
        source: entity.id,
        target: id,
        label: fact.predicateLabel,
        kind: 'relation',
        predicate: fact.predicate,
        status: node.status === 'modified' ? 'unchanged' : node.status,
      });
    });
  }
  return { nodes: literalNodeList, edges: literalEdges };
}

function keepChangesWithContext(
  nodes: VisibleNode[],
  edges: VisibleEdge[],
): Pick<ProjectedGraph, 'nodes' | 'edges'> {
  const changed = new Set(
    nodes.filter((node) => node.status !== 'unchanged').map((node) => node.id),
  );
  const keptEdges = edges.filter(
    (edge) => edge.status !== 'unchanged' || changed.has(edge.source) || changed.has(edge.target),
  );
  const kept = new Set(keptEdges.flatMap((edge) => [edge.source, edge.target]));
  for (const id of changed) kept.add(id);
  return {
    nodes: nodes
      .filter((node) => kept.has(node.id))
      .map((node) => (changed.has(node.id) ? node : { ...node, context: true })),
    edges: keptEdges,
  };
}
