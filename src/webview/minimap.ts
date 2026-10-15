import {
  projectionFor,
  sceneBounds,
  toGraphPoint,
  type MinimapScene,
  type Projection,
} from './minimapProjection';
import type { Palette } from './theme';

export interface Minimap {
  readonly element: HTMLCanvasElement;
  draw(scene: MinimapScene, palette: Palette): void;
}

const WIDTH = 180;
const HEIGHT = 120;
const DOT = 3;

/** A small overview of the whole graph. Clicking or dragging on it moves the main view there. */
export function createMinimap(
  label: string,
  onPan: (center: { x: number; y: number }) => void,
): Minimap {
  const element = document.createElement('canvas');
  element.className = 'minimap';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  element.style.width = `${WIDTH}px`;
  element.style.height = `${HEIGHT}px`;
  let projection: Projection | null = null;

  const panToPointer = (event: PointerEvent) => {
    if (!projection) return;
    const rect = element.getBoundingClientRect();
    onPan(toGraphPoint(projection, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
  };
  element.addEventListener('pointerdown', (event) => {
    element.setPointerCapture(event.pointerId);
    panToPointer(event);
  });
  element.addEventListener('pointermove', (event) => {
    if (element.hasPointerCapture(event.pointerId)) panToPointer(event);
  });

  return {
    element,
    draw(scene, palette) {
      const ratio = window.devicePixelRatio || 1;
      element.width = WIDTH * ratio;
      element.height = HEIGHT * ratio;
      const context = element.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      projection = projectionFor(sceneBounds(scene), WIDTH, HEIGHT);
      const { scale, offsetX, offsetY } = projection;
      for (const node of scene.nodes) {
        context.fillStyle =
          node.status === 'unchanged' ? palette.kinds[node.kind] : palette.status[node.status];
        context.fillRect(
          node.x * scale + offsetX - DOT / 2,
          node.y * scale + offsetY - DOT / 2,
          DOT,
          DOT,
        );
      }
      const { extent } = scene;
      context.strokeStyle = palette.focus;
      context.lineWidth = 1.5;
      context.strokeRect(
        extent.x1 * scale + offsetX,
        extent.y1 * scale + offsetY,
        (extent.x2 - extent.x1) * scale,
        (extent.y2 - extent.y1) * scale,
      );
    },
  };
}
