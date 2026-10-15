import { describe, expect, it } from 'vitest';
import { diffGraphs } from '../../src/core/diff/diff';
import { parseFixture } from './helpers';

const ZOO = 'http://example.org/zoo#';

async function diffFixtures(before: string | null, after: string | null) {
  return diffGraphs(
    before ? await parseFixture(`diff/${before}`) : null,
    after ? await parseFixture(`diff/${after}`) : null,
    { language: 'en' },
  );
}

describe('diffGraphs', () => {
  it('reports added, removed and modified entities', async () => {
    const diff = await diffFixtures('entities/before.ttl', 'entities/after.ttl');
    expect(diff.entityStatus[`${ZOO}Bird`]).toBe('added');
    expect(diff.entityStatus[`${ZOO}Reptile`]).toBe('removed');
    expect(diff.entityStatus[`${ZOO}Mammal`]).toBe('modified');
    expect(diff.entityStatus[`${ZOO}Animal`]).toBe('unchanged');
    expect(diff.summary.classes).toEqual({ added: 1, removed: 1, modified: 1 });
    const mammal = diff.changes.find((change) => change.id === `${ZOO}Mammal`);
    expect(mammal?.changes).toEqual([
      {
        status: 'removed',
        predicate: 'http://www.w3.org/2000/01/rdf-schema#label',
        text: 'rdfs:label "Mammal"',
      },
      {
        status: 'added',
        predicate: 'http://www.w3.org/2000/01/rdf-schema#label',
        text: 'rdfs:label "Mammal (warm-blooded)"',
      },
    ]);
  });

  it('marks edges of removed entities as removed', async () => {
    const diff = await diffFixtures('entities/before.ttl', 'entities/after.ttl');
    const removed = diff.model.edges.find((edge) => edge.source === `${ZOO}Reptile`);
    expect(removed && diff.edgeStatus[removed.id]).toBe('removed');
  });

  it.each([
    ['reordered file', 'reordered/before.ttl', 'reordered/after.ttl'],
    ['prefix change', 'prefix-change/before.ttl', 'prefix-change/after.ttl'],
    [
      'unchanged blank-node restrictions',
      'bnode-unchanged/before.ttl',
      'bnode-unchanged/after.ttl',
    ],
    [
      'Turtle to RDF/XML with identical content',
      'syntax-change/before.ttl',
      'syntax-change/after.owl',
    ],
  ])('finds no changes for a %s', async (_name, before, after) => {
    const diff = await diffFixtures(before, after);
    expect(diff.changes).toEqual([]);
    expect(diff.addedTriples + diff.removedTriples).toBe(0);
    expect(Object.values(diff.entityStatus).every((status) => status === 'unchanged')).toBe(true);
  });

  it.each(['pizza.ofn'])('finds no changes between pizza.ttl and %s', async (name) => {
    const diff = diffGraphs(await parseFixture('pizza.ttl'), await parseFixture(name), {
      language: 'en',
    });
    expect(diff.changes).toEqual([]);
    expect(diff.addedTriples + diff.removedTriples).toBe(0);
  });

  it('reports a changed restriction once, on the class that owns it', async () => {
    const diff = await diffFixtures('bnode-changed/before.ttl', 'bnode-changed/after.ttl');
    expect(diff.changes.map((change) => [change.id, change.status])).toEqual([
      [`${ZOO}Lion`, 'modified'],
    ]);
    expect(diff.changes[0]?.changes.map((change) => `${change.status} ${change.text}`)).toEqual([
      'removed rdfs:subClassOf [ livesIn only (Savanna or Zoo) ]',
      'added rdfs:subClassOf [ livesIn only (Savanna or Zoo or Circus) ]',
    ]);
    expect(diff.entityStatus[`${ZOO}Meat`]).toBe('unchanged');
  });

  it('treats a missing side as an empty ontology', async () => {
    const created = await diffFixtures(null, 'new-file/after.ttl');
    expect(created.summary.classes.added).toBe(3);
    expect(created.summary.classes.removed).toBe(0);
    const deleted = await diffFixtures('new-file/after.ttl', null);
    expect(deleted.summary.classes.removed).toBe(3);
  });
});
