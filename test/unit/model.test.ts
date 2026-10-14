import { describe, expect, it } from 'vitest';
import { modelOfFixture } from './helpers';

const PIZZA = 'http://example.org/pizza#';
const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

describe('buildModel', () => {
  it('classifies entities by kind', async () => {
    const { entities } = await modelOfFixture('pizza.ttl');
    expect(entities[`${PIZZA}Pizza`]?.kind).toBe('class');
    expect(entities[`${PIZZA}hasTopping`]?.kind).toBe('objectProperty');
    expect(entities[`${PIZZA}calories`]?.kind).toBe('datatypeProperty');
    expect(entities[`${PIZZA}myMargherita`]?.kind).toBe('individual');
    expect(entities[`${PIZZA}mozzarella`]?.kind).toBe('individual');
    expect(entities['http://www.w3.org/2001/XMLSchema#integer']?.kind).toBe('datatype');
  });

  it('prefers labels in the UI language, then English, then the local name', async () => {
    expect((await modelOfFixture('pizza.ttl', 'de')).entities[`${PIZZA}Food`]?.label).toBe('Essen');
    expect((await modelOfFixture('pizza.ttl', 'fr')).entities[`${PIZZA}Food`]?.label).toBe('Food');
    expect((await modelOfFixture('pizza.ttl')).entities[`${PIZZA}NamedPizza`]?.label).toBe(
      'NamedPizza',
    );
  });

  it('uses prefixed names for display', async () => {
    const { entities } = await modelOfFixture('pizza.ttl');
    expect(entities[`${PIZZA}Pizza`]?.displayName).toBe(':Pizza');
    expect(entities[OWL_THING]?.displayName).toBe('owl:Thing');
  });

  it('turns a someValuesFrom restriction into a labeled edge', async () => {
    const { edges } = await modelOfFixture('pizza.ttl');
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: `${PIZZA}Pizza`,
        target: `${PIZZA}PizzaBase`,
        kind: 'restriction',
        label: 'hasBase some',
      }),
    );
  });

  it('renders complex class expressions as readable text nodes', async () => {
    const { entities } = await modelOfFixture('pizza.ttl');
    const expression = Object.values(entities).find((entity) => entity.kind === 'expression');
    expect(expression?.label).toBe(
      'Pizza and (has topping only (Cheese topping or VegetableTopping))',
    );
  });

  it('folds literals into the entity instead of creating nodes', async () => {
    const { entities } = await modelOfFixture('pizza.ttl');
    const literals = entities[`${PIZZA}myMargherita`]?.literals ?? [];
    expect(literals.map((fact) => [fact.predicateLabel, fact.value, fact.isAnnotation])).toEqual([
      ['rdfs:label', 'My Margherita', true],
      [':calories', '850', false],
      [':origin', 'Naples', true],
    ]);
  });

  it('keeps the ontology header out of the graph', async () => {
    const model = await modelOfFixture('pizza.ttl');
    expect(model.ontology?.label).toBe('Pizza ontology');
    expect(model.entities['http://example.org/pizza']).toBeUndefined();
  });

  it('builds the same model from Turtle and RDF/XML', async () => {
    const turtle = await modelOfFixture('pizza.ttl');
    const rdfXml = await modelOfFixture('pizza.owl');
    expect(Object.keys(rdfXml.entities).sort()).toEqual(Object.keys(turtle.entities).sort());
    expect(rdfXml.edges.map((edge) => edge.id).sort()).toEqual(
      turtle.edges.map((edge) => edge.id).sort(),
    );
  });

  it('infers RDFS classes and instances from JSON-LD', async () => {
    const { entities, edges } = await modelOfFixture('people.jsonld');
    expect(entities['http://example.org/people#Person']?.kind).toBe('class');
    expect(entities['http://example.org/people#alice']?.kind).toBe('individual');
    expect(edges.some((edge) => edge.kind === 'relation' && edge.label === 'knows')).toBe(true);
  });
});
