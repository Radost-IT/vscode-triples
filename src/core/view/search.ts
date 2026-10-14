import type { Entity, OntologyModel } from '../model/types';

export interface SearchHit {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

/**
 * Finds entities by label, compact name or IRI. Prefix matches on the label rank
 * first, so typing "Piz" puts "Pizza" above "AmericanPizza".
 */
export function searchEntities(model: OntologyModel, query: string, limit: number): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const scored: { entity: Entity; score: number }[] = [];
  for (const entity of Object.values(model.entities)) {
    if (entity.kind === 'expression' || entity.builtin) continue;
    const score = matchScore(entity, needle);
    if (score > 0) scored.push({ entity, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entity.label.localeCompare(b.entity.label))
    .slice(0, limit)
    .map(({ entity }) => ({ id: entity.id, label: entity.label, detail: entity.displayName }));
}

function matchScore(entity: Entity, needle: string): number {
  const label = entity.label.toLowerCase();
  if (label === needle) return 5;
  if (label.startsWith(needle)) return 4;
  if (label.includes(needle)) return 3;
  if (entity.displayName.toLowerCase().includes(needle)) return 2;
  return entity.iri?.toLowerCase().includes(needle) ? 1 : 0;
}
