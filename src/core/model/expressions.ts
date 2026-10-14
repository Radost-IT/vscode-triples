import type { Term } from '../rdf';
import { owl, rdf } from '../vocab';
import type { TriplesBySubject } from './blank';

export type ExpressionShape =
  | {
      readonly type: 'restriction';
      readonly property: string;
      readonly quantifier: string;
      readonly filler: Term | undefined;
    }
  | { readonly type: 'union' | 'intersection' | 'oneOf' | 'complement'; readonly members: Term[] }
  | { readonly type: 'allDisjoint' | 'allDifferent'; readonly members: Term[] };

const CARDINALITIES: readonly [string, string][] = [
  [owl.cardinality, 'exactly'],
  [owl.qualifiedCardinality, 'exactly'],
  [owl.minCardinality, 'min'],
  [owl.minQualifiedCardinality, 'min'],
  [owl.maxCardinality, 'max'],
  [owl.maxQualifiedCardinality, 'max'],
];

function objectsOf(bySubject: TriplesBySubject, label: string, predicate: string): Term[] {
  return (bySubject.get(`_:${label}`) ?? [])
    .filter((triple) => triple.predicate === predicate)
    .map((triple) => triple.object);
}

function firstObject(
  bySubject: TriplesBySubject,
  label: string,
  predicate: string,
): Term | undefined {
  return objectsOf(bySubject, label, predicate)[0];
}

export function readList(bySubject: TriplesBySubject, head: Term): Term[] {
  const members: Term[] = [];
  const seen = new Set<string>();
  let node: Term | undefined = head;
  while (node && node.kind === 'bnode' && !seen.has(node.value)) {
    seen.add(node.value);
    const first = firstObject(bySubject, node.value, rdf.first);
    if (first) members.push(first);
    node = firstObject(bySubject, node.value, rdf.rest);
  }
  return members;
}

export function isListNode(bySubject: TriplesBySubject, label: string): boolean {
  return firstObject(bySubject, label, rdf.first) !== undefined;
}

export function isAxiomNode(bySubject: TriplesBySubject, label: string): boolean {
  return (bySubject.get(`_:${label}`) ?? []).some(
    (triple) =>
      triple.predicate === owl.annotatedSource ||
      (triple.predicate === rdf.type && triple.object.value === owl.Axiom),
  );
}

export function expressionShape(
  bySubject: TriplesBySubject,
  label: string,
): ExpressionShape | undefined {
  const property = firstObject(bySubject, label, owl.onProperty);
  if (property?.kind === 'iri') {
    return restrictionShape(bySubject, label, property.value);
  }
  const listShapes: [string, 'union' | 'intersection' | 'oneOf'][] = [
    [owl.unionOf, 'union'],
    [owl.intersectionOf, 'intersection'],
    [owl.oneOf, 'oneOf'],
  ];
  for (const [predicate, type] of listShapes) {
    const head = firstObject(bySubject, label, predicate);
    if (head) return { type, members: readList(bySubject, head) };
  }
  const complement = firstObject(bySubject, label, owl.complementOf);
  if (complement) return { type: 'complement', members: [complement] };

  const types = objectsOf(bySubject, label, rdf.type).map((term) => term.value);
  const members = firstObject(bySubject, label, owl.members);
  const distinct = firstObject(bySubject, label, owl.distinctMembers);
  if (types.includes(owl.AllDisjointClasses) || types.includes(owl.AllDisjointProperties)) {
    return { type: 'allDisjoint', members: members ? readList(bySubject, members) : [] };
  }
  if (types.includes(owl.AllDifferent)) {
    const head = distinct ?? members;
    return { type: 'allDifferent', members: head ? readList(bySubject, head) : [] };
  }
  return undefined;
}

function restrictionShape(
  bySubject: TriplesBySubject,
  label: string,
  property: string,
): ExpressionShape {
  const qualifier =
    firstObject(bySubject, label, owl.onClass) ?? firstObject(bySubject, label, owl.onDataRange);
  for (const [predicate, word] of CARDINALITIES) {
    const count = firstObject(bySubject, label, predicate);
    if (count)
      return {
        type: 'restriction',
        property,
        quantifier: `${word} ${count.value}`,
        filler: qualifier,
      };
  }
  const some = firstObject(bySubject, label, owl.someValuesFrom);
  if (some) return { type: 'restriction', property, quantifier: 'some', filler: some };
  const only = firstObject(bySubject, label, owl.allValuesFrom);
  if (only) return { type: 'restriction', property, quantifier: 'only', filler: only };
  const value = firstObject(bySubject, label, owl.hasValue);
  if (value) return { type: 'restriction', property, quantifier: 'value', filler: value };
  if (firstObject(bySubject, label, owl.hasSelf)) {
    return { type: 'restriction', property, quantifier: 'Self', filler: undefined };
  }
  return { type: 'restriction', property, quantifier: 'restriction', filler: undefined };
}

const MAX_DEPTH = 6;

/** Renders a class expression in Manchester-like syntax, for example `hasTopping some Cheese`. */
export function expressionText(
  shape: ExpressionShape,
  nameOf: (term: Term) => string,
  shapeOf: (label: string) => ExpressionShape | undefined,
  depth = 0,
): string {
  const render = (term: Term): string => {
    if (term.kind !== 'bnode') return nameOf(term);
    const nested = shapeOf(term.value);
    if (!nested || depth >= MAX_DEPTH) return '…';
    return `(${expressionText(nested, nameOf, shapeOf, depth + 1)})`;
  };
  switch (shape.type) {
    case 'restriction': {
      const filler = shape.filler ? ` ${render(shape.filler)}` : '';
      return `${nameOf({ kind: 'iri', value: shape.property })} ${shape.quantifier}${filler}`;
    }
    case 'union':
      return shape.members.map(render).join(' or ');
    case 'intersection':
      return shape.members.map(render).join(' and ');
    case 'complement':
      return `not ${shape.members.map(render).join('')}`;
    case 'oneOf':
      return `{${shape.members.map(render).join(', ')}}`;
    case 'allDisjoint':
      return `disjoint: ${shape.members.map(render).join(', ')}`;
    case 'allDifferent':
      return `all different: ${shape.members.map(render).join(', ')}`;
  }
}
