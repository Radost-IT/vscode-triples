import type { ChangeStatus } from '../core/diff/diff';
import type { NodeKind } from '../core/view/project';

const PADDING = 6;

export interface Box {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface MinimapNode {
  readonly x: number;
  readonly y: number;
  readonly kind: NodeKind;
  readonly status: ChangeStatus;
}

export interface MinimapScene {
  readonly nodes: readonly MinimapNode[];
  /** The part of the graph that is visible in the main view. */
  readonly extent: Box;
}

export interface Projection {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Fits `bounds` into the minimap, centered, keeping the aspect ratio. */
export function projectionFor(bounds: Box, width: number, height: number): Projection {
  const boundsWidth = Math.max(bounds.x2 - bounds.x1, 1);
  const boundsHeight = Math.max(bounds.y2 - bounds.y1, 1);
  const scale = Math.min(
    (width - 2 * PADDING) / boundsWidth,
    (height - 2 * PADDING) / boundsHeight,
  );
  return {
    scale,
    offsetX: (width - boundsWidth * scale) / 2 - bounds.x1 * scale,
    offsetY: (height - boundsHeight * scale) / 2 - bounds.y1 * scale,
  };
}

export function toGraphPoint(
  projection: Projection,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (point.x - projection.offsetX) / projection.scale,
    y: (point.y - projection.offsetY) / projection.scale,
  };
}

/** Bounds of the nodes and the visible extent together, so the viewport box never leaves the map. */
export function sceneBounds(scene: MinimapScene): Box {
  return scene.nodes.reduce<Box>(
    (box, node) => ({
      x1: Math.min(box.x1, node.x),
      y1: Math.min(box.y1, node.y),
      x2: Math.max(box.x2, node.x),
      y2: Math.max(box.y2, node.y),
    }),
    scene.extent,
  );
}
