import type { Core, EdgeSingular, NodeSingular, Position } from 'cytoscape';

const PADDING = 30;

/**
 * Writes the current drawing as standalone SVG from the rendered positions and
 * styles. cytoscape-svg would do this but is GPL-3.0, so it is not bundled.
 */
export function exportSvg(cy: Core, background: string): string {
  const box = cy.elements(':visible').boundingBox({});
  const width = Math.ceil(box.w + PADDING * 2);
  const height = Math.ceil(box.h + PADDING * 2);
  const shift = (point: Position) => ({
    x: point.x - box.x1 + PADDING,
    y: point.y - box.y1 + PADDING,
  });

  const edges = cy.edges(':visible').map((edge) => edgeSvg(edge, shift));
  const nodes = cy.nodes(':visible').map((node) => nodeSvg(node, shift));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${escapeXml(background)}"/>`,
    ...edges,
    ...nodes,
    '</svg>',
  ].join('\n');
}

function nodeSvg(node: NodeSingular, shift: (point: Position) => Position): string {
  const center = shift(node.position());
  const width = node.width();
  const height = node.height();
  const color = node.style('border-color') as string;
  const fill = node.style('background-color') as string;
  const dash = dashArray(node.style('border-style') as string);
  const shape = shapePath(node.style('shape') as string, center, width, height);
  const label = node.style('label') as string;
  return [
    `<g opacity="${Number(node.style('opacity'))}">`,
    `<path d="${shape}" fill="${escapeXml(fill)}" fill-opacity="${Number(node.style('background-opacity'))}" stroke="${escapeXml(color)}" stroke-width="${parseFloat(node.style('border-width') as string)}"${dash}/>`,
    label
      ? textSvg(
          label,
          center,
          node.style('color') as string,
          parseFloat(node.style('font-size') as string),
        )
      : '',
    '</g>',
  ].join('');
}

function edgeSvg(edge: EdgeSingular, shift: (point: Position) => Position): string {
  const start = shift(edge.sourceEndpoint());
  const end = shift(edge.targetEndpoint());
  const controls = (edge.controlPoints() ?? []).map(shift);
  const color = edge.style('line-color') as string;
  const width = parseFloat(edge.style('width') as string);
  const dash = dashArray(edge.style('line-style') as string);
  const path =
    controls.length > 0
      ? `M${start.x},${start.y} ${controls
          .map((point, index) => {
            const next = controls[index + 1];
            const to = next ? { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 } : end;
            return `Q${point.x},${point.y} ${to.x},${to.y}`;
          })
          .join(' ')}`
      : `M${start.x},${start.y} L${end.x},${end.y}`;
  const from = controls.at(-1) ?? start;
  const arrow = arrowSvg(
    edge.style('target-arrow-shape') as string,
    edge.style('target-arrow-fill') as string,
    from,
    end,
    color,
  );
  const label = edge.style('label') as string;
  const midpoint = shift(edge.midpoint());
  const middle = {
    x: midpoint.x + parseFloat(edge.style('text-margin-x') as string),
    y: midpoint.y + parseFloat(edge.style('text-margin-y') as string),
  };
  return [
    `<g opacity="${Number(edge.style('opacity'))}">`,
    `<path d="${path}" fill="none" stroke="${escapeXml(color)}" stroke-width="${width}"${dash}/>`,
    arrow,
    label
      ? textSvg(
          label,
          middle,
          edge.style('color') as string,
          parseFloat(edge.style('font-size') as string),
        )
      : '',
    '</g>',
  ].join('');
}

function arrowSvg(
  shape: string,
  fill: string,
  from: Position,
  tip: Position,
  color: string,
): string {
  if (shape === 'none') return '';
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const point = (back: number, side: number) => ({
    x: tip.x - back * Math.cos(angle) + side * Math.sin(angle),
    y: tip.y - back * Math.sin(angle) - side * Math.cos(angle),
  });
  if (shape === 'tee') {
    const [a, b] = [point(1, 6), point(1, -6)];
    return `<path d="M${a.x},${a.y} L${b.x},${b.y}" stroke="${escapeXml(color)}" stroke-width="2"/>`;
  }
  const [left, right] = [point(11, 5), point(11, -5)];
  const notch = shape === 'vee' ? point(7, 0) : null;
  const corners = notch ? [tip, left, notch, right] : [tip, left, right];
  const fillColor = fill === 'hollow' ? 'none' : escapeXml(color);
  return `<path d="M${corners.map((corner) => `${corner.x},${corner.y}`).join(' L')} Z" fill="${fillColor}" stroke="${escapeXml(color)}" stroke-width="1.2"/>`;
}

function shapePath(shape: string, center: Position, width: number, height: number): string {
  const [x, y, w, h] = [center.x, center.y, width / 2, height / 2];
  const polygon = (points: [number, number][]) =>
    `M${points.map(([px, py]) => `${x + px * w},${y + py * h}`).join(' L')} Z`;
  switch (shape) {
    case 'ellipse':
      return `M${x - w},${y} A${w},${h} 0 1 0 ${x + w},${y} A${w},${h} 0 1 0 ${x - w},${y} Z`;
    case 'diamond':
      return polygon([
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]);
    case 'hexagon':
      return polygon([
        [-0.5, -1],
        [0.5, -1],
        [1, 0],
        [0.5, 1],
        [-0.5, 1],
        [-1, 0],
      ]);
    case 'octagon':
      return polygon([
        [-0.4, -1],
        [0.4, -1],
        [1, -0.4],
        [1, 0.4],
        [0.4, 1],
        [-0.4, 1],
        [-1, 0.4],
        [-1, -0.4],
      ]);
    case 'round-tag':
      return polygon([
        [-1, -1],
        [0.6, -1],
        [1, 0],
        [0.6, 1],
        [-1, 1],
      ]);
    case 'round-rectangle':
    case 'barrel': {
      const radius = Math.min(8, h);
      return `M${x - w + radius},${y - h} H${x + w - radius} Q${x + w},${y - h} ${x + w},${y - h + radius} V${y + h - radius} Q${x + w},${y + h} ${x + w - radius},${y + h} H${x - w + radius} Q${x - w},${y + h} ${x - w},${y + h - radius} V${y - h + radius} Q${x - w},${y - h} ${x - w + radius},${y - h} Z`;
    }
    default:
      return polygon([
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]);
  }
}

function textSvg(text: string, at: Position, color: string, size: number): string {
  return `<text x="${at.x}" y="${at.y}" fill="${escapeXml(color)}" font-family="sans-serif" font-size="${size}" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`;
}

function dashArray(style: string): string {
  if (style === 'dashed') return ' stroke-dasharray="6 4"';
  if (style === 'dotted') return ' stroke-dasharray="1.5 3"';
  return '';
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
