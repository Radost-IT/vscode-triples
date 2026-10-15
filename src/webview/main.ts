import type { AnalysisRequest, AnalysisResult, SourceProblem } from '../core/analyze';
import type { ChangeStatus, DiffResult } from '../core/diff/diff';
import type { OntologyModel } from '../core/model/types';
import type { HostMessage, ViewMode, WebviewMessage } from '../core/protocol';
import { neighborhood } from '../core/view/neighborhood';
import {
  DEFAULT_VIEW_OPTIONS,
  projectGraph,
  type NodeKind,
  type ProjectedGraph,
  type ViewOptions,
} from '../core/view/project';
import { renderDetails, indexEdges, type DetailsContext } from './detailsPanel';
import { renderDiffPanel } from './diffPanel';
import { h } from './dom';
import { renderFilters, type FilterState } from './filtersPanel';
import { createGraphView, type Viewport } from './graphView';
import { createHierarchyView, type HierarchySettings } from './hierarchyView';
import type { LayoutName } from './layout';
import { renderLegend } from './legend';
import { createMinimap } from './minimap';
import { createSearchBox } from './searchBox';
import { kindNames, statusNames, strings } from './strings';
import { exportSvg } from './svgExport';
import { onThemeChange, readPalette } from './theme';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: PersistedState): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface PersistedState {
  readonly options: ViewOptions;
  readonly layout: LayoutName;
  readonly hops: number;
  readonly selectedId: string | null;
  readonly viewport: Viewport | null;
  readonly hierarchy: HierarchySettings;
  readonly panels: {
    readonly filters: boolean;
    readonly legend: boolean;
    readonly details: boolean;
    readonly changes: boolean;
    readonly minimap: boolean;
  };
}

interface Loaded {
  readonly request: AnalysisRequest;
  readonly model: OntologyModel;
  readonly diff: DiffResult | null;
  readonly details: DetailsContext;
}

const DEFAULT_STATE: PersistedState = {
  options: DEFAULT_VIEW_OPTIONS,
  layout: 'force',
  hops: 1,
  selectedId: null,
  viewport: null,
  hierarchy: { tab: 'classes', mode: 'outline', direction: 'LR' },
  panels: { filters: false, legend: true, details: true, changes: true, minimap: false },
};

/** Past this many nodes a full drawing makes the editor sluggish, so the user decides first. */
const HUGE_GRAPH = 20_000;
const NO_GRAPH: ProjectedGraph = { nodes: [], edges: [], hiddenEntityCount: 0 };

const vscode = acquireVsCodeApi();
const savedState = vscode.getState() as Partial<PersistedState> | undefined;
// Panels added in later versions are missing from older saved state.
let state: PersistedState = {
  ...DEFAULT_STATE,
  ...savedState,
  panels: { ...DEFAULT_STATE.panels, ...savedState?.panels },
};
let viewMode: ViewMode = 'graph';
let loaded: Loaded | null = null;
let projected: ProjectedGraph = NO_GRAPH;
let nodeEntity = new Map<string, string>();
let focusNodeId: string | null = null;
let graphDirty = false;
let drawHugeGraph = false;
let latestRequestId = 0;
/** Layouts are deterministic, so after a window reload the saved zoom and pan show the same picture. */
let viewportToRestore = state.viewport;
let viewportSaveTimer: ReturnType<typeof setTimeout> | undefined;

function saveState(change: Partial<PersistedState>): void {
  state = { ...state, ...change };
  vscode.setState(state);
}

const graphHost = h('div', {
  class: 'graph',
  tabindex: 0,
  role: 'application',
  'aria-label': strings.graphKeys,
});
const graph = createGraphView(graphHost, {
  onSelect: (nodeId) => setSelection(nodeId ? (nodeEntity.get(nodeId) ?? null) : null, false),
  onFocus: (nodeId) => {
    focusNodeId = nodeId;
    drawGraph(false);
  },
  onViewportChange: (viewport) => {
    clearTimeout(viewportSaveTimer);
    viewportSaveTimer = setTimeout(() => saveState({ viewport }), 300);
  },
  onRender: () => scheduleMinimap(),
});
const minimap = createMinimap(strings.minimapLabel, (center) => graph.centerAt(center));
let minimapFrame = 0;
const hierarchy = createHierarchyView(state.hierarchy, {
  onSelect: (entityId) => setSelection(entityId, false),
  onSettingsChange: (settings) => saveState({ hierarchy: settings }),
});
const search = createSearchBox((entityId) => setSelection(entityId, true));

