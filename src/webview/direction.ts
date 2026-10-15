export type Direction = 'left' | 'right' | 'up' | 'down';

export interface PlacedNode {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
}

const UNIT: Record<Direction, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** Sideways offset counts double, so a node straight ahead wins over a closer one off to the side. */
const SIDEWAYS_WEIGHT = 2;

/**
 * Picks the candidate the arrow key points at: it must lie within about 63 degrees of the
 * direction, and the one with the lowest distance ahead plus weighted sideways offset wins.
 */
export function nearestInDirection(
  from: PlacedNode['position'],
  candidates: readonly PlacedNode[],
  direction: Direction,
): string | null {
  const unit = UNIT[direction];
  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    const dx = candidate.position.x - from.x;
    const dy = candidate.position.y - from.y;
    const ahead = dx * unit.x + dy * unit.y;
    const sideways = Math.abs(dx * unit.y - dy * unit.x);
    if (ahead <= 0 || sideways > ahead * 2) continue;
    const score = ahead + SIDEWAYS_WEIGHT * sideways;
    if (!best || score < best.score || (score === best.score && candidate.id < best.id)) {
      best = { id: candidate.id, score };
    }
  }
  return best?.id ?? null;
}
