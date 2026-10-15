import type { ProjectedGraph } from '../core/view/project';

const LANDMARK_MIN_LINKS = 8;
const MAX_LANDMARKS = 30;
/** Rendered label size a landmark keeps while the rest of the graph shrinks away. */
const LANDMARK_SCREEN_FONT = 12;
/** Node label font size and width in graphStyle. */
const BASE_FONT = 13;
const BASE_TEXT_WIDTH = 210;
const MAX_SCALE = 10;
/** Average glyph width and line height of the label font, relative to its size. */
const GLYPH_WIDTH = 0.6;
const LINE_HEIGHT = 1.4;

/**
 * The hubs of the graph keep a readable label when zoomed out, so the overview still says
 * what is where. Ties go to the earlier node, which keeps the pick stable across renders.
 */
export function pickLandmarks(graph: ProjectedGraph): string[] {
  const links = new Map<string, number>();
  for (const edge of graph.edges) {
    links.set(edge.source, (links.get(edge.source) ?? 0) + 1);
    if (edge.target !== edge.source) links.set(edge.target, (links.get(edge.target) ?? 0) + 1);
  }
  const hubs = graph.nodes
    .map((node) => ({ id: node.id, links: links.get(node.id) ?? 0 }))
    .filter((node) => node.links >= LANDMARK_MIN_LINKS)
    .sort((a, b) => b.links - a.links);
  return hubs.slice(0, MAX_LANDMARKS).map((node) => node.id);
}

/** Label size in model units that renders a landmark label at a fixed screen size. */
export function landmarkLabelSize(zoom: number): { fontSize: number; textMaxWidth: number } {
  const scale = Math.min(MAX_SCALE, Math.max(1, LANDMARK_SCREEN_FONT / BASE_FONT / zoom));
  return { fontSize: BASE_FONT * scale, textMaxWidth: BASE_TEXT_WIDTH * scale };
}

export interface LandmarkPlacement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

/**
 * Landmarks in a dense cluster would print their big labels over each other. Going from the
 * busiest hub down, a landmark keeps its big label only if it clears every one already kept.
 */
export function unclutteredLandmarks(
  ranked: readonly LandmarkPlacement[],
  fontSize: number,
  textMaxWidth: number,
): string[] {
  const height = fontSize * LINE_HEIGHT;
  const kept: { x: number; y: number; halfWidth: number; id: string }[] = [];
  for (const landmark of ranked) {
    const halfWidth = Math.min(landmark.label.length * fontSize * GLYPH_WIDTH, textMaxWidth) / 2;
    const overlaps = kept.some(
      (other) =>
        Math.abs(other.x - landmark.x) < other.halfWidth + halfWidth &&
        Math.abs(other.y - landmark.y) < height,
    );
    if (!overlaps) kept.push({ x: landmark.x, y: landmark.y, halfWidth, id: landmark.id });
  }
  return kept.map((landmark) => landmark.id);
}