const viewButtons = (['graph', 'hierarchy'] as const).map((mode) =>
  h(
    'button',
    { class: 'segment', 'data-mode': mode, onclick: () => switchView(mode, true) },
    mode === 'graph' ? strings.graph : strings.hierarchy,
  ),
);
const layoutSelect = h(
  'select',
  {
    'aria-label': strings.layoutLabel,
    onchange: () => {
      saveState({ layout: layoutSelect.value as LayoutName });
      drawGraph(false);
    },
  },
  h('option', { value: 'force' }, strings.layoutForce),
  h('option', { value: 'layered' }, strings.layoutLayered),
);
const iconButton = (label: string, text: string, onclick: () => void) =>
  h('button', { class: 'icon-button', title: label, 'aria-label': label, onclick }, text);
const panelToggle = (panel: keyof PersistedState['panels'], label: string) =>
  h(
    'button',
    {
      class: 'text-button',
      'aria-pressed': String(state.panels[panel]),
      onclick: () => togglePanel(panel),
    },
    label,
  );
const filtersButton = panelToggle('filters', strings.filters);
const legendButton = panelToggle('legend', strings.legend);
const detailsButton = panelToggle('details', strings.details);
const changesButton = panelToggle('changes', strings.diffSummary);
const minimapButton = panelToggle('minimap', strings.minimap);
const exportSvgButton = h(
  'button',
  { class: 'text-button', onclick: () => exportView('svg') },
  strings.exportSvg,
);
const exportPngButton = h(
  'button',
  { class: 'text-button', onclick: () => exportView('png') },
  strings.exportPng,
);
const stats = h('span', { class: 'stats', 'aria-live': 'polite' });
const graphControls = h(
  'span',
  { class: 'group' },
  layoutSelect,
  iconButton(strings.zoomOut, '−', () => graph.zoomBy(1 / 1.25)),
  iconButton(strings.zoomIn, '+', () => graph.zoomBy(1.25)),
  iconButton(strings.fit, '⤢', () => graph.fit()),
  minimapButton,
);

const toolbar = h(
  'header',
  { class: 'toolbar', role: 'toolbar', 'aria-label': strings.viewSwitch },
  h(
    'span',
    { class: 'segmented', role: 'group', 'aria-label': strings.viewSwitch },
    ...viewButtons,
  ),
  search.element,
  graphControls,
  filtersButton,
  legendButton,
  detailsButton,
  changesButton,
  exportSvgButton,
  exportPngButton,
  stats,
);
const focusText = h('span', {});
const banner = h(
  'div',
  { class: 'banner', role: 'status', hidden: true },
  focusText,
  h(
    'button',
    {
      class: 'text-button',
      onclick: () => {
        focusNodeId = null;
        drawGraph(false);
      },
    },
    strings.showAll,
  ),
);
const changesPanel = h('aside', { class: 'panel changes', 'aria-label': strings.diffSummary });
const filtersPanel = h('aside', { class: 'panel popover filters', 'aria-label': strings.filters });
const legendPanel = h('aside', { class: 'panel popover legend', 'aria-label': strings.legend });
const detailsPanel = h('aside', {
  class: 'panel details',
  'aria-label': strings.details,
});
const announcer = h('div', { class: 'sr-only', 'aria-live': 'polite' });
const overlay = h('div', { class: 'overlay', role: 'alert' });
const stage = h(
  'div',
  { class: 'stage' },
  graphHost,
  hierarchy.element,
  filtersPanel,
  legendPanel,
  minimap.element,
  overlay,
);
document.body.append(
  toolbar,
  banner,
  h('main', { class: 'workspace' }, changesPanel, stage, detailsPanel),
  announcer,
);

const workerReady = createWorker(document.body.dataset['workerUri'] ?? '');

