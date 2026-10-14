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
    const result = await analyze({ kind: 'single', language: 'en', source: source('pizza.ttl') });
    expect(result.kind).toBe('single');
  });

  it('reports a parse error with its position instead of throwing', async () => {
    const result = await analyze({ kind: 'single', language: 'en', source: source('broken.ttl') });
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

  it('reports formats that are not supported yet', async () => {
    const result = await analyze({
      kind: 'single',
      language: 'en',
      source: source('functional.owl'),
    });
    expect(result.kind).toBe('problems');
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
