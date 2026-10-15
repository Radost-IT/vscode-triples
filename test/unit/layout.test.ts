import cytoscape from 'cytoscape';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_OPTIONS, projectGraph } from '../../src/core/view/project';
import {
  forceLayout,
  layeredLayout,
  withSeededRandom,
  type LayoutName,
} from '../../src/webview/layout';
import { modelOfFixture } from './helpers';

async function positions(layout: LayoutName): Promise<Record<string, cytoscape.Position>> {
  const graph = projectGraph(await modelOfFixture('pizza.ttl'), DEFAULT_VIEW_OPTIONS);
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    style: [{ selector: 'node', style: { width: 100, height: 40 } }],
    elements: [
      ...graph.nodes.map((node) => ({ data: { id: node.id } })),
      ...graph.edges.map((edge) => ({
        data: { id: edge.id, source: edge.source, target: edge.target },
      })),
    ],
  });
  const options = layout === 'force' ? forceLayout(cy.nodes().length) : layeredLayout('TB');
  withSeededRandom(() => cy.layout(options).run());
  return Object.fromEntries(cy.nodes().map((node) => [node.id(), { ...node.position() }]));
}

describe('layout', () => {
  it.each<LayoutName>(['force', 'layered'])(
    'gives the same %s layout for the same file',
    async (layout) => {
      const first = await positions(layout);
      expect(Object.keys(first).length).toBeGreaterThan(5);
      expect(await positions(layout)).toEqual(first);
    },
  );

  it('leaves Math.random alone after a seeded layout', () => {
    const original = Math.random;
    withSeededRandom(() => Math.random());
    expect(Math.random).toBe(original);
  });
});