async function createWorker(url: string): Promise<Worker> {
  // Webviews cannot start a worker from a vscode-resource URL directly, so the bundle is loaded as a blob.
  const source = await (await fetch(url)).text();
  const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) =>
    onWorkerResponse(event.data),
  );
  worker.addEventListener('error', (event) =>
    showOverlay([h('h2', {}, strings.internalError), h('pre', {}, event.message)]),
  );
  return worker;
}

const requests = new Map<number, AnalysisRequest>();

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message.type !== 'analyze') return;
  const id = ++latestRequestId;
  requests.set(id, message.request);
  if (!loaded) showOverlay([h('p', { class: 'muted' }, strings.loading)]);
  switchView(message.viewMode, false);
  void workerReady.then((worker) =>
    worker.postMessage({ id, request: message.request } satisfies WorkerRequest),
  );
});

function onWorkerResponse(response: WorkerResponse): void {
  const request = requests.get(response.id);
  requests.delete(response.id);
  if (response.id !== latestRequestId || !request) return;
  if ('failure' in response) {
    showOverlay([h('h2', {}, strings.internalError), h('pre', {}, response.failure)]);
    return;
  }
  applyResult(request, response.result);
}

function applyResult(request: AnalysisRequest, result: AnalysisResult): void {
  if (result.kind === 'problems') {
    showProblems(result.problems);
    return;
  }
  const model = result.kind === 'single' ? result.model : result.diff.model;
  const diff = result.kind === 'diff' ? result.diff : null;
  const reuse = loaded !== null;
  const changesById = new Map(diff?.changes.map((change) => [change.id, change]));
  loaded = {
    request,
    model,
    diff,
    details: {
      model,
      edgesBySource: indexEdges(model.edges, 'source'),
      edgesByTarget: indexEdges(model.edges, 'target'),
      status: (entityId): ChangeStatus => diff?.entityStatus[entityId] ?? 'unchanged',
      changesOf: (entityId) => changesById.get(entityId),
      onNavigate: (entityId) => setSelection(entityId, true),
    },
  };
  if (state.selectedId && !model.entities[state.selectedId]) saveState({ selectedId: null });
  if (focusNodeId && !model.entities[focusNodeId]) focusNodeId = null;
  overlay.hidden = true;
  search.setModel(model);
  hierarchy.setOnlyChanges(state.options.onlyChanges && diff !== null);
  hierarchy.setModel(model, diff?.entityStatus ?? null);
  drawPanels();
  drawGraph(reuse);
  if (viewMode === 'hierarchy') hierarchy.reveal(state.selectedId);
}

function showProblems(problems: readonly SourceProblem[]): void {
  showOverlay(
    problems.map((problem) =>
      h(
        'div',
        { class: 'problem' },
        h('h2', {}, strings.problemTitle(problem.title)),
        h('p', {}, problem.message),
        problem.line !== undefined
          ? h(
              'button',
              {
                class: 'link',
                onclick: () =>
                  vscode.postMessage({
                    type: 'revealLine',
                    uri: problem.uri,
                    line: problem.line ?? 1,
                    column: problem.column,
                  }),
              },
              strings.goToLine(problem.line),
            )
          : null,
      ),
    ),
  );
}

function showOverlay(content: Node[]): void {
  delete overlay.dataset['notice'];
  overlay.replaceChildren(
    h('div', { class: `overlay-card${loaded ? ' over-graph' : ''}` }, ...content),
  );
  overlay.hidden = false;
}

