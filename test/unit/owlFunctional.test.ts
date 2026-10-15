import { describe, expect, it } from 'vitest';
import { ParseError, parseRdf } from '../../src/core/parse';
import type { Triple } from '../../src/core/rdf';

const EX = 'http://example.org/';
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

const parse = (body: string) =>
  parseRdf(`Prefix(:=<${EX}>)\nOntology(<${EX}o>\n${body}\n)`, 'a.ofn', 'file:///a.ofn');

const objectsOf = (triples: Triple[], predicate: string) =>
  triples.filter((triple) => triple.predicate === predicate).map((triple) => triple.object);

describe('OWL Functional Syntax', () => {
  it('maps a qualified cardinality restriction', async () => {
    const { triples } = await parse('SubClassOf(:Car ObjectExactCardinality(4 :hasWheel :Wheel))');
    expect(objectsOf(triples, `${OWL}qualifiedCardinality`)).toEqual([
      expect.objectContaining({ value: '4' }),
    ]);
    expect(objectsOf(triples, `${OWL}onClass`)).toEqual([{ kind: 'iri', value: `${EX}Wheel` }]);
  });

  it('turns three disjoint classes into owl:AllDisjointClasses', async () => {
    const { triples } = await parse('DisjointClasses(:A :B :C)');
    expect(objectsOf(triples, `${OWL}members`)).toHaveLength(1);
    expect(triples.filter((triple) => triple.predicate === `${OWL}disjointWith`)).toEqual([]);
  });

  it('keeps axiom annotations on a reified axiom', async () => {
    const { triples } = await parse('SubClassOf(Annotation(:source "a paper") :Cat :Animal)');
    expect(objectsOf(triples, `${RDFS}subClassOf`)).toEqual([
      { kind: 'iri', value: `${EX}Animal` },
    ]);
    expect(objectsOf(triples, `${OWL}annotatedTarget`)).toEqual([
      { kind: 'iri', value: `${EX}Animal` },
    ]);
    expect(objectsOf(triples, `${EX}source`)).toEqual([
      expect.objectContaining({ value: 'a paper' }),
    ]);
  });

  it('maps a property chain', async () => {
    const { triples } = await parse(
      'SubObjectPropertyOf(ObjectPropertyChain(:hasParent :hasBrother) :hasUncle)',
    );
    expect(
      triples.find((triple) => triple.predicate === `${OWL}propertyChainAxiom`)?.subject,
    ).toEqual({
      kind: 'iri',
      value: `${EX}hasUncle`,
    });
  });

  it('skips SWRL rules, which have no place in the graph', async () => {
    const { triples } = await parse('DLSafeRule(Body() Head())\nDeclaration(Class(:A))');
    expect(triples.some((triple) => triple.subject.value === `${EX}A`)).toBe(true);
  });

  it('reports the line and column of a syntax error', async () => {
    const error = await parse('Declaration(Class(:A))\nSubClassOf(:A = :B)').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({ line: 4, column: 15 });
  });

  it('reports an unknown prefix', async () => {
    await expect(parse('Declaration(Class(foo:A))')).rejects.toThrow(/Unknown prefix "foo:"/);
  });
});
