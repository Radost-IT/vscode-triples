import cytoscape, {
  type Core,
  type EdgeCollection,
  type ElementDefinition,
  type NodeSingular,
  type Position,
} from 'cytoscape';
import type { ChangeStatus } from '../core/diff/diff';
import type { NodeKind, ProjectedGraph } from '../core/view/project';
import { nearestInDirection, type Direction } from './direction';
import { edgeLabelOffset } from './edgeLabel';
import { graphStylesheet, nodeSize } from './graphStyle';
import { forceLayout, layeredLayout, withSeededRandom, type LayoutName } from './layout';
import type { MinimapScene } from './minimapProjection';
import { spreadSelfLoops } from './selfLoops';
import { exportSvg } from './svgExport';
import { STATUS_MARK, readPalette } from './theme';

export interface GraphViewEvents {
  readonly onSelect: (nodeId: string | null) => void;
  readonly onFocus: (nodeId: string) => void;
  readonly onViewportChange: (viewport: Viewport) => void;
  /** Called after each frame the canvas draws, including during layout and dragging. */
  readonly onRender: () => void;
}

export interface Viewport {
  readonly zoom: number;
  readonly pan: Position;
}

export interface GraphRenderSettings {
  readonly layout: LayoutName;
  readonly diff: boolean;
  /** Keep node positions and the viewport from the previous render where possible. */
  readonly reuse: boolean;
}

export interface GraphView {
  render(graph: ProjectedGraph, settings: GraphRenderSettings): void;
  select(nodeId: string | null, center: boolean): void;
  zoomBy(factor: number): void;
  fit(): void;
  setViewport(viewport: Viewport): void;
  centerAt(position: Position): void;
  minimapScene(): MinimapScene;
  applyTheme(): void;
  png(): string;
  svg(): string;
  has(nodeId: string): boolean;
  resize(): void;
}

const LARGE_GRAPH = 3000;
/** Below this share of known nodes the old positions say little about the new graph. */
const REUSE_THRESHOLD = 0.6;
const PAN_STEP = 60;
/** Spreads new nodes around their anchor without overlapping each other. */
const GOLDEN_ANGLE = 2.399963;

export function createGraphView(container: HTMLElement, events: GraphViewEvents): GraphView {
  let large = false;
  let cy = createCore(container, events, large);
  container.addEventListener('keydown', (event) => handleKey(cy, event, events));

  return {
    render(graph, settings) {
      // Render options are fixed at creation, so switching size class needs a new instance.
      const needsLarge = graph.nodes.length > LARGE_GRAPH;
      if (needsLarge !== large) {
        large = needsLarge;
        cy.destroy();
        cy = createCore(container, events, large);
      }
      render(cy, graph, settings);
    },
    select: (nodeId, center) => select(cy, nodeId, center),
    zoomBy: (factor) => zoomBy(cy, factor),
    fit: () => cy.fit(undefined, 40),
    setViewport: (viewport) => void cy.viewport(viewport),
    centerAt: (position) => centerAt(cy, position),
    minimapScene: () => minimapScene(cy),
    applyTheme: () => cy.style(graphStylesheet(readPalette())),
    png: () =>
      cy.png({
        output: 'base64uri',
        full: true,
        scale: 2,
        maxWidth: 12000,
        maxHeight: 12000,
        bg: readPalette().background,
      }),
    svg: () => exportSvg(cy, readPalette().background),
    has: (nodeId) => cy.getElementById(nodeId).nonempty(),
    resize: () => cy.resize(),
  };
}

