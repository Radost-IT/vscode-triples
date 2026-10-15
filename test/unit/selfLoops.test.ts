import { describe, expect, it } from 'vitest';
import { spreadSelfLoops } from '../../src/webview/selfLoops';

const edge = (id: string, source: string, target: string) => ({ id, source, target });

describe('spreadSelfLoops', () => {
  it('ignores edges between two different nodes', () => {
    expect(spreadSelfLoops([edge('e1', 'a', 'b')]).size).toBe(0);
  });

  it('draws a single loop straight up with its label above it', () => {
    const loop = spreadSelfLoops([edge('e1', 'a', 'a')]).get('e1');
    expect(loop?.direction).toBe(0);
    expect(loop?.sweep).toBe(60);
    expect(loop?.labelOffset.x).toBeCloseTo(0);
    expect(loop?.labelOffset.y).toBeLessThan(0);
  });

  it('gives each loop on a node its own direction, narrower when there are many', () => {
    const loops = spreadSelfLoops(
      ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'].map((id) => edge(id, 'a', 'a')),
    );
    const directions = [...loops.values()].map((loop) => loop.direction);
    expect(directions).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(loops.get('e1')?.sweep).toBeCloseTo(31.5);
  });

  it('spreads the loops of each node on their own', () => {
    const loops = spreadSelfLoops([edge('e1', 'a', 'a'), edge('e2', 'b', 'b')]);
    expect(loops.get('e1')?.direction).toBe(0);
    expect(loops.get('e2')?.direction).toBe(0);
  });
});
