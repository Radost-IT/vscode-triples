import type { StylesheetJson } from 'cytoscape';
import type { NodeKind } from '../core/view/project';
import { KIND_LOOK, type Palette } from './theme';

export function graphStylesheet(palette: Palette): StylesheetJson {
  const borderWidth = palette.highContrast ? 2 : 1.5;
  const kindRules = (Object.keys(KIND_LOOK) as NodeKind[]).map((kind) => ({
    selector: `node.kind-${kind}`,
    style: {
      shape: KIND_LOOK[kind].shape,
      'background-color': palette.kinds[kind],
      'border-color': palette.kinds[kind],
      'border-style': KIND_LOOK[kind].dashed ? ('dashed' as const) : ('solid' as const),
    },
  }));
  const statusRules = (['added', 'removed', 'modified'] as const).map((status) => ({
    selector: `.status-${status}`,
    style: {
      'background-color': palette.status[status],
      'border-color': palette.status[status],
      'line-color': palette.status[status],
      'target-arrow-color': palette.status[status],
      'source-arrow-color': palette.status[status],
      color: palette.foreground,
    },
  }));

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        width: 'data(width)',
        height: 'data(height)',
        'background-opacity': palette.highContrast ? 0 : 0.22,
        'border-width': borderWidth,
        color: palette.foreground,
        'font-family': palette.fontFamily,
        'font-size': 12,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'ellipsis',
        'text-max-width': '180px',
        'min-zoomed-font-size': 7,
      },
    },
    ...kindRules,
    { selector: 'node.kind-literal', style: { 'font-size': 11, 'font-style': 'italic' } },
    {
      selector: 'edge',
      style: {
        width: 1.2,
        'curve-style': 'bezier',
        'line-color': palette.edge,
        'target-arrow-color': palette.edge,
        'source-arrow-color': palette.edge,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.9,
        label: 'data(label)',
        color: palette.muted,
        'font-family': palette.fontFamily,
        'font-size': 10,
        'text-rotation': 'autorotate',
        'text-background-color': palette.background,
        'text-background-opacity': 0.85,
        'text-background-padding': '2px',
        'min-zoomed-font-size': 8,
      },
    },
    {
      selector: 'edge.kind-subClassOf, edge.kind-subPropertyOf',
      style: { width: 1, 'target-arrow-fill': 'hollow', 'arrow-scale': 1.3 },
    },
    { selector: 'edge.kind-type', style: { 'line-style': 'dotted', 'target-arrow-shape': 'vee' } },
    { selector: 'edge.kind-restriction', style: { 'line-style': 'dashed', width: 1.4 } },
    { selector: 'edge.kind-domain, edge.kind-range', style: { 'line-style': 'dashed', width: 1 } },
    { selector: 'edge.kind-equivalent', style: { 'target-arrow-shape': 'none', width: 2.5 } },
    {
      selector: 'edge.kind-disjoint',
      style: { 'line-style': 'dashed', 'target-arrow-shape': 'tee' },
    },
    { selector: 'edge.kind-inverse', style: { 'source-arrow-shape': 'triangle' } },
    { selector: 'edge.kind-annotation', style: { 'line-style': 'dotted', width: 1, opacity: 0.7 } },
    { selector: 'edge.kind-property', style: { width: 1.6, color: palette.foreground } },
    ...statusRules,
    {
      selector: 'node.status-added, node.status-removed, node.status-modified',
      style: { 'border-width': 3, 'background-opacity': 0.35 },
    },
    { selector: 'node.status-removed', style: { 'border-style': 'dashed', opacity: 0.75 } },
    { selector: 'node.status-modified', style: { 'border-style': 'double', 'border-width': 5 } },
    { selector: 'edge.status-removed', style: { 'line-style': 'dashed', opacity: 0.75 } },
    { selector: 'edge.status-added, edge.status-modified', style: { width: 2.4 } },
    { selector: '.diff.status-unchanged', style: { opacity: 0.55 } },
    { selector: '.context', style: { opacity: 0.35 } },
    { selector: '.faded', style: { opacity: 0.12, 'text-opacity': 0 } },
    {
      selector: 'edge.highlighted',
      style: {
        width: 2.4,
        'line-color': palette.focus,
        'target-arrow-color': palette.focus,
        'source-arrow-color': palette.focus,
        opacity: 1,
      },
    },
    { selector: 'node.highlighted', style: { opacity: 1, 'text-opacity': 1 } },
    {
      selector: 'node:selected',
      style: {
        'border-width': 4,
        'border-color': palette.focus,
        'border-style': 'solid',
        opacity: 1,
        'text-opacity': 1,
      },
    },
  ];
}

/** Rough label size so nodes grow with their text without measuring on every render. */
export function nodeSize(label: string, kind: NodeKind): { width: number; height: number } {
  const textWidth = Math.min(label.length, 28) * 7;
  if (kind === 'individual') return { width: textWidth + 44, height: 42 };
  if (kind === 'class' || kind === 'expression') return { width: textWidth + 34, height: 38 };
  if (kind === 'literal') return { width: textWidth + 16, height: 24 };
  return { width: textWidth + 24, height: 30 };
}