/** Big graphs stay responsive only if the canvas skips edges and uses a bitmap while moving. */
function createCore(container: HTMLElement, events: GraphViewEvents, large: boolean): Core {
  const cy = cytoscape({
    container,
    // The container may still be detached here; the default grid layout cannot size itself then.
    layout: { name: 'preset' },
    style: graphStylesheet(readPalette()),
    minZoom: 0.02,
    maxZoom: 4,
    boxSelectionEnabled: false,
    selectionType: 'single',
    textureOnViewport: large,
    hideEdgesOnViewport: large,
    pixelRatio: large ? 1 : 'auto',
  });
  cy.on('tap', 'node', (event) => events.onSelect((event.target as NodeSingular).id()));
  cy.on('tap', (event) => {
    if (event.target === cy) events.onSelect(null);
  });
  cy.on('dbltap', 'node', (event) => events.onFocus((event.target as NodeSingular).id()));
  cy.on('drag', 'node', (event) =>
    placeEdgeLabels((event.target as NodeSingular).connectedEdges(':simple')),
  );
  cy.on('viewport', () => events.onViewportChange({ zoom: cy.zoom(), pan: { ...cy.pan() } }));
  cy.on('render', () => events.onRender());
  return cy;
}

function render(cy: Core, graph: ProjectedGraph, settings: GraphRenderSettings): void {
  const previous = new Map<string, Position>();
  if (settings.reuse)
    cy.nodes().forEach((node) => void previous.set(node.id(), { ...node.position() }));
  const selected = cy.$('node:selected').id();
  const viewport = { zoom: cy.zoom(), pan: { ...cy.pan() } };

  cy.batch(() => {
    cy.elements().remove();
    cy.add(toElements(graph, settings.diff));
  });

  const known = graph.nodes.filter((node) => previous.has(node.id)).length;
  if (settings.reuse && graph.nodes.length > 0 && known / graph.nodes.length >= REUSE_THRESHOLD) {
    placeFromPrevious(cy, previous);
    cy.viewport(viewport);
  } else {
    cy.resize();
    runLayout(cy, settings.layout);
  }
  cy.batch(() => placeEdgeLabels(cy.edges(':simple')));
  if (selected && cy.getElementById(selected).nonempty()) select(cy, selected, false);
}

function toElements(graph: ProjectedGraph, diff: boolean): ElementDefinition[] {
  const nodes = graph.nodes.map((node) => {
    const label = `${STATUS_MARK[node.status]}${node.label}`;
    return {
      group: 'nodes' as const,
      data: {
        id: node.id,
        label,
        kind: node.kind,
        status: node.status,
        ...nodeSize(label, node.kind),
      },
      classes: [
        `kind-${node.kind}`,
        `status-${node.status}`,
        diff ? 'diff' : '',
        node.context ? 'context' : '',
      ].join(' '),
    };
  });
  const loops = spreadSelfLoops(graph.edges);
  const edges = graph.edges.map((edge) => {
    const loop = loops.get(edge.id);
    return {
      group: 'edges' as const,
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label:
          edge.kind === 'subClassOf' || edge.kind === 'subPropertyOf'
            ? ''
            : `${STATUS_MARK[edge.status]}${edge.label}`,
        ...(loop && {
          loopDirection: loop.direction,
          loopSweep: loop.sweep,
          labelDx: loop.labelOffset.x,
          labelDy: loop.labelOffset.y,
        }),
      },
      classes: [`kind-${edge.kind}`, `status-${edge.status}`, diff ? 'diff' : ''].join(' '),
    };
  });
  return [...nodes, ...edges];
}

/**
 * Cytoscape keeps text margins in model space, so they follow the edge only if recomputed when
 * nodes move. Self loops keep the fixed offset they got from spreadSelfLoops.
 */
function placeEdgeLabels(edges: EdgeCollection): void {
  edges.forEach((edge) => {
    const offset = edgeLabelOffset(edge.source().position(), edge.target().position());
    edge.data({ labelDx: offset.x, labelDy: offset.y });
  });
}

function runLayout(cy: Core, layout: LayoutName): void {
  if (cy.nodes().empty()) return;
  const options = layout === 'force' ? forceLayout(cy.nodes().length) : layeredLayout('TB');
  withSeededRandom(() => cy.layout(options).run());
}

