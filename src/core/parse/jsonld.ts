import { JsonLdParser, type IJsonLdParserOptions } from 'jsonld-streaming-parser';
import type { Prefixes, Triple } from '../rdf';
import { ParseError } from './errors';
import { fromRdfJsQuad } from './rdfjs';
import type { ParsedGraph } from './types';

const offlineDocumentLoader: NonNullable<IJsonLdParserOptions['documentLoader']> = {
  load(url) {
    return Promise.reject(
      new ParseError(
        `Remote JSON-LD context "${url}" was not loaded. Triples works offline; inline the context in the file.`,
      ),
    );
  },
};

export async function parseJsonLd(text: string, baseIri: string): Promise<ParsedGraph> {
  const document = parseJson(text);
  const triples: Triple[] = [];
  await new Promise<void>((resolve, reject) => {
    const parser = new JsonLdParser({ baseIRI: baseIri, documentLoader: offlineDocumentLoader });
    parser.on('data', (quad) => {
      const triple = fromRdfJsQuad(quad);
      if (triple) triples.push(triple);
    });
    parser.on('error', (error: Error) =>
      reject(error instanceof ParseError ? error : new ParseError(error.message)),
    );
    parser.on('end', () => resolve());
    parser.write(text);
    parser.end();
  });
  return { triples, prefixes: contextPrefixes(document) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw jsonSyntaxError(text, error as SyntaxError);
  }
}

function jsonSyntaxError(text: string, error: SyntaxError): ParseError {
  const lineColumn = /line (\d+) column (\d+)/.exec(error.message);
  if (lineColumn) {
    return new ParseError(error.message, Number(lineColumn[1]), Number(lineColumn[2]));
  }
  const position = /position (\d+)/.exec(error.message);
  if (!position) {
    return new ParseError(error.message);
  }
  const before = text.slice(0, Number(position[1]));
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n');
  return new ParseError(error.message, line, column);
}

function contextPrefixes(document: unknown): Prefixes {
  const prefixes: Prefixes = {};
  const roots = Array.isArray(document) ? document : [document];
  for (const root of roots) {
    const context = (root as { '@context'?: unknown } | null)?.['@context'];
    const contexts = Array.isArray(context) ? context : [context];
    for (const entry of contexts) {
      if (!entry || typeof entry !== 'object') continue;
      for (const [term, value] of Object.entries(entry)) {
        if (typeof value === 'string' && /[#/]$/.test(value) && !term.startsWith('@')) {
          prefixes[term] = value;
        }
      }
    }
  }
  return prefixes;
}
