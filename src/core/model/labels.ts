import type { Literal } from '../rdf';

/**
 * Ranks a label by how well its language tag fits the UI language:
 * exact match, then same primary language, then English, then untagged, then anything.
 */
function languageRank(tag: string, preferred: string): number {
  const label = tag.toLowerCase();
  const wanted = preferred.toLowerCase();
  if (label === wanted) return 0;
  if (label && label.split('-')[0] === wanted.split('-')[0]) return 1;
  if (label === 'en' || label.startsWith('en-')) return 2;
  if (label === '') return 3;
  return 4;
}

export function pickLabel(
  candidates: readonly Literal[],
  preferredLanguage: string,
): string | undefined {
  let best: Literal | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const rank = languageRank(candidate.language, preferredLanguage);
    if (rank < bestRank || (rank === bestRank && best && candidate.value < best.value)) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best?.value.trim() || undefined;
}
