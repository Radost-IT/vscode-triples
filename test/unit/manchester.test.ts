import { describe, expect, it } from 'vitest';
import { ParseError, parseRdf } from '../../src/core/parse';
import type { Triple } from '../../src/core/rdf';

const EX = 'http://example.org/';
const OWL = 'http://www.w3.org/2002/07/owl#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const parse = (body: string) =>
  parseRdf(`Prefix: : <${EX}>\nOntology: <${EX}o>\n${body}`, 'a.omn', 'file:///a.omn');

const objectsOf = (triples: Triple[], predicate: string) =>
  triples.filter((triple) => triple.predicate === predicate).map((triple) => triple.object);

describe('Manchester Syntax', () => {
  it('uses owl:onDataRange for qualified restrictions on data properties', async () => {
    const { triples } = await parse(
      'DataProperty: age\nClass: Adult\n  SubClassOf: age exactly 1 xsd:integer[>= 18]',
    );
    expect(objectsOf(triples, `${OWL}onDataRange`)).toHaveLength(1);
    expect(objectsOf(triples, `${OWL}onClass`)).toEqual([]);
    expect(objectsOf(triples, `${XSD}minInclusive`)).toEqual([
      expect.objectContaining({ value: '18', datatype: `${XSD}integer` }),
    ]);
  });

  it('binds "and" tighter than "or"', async () => {
    const { triples } = await parse('Class: A\n  EquivalentTo: B or C and D');
    expect(objectsOf(triples, `${OWL}unionOf`)).toHaveLength(1);
    expect(objectsOf(triples, `${OWL}intersectionOf`)).toHaveLength(1);
  });

  it('keeps axiom annotations', async () => {
    const { triples } = await parse(
      'Class: Cat\n  SubClassOf: Annotations: rdfs:comment "from a paper" Animal',
    );
    expect(objectsOf(triples, `${OWL}annotatedTarget`)).toEqual([
      { kind: 'iri', value: `${EX}Animal` },
    ]);
  });

  it('reads property characteristics, inverses and chains', async () => {
    const { triples } = await parse(
      'ObjectProperty: hasUncle\n  Characteristics: Irreflexive\n  InverseOf: isUncleOf\n  SubPropertyChain: hasParent o hasBrother',
    );
    expect(objectsOf(triples, `${OWL}inverseOf`)).toEqual([
      { kind: 'iri', value: `${EX}isUncleOf` },
    ]);
    expect(objectsOf(triples, `${OWL}propertyChainAxiom`)).toHaveLength(1);
    expect(objectsOf(triples, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')).toContainEqual({
      kind: 'iri',
      value: `${OWL}IrreflexiveProperty`,
    });
  });

  it('skips SWRL rules', async () => {
    const { triples } = await parse('Rule: Person(?x) -> Adult(?x)\nClass: A');
    expect(triples.some((triple) => triple.subject.value === `${EX}A`)).toBe(true);
  });

  it('reports the line of a syntax error', async () => {
    const error = await parse('Class: A\n  SubClassOf: B and ,').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({ line: 4 });
  });

  it('rejects a section that does not belong to the frame', async () => {
    await expect(parse('Class: A\n  Facts: p b')).rejects.toThrow(/not allowed in a Class frame/);
  });
});
