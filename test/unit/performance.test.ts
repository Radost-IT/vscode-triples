import cytoscape from 'cytoscape';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyze';
import { DEFAULT_VIEW_OPTIONS, projectGraph } from '../../src/core/view/project';
import { forceLayout, withSeededRandom } from '../../src/webview/layout';
import { largeOntology } from './largeOntology';

/** The product target is parse and first render of 5,000 nodes under 2 seconds. */
// Shared CI runners are several times slower than a developer machine, so they get more headroom.
const BUDGET_MS = process.env['CI'] ? 6000 : 2000;

describe('performance', () => {
  it('parses, projects and lays out a 5,000-node ontology within budget', async () => {
    const text = largeOntology(5000);
    const started = performance.now();

    const result = await analyze({
      kind: 'single',
      language: 'en',
      sources: [
        {
          text,
          fileName: 'large.ttl',
          uri: 'file:///large.ttl',
          baseIri: 'file:///large.ttl',
          title: 'large.ttl',
        },
      ],
    });
    if (result.kind !== 'single') throw new Error(`Expected a model, got ${result.kind}`);
    const graph = projectGraph(result.model, DEFAULT_VIEW_OPTIONS);
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: [{ selector: 'node', style: { width: 120, height: 40 } }],
      elements: [
        ...graph.nodes.map((node) => ({ data: { id: node.id } })),
        ...graph.edges.map((edge) => ({
          data: { id: edge.id, source: edge.source, target: edge.target },
        })),
      ],
    });
    withSeededRandom(() => cy.layout(forceLayout(cy.nodes().length)).run());

    const elapsed = performance.now() - started;
    expect(graph.nodes.length).toBeGreaterThanOrEqual(5000);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
