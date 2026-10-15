import type { Offset } from './edgeLabel';

export interface LoopPlacement {
  /** Degrees clockwise from straight up. */
  readonly direction: number;
  readonly sweep: number;
  readonly labelOffset: Offset;
}

const WIDEST_SWEEP = 60;
/** Distance from the loop line to its label, outward from the node. */
const LABEL_GAP = 9;

/**
 * Cytoscape nests loops that share a direction, which stacks their labels on top of each
 * other. Spreading the loops of one node around it gives each loop and label its own spot.
 */
export function spreadSelfLoops(
  edges: readonly { readonly id: string; readonly source: string; readonly target: string }[],
): Map<string, LoopPlacement> {
  const loopsByNode = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.source !== edge.target) continue;
    loopsByNode.set(edge.source, [...(loopsByNode.get(edge.source) ?? []), edge.id]);
  }
  const placements = new Map<string, LoopPlacement>();
  for (const loops of loopsByNode.values()) {
    const step = 360 / loops.length;
    const sweep = Math.min(WIDEST_SWEEP, step * 0.7);
    loops.forEach((id, index) => {
      const direction = index * step;
      const radians = (direction * Math.PI) / 180;
      placements.set(id, {
        direction,
        sweep,
        labelOffset: { x: Math.sin(radians) * LABEL_GAP, y: -Math.cos(radians) * LABEL_GAP },
      });
    });
  }
  return placements;
}