function drawGraph(reuse: boolean): void {
  if (!loaded) return;
  const diffStatuses = loaded.diff ?? undefined;
  const full = projectGraph(loaded.model, state.options, diffStatuses);
  projected = full;
  if (focusNodeId && full.nodes.some((node) => node.id === focusNodeId)) {
    const keep = neighborhood(full, focusNodeId, state.hops);
    projected = {
      nodes: full.nodes.filter((node) => keep.has(node.id)),
      edges: full.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
      hiddenEntityCount: full.hiddenEntityCount,
    };
    const label =
      loaded.model.entities[nodeEntity.get(focusNodeId) ?? focusNodeId]?.label ?? focusNodeId;
    focusText.textContent = strings.focusing(label, state.hops);
  } else {
    focusNodeId = null;
  }
  banner.hidden = focusNodeId === null;
  nodeEntity = new Map(projected.nodes.map((node) => [node.id, node.entityId]));
  stats.textContent = [
    strings.stats(projected.nodes.length, projected.edges.length),
    projected.hiddenEntityCount > 0 ? strings.hiddenCount(projected.hiddenEntityCount) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  renderLegend(
    legendPanel,
    new Set<NodeKind>(projected.nodes.map((node) => node.kind)),
    loaded.diff !== null,
  );
  drawGraphNotice();
  if (viewMode !== 'graph') {
    graphDirty = true;
    return;
  }
  graphDirty = false;
  graph.render(isGraphHeldBack() ? NO_GRAPH : projected, {
    layout: state.layout,
    diff: loaded.diff !== null,
    reuse,
  });
  graph.select(state.selectedId, false);
  if (viewportToRestore && projected.nodes.length > 0 && !isGraphHeldBack()) {
    graph.setViewport(viewportToRestore);
    viewportToRestore = null;
  } else if (!reuse) {
    // The panel may still be growing to its final size when the layout first fits the graph.
    requestAnimationFrame(() => {
      graph.resize();
      graph.fit();
    });
  }
}

function isGraphHeldBack(): boolean {
  return projected.nodes.length > HUGE_GRAPH && !drawHugeGraph;
}

/** Explains an empty or held-back graph. Problem overlays carry no notice and are left alone. */
function drawGraphNotice(): void {
  const notice =
    !loaded || viewMode !== 'graph'
      ? null
      : projected.nodes.length === 0
        ? 'empty'
        : isGraphHeldBack()
          ? 'huge'
          : null;
  if (!notice) {
    if (overlay.dataset['notice']) overlay.hidden = true;
    delete overlay.dataset['notice'];
    return;
  }
  showOverlay(notice === 'empty' ? emptyNotice() : hugeNotice());
  overlay.dataset['notice'] = notice;
}

function emptyNotice(): Node[] {
  const filtered = Object.keys(loaded?.model.entities ?? {}).length > 0;
  return [
    h('h2', {}, strings.emptyTitle),
    h('p', {}, filtered ? strings.emptyFiltered : strings.emptyBody),
  ];
}

function hugeNotice(): Node[] {
  return [
    h('h2', {}, strings.hugeTitle(projected.nodes.length)),
    h('p', {}, strings.hugeBody),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        { class: 'text-button primary', onclick: () => switchView('hierarchy', true) },
        strings.openHierarchy,
      ),
      h(
        'button',
        {
          class: 'text-button',
          onclick: () => {
            drawHugeGraph = true;
            drawGraph(false);
          },
        },
        strings.drawAnyway,
      ),
    ),
  ];
}

function drawPanels(): void {
  if (!loaded) return;
  const filterState: FilterState = {
    options: state.options,
    hops: state.hops,
    diff: loaded.diff !== null,
  };
  renderFilters(filtersPanel, loaded.model, filterState, (next) => {
    saveState({ options: next.options, hops: next.hops });
    hierarchy.setOnlyChanges(next.options.onlyChanges && loaded?.diff != null);
    drawPanels();
    drawGraph(true);
  });
  renderDetails(detailsPanel, state.selectedId, loaded.details);
  if (loaded.diff && loaded.request.kind === 'diff') {
    renderDiffPanel(
      changesPanel,
      loaded.diff,
      {
        before: loaded.request.before?.title ?? strings.missingSide,
        after: loaded.request.after?.title ?? strings.missingSide,
      },
      (entityId) => setSelection(entityId, true),
    );
  }
  syncPanels();
}

function syncPanels(): void {
  const diff = loaded?.diff !== null && loaded?.diff !== undefined;
  filtersPanel.hidden = !state.panels.filters;
  legendPanel.hidden = !loaded || !state.panels.legend || viewMode !== 'graph';
  detailsPanel.hidden = !state.panels.details;
  changesPanel.hidden = !state.panels.changes || !diff;
  changesButton.hidden = !diff;
  filtersButton.setAttribute('aria-pressed', String(state.panels.filters));
  legendButton.setAttribute('aria-pressed', String(state.panels.legend));
  detailsButton.setAttribute('aria-pressed', String(state.panels.details));
  changesButton.setAttribute('aria-pressed', String(state.panels.changes));
  minimapButton.setAttribute('aria-pressed', String(state.panels.minimap));
  minimap.element.hidden = !loaded || !state.panels.minimap || viewMode !== 'graph';
  graph.resize();
  scheduleMinimap();
}

