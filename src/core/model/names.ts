import type { Prefixes } from '../rdf';
import { WELL_KNOWN_PREFIXES } from '../vocab';

export function splitIri(iri: string): { namespace: string; localName: string } {
  const trimmed = iri.replace(/[#/]+$/, '');
  const cut = Math.max(
    trimmed.lastIndexOf('#'),
    trimmed.lastIndexOf('/'),
    trimmed.lastIndexOf(':'),
  );
  if (cut < 0) return { namespace: '', localName: iri };
  return { namespace: iri.slice(0, cut + 1), localName: trimmed.slice(cut + 1) };
}

export function localName(iri: string): string {
  const name = splitIri(iri).localName;
  try {
    return decodeURIComponent(name) || iri;
  } catch {
    return name || iri;
  }
}

export interface IriCompactor {
  compact(iri: string): string;
  namespaceOf(iri: string): string;
}

export function createCompactor(filePrefixes: Prefixes): IriCompactor {
  const prefixes = { ...WELL_KNOWN_PREFIXES, ...filePrefixes };
  const byLength = Object.entries(prefixes)
    .filter(([, namespace]) => namespace.length > 0)
    .sort(([, a], [, b]) => b.length - a.length);

  const match = (iri: string): [string, string] | undefined => {
    for (const [prefix, namespace] of byLength) {
      if (iri.startsWith(namespace)) {
        const rest = iri.slice(namespace.length);
        if (/^[^\s/#?]*$/.test(rest)) return [prefix, rest];
      }
    }
    return undefined;
  };

  return {
    compact(iri) {
      const found = match(iri);
      return found ? `${found[0]}:${found[1]}` : iri;
    },
    namespaceOf(iri) {
      const found = match(iri);
      return found ? `${found[0]}:` : splitIri(iri).namespace;
    },
  };
}
