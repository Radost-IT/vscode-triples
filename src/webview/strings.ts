import type { ChangeStatus, SummaryCategory } from '../core/diff/diff';
import type { EntityKind } from '../core/model/types';
import type { NodeKind } from '../core/view/project';
import { translate, type Bundle } from './l10n';

const bundle: Bundle = JSON.parse(document.getElementById('l10n')?.textContent || '{}') as Bundle;

function t(message: string, ...args: (string | number)[]): string {
  return translate(bundle, message, args);
}

/** Every string the webview shows, kept in one place for localization. */
export const strings = {
  graph: t('Graph'),
  graphKeys: t(
    'Graph. Arrow keys move between connected nodes, or pan when nothing is selected. Enter selects the node in the middle, or focuses on the selected node. Escape clears the selection.',
  ),
  selectedAnnouncement: (label: string, kind: string, status: string | null) =>
    status ? t('{0}, {1}, {2}', label, kind, status) : t('{0}, {1}', label, kind),
  hierarchy: t('Hierarchy'),
  viewSwitch: t('View'),
  searchPlaceholder: t('Search by label or IRI'),
  searchLabel: t('Search entities'),
  noSearchResults: t('No matches'),
  layoutForce: t('Force layout'),
  layoutLayered: t('Layered layout'),
  layoutLabel: t('Layout'),
  zoomIn: t('Zoom in'),
  zoomOut: t('Zoom out'),
  fit: t('Fit to screen'),
  minimap: t('Minimap'),
  minimapLabel: t('Overview of the whole graph. Click or drag to move the view.'),
  filters: t('Filters'),
  legend: t('Legend'),
  exportSvg: t('Export SVG'),
  exportPng: t('Export PNG'),
  exportNeedsDiagram: t('Switch to the graph or the tree diagram to export'),
  details: t('Details'),
  closePanel: t('Close'),
  loading: t('Reading ontology…'),
  emptyTitle: t('Nothing to show'),
  emptyBody: t('The file has no triples yet.'),
  emptyFiltered: t('Every node is hidden by the current filters.'),
  hugeTitle: (nodes: number) => t('This graph has {0} nodes', nodes.toLocaleString()),
  hugeBody: t(
    'Drawing all of them can make VS Code slow. Search for a node to see its neighborhood, hide some kinds or namespaces in Filters, or browse the hierarchy.',
  ),
  openHierarchy: t('Open hierarchy'),
  drawAnyway: t('Draw anyway'),
  problemTitle: (title: string) => t('Could not read {0}', title),
  goToLine: (line: number) => t('Go to line {0}', line),
  internalError: t('Something went wrong while reading the ontology:'),
  declutter: t('Declutter'),
  showOwlThing: t('Show owl:Thing and owl:Nothing'),
  showAnnotationLinks: t('Show annotation links'),
  showLiterals: t('Draw data values as nodes'),
  propertiesAsEdges: t('Draw properties as arrows between domain and range'),
  onlyChanges: t('Show only changes'),
  nodeKinds: t('Node kinds'),
  namespaces: t('Namespaces'),
  relations: t('Relations'),
  focusHops: t('Focus depth (hops)'),
  focusing: (label: string, hops: number) =>
    hops === 1 ? t('Focused on {0}, 1 hop', label) : t('Focused on {0}, {1} hops', label, hops),
  showAll: t('Show all'),
  hiddenCount: (count: number) => t('{0} hidden', count),
  stats: (nodes: number, edges: number) => t('{0} nodes, {1} edges', nodes, edges),
  classesTab: t('Classes'),
  propertiesTab: t('Properties'),
  outline: t('Outline'),
  diagram: t('Tree diagram'),
  leftToRight: t('Left to right'),
  topDown: t('Top down'),
  expandAll: t('Expand all'),
  collapseAll: t('Collapse all'),
  filterTree: t('Filter tree'),
  instances: (count: number) => (count === 1 ? t('1 instance') : t('{0} instances', count)),
  alsoUnder: (labels: string) => t('Also under {0}', labels),
  showMore: (count: number) => t('Show {0} more', count),
  emptyHierarchy: t('No hierarchy in this file.'),
  iri: t('IRI'),
  kind: t('Kind'),
  compactName: t('Name'),
  annotations: t('Annotations'),
  values: t('Data values'),
  outgoing: t('Relations'),
  incoming: t('Used by'),
  changes: t('Changes'),
  noDetails: t('Select a node to see its details.'),
  diffSummary: t('Changes'),
  diffTitle: (before: string, after: string) => t('{0} → {1}', before, after),
  noChanges: t('No semantic changes. The two versions describe the same triples.'),
  tripleCounts: (added: number, removed: number) =>
    t('{0} triples added, {1} removed', added, removed),
  missingSide: t('does not exist'),
  ontologyHeader: t('Ontology header'),
} as const;

export const kindNames: Record<NodeKind, string> = {
  class: t('Class'),
  objectProperty: t('Object property'),
  datatypeProperty: t('Datatype property'),
  annotationProperty: t('Annotation property'),
  property: t('Property'),
  individual: t('Individual'),
  datatype: t('Datatype'),
  expression: t('Class expression'),
  resource: t('Resource'),
  literal: t('Data value'),
};

export const statusNames: Record<ChangeStatus, string> = {
  added: t('Added'),
  removed: t('Removed'),
  modified: t('Modified'),
  unchanged: t('Unchanged'),
};

export const categoryNames: Record<SummaryCategory, string> = {
  classes: t('Classes'),
  properties: t('Properties'),
  individuals: t('Individuals'),
  other: t('Other'),
};

export const edgeLegend = {
  subClassOf: t('Subclass of (hollow arrow)'),
  property: t('Property or relation'),
  type: t('Instance of (dotted)'),
  restriction: t('Restriction (dashed)'),
} as const;

export const filterableKinds: readonly EntityKind[] = [
  'class',
  'objectProperty',
  'datatypeProperty',
  'annotationProperty',
  'property',
  'individual',
  'datatype',
  'expression',
  'resource',
];
