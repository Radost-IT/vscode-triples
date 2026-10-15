import type { Entity, OntologyModel } from '../model/types';

/**
 * Returns a label function for the views. When several named entities share a label, for example
 * `Person` in two namespaces, each one gets its compact name added, such as `Person (foaf:Person)`.
 * The model keeps the plain label so the diff does not report a change when a namesake appears.
 */
export function distinctLabels(model: OntologyModel): (entity: Entity) => string {
  const counts = new Map<string, number>();
  for (const entity of Object.values(model.entities)) {
    if (entity.iri) counts.set(entity.label, (counts.get(entity.label) ?? 0) + 1);
  }
  return (entity) =>
    entity.iri && (counts.get(entity.label) ?? 0) > 1 && entity.label !== entity.displayName
      ? `${entity.label} (${entity.displayName})`
      : entity.label;
}
