import { describe, expect, it } from 'vitest';
import { edgeLabelOffset, type Offset } from '../../src/webview/edgeLabel';

/** Adding zero turns -0 into 0, which toEqual tells apart. */
const offset = (source: Offset, target: Offset) => {
  const { x, y } = edgeLabelOffset(source, target);
  return { x: x + 0, y: y + 0 };
};

describe('edgeLabelOffset', () => {
  it('puts the label above a horizontal edge in either direction', () => {
    expect(offset({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ x: 0, y: -11 });
    expect(offset({ x: 100, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: -11 });
  });

  it('puts the label left of a vertical edge in either direction', () => {
    expect(offset({ x: 0, y: 0 }, { x: 0, y: 100 })).toEqual({ x: -11, y: 0 });
    expect(offset({ x: 0, y: 100 }, { x: 0, y: 0 })).toEqual({ x: -11, y: 0 });
  });

  it('moves the label at a right angle to a diagonal edge', () => {
    const shift = edgeLabelOffset({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(shift.x * 100 + shift.y * 100).toBeCloseTo(0);
    expect(Math.hypot(shift.x, shift.y)).toBeCloseTo(11);
    expect(shift.y).toBeLessThan(0);
  });

  it('leaves a self loop label in place', () => {
    expect(offset({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});
