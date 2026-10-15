import cytoscape from 'cytoscape';
import dagre, { type DagreLayoutOptions } from 'cytoscape-dagre';
import fcose, { type FcoseLayoutOptions } from 'cytoscape-fcose';

cytoscape.use(fcose);
cytoscape.use(dagre);

export type LayoutName = 'force' | 'layered';
export type TreeDirection = 'LR' | 'TB';

const LARGE_GRAPH = 2500;
/** Up to this size the default spacing works; bigger graphs get longer edges so hubs do not clump. */
const ROOMY_GRAPH = 150;
const MAX_SPREAD = 2.5;

/** How much to stretch edges and repulsion for a graph of this size. 1 means the default spacing. */
export function layoutSpread(nodeCount: number): number {
  return Math.min(MAX_SPREAD, Math.max(1, Math.sqrt(nodeCount / ROOMY_GRAPH)));
}

export function forceLayout(nodeCount: number): FcoseLayoutOptions {
  const spread = layoutSpread(nodeCount);
  return {
    name: 'fcose',
    quality: nodeCount > LARGE_GRAPH ? 'draft' : 'default',
    randomize: true,
    animate: false,
    fit: true,
    padding: 40,
    nodeDimensionsIncludeLabels: false,
    packComponents: true,
    idealEdgeLength: 110 * spread,
    nodeRepulsion: 8000 * spread * spread,
    nodeSeparation: 90,
    numIter: nodeCount > LARGE_GRAPH ? 1000 : 2500,
  };
}

export function layeredLayout(direction: TreeDirection): DagreLayoutOptions {
  return {
    name: 'dagre',
    rankDir: direction,
    nodeSep: 24,
    rankSep: 70,
    edgeSep: 10,
    animate: false,
    fit: true,
    padding: 40,
  };
}

/**
 * Runs `work` with a fixed-seed Math.random, so force layouts give the same
 * picture for the same file instead of a new arrangement on every refresh.
 */
export function withSeededRandom<T>(work: () => T): T {
  const original = Math.random;
  let state = 0x9e3779b9;
  Math.random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return work();
  } finally {
    Math.random = original;
  }
}
