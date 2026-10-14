import type { NodeKind } from '../core/view/project';
import { h } from './dom';
import { edgeLegend, kindNames, statusNames, strings } from './strings';
import { KIND_LOOK, STATUS_MARK, readPalette } from './theme';

const SVG = 'http://www.w3.org/2000/svg';

const SHAPE_POINTS: Partial<Record<string, string>> = {
  diamond: '10,1 19,8 10,15 1,8',
  hexagon: '5,1 15,1 19,8 15,15 5,15 1,8',
  octagon: '6,1 14,1 19,5 19,11 14,15 6,15 1,11 1,5',
  'round-tag': '1,1 15,1 19,8 15,15 1,15',
};

/** Shapes for the node kinds that occur in the current file, so the legend stays short. */
export function renderLegend(
  target: HTMLElement,
  kinds: ReadonlySet<NodeKind>,
  diff: boolean,
): void {
  const palette = readPalette();
  const kindItems = (Object.keys(KIND_LOOK) as NodeKind[])
    .filter((kind) => kinds.has(kind))
    .map((kind) => h('li', {}, shapeIcon(kind, palette.kinds[kind]), ` ${kindNames[kind]}`));
  const edgeItems = Object.values(edgeLegend).map((label) => h('li', {}, label));
  const statusItems = diff
    ? (['added', 'removed', 'modified'] as const).map((status) =>
        h(
          'li',
          { class: `status-${status}` },
          h('span', { class: `swatch status-${status}` }),
          ` ${STATUS_MARK[status]}${statusNames[status]}`,
        ),
      )
    : [];
  target.replaceChildren(
    h('h2', {}, strings.legend),
    h('ul', { class: 'legend-list' }, ...kindItems),
    h('ul', { class: 'legend-list' }, ...edgeItems),
    statusItems.length > 0 ? h('ul', { class: 'legend-list' }, ...statusItems) : '',
  );
}

function shapeIcon(kind: NodeKind, color: string): SVGSVGElement {
  const look = KIND_LOOK[kind];
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 20 16');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const points = SHAPE_POINTS[look.shape];
  const shape = document.createElementNS(
    SVG,
    points ? 'polygon' : look.shape === 'ellipse' ? 'ellipse' : 'rect',
  );
  if (points) shape.setAttribute('points', points);
  else if (look.shape === 'ellipse')
    Object.entries({ cx: 10, cy: 8, rx: 9, ry: 7 }).forEach(([name, value]) =>
      shape.setAttribute(name, String(value)),
    );
  else
    Object.entries({
      x: 1,
      y: 2,
      width: 18,
      height: 12,
      rx: look.shape === 'rectangle' ? 0 : 4,
    }).forEach(([name, value]) => shape.setAttribute(name, String(value)));
  shape.setAttribute('fill', color);
  shape.setAttribute('fill-opacity', '0.25');
  shape.setAttribute('stroke', color);
  shape.setAttribute('stroke-width', '1.5');
  if (look.dashed) shape.setAttribute('stroke-dasharray', '3 2');
  svg.append(shape);
  return svg;
}
