import { describe, expect, it } from 'vitest';
import { buildModel } from '../../src/core/model/build';
import { parseRdf } from '../../src/core/parse';
import {
  BUSY_CLASS_INSTANCES,
  DEFAULT_VIEW_OPTIONS,
  projectGraph,
} from '../../src/core/view/project';
import { modelOfFixture } from './helpers';

/** A policy file in the shape of real ODRL data: many constraints of one class. */
async function constraintsModel(count: number) {
  const constraints = Array.from(
    { length: count },
    (_, index) =>
      `ex:c${index} a odrl:Constraint ; odrl:operator odrl:eq ; odrl:rightOperand ex:r${index % 3} .`,
  );
  const text = [
    '@prefix odrl: <http://www.w3.org/ns/odrl/2/> .',
    '@prefix ex: <http://example.org/rights#> .',
    'ex:policy a odrl:Set .',
    ...constraints,
  ].join('\n');
  return buildModel(await parseRdf(text, 'policies.ttl', 'file:///policies.ttl'), {
    language: 'en',
  });
}

const typeLinks = (graph: ReturnType<typeof projectGraph>) =>
  graph.edges.filter((edge) => edge.kind === 'type');

describe('ODRL policies', () => {
  it('names blank constraints after their values instead of "anonymous"', async () => {
    const { entities } = await modelOfFixture('odrl.ttl');
    const labels = Object.values(entities)
      .filter((entity) => entity.iri === null)
      .map((entity) => entity.label);
    expect(labels).toEqual(
      expect.arrayContaining(['purpose eq marketing', 'delayPeriod eq P30D', 'distribute']),
    );
  });

  it('keeps the type in the name of a blank node that holds no values', async () => {
    const { entities } = await modelOfFixture('odrl.ttl');
    const labels = Object.values(entities).map((entity) => entity.label);
    expect(labels).toContain('anonymous LogicalConstraint');
  });
});

describe('busy classes', () => {
  it('hides "instance of" links to a class with many instances', async () => {
    const model = await constraintsModel(BUSY_CLASS_INSTANCES + 1);
    const graph = projectGraph(model, DEFAULT_VIEW_OPTIONS);
    expect(typeLinks(graph).map((edge) => edge.target)).toEqual([
      'http://www.w3.org/ns/odrl/2/Set',
    ]);
    const all = projectGraph(model, { ...DEFAULT_VIEW_OPTIONS, showBusyTypeLinks: true });
    expect(typeLinks(all)).toHaveLength(BUSY_CLASS_INSTANCES + 2);
  });

  it('keeps the links of a class with few instances', async () => {
    const graph = projectGraph(await constraintsModel(BUSY_CLASS_INSTANCES), DEFAULT_VIEW_OPTIONS);
    expect(typeLinks(graph)).toHaveLength(BUSY_CLASS_INSTANCES + 1);
  });
});
