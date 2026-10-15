import { SaxesParser, type SaxesTagNS } from '@rubensworks/saxes';
import { bnode, iri, literal, type Prefixes, type Term } from '../../rdf';
import { OWL, RDF, XSD, rdf } from '../../vocab';
import { ParseError } from '../errors';
import type { ParsedGraph } from '../types';
import { owlToTriples } from './mapping';
import { DEFAULT_PREFIXES, resolveIri, type OwlArg, type OwlCall } from './tree';

const XML = 'http://www.w3.org/XML/1998/namespace';
const PLAIN_LITERAL = `${RDF}PlainLiteral`;

interface Element {
  readonly tag: SaxesTagNS;
  readonly base: string;
  readonly args: OwlArg[];
  text: string;
}

/**
 * Reads OWL/XML into the same construct tree as Functional Syntax: each OWL element
 * becomes the construct of the same name, and attributes become leading arguments.
 */
export function parseOwlXml(text: string, baseIri: string): ParsedGraph {
  const prefixes: Prefixes = {};
  const topLevel: OwlArg[] = [];
  const stack: Element[] = [];
  const parser = new SaxesParser({ xmlns: true, position: true });
  const fail = (message: string) => new ParseError(message, parser.line, parser.column + 1);

  parser.on('error', (error) => {
    throw fail(error.message.replace(/^\d+:\d+: /, ''));
  });
  parser.on('opentag', (tag) => {
    const parentBase = stack.at(-1)?.base ?? baseIri;
    const base = tag.attributes['xml:base']?.value;
    stack.push({ tag, base: base ? resolveIri(parentBase, base) : parentBase, args: [], text: '' });
  });
  parser.on('text', (value) => {
    const current = stack.at(-1);
    if (current) current.text += value;
  });
  parser.on('closetag', () => {
    const element = stack.pop();
    if (!element || element.tag.uri !== OWL) return;
    if (element.tag.local === 'Prefix') {
      prefixes[attribute(element, 'name') ?? ''] = attribute(element, 'IRI') ?? '';
      return;
    }
    const arg = toArg(element, prefixes, fail);
    if (arg) (stack.at(-1)?.args ?? topLevel).push(arg);
  });

  parser.write(text).close();
  const ontology = topLevel.find((arg): arg is OwlCall => 'name' in arg && arg.name === 'Ontology');
  if (!ontology) throw new ParseError('The file has no OWL/XML <Ontology> element.');
  return owlToTriples({ prefixes, ontology });
}

function toArg(
  element: Element,
  prefixes: Prefixes,
  fail: (message: string) => ParseError,
): OwlArg | undefined {
  const name = element.tag.local;
  const content = element.text.trim();
  const expand = (value: string) => expandAbbreviated(value, prefixes, fail);
  switch (name) {
    case 'IRI':
      return iri(resolveIri(element.base, content));
    case 'AbbreviatedIRI':
      return iri(expand(content));
    case 'Literal':
      return toLiteral(element);
    case 'AnonymousIndividual':
      // A leading underscore keeps file labels apart from the blank nodes the mapping creates.
      return bnode(`_${attribute(element, 'nodeID') ?? ''}`);
    case 'Import':
      return { name, args: [iri(resolveIri(element.base, content))] };
  }
  const leading: Term[] = [];
  const entityIri = attribute(element, 'IRI');
  const abbreviated = attribute(element, 'abbreviatedIRI');
  if (entityIri !== undefined) leading.push(iri(resolveIri(element.base, entityIri)));
  if (abbreviated !== undefined) leading.push(iri(expand(abbreviated)));
  const facet = attribute(element, 'facet');
  if (facet !== undefined) leading.push(iri(resolveIri(element.base, facet)));
  const cardinality = attribute(element, 'cardinality');
  if (cardinality !== undefined) leading.push(literal(cardinality, `${XSD}nonNegativeInteger`));
  if (name === 'Ontology') {
    const ontologyIri = attribute(element, 'ontologyIRI');
    const versionIri = attribute(element, 'versionIRI');
    if (ontologyIri !== undefined) leading.push(iri(resolveIri(element.base, ontologyIri)));
    if (versionIri !== undefined) leading.push(iri(resolveIri(element.base, versionIri)));
  }
  return { name, args: [...leading, ...element.args] };
}

function toLiteral(element: Element): Term {
  const language = element.tag.attributes['xml:lang']?.value ?? '';
  const datatype = attribute(element, 'datatypeIRI') ?? PLAIN_LITERAL;
  if (datatype !== PLAIN_LITERAL) return literal(element.text, resolveIri(element.base, datatype));
  return language
    ? literal(element.text, rdf.langString, language.toLowerCase())
    : literal(element.text, `${XSD}string`);
}

function expandAbbreviated(
  value: string,
  prefixes: Prefixes,
  fail: (message: string) => ParseError,
): string {
  const colon = value.indexOf(':');
  const prefix = value.slice(0, colon);
  const namespace = prefixes[prefix] ?? DEFAULT_PREFIXES[prefix];
  if (colon < 0 || namespace === undefined)
    throw fail(`Unknown prefix "${prefix}:" in "${value}".`);
  return namespace + value.slice(colon + 1);
}

/** OWL/XML attributes have no namespace, except `xml:lang` and `xml:base`. */
function attribute(element: Element, local: string): string | undefined {
  const found = Object.values(element.tag.attributes).find(
    (candidate) => candidate.local === local && candidate.uri !== XML,
  );
  return found?.value;
}
