import type { ChangeStatus } from '../core/diff/diff';
import type { NodeKind } from '../core/view/project';

export type NodeShape =
  | 'ellipse'
  | 'round-rectangle'
  | 'rectangle'
  | 'diamond'
  | 'hexagon'
  | 'round-tag'
  | 'octagon'
  | 'barrel';

interface KindLook {
  readonly shape: NodeShape;
  readonly colorVariable: string;
  readonly fallback: string;
  readonly dashed: boolean;
}

/** Each kind differs by shape as well as color, so the legend still works without color. */
export const KIND_LOOK: Record<NodeKind, KindLook> = {
  class: {
    shape: 'ellipse',
    colorVariable: '--vscode-charts-blue',
    fallback: '#3794ff',
    dashed: false,
  },
  objectProperty: {
    shape: 'round-rectangle',
    colorVariable: '--vscode-charts-purple',
    fallback: '#b180d7',
    dashed: false,
  },
  datatypeProperty: {
    shape: 'rectangle',
    colorVariable: '--vscode-charts-green',
    fallback: '#89d185',
    dashed: false,
  },
  annotationProperty: {
    shape: 'round-tag',
    colorVariable: '--vscode-charts-yellow',
    fallback: '#cca700',
    dashed: false,
  },
  property: {
    shape: 'round-rectangle',
    colorVariable: '--vscode-descriptionForeground',
    fallback: '#8b8b8b',
    dashed: false,
  },
  individual: {
    shape: 'diamond',
    colorVariable: '--vscode-terminal-ansiCyan',
    fallback: '#11a8cd',
    dashed: false,
  },
  datatype: {
    shape: 'hexagon',
    colorVariable: '--vscode-charts-orange',
    fallback: '#d18616',
    dashed: false,
  },
  expression: {
    shape: 'octagon',
    colorVariable: '--vscode-descriptionForeground',
    fallback: '#8b8b8b',
    dashed: true,
  },
  resource: {
    shape: 'barrel',
    colorVariable: '--vscode-descriptionForeground',
    fallback: '#8b8b8b',
    dashed: true,
  },
  literal: {
    shape: 'rectangle',
    colorVariable: '--vscode-descriptionForeground',
    fallback: '#8b8b8b',
    dashed: true,
  },
};

const STATUS_VARIABLES: Record<Exclude<ChangeStatus, 'unchanged'>, [string, string]> = {
  added: ['--vscode-gitDecoration-addedResourceForeground', '#81b88b'],
  removed: ['--vscode-gitDecoration-deletedResourceForeground', '#c74e39'],
  modified: ['--vscode-gitDecoration-modifiedResourceForeground', '#e2c08d'],
};

/** Text prefix that marks a diff status for readers who cannot tell the colors apart. */
export const STATUS_MARK: Record<ChangeStatus, string> = {
  added: '+ ',
  removed: '− ',
  modified: '~ ',
  unchanged: '',
};

export interface Palette {
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
  readonly focus: string;
  readonly edge: string;
  readonly highContrast: boolean;
  readonly kinds: Record<NodeKind, string>;
  readonly status: Record<Exclude<ChangeStatus, 'unchanged'>, string>;
  readonly fontFamily: string;
}

/** Cytoscape draws on canvas and cannot read CSS variables, so the theme is resolved here. */
export function readPalette(): Palette {
  const style = getComputedStyle(document.body);
  const read = (variable: string, fallback: string) =>
    style.getPropertyValue(variable).trim() || fallback;
  const kinds = Object.fromEntries(
    Object.entries(KIND_LOOK).map(([kind, look]) => [
      kind,
      read(look.colorVariable, look.fallback),
    ]),
  ) as Record<NodeKind, string>;
  const status = Object.fromEntries(
    Object.entries(STATUS_VARIABLES).map(([name, [variable, fallback]]) => [
      name,
      read(variable, fallback),
    ]),
  ) as Palette['status'];
  const foreground = read('--vscode-editor-foreground', '#cccccc');
  return {
    background: read('--vscode-editor-background', '#1e1e1e'),
    foreground,
    muted: read('--vscode-descriptionForeground', '#8b8b8b'),
    focus: read('--vscode-focusBorder', '#007fd4'),
    edge: read('--vscode-editorLineNumber-foreground', '#858585'),
    highContrast:
      document.body.classList.contains('vscode-high-contrast') ||
      document.body.classList.contains('vscode-high-contrast-light'),
    kinds,
    status,
    fontFamily: read('--vscode-font-family', 'sans-serif'),
  };
}

export function onThemeChange(listener: () => void): void {
  new MutationObserver(listener).observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
}
