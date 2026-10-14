import { RdfXmlParser } from 'rdfxml-streaming-parser';
import type { Prefixes, Triple } from '../rdf';
import { ParseError } from './errors';
import { fromRdfJsQuad } from './rdfjs';
import type { ParsedGraph } from './types';

export function parseRdfXml(text: string, baseIri: string): Promise<ParsedGraph> {
  return new Promise((resolve, reject) => {
    const triples: Triple[] = [];
    const prefixes: Prefixes = collectXmlnsPrefixes(text);
    const parser = new RdfXmlParser({ baseIRI: baseIri, trackPosition: true });
    parser.on('data', (quad) => {
      const triple = fromRdfJsQuad(quad);
      if (triple) triples.push(triple);
    });
    parser.on('error', (error: Error) => reject(toParseError(error)));
    parser.on('end', () => resolve({ triples, prefixes }));
    parser.write(text);
    parser.end();
  });
}

function collectXmlnsPrefixes(text: string): Prefixes {
  const prefixes: Prefixes = {};
  for (const match of text.matchAll(/xmlns:([A-Za-z_][\w.-]*)\s*=\s*["']([^"']+)["']/g)) {
    const [, prefix, namespace] = match;
    if (prefix && namespace && !(prefix in prefixes)) {
      prefixes[prefix] = namespace;
    }
  }
  return prefixes;
}

function toParseError(error: Error): ParseError {
  const position =
    /^(\d+):(\d+):/.exec(error.message) ?? /line (\d+) column (\d+)/i.exec(error.message);
  return new ParseError(
    error.message,
    position ? Number(position[1]) : undefined,
    position ? Number(position[2]) : undefined,
  );
}
