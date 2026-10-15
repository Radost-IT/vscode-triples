import { describe, expect, it } from 'vitest';
import { modelOfFixture } from './helpers';

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
