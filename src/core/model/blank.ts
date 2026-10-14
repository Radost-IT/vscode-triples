import type { Term, Triple } from '../rdf';
import { hashString } from './hash';

export type TriplesBySubject = Map<string, Triple[]>;

export function subjectKey(term: Term): string {
  return term.kind === 'bnode' ? `_:${term.value}` : term.value;
}

export function indexBySubject(triples: readonly Triple[]): TriplesBySubject {
  const index: TriplesBySubject = new Map();
  for (const triple of triples) {
    const key = subjectKey(triple.subject);
    const list = index.get(key);
    if (list) list.push(triple);
    else index.set(key, [triple]);
  }
  return index;
}

/**
 * Gives every blank node an id derived from its structure (a Merkle hash over the
 * triples it is the subject of). Blank-node labels are arbitrary per parse, so this
 * is what lets an unchanged OWL restriction keep its identity across file versions.
 */
export function structuralBlankIds(bySubject: TriplesBySubject): Map<string, string> {
  const ids = new Map<string, string>();
  const inProgress = new Set<string>();

  const idOf = (label: string): string => {
    const known = ids.get(label);
    if (known) return known;
    if (inProgress.has(label)) return '_:cycle';
    inProgress.add(label);
    const parts = (bySubject.get(`_:${label}`) ?? []).map(
      (triple) => `${triple.predicate} ${termKey(triple.object)}`,
    );
    parts.sort();
    inProgress.delete(label);
    const id = `_:${hashString(parts.join('\n'))}`;
    ids.set(label, id);
    return id;
  };

  const termKey = (term: Term): string => {
    switch (term.kind) {
      case 'iri':
        return `<${term.value}>`;
      case 'bnode':
        return idOf(term.value);
      case 'literal':
        return JSON.stringify([term.value, term.language, term.datatype]);
    }
  };

  for (const key of bySubject.keys()) {
    if (key.startsWith('_:')) idOf(key.slice(2));
  }
  return ids;
}

export function blankLabel(term: Term): string | undefined {
  return term.kind === 'bnode' ? term.value : undefined;
}
