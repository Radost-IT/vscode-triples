import { describe, expect, it } from 'vitest';
import { neighborhood } from '../../src/core/view/neighborhood';
import { DEFAULT_VIEW_OPTIONS, projectGraph } from '../../src/core/view/project';
import { searchEntities } from '../../src/core/view/search';
import { modelOfFixture } from './helpers';

const PIZZA = 'http://example.org/pizza#';

describe('searchEntities', () => {
  it('ranks label prefix matches above substring matches', async () => {
    const model = await modelOfFixture('pizza.ttl');
    const labels = searchEntities(model, 'piz', 10).map((hit) => hit.label);
    expect(labels[0]).toBe('Pizza');
    expect(labels.indexOf('Pizza base')).toBeLessThan(labels.indexOf('VegetarianPizza'));
  });

  it('matches the IRI and skips built-in vocabulary', async () => {
    const model = await modelOfFixture('pizza.ttl');
    expect(searchEntities(model, 'example.org/pizza#myMargherita', 5).map((hit) => hit.id)).toEqual(
      [`${PIZZA}myMargherita`],
    );
    expect(searchEntities(model, 'Thing', 5)).toEqual([]);
  });

  it('returns nothing for a blank query', async () => {
    const model = await modelOfFixture('pizza.ttl');
    expect(searchEntities(model, '   ', 5)).toEqual([]);
  });
});

describe('neighborhood', () => {
  it('grows by one ring of neighbors per hop', async () => {
    const graph = projectGraph(await modelOfFixture('pizza.ttl'), DEFAULT_VIEW_OPTIONS);
    const oneHop = neighborhood(graph, `${PIZZA}Margherita`, 1);
    expect(oneHop).toContain(`${PIZZA}NamedPizza`);
    expect(oneHop).not.toContain(`${PIZZA}Pizza`);
    expect(neighborhood(graph, `${PIZZA}Margherita`, 2)).toContain(`${PIZZA}Pizza`);
    expect(neighborhood(graph, `${PIZZA}Margherita`, 0)).toEqual(new Set([`${PIZZA}Margherita`]));
  });
});
