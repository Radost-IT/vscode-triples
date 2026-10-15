import { describe, expect, it } from 'vitest';
import { projectionFor, sceneBounds, toGraphPoint } from '../../src/webview/minimapProjection';

describe('minimap', () => {
  it('fits wide bounds by width and centers them vertically', () => {
    const projection = projectionFor({ x1: 0, y1: 0, x2: 1000, y2: 100 }, 112, 112);
    expect(projection.scale).toBeCloseTo(0.1);
    expect(projection.offsetX).toBeCloseTo(6);
    expect(projection.offsetY).toBeCloseTo(51);
  });

  it('maps a minimap point back to the graph point it shows', () => {
    const bounds = { x1: -200, y1: 50, x2: 600, y2: 450 };
    const projection = projectionFor(bounds, 180, 120);
    const center = {
      x: 200 * projection.scale + projection.offsetX,
      y: 250 * projection.scale + projection.offsetY,
    };
    const point = toGraphPoint(projection, center);
    expect(point.x).toBeCloseTo(200);
    expect(point.y).toBeCloseTo(250);
  });

  it('includes the visible extent, so the viewport box stays on the map', () => {
    const bounds = sceneBounds({
      nodes: [{ x: 10, y: 20, kind: 'class', status: 'unchanged' }],
      extent: { x1: -50, y1: 0, x2: 30, y2: 40 },
    });
    expect(bounds).toEqual({ x1: -50, y1: 0, x2: 30, y2: 40 });
  });
});
