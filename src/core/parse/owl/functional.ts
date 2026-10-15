import { bnode, iri, literal, type Prefixes, type Term } from '../../rdf';
import { XSD, rdf } from '../../vocab';
import { ParseError } from '../errors';
import type { ParsedGraph } from '../types';
import { owlToTriples } from './mapping';
import { DEFAULT_PREFIXES, resolveIri, type OwlArg, type OwlCall } from './tree';

type TokenKind =
  | 'open'
  | 'close'
  | 'equals'
  | 'iri'
  | 'pname'
  | 'string'
  | 'lang'
  | 'datatype'
  | 'blank'
  | 'number'
  | 'word';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly offset: number;
}

const TOKEN_PATTERNS: readonly [TokenKind | 'skip', RegExp][] = [
  ['skip', /\s+|#[^\n]*/y],
  ['open', /\(/y],
  ['close', /\)/y],
  ['equals', /=/y],
  ['datatype', /\^\^/y],
  ['iri', /<[^>\s]*>/y],
  ['string', /"(?:[^"\\]|\\.)*"/y],
  ['lang', /@[A-Za-z]+(?:-[A-Za-z0-9]+)*/y],
  ['blank', /_:[^\s()"<>=]+/y],
  ['number', /[0-9]+/y],
  ['pname', /(?:[A-Za-z_][\w.-]*)?:[^\s()"<>=^]*/y],
  ['word', /[A-Za-z][A-Za-z0-9]*/y],
];

export function parseOwlFunctional(text: string, baseIri: string): ParsedGraph {
  return owlToTriples(new FunctionalParser(text, baseIri).document());
}

class FunctionalParser {
  private readonly tokens: Token[];
  private position = 0;
  private readonly declared: Prefixes = {};

  constructor(
    private readonly text: string,
    private readonly baseIri: string,
  ) {
    this.tokens = this.tokenize();
  }

  document(): { prefixes: Prefixes; ontology: OwlCall } {
    while (this.peek()?.text === 'Prefix') this.prefix();
    const ontology = this.call();
    if (ontology.name !== 'Ontology') {
      throw this.error(`Expected "Ontology(", found "${ontology.name}(".`, this.tokens[0]);
    }
    const extra = this.peek();
    if (extra) throw this.error(`Unexpected "${extra.text}" after the ontology.`, extra);
    return { prefixes: this.declared, ontology };
  }

  private prefix(): void {
    this.expect('word');
    this.expect('open');
    const name = this.expect('pname').text;
    if (!name.endsWith(':'))
      throw this.error(`Invalid prefix name "${name}".`, this.tokens[this.position - 1]);
    this.expect('equals');
    this.declared[name.slice(0, -1)] = resolveIri(
      this.baseIri,
      this.expect('iri').text.slice(1, -1),
    );
    this.expect('close');
  }

  private call(): OwlCall {
    const name = this.peek()?.kind === 'open' ? '' : this.expect('word').text;
    this.expect('open');
    const args: OwlArg[] = [];
    while (this.peek()?.kind !== 'close') args.push(this.arg());
    this.expect('close');
    return { name, args };
  }

  private arg(): OwlArg {
    const token = this.peek();
    if (!token) throw this.error('The file ends before the ontology is closed.');
    switch (token.kind) {
      case 'word':
      case 'open':
        return this.call();
      case 'iri':
      case 'pname':
        return iri(this.iriValue(this.next()));
      case 'blank':
        // A leading underscore keeps file labels apart from the blank nodes the mapping creates.
        return bnode(`_${this.next().text.slice(2)}`);
      case 'number':
        return literal(this.next().text, `${XSD}nonNegativeInteger`);
      case 'string':
        return this.literal();
      default:
        throw this.error(`Unexpected "${token.text}".`, token);
    }
  }

  private literal(): Term {
    const value = unescape(this.next().text.slice(1, -1));
    const suffix = this.peek();
    if (suffix?.kind === 'lang') {
      this.next();
      return literal(value, rdf.langString, suffix.text.slice(1).toLowerCase());
    }
    if (suffix?.kind === 'datatype') {
      this.next();
      const datatype = this.next();
      if (datatype.kind !== 'iri' && datatype.kind !== 'pname') {
        throw this.error('Expected a datatype IRI after "^^".', datatype);
      }
      return literal(value, this.iriValue(datatype));
    }
    return literal(value, `${XSD}string`);
  }

  private iriValue(token: Token): string {
    if (token.kind === 'iri') return resolveIri(this.baseIri, token.text.slice(1, -1));
    const colon = token.text.indexOf(':');
    const prefix = token.text.slice(0, colon);
    const namespace = this.declared[prefix] ?? DEFAULT_PREFIXES[prefix];
    if (namespace === undefined) throw this.error(`Unknown prefix "${prefix}:".`, token);
    return namespace + token.text.slice(colon + 1);
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private next(): Token {
    const token = this.tokens[this.position];
    if (!token) throw this.error('The file ends before the ontology is closed.');
    this.position += 1;
    return token;
  }

  private expect(kind: TokenKind): Token {
    const token = this.next();
    if (token.kind !== kind) throw this.error(`Unexpected "${token.text}".`, token);
    return token;
  }

  private tokenize(): Token[] {
    const tokens: Token[] = [];
    let offset = 0;
    while (offset < this.text.length) {
      const match = matchToken(this.text, offset);
      if (!match) {
        throw this.error(`Unexpected character "${this.text[offset]}".`, {
          kind: 'word',
          text: '',
          offset,
        });
      }
      if (match.kind !== 'skip') tokens.push({ kind: match.kind, text: match.text, offset });
      offset += match.text.length;
    }
    return tokens;
  }

  private error(message: string, token?: Token): ParseError {
    const offset = token?.offset ?? this.text.length;
    const before = this.text.slice(0, offset).split('\n');
    return new ParseError(message, before.length, (before.at(-1)?.length ?? 0) + 1);
  }
}

function matchToken(
  text: string,
  offset: number,
): { kind: TokenKind | 'skip'; text: string } | undefined {
  for (const [kind, pattern] of TOKEN_PATTERNS) {
    pattern.lastIndex = offset;
    const match = pattern.exec(text);
    if (match) return { kind, text: match[0] };
  }
  return undefined;
}

function unescape(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}