/** The canvas fires a render event per frame, so the minimap redraws at most once per frame too. */
function scheduleMinimap(): void {
  if (minimap.element.hidden || minimapFrame) return;
  minimapFrame = requestAnimationFrame(() => {
    minimapFrame = 0;
    minimap.draw(graph.minimapScene(), readPalette());
  });
}

function togglePanel(panel: keyof PersistedState['panels']): void {
  saveState({ panels: { ...state.panels, [panel]: !state.panels[panel] } });
  syncPanels();
}

function setSelection(entityId: string | null, center: boolean): void {
  saveState({ selectedId: entityId });
  if (loaded) renderDetails(detailsPanel, entityId, loaded.details);
  announceSelection(entityId);
  if (center && entityId && viewMode === 'graph' && isGraphHeldBack()) {
    // The full graph is not drawn, so show the chosen node with its neighborhood instead.
    focusNodeId = entityId;
    drawGraph(false);
    return;
  }
  if (viewMode === 'graph') graph.select(entityId && graph.has(entityId) ? entityId : null, center);
  else hierarchy.reveal(entityId);
}

function announceSelection(entityId: string | null): void {
  const entity = entityId ? loaded?.model.entities[entityId] : undefined;
  if (!entity || !loaded) {
    announcer.textContent = '';
    return;
  }
  const status = loaded.diff ? loaded.details.status(entity.id) : null;
  announcer.textContent = strings.selectedAnnouncement(
    entity.label,
    kindNames[entity.kind],
    status && status !== 'unchanged' ? statusNames[status] : null,
  );
}

function switchView(mode: ViewMode, notifyHost: boolean): void {
  const changed = mode !== viewMode;
  viewMode = mode;
  viewButtons.forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset['mode'] === mode)),
  );
  graphHost.hidden = mode !== 'graph';
  graphControls.hidden = mode !== 'graph';
  hierarchy.element.hidden = mode !== 'hierarchy';
  banner.hidden = mode !== 'graph' || focusNodeId === null;
  syncPanels();
  if (notifyHost && changed) vscode.postMessage({ type: 'viewMode', mode });
  if (!loaded || !changed) return;
  if (mode === 'graph') {
    graph.resize();
    if (graphDirty) drawGraph(true);
    graph.select(state.selectedId, true);
  } else {
    hierarchy.show();
    hierarchy.reveal(state.selectedId);
  }
  drawGraphNotice();
}

function exportView(format: 'svg' | 'png'): void {
  if (!loaded) return;
  const diagram = viewMode === 'hierarchy' ? hierarchy.diagram() : null;
  if (viewMode === 'hierarchy' && !diagram) {
    showToast(strings.exportNeedsDiagram);
    return;
  }
  const background = readPalette().background;
  const data = diagram
    ? format === 'svg'
      ? exportSvg(diagram, background)
      : diagram.png({ output: 'base64uri', full: true, scale: 2, bg: background })
    : format === 'svg'
      ? graph.svg()
      : graph.png();
  const source =
    loaded.request.kind === 'single'
      ? loaded.request.source
      : (loaded.request.after ?? loaded.request.before);
  const baseName = (source?.fileName.split(/[\\/]/).pop() ?? 'ontology').replace(/\.[^.]+$/, '');
  vscode.postMessage({
    type: 'export',
    format,
    data,
    suggestedName: `${baseName}-${viewMode}.${format}`,
  });
}

function showToast(text: string): void {
  const toast = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3000);
}

onThemeChange(() => {
  graph.applyTheme();
  hierarchy.applyTheme();
  if (loaded)
    renderLegend(
      legendPanel,
      new Set<NodeKind>(projected.nodes.map((node) => node.kind)),
      loaded.diff !== null,
    );
});

layoutSelect.value = state.layout;
switchView('graph', false);
vscode.postMessage({ type: 'ready' });
