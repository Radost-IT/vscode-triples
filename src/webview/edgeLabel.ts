export interface Offset {
  readonly x: number;
  readonly y: number;
}

/** Half the 10px label with its 3px background padding, plus a small gap to the line. */
const GAP = 11;

/**
 * Moves an edge label sideways off its line, to the upper side (left on a vertical line),
 * so the line and arrow do not run through the text. The label sits at the middle of the
 * edge, where even a bundled curve runs parallel to the straight line between its nodes.
 */
export function edgeLabelOffset(source: Offset, target: Offset): Offset {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: 0 };
  const normal = { x: dy / length, y: -dx / length };
  const flip = normal.y > 0 || (normal.y === 0 && normal.x > 0) ? -1 : 1;
  return { x: normal.x * flip * GAP, y: normal.y * flip * GAP };
}

/** Past this many edges their labels pile up into noise, so they show only around the selection. */
const QUIET_LABEL_EDGES = 300;

export function hasQuietEdgeLabels(edgeCount: number): boolean {
  return edgeCount > QUIET_LABEL_EDGES;
}
