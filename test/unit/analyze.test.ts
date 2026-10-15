import { describe, expect, it } from 'vitest';
import { analyze, type SourceDocument } from '../../src/core/analyze';
import { readFixture } from './helpers';

const source = (name: string, title = name): SourceDocument => ({
  text: readFixture(name),
  fileName: name,
  uri: `file:///fixtures/${name}`,
  baseIri: `file:///fixtures/${name}`,
  title,
});

describe('analyze', () => {
  it('builds a model for one file', async () => {
    const result = await analyze({
      kind: 'single',
      language: 'en',
      sources: [source('pizza.ttl')],
    });
    expect(result.kind).toBe('single');
  });

  it('reports a parse error with its position instead of throwing', async () => {
    const result = await analyze({
      kind: 'single',
      language: 'en',
      sources: [source('broken.ttl')],
    });
    expect(result).toEqual({
      kind: 'problems',
      problems: [
        expect.objectContaining({
          title: 'broken.ttl',
          uri: 'file:///fixtures/broken.ttl',
          line: 5,
        }),
      ],
    });
  });

  it('reports formats that are not supported', async () => {
    const result = await analyze({
      kind: 'single',
      language: 'en',
      sources: [{ ...source('pizza.ttl'), fileName: 'pizza.csv' }],
    });
    expect(result.kind).toBe('problems');
  });

  it('draws several files as one graph', async () => {
    const result = await analyze({
      kind: 'single',
      language: 'en',
      sources: [source('pizza.ttl'), source('odrl.ttl')],
    });
    if (result.kind !== 'single') throw new Error(`expected a model, got ${result.kind}`);
    const ids = Object.keys(result.model.entities);
    expect(ids).toContain('http://example.org/rights#Policy_Lvl1_StandardProduct');
    expect(ids.some((id) => id.startsWith('http://example.org/pizza#'))).toBe(true);
  });

  it('keeps blank nodes of different files apart', async () => {
    const file = (name: string, label: string): SourceDocument => ({
      text: `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n_:b0 rdfs:label "${label}" .`,
      fileName: name,
      uri: `file:///${name}`,
      baseIri: `file:///${name}`,
      title: name,
    });
    const result = await analyze({
      kind: 'single',
      language: 'en',
      sources: [file('a.ttl', 'first'), file('b.ttl', 'second')],
    });
    if (result.kind !== 'single') throw new Error(`expected a model, got ${result.kind}`);
    const labels = Object.values(result.model.entities).map((entity) => entity.label);
    expect(labels).toEqual(expect.arrayContaining(['first', 'second']));
  });

  it('treats a missing side of a diff as an empty ontology', async () => {
    const result = await analyze({
      kind: 'diff',
      language: 'en',
      before: null,
      after: source('pizza.ttl'),
    });
    if (result.kind !== 'diff') throw new Error(`expected a diff, got ${result.kind}`);
    expect(result.diff.removedTriples).toBe(0);
    expect(result.diff.summary.classes.added).toBeGreaterThan(0);
  });

  it('collects the problems of both sides', async () => {
    const result = await analyze({
      kind: 'diff',
      language: 'en',
      before: source('broken.ttl', 'HEAD'),
      after: source('broken.jsonld', 'working tree'),
    });
    expect(result.kind === 'problems' && result.problems.map((problem) => problem.title)).toEqual([
      'HEAD',
      'working tree',
    ]);
  });
});
