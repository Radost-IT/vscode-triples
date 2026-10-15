import { describe, expect, it } from 'vitest';
import { hasQuietEdgeLabels } from '../../src/webview/edgeLabel';

describe('hasQuietEdgeLabels', () => {
  it('shows every edge label in a small graph', () => {
    expect(hasQuietEdgeLabels(300)).toBe(false);
  });

  it('keeps edge labels for the selection in a big graph', () => {
    expect(hasQuietEdgeLabels(301)).toBe(true);
  });
});
