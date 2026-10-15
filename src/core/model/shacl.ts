import { rdf, sh } from '../vocab';
import type { TriplesBySubject } from './blank';
import { objectsOf } from './expressions';

export interface PropertyShape {
  readonly path: string;
  /** `[min..max]`, or empty when the shape sets neither count. */
  readonly cardinality: string;
  /** The one class, datatype or node shape that values must match, if the shape names exactly one. */
  readonly valueType: string | undefined;
  /** True when the shape says nothing beyond path, value type and counts, so an edge can stand for it. */
  readonly foldable: boolean;
}

const VALUE_TYPE_PREDICATES: readonly string[] = [sh.class, sh.datatype, sh.node];
const FOLDABLE_PREDICATES: ReadonlySet<string> = new Set([
  sh.path,
  sh.minCount,
  sh.maxCount,
  ...VALUE_TYPE_PREDICATES,
]);

/** Reads a SHACL property shape with a plain property path, such as `[ sh:path ex:name ; sh:minCount 1 ]`. */
export function propertyShapeOf(
  bySubject: TriplesBySubject,
  label: string,
): PropertyShape | undefined {
  const [path] = objectsOf(bySubject, label, sh.path);
  if (path?.kind !== 'iri') return undefined;
  const valueTypes = VALUE_TYPE_PREDICATES.flatMap((predicate) =>
    objectsOf(bySubject, label, predicate),
  );
  const valueType =
    valueTypes.length === 1 && valueTypes[0]?.kind === 'iri' ? valueTypes[0].value : undefined;
  const [min] = objectsOf(bySubject, label, sh.minCount);
  const [max] = objectsOf(bySubject, label, sh.maxCount);
  const cardinality = min || max ? `[${min?.value ?? 0}..${max?.value ?? '*'}]` : '';
  const foldable =
    valueType !== undefined &&
    (bySubject.get(`_:${label}`) ?? []).every(
      (triple) =>
        FOLDABLE_PREDICATES.has(triple.predicate) ||
        (triple.predicate === rdf.type && triple.object.value === sh.PropertyShape),
    );
  return { path: path.value, cardinality, valueType, foldable };
}
