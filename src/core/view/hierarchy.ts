import { PROPERTY_KINDS } from '../model/kinds';
import type { Entity, OntologyModel } from '../model/types';
import { owl } from '../vocab';
import { distinctLabels } from './labels';

export type HierarchyTab = 'classes' | 'properties';

export interface HierarchyNode {
  readonly id: string;
  readonly label: string;
  readonly children: string[];
  readonly parents: string[];
  readonly instanceCount: number;
}

export interface Hierarchy {
  readonly roots: string[];
  readonly nodes: Record<string, HierarchyNode>;
}

/**
 * Builds the subclass or subproperty tree. A node with several parents appears
 * under each of them; nodes stuck in a cycle get promoted to roots so nothing is lost.
 */
export function buildHierarchy(model: OntologyModel, tab: HierarchyTab): Hierarchy {
  const members = Object.values(model.entities).filter((entity) => belongsTo(entity, tab));
  const ids = new Set(members.map((entity) => entity.id));
  const parentEdge = tab === 'classes' ? 'subClassOf' : 'subPropertyOf';

  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  const instances = new Map<string, number>();
  for (const edge of model.edges) {
    if (edge.kind === 'type') instances.set(edge.target, (instances.get(edge.target) ?? 0) + 1);
    if (
      edge.kind !== parentEdge ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      edge.source === edge.target
    ) {
      continue;
    }
    addTo(parents, edge.source, edge.target);
    addTo(children, edge.target, edge.source);
  }

  const byLabel = (a: string, b: string) => compareLabels(model.entities[a], model.entities[b]);
  const labelOf = distinctLabels(model);
  const nodes: Record<string, HierarchyNode> = {};
  for (const entity of members) {
    nodes[entity.id] = {
      id: entity.id,
      label: labelOf(entity),
      children: [...(children.get(entity.id) ?? [])].sort(byLabel),
      parents: [...(parents.get(entity.id) ?? [])].sort(byLabel),
      instanceCount: instances.get(entity.id) ?? 0,
    };
  }

  const roots = members.filter((entity) => !parents.has(entity.id)).map((entity) => entity.id);
  const reached = reachableFrom(roots, nodes);
  for (const entity of [...members].sort((a, b) => compareLabels(a, b))) {
    if (reached.has(entity.id)) continue;
    roots.push(entity.id);
    for (const id of reachableFrom([entity.id], nodes)) reached.add(id);
  }
  return { roots: roots.sort(byLabel), nodes };
}

/** The given nodes plus every ancestor, so a filtered tree still shows the path to each match. */
export function withAncestors(hierarchy: Hierarchy, ids: Iterable<string>): Set<string> {
  const keep = new Set<string>();
  const stack = [...ids];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (keep.has(id)) continue;
    keep.add(id);
    stack.push(...(hierarchy.nodes[id]?.parents ?? []));
  }
  return keep;
}

function belongsTo(entity: Entity, tab: HierarchyTab): boolean {
  if (tab === 'properties') return PROPERTY_KINDS.has(entity.kind) && !entity.builtin;
  return entity.kind === 'class' && entity.iri !== owl.Thing && entity.iri !== owl.Nothing;
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function compareLabels(a: Entity | undefined, b: Entity | undefined): number {
  return (
    (a?.label ?? '').localeCompare(b?.label ?? '', undefined, { sensitivity: 'base' }) ||
    (a?.id ?? '').localeCompare(b?.id ?? '')
  );
}

function reachableFrom(
  starts: readonly string[],
  nodes: Record<string, HierarchyNode>,
): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(nodes[id]?.children ?? []));
  }
  return seen;
}
