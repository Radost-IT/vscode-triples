import type * as RDF from '@rdfjs/types';
import { bnode, iri, literal, type Subject, type Term, type Triple } from '../rdf';

export function fromRdfJsQuad(quad: RDF.Quad): Triple | undefined {
  const subject = fromRdfJsSubject(quad.subject);
  const object = fromRdfJsTerm(quad.object);
  if (!subject || !object || quad.predicate.termType !== 'NamedNode') {
    return undefined;
  }
  return { subject, predicate: quad.predicate.value, object };
}

function fromRdfJsSubject(term: RDF.Term): Subject | undefined {
  if (term.termType === 'NamedNode') return iri(term.value);
  if (term.termType === 'BlankNode') return bnode(term.value);
  return undefined;
}

function fromRdfJsTerm(term: RDF.Term): Term | undefined {
  if (term.termType === 'Literal') {
    return literal(term.value, term.datatype.value, term.language);
  }
  return fromRdfJsSubject(term);
}
