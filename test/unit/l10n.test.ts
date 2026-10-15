import { describe, expect, it } from 'vitest';
import { translate } from '../../src/webview/l10n';

describe('translate', () => {
  it('uses the translation and fills placeholders in its order', () => {
    const bundle = { '{0} nodes, {1} edges': '{1} Kanten, {0} Knoten' };
    expect(translate(bundle, '{0} nodes, {1} edges', [3, 2])).toBe('2 Kanten, 3 Knoten');
  });

  it('falls back to the English message and leaves unknown placeholders alone', () => {
    expect(translate({}, 'Show {0} more, {1}', [5])).toBe('Show 5 more, {1}');
  });
});
