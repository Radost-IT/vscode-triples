import { UnsupportedFormatError } from './errors';

export type RdfFormat =
  | 'turtle'
  | 'trig'
  | 'ntriples'
  | 'nquads'
  | 'n3'
  | 'rdfxml'
  | 'jsonld'
  | 'owlfunctional'
  | 'owlxml'
  | 'manchester';

const FORMAT_BY_EXTENSION: Readonly<Record<string, RdfFormat>> = {
  ttl: 'turtle',
  turtle: 'turtle',
  trig: 'trig',
  nt: 'ntriples',
  nq: 'nquads',
  n3: 'n3',
  rdf: 'rdfxml',
  owl: 'rdfxml',
  xml: 'rdfxml',
  jsonld: 'jsonld',
  ofn: 'owlfunctional',
  owx: 'owlxml',
  omn: 'manchester',
};

export const SUPPORTED_EXTENSIONS = Object.keys(FORMAT_BY_EXTENSION);

export function extensionOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/**
 * Picks the parser for a file. The extension is only a hint: `.owl` files in the
 * wild contain RDF/XML, Turtle, OWL/XML or Functional Syntax, so the content decides.
 */
export function detectFormat(fileName: string, text: string): RdfFormat {
  const extension = extensionOf(fileName);
  const head = text
    .slice(0, 4096)
    .replace(/^\uFEFF/, '')
    .trimStart();

  if (extension === 'owx' || looksLikeOwlXml(head)) {
    return 'owlxml';
  }
  if (extension === 'omn' || /^(Prefix|Ontology):\s/.test(head)) {
    return 'manchester';
  }
  if (/^(Prefix|Ontology)\s*\(/.test(head.replace(/^(\s*#[^\n]*\n)+\s*/, ''))) {
    return 'owlfunctional';
  }

  const byExtension = FORMAT_BY_EXTENSION[extension];
  if (byExtension === 'rdfxml' && !head.startsWith('<')) {
    return head.startsWith('{') || head.startsWith('[') ? 'jsonld' : 'turtle';
  }
  if (byExtension) {
    return byExtension;
  }
  if (head.startsWith('<?xml') || head.startsWith('<rdf:RDF')) {
    return 'rdfxml';
  }
  if (head.startsWith('{') || head.startsWith('[')) {
    return 'jsonld';
  }
  throw new UnsupportedFormatError(`Files with the extension ".${extension}" are not supported.`);
}

function looksLikeOwlXml(head: string): boolean {
  return /<Ontology[\s>]/.test(head) && head.includes('http://www.w3.org/2002/07/owl#');
}
