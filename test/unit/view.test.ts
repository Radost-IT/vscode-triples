import { describe, expect, it } from 'vitest';
import { diffGraphs } from '../../src/core/diff/diff';
import { buildHierarchy, withAncestors } from '../../src/core/view/hierarchy';
import { DEFAULT_VIEW_OPTIONS, projectGraph } from '../../src/core/view/project';
import { modelOfFixture, parseFixture } from './helpers';

const PIZZA = 'http://example.org/pizza#';
const ZOO = 'http://example.org/zoo#';
const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

describe('projectGraph', () => {
  it('hides owl:Thing by default and shows it on request', async () => {
    const model = await modelOfFixture('pizza.ttl');
    const ids = (showOwlThing: boolean) =>
      projectGraph(model, { ...DEFAULT_VIEW_OPTIONS, showOwlThing }).nodes.map((node) => node.id);
    expect(ids(false)).not.toContain(OWL_THING);
    expect(ids(true)).toContain(OWL_THING);
  });

  it('draws a property with domain and range as one arrow', async () => {
    const model = await modelOfFixture('pizza.ttl');
    const graph = projectGraph(model, DEFAULT_VIEW_OPTIONS);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: `${PIZZA}Pizza`,
        target: `${PIZZA}Topping`,
        kind: 'property',
        label: 'has topping',
      }),
    );
    expect(graph.nodes.map((node) => node.id)).not.toContain(`${PIZZA}hasTopping`);
    expect(graph.nodes.map((node) => node.id)).toContain(`${PIZZA}hasBase`);
  });

  it('keeps property nodes when folding is off', async () => {
    const model = await modelOfFixture('pizza.ttl');
    const graph = projectGraph(model, { ...DEFAULT_VIEW_OPTIONS, propertiesAsEdges: false });
    expect(graph.nodes.map((node) => node.id)).toContain(`${PIZZA}hasTopping`);
    expect(
      graph.edges
        .filter((edge) => edge.source === `${PIZZA}hasTopping`)
        .map((edge) => edge.kind)
        .sort(),
    ).toEqual(['domain', 'range']);
  });

  it('draws data values as literal nodes only on request', async () => {
    const model = await modelOfFixture('pizza.ttl');
    const literals = (showLiterals: boolean) =>
      projectGraph(model, { ...DEFAULT_VIEW_OPTIONS, showLiterals }).nodes.filter(
        (node) => node.kind === 'literal',
      );
    expect(literals(false)).toEqual([]);
    expect(literals(true).map((node) => node.label)).toEqual(['850']);
  });

  it('filters by kind and namespace', async () => {
    const model = await modelOfFixture('pizza.ttl');
    const withoutIndividuals = projectGraph(model, {
      ...DEFAULT_VIEW_OPTIONS,
      hiddenKinds: ['individual'],
    });
    expect(withoutIndividuals.nodes.some((node) => node.kind === 'individual')).toBe(false);
    const withoutXsd = projectGraph(model, { ...DEFAULT_VIEW_OPTIONS, hiddenNamespaces: ['xsd:'] });
    expect(
      withoutXsd.nodes.some((node) => node.id.startsWith('http://www.w3.org/2001/XMLSchema#')),
    ).toBe(false);
  });

  it('shows only changes plus a ring of unchanged neighbors', async () => {
    const diff = diffGraphs(
      await parseFixture('diff/entities/before.ttl'),
      await parseFixture('diff/entities/after.ttl'),
      { language: 'en' },
    );
    const graph = projectGraph(diff.model, { ...DEFAULT_VIEW_OPTIONS, onlyChanges: true }, diff);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get(`${ZOO}Bird`)?.status).toBe('added');
    expect(byId.get(`${ZOO}Reptile`)?.status).toBe('removed');
    expect(byId.get(`${ZOO}Animal`)?.context).toBe(true);
  });
});

describe('buildHierarchy', () => {
  it('nests classes by rdfs:subClassOf and lists multiple parents', async () => {
    const model = await modelOfFixture('pizza.ttl');
    const tree = buildHierarchy(model, 'classes');
    expect(tree.roots).toEqual([`${PIZZA}Food`, `${PIZZA}VegetarianPizza`]);
    expect(tree.nodes[`${PIZZA}Margherita`]?.parents).toEqual([
      `${PIZZA}NamedPizza`,
      `${PIZZA}VegetarianPizza`,
    ]);
    expect(tree.nodes[`${PIZZA}Margherita`]?.instanceCount).toBe(1);
  });

  it('nests properties by rdfs:subPropertyOf', async () => {
    const model = await modelOfFixture('pizza.ttl');
    const tree = buildHierarchy(model, 'properties');
    expect(tree.nodes[`${PIZZA}hasIngredient`]?.children).toEqual([`${PIZZA}hasBase`]);
    expect(tree.roots).not.toContain(`${PIZZA}hasBase`);
  });

  it('keeps classes that sit in a subclass cycle', () => {
    const entity = (id: string) => ({
      id,
      iri: id,
      kind: 'class' as const,
      label: id,
      displayName: id,
      namespace: '',
      builtin: false,
      referencedOnly: false,
      literals: [],
    });
    const edge = (source: string, target: string) => ({
      id: `${source}>${target}`,
      source,
      target,
      predicate: '',
      label: '',
      kind: 'subClassOf' as const,
    });
    const tree = buildHierarchy(
      {
        entities: { a: entity('a'), b: entity('b') },
        edges: [edge('a', 'b'), edge('b', 'a')],
        prefixes: {},
        ontology: null,
        tripleCount: 2,
      },
      'classes',
    );
    expect(tree.roots).toEqual(['a']);
    expect(tree.nodes.a?.children).toEqual(['b']);
  });
});

describe('withAncestors', () => {
  it('keeps the matches and the path up to their roots', () => {
    const node = (id: string, parents: string[], children: string[]) => ({
      id,
      label: id,
      parents,
      children,
      instanceCount: 0,
    });
    const tree = {
      roots: ['a'],
      nodes: {
        a: node('a', [], ['b', 'd']),
        b: node('b', ['a'], ['c']),
        c: node('c', ['b'], []),
        d: node('d', ['a'], []),
      },
    };
    expect([...withAncestors(tree, ['c'])].sort()).toEqual(['a', 'b', 'c']);
    expect(withAncestors(tree, []).size).toBe(0);
  });
});
