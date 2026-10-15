import { describe, expect, it } from 'vitest';
import { ParseError, detectFormat, parseRdf } from '../../src/core/parse';
import { iri } from '../../src/core/rdf';
import { owl, rdf } from '../../src/core/vocab';
import { parseFixture, readFixture } from './helpers';

const tripleKeys = (graph: Awaited<ReturnType<typeof parseFixture>>) =>
  new Set(
    graph.triples
      .filter((triple) => triple.subject.kind === 'iri' && triple.object.kind !== 'bnode')
      .map((triple) => JSON.stringify(triple)),
  );

describe('detectFormat', () => {
  it('maps extensions to formats', () => {
    expect(detectFormat('a.ttl', '')).toBe('turtle');
    expect(detectFormat('a.nt', '')).toBe('ntriples');
    expect(detectFormat('a.trig', '')).toBe('trig');
    expect(detectFormat('a.jsonld', '{}')).toBe('jsonld');
    expect(detectFormat('a.owl', '<?xml version="1.0"?><rdf:RDF/>')).toBe('rdfxml');
  });

  it('sniffs .owl files that contain Turtle', () => {
    expect(detectFormat('a.owl', '@prefix ex: <http://example.org/> .')).toBe('turtle');
  });

  it('detects OWL Functional Syntax by extension and content', () => {
    expect(detectFormat('a.ofn', '')).toBe('owlfunctional');
    expect(detectFormat('a.owl', readFixture('functional.owl'))).toBe('owlfunctional');
    expect(detectFormat('a.owl', '# comment\nPrefix(:=<http://example.org/>)')).toBe(
      'owlfunctional',
    );
  });

  it('detects OWL/XML by extension and content', () => {
    expect(detectFormat('a.owx', '<Ontology/>')).toBe('owlxml');
    expect(detectFormat('a.owl', readFixture('pizza.owx'))).toBe('owlxml');
  });

  it('detects Manchester Syntax by extension and content', () => {
    expect(detectFormat('a.omn', 'Class: A')).toBe('manchester');
    expect(detectFormat('a.owl', readFixture('pizza.omn'))).toBe('manchester');
  });
});

describe('parseRdf', () => {
  it('parses Turtle with prefixes', async () => {
    const graph = await parseFixture('pizza.ttl');
    expect(graph.triples.length).toBeGreaterThan(50);
    expect(graph.prefixes['']).toBe('http://example.org/pizza#');
  });

  it('produces the same named triples from Turtle, RDF/XML, N-Triples, TriG, Functional Syntax and OWL/XML', async () => {
    const expected = tripleKeys(await parseFixture('pizza.ttl'));
    for (const name of ['pizza.owl', 'pizza.nt', 'pizza.trig', 'pizza.ofn', 'pizza.owx']) {
      expect(tripleKeys(await parseFixture(name)), name).toEqual(expected);
    }
  });

  it('reads Manchester Syntax, where an individual frame also declares the individual', async () => {
    const expected = tripleKeys(await parseFixture('pizza.ttl'));
    expected.add(
      JSON.stringify({
        subject: iri('http://example.org/pizza#mozzarella'),
        predicate: rdf.type,
        object: iri(owl.NamedIndividual),
      }),
    );
    expect(tripleKeys(await parseFixture('pizza.omn'))).toEqual(expected);
  });

  it('parses JSON-LD with an inline context', async () => {
    const graph = await parseFixture('people.jsonld');
    expect(graph.triples).toHaveLength(7);
    expect(graph.prefixes.foaf).toBe('http://xmlns.com/foaf/0.1/');
  });

  it('reports the line of a Turtle syntax error', async () => {
    const error = await parseFixture('broken.ttl').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).line).toBe(5);
  });

  it('reports the line of a JSON syntax error', async () => {
    const error = await parseFixture('broken.jsonld').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).line).toBe(4);
  });

  it('reports the line of an RDF/XML error', async () => {
    const error = await parseRdf(
      '<?xml version="1.0"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n<rdf:Description>\n</rdf:RDF>',
      'a.rdf',
      'file:///a.rdf',
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).line).toBeGreaterThan(1);
  });

  it('reports the line of an OWL/XML error', async () => {
    const error = await parseRdf(
      '<Ontology xmlns="http://www.w3.org/2002/07/owl#">\n<Declaration>\n</Ontology>',
      'a.owx',
      'file:///a.owx',
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).line).toBe(3);
  });

  it('never fetches remote JSON-LD contexts', async () => {
    await expect(parseFixture('remote-context.jsonld')).rejects.toThrow(/was not loaded/);
  });

  it('accepts an empty file', async () => {
    expect((await parseFixture('empty.ttl')).triples).toEqual([]);
  });
});
