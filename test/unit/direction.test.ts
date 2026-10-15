import { describe, expect, it } from 'vitest';
import { nearestInDirection } from '../../src/webview/direction';

const at = (id: string, x: number, y: number) => ({ id, position: { x, y } });

describe('nearestInDirection', () => {
  const origin = { x: 0, y: 0 };
  const around = [at('right', 100, 10), at('left', -80, 0), at('up', 5, -60), at('down', 0, 90)];

  it('follows each arrow key, with y growing downwards', () => {
    expect(nearestInDirection(origin, around, 'right')).toBe('right');
    expect(nearestInDirection(origin, around, 'left')).toBe('left');
    expect(nearestInDirection(origin, around, 'up')).toBe('up');
    expect(nearestInDirection(origin, around, 'down')).toBe('down');
  });

  it('prefers a node straight ahead over a closer one off to the side', () => {
    const candidates = [at('diagonal', 60, 50), at('ahead', 120, 0)];
    expect(nearestInDirection(origin, candidates, 'right')).toBe('ahead');
  });

  it('returns null when nothing lies in that direction', () => {
    expect(nearestInDirection(origin, [at('behind', -50, 0), at('above', 10, -100)], 'right')).toBe(
      null,
    );
  });
});