/** New nodes go next to a neighbor that already has a place, so a small edit does not reshuffle the picture. */
function placeFromPrevious(cy: Core, previous: Map<string, Position>): void {
  const fresh: NodeSingular[] = [];
  cy.nodes().forEach((node) => {
    const position = previous.get(node.id());
    if (position) node.position(position);
    else fresh.push(node);
  });
  const known = cy
    .nodes()
    .filter((node) => previous.has(node.id()))
    .boundingBox({});
  const fallback = { x: known.x2 + 120, y: known.y1 };
  fresh.forEach((node, index) => {
    const base =
      node
        .neighborhood()
        .nodes()
        .map((other) => previous.get(other.id()))
        .find(Boolean) ?? fallback;
    const angle = index * GOLDEN_ANGLE;
    node.position({ x: base.x + 120 * Math.cos(angle), y: base.y + 120 * Math.sin(angle) });
  });
}

function select(cy: Core, nodeId: string | null, center: boolean): void {
  cy.batch(() => {
    cy.elements().removeClass('faded highlighted').unselect();
    if (!nodeId) return;
    const node = cy.getElementById(nodeId);
    if (node.empty()) return;
    const around = node.closedNeighborhood();
    cy.elements().not(around).addClass('faded');
    around.addClass('highlighted');
    node.select();
  });
  const node = nodeId ? cy.getElementById(nodeId) : null;
  if (center && node?.nonempty()) {
    cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1) }, { duration: 250 });
  }
}

function centerAt(cy: Core, position: Position): void {
  cy.pan({
    x: cy.width() / 2 - position.x * cy.zoom(),
    y: cy.height() / 2 - position.y * cy.zoom(),
  });
}

function minimapScene(cy: Core): MinimapScene {
  return {
    nodes: cy.nodes().map((node) => ({
      ...node.position(),
      kind: node.data('kind') as NodeKind,
      status: node.data('status') as ChangeStatus,
    })),
    extent: cy.extent(),
  };
}

function zoomBy(cy: Core, factor: number): void {
  const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
  cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
}

const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * With a node selected, arrow keys move to the connected node in that direction and Enter
 * focuses on it. Without a selection, arrow keys pan and Enter selects the node nearest the center.
 */
function handleKey(cy: Core, event: KeyboardEvent, events: GraphViewEvents): void {
  const selected = cy.nodes(':selected').first();
  const direction = ARROWS[event.key];
  if (direction && selected.nonempty()) moveSelection(cy, selected, direction, events);
  else if (direction) cy.panBy(panFor(direction));
  else if (event.key === 'Enter' && selected.nonempty()) events.onFocus(selected.id());
  else if (event.key === 'Enter') selectNearestToCenter(cy, events);
  else if (event.key === '+' || event.key === '=') zoomBy(cy, 1.2);
  else if (event.key === '-') zoomBy(cy, 1 / 1.2);
  else if (event.key === '0') cy.fit(undefined, 40);
  else if (event.key === 'Escape') events.onSelect(null);
  else return;
  event.preventDefault();
}

function panFor(direction: Direction): Position {
  const pans: Record<Direction, Position> = {
    left: { x: PAN_STEP, y: 0 },
    right: { x: -PAN_STEP, y: 0 },
    up: { x: 0, y: PAN_STEP },
    down: { x: 0, y: -PAN_STEP },
  };
  return pans[direction];
}

function moveSelection(
  cy: Core,
  from: NodeSingular,
  direction: Direction,
  events: GraphViewEvents,
): void {
  const neighbors = from
    .neighborhood()
    .nodes()
    .map((node) => ({ id: node.id(), position: node.position() }));
  const nextId = nearestInDirection(from.position(), neighbors, direction);
  if (!nextId) return;
  events.onSelect(nextId);
  cy.animate({ center: { eles: cy.getElementById(nextId) } }, { duration: 150 });
}

function selectNearestToCenter(cy: Core, events: GraphViewEvents): void {
  const extent = cy.extent();
  const center = { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };
  const nearest = cy.nodes().min((node: NodeSingular) => {
    const { x, y } = node.position();
    return Math.hypot(x - center.x, y - center.y);
  });
  if (nearest.ele) events.onSelect(nearest.ele.id());
}
