import type { ProjectedGraph } from './project';

/** Keeps the nodes within `hops` edges of `centerId`, ignoring edge direction. */
export function neighborhood(
  graph: Pick<ProjectedGraph, 'nodes' | 'edges'>,
  centerId: string,
  hops: number,
): Set<string> {
  const adjacent = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const list = adjacent.get(from) ?? [];
    list.push(to);
    adjacent.set(from, list);
  };
  for (const edge of graph.edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }
  const reached = new Set([centerId]);
  let frontier = [centerId];
  for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacent.get(id) ?? []) {
        if (reached.has(neighbor)) continue;
        reached.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return reached;
}
