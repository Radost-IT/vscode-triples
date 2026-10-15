import { describe, expect, it } from 'vitest';
import type { ProjectedGraph, VisibleEdge, VisibleNode } from '../../src/core/view/project';
import {
  landmarkLabelSize,
  pickLandmarks,
  unclutteredLandmarks,
} from '../../src/webview/landmarks';

function node(id: string): VisibleNode {
  return { id, entityId: id, kind: 'individual', label: id, status: 'unchanged', context: false };
}

function edge(source: string, target: string): VisibleEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    label: 'link',
    kind: 'property',
    predicate: 'http://example.org/link',
    status: 'unchanged',
  };
}

/** One hub per entry, each linked to that many leaves of its own. */
function hubs(linkCounts: readonly number[]): ProjectedGraph {
  const nodes: VisibleNode[] = [];
  const edges: VisibleEdge[] = [];
  linkCounts.forEach((count, hub) => {
    nodes.push(node(`hub${hub}`));
    for (let leaf = 0; leaf < count; leaf++) {
      nodes.push(node(`hub${hub}-leaf${leaf}`));
      edges.push(edge(`hub${hub}`, `hub${hub}-leaf${leaf}`));
    }
  });
  return { nodes, edges, hiddenEntityCount: 0, groupedInto: new Map() };
}

describe('pickLandmarks', () => {
  it('picks nodes with at least eight links', () => {
    expect(pickLandmarks(hubs([8, 7]))).toEqual(['hub0']);
  });

  it('keeps the 30 busiest hubs', () => {
    const counts = Array.from({ length: 35 }, (_, hub) => 8 + hub);
    const landmarks = pickLandmarks(hubs(counts));
    expect(landmarks).toHaveLength(30);
    expect(landmarks[0]).toBe('hub34');
    expect(landmarks).not.toContain('hub4');
  });
});

describe('landmarkLabelSize', () => {
  it('keeps the normal size at normal zoom', () => {
    expect(landmarkLabelSize(1)).toEqual({ fontSize: 13, textMaxWidth: 210 });
  });

  it('grows as the view zooms out, up to ten times', () => {
    expect(landmarkLabelSize(0.2).fontSize).toBeCloseTo(60);
    expect(landmarkLabelSize(0.01)).toEqual({ fontSize: 130, textMaxWidth: 2100 });
  });
});

describe('unclutteredLandmarks', () => {
  const at = (id: string, x: number, y: number) => ({ id, x, y, label: 'Constraint' });

  it('drops a landmark whose label would cover a busier one', () => {
    const ranked = [at('busy', 0, 0), at('near', 40, 10), at('far', 0, 100)];
    expect(unclutteredLandmarks(ranked, 13, 210)).toEqual(['busy', 'far']);
  });

  it('keeps both once zoomed in far enough for the labels to clear', () => {
    const ranked = [at('busy', 0, 0), at('near', 0, 30)];
    expect(unclutteredLandmarks(ranked, 13, 210)).toEqual(['busy', 'near']);
    expect(unclutteredLandmarks(ranked, 60, 970)).toEqual(['busy']);
  });
});
