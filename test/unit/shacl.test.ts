import { describe, expect, it } from 'vitest';
import { modelOfFixture } from './helpers';

const EX = 'http://example.org/people#';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';

describe('SHACL shapes', () => {
  it('draws node shapes as shapes and their targets as classes', async () => {
    const { entities } = await modelOfFixture('shapes.ttl');
    expect(entities[`${EX}PersonShape`]?.kind).toBe('shape');
    expect(entities[`${EX}Person`]?.kind).toBe('class');
    expect(entities[`${EX}email`]?.kind).toBe('property');
  });

  it('turns a simple property shape into an edge labeled with its path and counts', async () => {
    const { edges } = await modelOfFixture('shapes.ttl');
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: `${EX}PersonShape`,
        target: XSD_STRING,
        predicate: `${EX}name`,
        kind: 'restriction',
        label: 'name [1..1]',
      }),
    );
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: `${EX}PersonShape`,
        target: `${EX}Person`,
        kind: 'restriction',
        label: 'knows',
      }),
    );
  });

  it('keeps a property shape with more constraints as a node named after its path', async () => {
    const { entities, edges } = await modelOfFixture('shapes.ttl');
    const email = Object.values(entities).find((entity) => entity.label === 'email [1..*]');
    expect(email?.kind).toBe('shape');
    expect(email?.literals.map((literal) => literal.value)).toContain('^.+@.+$');
    expect(edges).toContainEqual(
      expect.objectContaining({ source: email?.id, target: XSD_STRING, label: 'datatype' }),
    );
    expect(Object.values(entities).some((entity) => entity.label === 'anonymous')).toBe(false);
  });
});
