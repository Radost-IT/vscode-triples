import { bnode, iri, literal, type Prefixes, type Term } from '../../rdf';
import { RDF, XSD, rdf } from '../../vocab';
import type { ParseError } from '../errors';
import type { ParsedGraph } from '../types';
import { owlToTriples } from './mapping';
import {
  DEFAULT_PREFIXES,
  isCall,
  parseErrorAt,
  resolveIri,
  type OwlArg,
  type OwlCall,
  type OwlDocument,
} from './tree';

type TokenKind =
  | 'keyword'
  | 'name'
  | 'iri'
  | 'blank'
  | 'string'
  | 'lang'
  | 'datatype'
  | 'number'
  | 'compare'
  | 'punct'
  | 'other';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly offset: number;
}

const TOKEN_PATTERNS: readonly [TokenKind | 'skip', RegExp][] = [
  ['skip', /\s+|#[^\n]*/y],
  ['iri', /<[^>\s,[\]]*>/y],
  ['compare', /[<>]=?/y],
  ['string', /"(?:[^"\\]|\\.)*"/y],
  ['datatype', /\^\^/y],
  ['lang', /@[A-Za-z]+(?:-[A-Za-z0-9]+)*/y],
  ['blank', /_:[\w.-]+/y],
  ['number', /[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fF]?/y],
  ['punct', /[(){}[\],]/y],
  ['name', /[A-Za-z_][\w.-]*(?::[\w.-]*)?|:[\w.-]*/y],
  // Lets SWRL rules, which are skipped, contain characters the rest of the grammar does not use.
  ['other', /\S/y],
];

const FRAMES = new Set([
  'Class',
  'ObjectProperty',
  'DataProperty',
  'AnnotationProperty',
  'Individual',
  'Datatype',
  'EquivalentClasses',
  'DisjointClasses',
  'EquivalentProperties',
  'DisjointProperties',
  'SameIndividual',
  'DifferentIndividuals',
  'Rule',
]);

const SECTIONS = new Set([
  'Prefix',
  'Ontology',
  'Import',
  'Annotations',
  'SubClassOf',
  'EquivalentTo',
  'DisjointWith',
  'DisjointUnionOf',
  'HasKey',
  'Domain',
  'Range',
  'Characteristics',
  'SubPropertyOf',
  'InverseOf',
  'SubPropertyChain',
  'Types',
  'Facts',
  'SameAs',
  'DifferentFrom',
]);

const DECLARATIONS: Readonly<Record<string, string>> = {
  Class: 'Class',
  ObjectProperty: 'ObjectProperty',
  DataProperty: 'DataProperty',
  AnnotationProperty: 'AnnotationProperty',
  Individual: 'NamedIndividual',
  Datatype: 'Datatype',
};

const FACETS: Readonly<Record<string, string>> = {
  length: `${XSD}length`,
  minLength: `${XSD}minLength`,
  maxLength: `${XSD}maxLength`,
  pattern: `${XSD}pattern`,
  langRange: `${RDF}langRange`,
  '<=': `${XSD}maxInclusive`,
  '<': `${XSD}maxExclusive`,
  '>=': `${XSD}minInclusive`,
  '>': `${XSD}minExclusive`,
};

const RESTRICTIONS = new Set(['some', 'only', 'value', 'Self', 'min', 'max', 'exactly']);
const CONNECTIVES = new Set(['and', 'or', 'that']);

type Range = 'Object' | 'Data';

interface Item<T> {
  readonly annotations: OwlCall[];
  readonly value: T;
}

interface AnnotationValue {
  readonly property: Term;
  readonly value: Term;
}

export function parseManchester(text: string, baseIri: string): ParsedGraph {
  return owlToTriples(new ManchesterParser(text, baseIri).document());
}

/** Reads Manchester Syntax frames into the construct tree that Functional Syntax uses. */
class ManchesterParser {
  private readonly tokens: Token[];
  private position = 0;
  private readonly declared: Prefixes = {};
  private readonly dataProperties = new Set<string>();
  private readonly axioms: OwlCall[] = [];

  constructor(
    private readonly text: string,
    private readonly baseIri: string,
  ) {
    this.tokens = this.tokenize();
  }

  document(): OwlDocument {
    while (this.atKeyword('Prefix')) this.prefix();
    this.collectDataProperties();
    const header: OwlArg[] = [];
    if (this.atKeyword('Ontology')) {
      this.next();
      while (this.peek()?.kind === 'iri') header.push(this.entity());
    }
    while (this.atKeyword('Import') || this.atKeyword('Annotations')) {
      if (this.next().text === 'Import:') header.push({ name: 'Import', args: [this.entity()] });
      else header.push(...this.annotations().map(toAnnotation));
    }
    while (this.peek()) this.frame();
    return {
      prefixes: this.declared,
      ontology: { name: 'Ontology', args: [...header, ...this.axioms] },
    };
  }

  private prefix(): void {
    this.next();
    const name = this.expect('name');
    if (!name.text.endsWith(':')) throw this.error(`Invalid prefix name "${name.text}".`, name);
    this.declared[name.text.slice(0, -1)] = resolveIri(
      this.baseIri,
      this.expect('iri').text.slice(1, -1),
    );
  }

  /** Restrictions on data properties map to different RDF, so they must be known up front. */
  private collectDataProperties(): void {
    this.tokens.forEach((token, index) => {
      const next = this.tokens[index + 1];
      if (token.kind === 'keyword' && token.text === 'DataProperty:' && next) {
        this.dataProperties.add(this.iriOf(next));
      }
    });
  }

  private frame(): void {
    const token = this.next();
    const kind = token.text.slice(0, -1);
    if (token.kind !== 'keyword' || !FRAMES.has(kind)) {
      throw this.error(`Expected a frame such as "Class:", found "${token.text}".`, token);
    }
    if (kind === 'Rule') return this.skipRule();
    const declaration = DECLARATIONS[kind];
    if (!declaration) return this.listFrame(kind);
    const subject = this.entity();
    if (subject.kind === 'iri') {
      this.add('Declaration', [], [{ name: declaration, args: [subject] }]);
    }
    while (this.peek()?.kind === 'keyword' && !this.atFrame()) {
      this.section(kind, subject, this.next());
    }
  }

  private section(frame: string, subject: Term, keyword: Token): void {
    const name = keyword.text.slice(0, -1);
    const range: Range = this.dataProperties.has(subject.value) ? 'Data' : 'Object';
    if (name === 'Annotations') {
      for (const { annotations, value } of this.annotations()) {
        this.add('AnnotationAssertion', annotations, [value.property, subject, value.value]);
      }
      return;
    }
    const each = <T>(read: () => T, build: (value: T) => [string, OwlArg[]]): void => {
      for (const item of this.items(read)) {
        const [axiom, args] = build(item.value);
        this.add(axiom, item.annotations, args);
      }
    };
    const description = () => this.description('Object');
    const property = () => this.propertyExpression();
    switch (`${frame}.${name}`) {
      case 'Class.SubClassOf':
        return each(description, (value) => ['SubClassOf', [subject, value]]);
      case 'Class.EquivalentTo':
        return each(description, (value) => ['EquivalentClasses', [subject, value]]);
      case 'Class.DisjointWith':
        return each(description, (value) => ['DisjointClasses', [subject, value]]);
      case 'Class.DisjointUnionOf':
        return this.wholeList(description, (values) => ['DisjointUnion', [subject, ...values]]);
      case 'Class.HasKey':
        return this.wholeList(property, (values) => ['HasKey', [subject, ...values]]);
      case 'ObjectProperty.Domain':
      case 'DataProperty.Domain':
        return each(description, (value) => [`${range}PropertyDomain`, [subject, value]]);
      case 'ObjectProperty.Range':
      case 'DataProperty.Range':
        return each(
          () => this.description(range),
          (value) => [`${range}PropertyRange`, [subject, value]],
        );
      case 'ObjectProperty.Characteristics':
      case 'DataProperty.Characteristics':
        return each(
          () => this.expect('name').text,
          (value) => [`${value}${range}Property`, [subject]],
        );
      case 'ObjectProperty.SubPropertyOf':
      case 'DataProperty.SubPropertyOf':
        return each(property, (value) => [`Sub${range}PropertyOf`, [subject, value]]);
      case 'ObjectProperty.EquivalentTo':
      case 'DataProperty.EquivalentTo':
        return each(property, (value) => [`Equivalent${range}Properties`, [subject, value]]);
      case 'ObjectProperty.DisjointWith':
      case 'DataProperty.DisjointWith':
        return each(property, (value) => [`Disjoint${range}Properties`, [subject, value]]);
      case 'ObjectProperty.InverseOf':
        return each(property, (value) => ['InverseObjectProperties', [subject, value]]);
      case 'ObjectProperty.SubPropertyChain':
        return each(
          () => this.propertyChain(),
          (chain) => ['SubObjectPropertyOf', [chain, subject]],
        );
      case 'AnnotationProperty.Domain':
        return each(
          () => this.entity(),
          (value) => ['AnnotationPropertyDomain', [subject, value]],
        );
      case 'AnnotationProperty.Range':
        return each(
          () => this.entity(),
          (value) => ['AnnotationPropertyRange', [subject, value]],
        );
      case 'AnnotationProperty.SubPropertyOf':
        return each(
          () => this.entity(),
          (value) => ['SubAnnotationPropertyOf', [subject, value]],
        );
      case 'Individual.Types':
        return each(description, (value) => ['ClassAssertion', [value, subject]]);
      case 'Individual.Facts':
        return each(
          () => this.fact(),
          ({ negative, property: factProperty, value }) => {
            const kind = value.kind === 'literal' ? 'Data' : 'Object';
            const axiom = `${negative ? 'Negative' : ''}${kind}PropertyAssertion`;
            return [axiom, [factProperty, subject, value]];
          },
        );
      case 'Individual.SameAs':
        return each(
          () => this.entity(),
          (value) => ['SameIndividual', [subject, value]],
        );
      case 'Individual.DifferentFrom':
        return each(
          () => this.entity(),
          (value) => ['DifferentIndividuals', [subject, value]],
        );
      case 'Datatype.EquivalentTo':
        return each(
          () => this.description('Data'),
          (value) => ['DatatypeDefinition', [subject, value]],
        );
      default:
        throw this.error(`"${keyword.text}" is not allowed in a ${frame} frame.`, keyword);
    }
  }

  /** Frames such as `DisjointClasses: A, B, C` state one axiom about all listed members. */
  private listFrame(kind: string): void {
    const read =
      kind === 'EquivalentClasses' || kind === 'DisjointClasses'
        ? () => this.description('Object')
        : kind === 'SameIndividual' || kind === 'DifferentIndividuals'
          ? () => this.entity()
          : () => this.propertyExpression();
    this.wholeList(read, (members) => {
      const first = members[0];
      const range =
        first && !isCall(first) && this.dataProperties.has(first.value) ? 'Data' : 'Object';
      const name = kind.endsWith('Properties')
        ? kind.replace('Properties', `${range}Properties`)
        : kind;
      return [name, members];
    });
  }

  /** `HasKey:` separates its members with spaces, the other lists with commas; both are accepted. */
  private wholeList(read: () => OwlArg, build: (values: OwlArg[]) => [string, OwlArg[]]): void {
    const annotations = this.itemAnnotations();
    const values = [read()];
    while (this.comma() || this.startsPrimary()) values.push(read());
    const [name, args] = build(values);
    this.add(name, annotations, args);
  }

  private items<T>(read: () => T): Item<T>[] {
    const items: Item<T>[] = [];
    do {
      items.push({ annotations: this.itemAnnotations(), value: read() });
    } while (this.comma());
    return items;
  }

  private itemAnnotations(): OwlCall[] {
    if (!this.atKeyword('Annotations')) return [];
    this.next();
    return this.annotations().map(toAnnotation);
  }

  private annotations(): Item<AnnotationValue>[] {
    return this.items(() => ({ property: this.entity(), value: this.annotationValue() }));
  }

  private annotationValue(): Term {
    const token = this.peek();
    return token?.kind === 'string' || token?.kind === 'number' ? this.literal() : this.entity();
  }

  private fact(): { negative: boolean; property: OwlArg; value: Term } {
    const negative = this.atName('not');
    if (negative) this.next();
    return { negative, property: this.propertyExpression(), value: this.annotationValue() };
  }

  private propertyChain(): OwlCall {
    const chain = [this.propertyExpression()];
    while (this.atName('o')) {
      this.next();
      chain.push(this.propertyExpression());
    }
    return { name: 'ObjectPropertyChain', args: chain };
  }

  private propertyExpression(): OwlArg {
    if (!this.atName('inverse')) return this.entity();
    this.next();
    const parenthesized = this.atPunct('(');
    if (parenthesized) this.next();
    const inverse = { name: 'ObjectInverseOf', args: [this.entity()] };
    if (parenthesized) this.expectPunct(')');
    return inverse;
  }

  private description(range: Range): OwlArg {
    const first = this.conjunction(range);
    if (!this.atName('or')) return first;
    const operands = [first];
    while (this.atName('or')) {
      this.next();
      operands.push(this.conjunction(range));
    }
    return { name: `${range}UnionOf`, args: operands };
  }

  private conjunction(range: Range): OwlArg {
    const first = this.primary(range);
    if (!this.atName('and') && !this.atName('that')) return first;
    const operands = [first];
    while (this.atName('and') || this.atName('that')) {
      this.next();
      operands.push(this.primary(range));
    }
    return { name: `${range}IntersectionOf`, args: operands };
  }

  private primary(range: Range): OwlArg {
    if (this.atName('not')) {
      this.next();
      return { name: `${range}ComplementOf`, args: [this.primary(range)] };
    }
    if (this.atPunct('(')) {
      this.next();
      const inner = this.description(range);
      this.expectPunct(')');
      return inner;
    }
    if (this.atPunct('{')) {
      this.next();
      const members = this.items(() => (range === 'Data' ? this.literal() : this.entity()));
      this.expectPunct('}');
      return { name: `${range}OneOf`, args: members.map((member) => member.value) };
    }
    if (this.atName('inverse')) return this.restriction(this.propertyExpression());
    const entity = this.entity();
    const next = this.peek();
    if (next?.kind === 'name' && RESTRICTIONS.has(next.text)) return this.restriction(entity);
    if (range === 'Data' && this.atPunct('[')) return this.datatypeRestriction(entity);
    return entity;
  }

  private restriction(property: OwlArg): OwlCall {
    const range: Range =
      !isCall(property) && this.dataProperties.has(property.value) ? 'Data' : 'Object';
    const word = this.next();
    switch (word.text) {
      case 'some':
        return { name: `${range}SomeValuesFrom`, args: [property, this.primary(range)] };
      case 'only':
        return { name: `${range}AllValuesFrom`, args: [property, this.primary(range)] };
      case 'value':
        return { name: `${range}HasValue`, args: [property, this.annotationValue()] };
      case 'Self':
        return { name: 'ObjectHasSelf', args: [property] };
      default: {
        const count = this.expect('number');
        const kind = { min: 'Min', max: 'Max', exactly: 'Exact' }[word.text] ?? '';
        const filler = this.startsPrimary() ? [this.primary(range)] : [];
        return {
          name: `${range}${kind}Cardinality`,
          args: [literal(count.text, `${XSD}nonNegativeInteger`), property, ...filler],
        };
      }
    }
  }

  private datatypeRestriction(datatype: Term): OwlCall {
    this.expectPunct('[');
    const facets = this.items(() => {
      const facet = this.next();
      const facetIri = FACETS[facet.text];
      if (!facetIri) throw this.error(`Unknown facet "${facet.text}".`, facet);
      return [iri(facetIri), this.literal()];
    });
    this.expectPunct(']');
    return {
      name: 'DatatypeRestriction',
      args: [datatype, ...facets.flatMap((item) => item.value)],
    };
  }

  private literal(): Term {
    const token = this.next();
    if (token.kind === 'number') return numberLiteral(token.text);
    if (token.kind !== 'string')
      throw this.error(`Expected a literal, found "${token.text}".`, token);
    const value = token.text.slice(1, -1).replace(/\\(.)/g, '$1');
    const suffix = this.peek();
    if (suffix?.kind === 'lang') {
      this.next();
      return literal(value, rdf.langString, suffix.text.slice(1).toLowerCase());
    }
    if (suffix?.kind === 'datatype') {
      this.next();
      return literal(value, this.iriOf(this.next()));
    }
    return literal(value, `${XSD}string`);
  }

  private entity(): Term {
    const token = this.next();
    if (token.kind === 'blank') {
      // A leading underscore keeps file labels apart from the blank nodes the mapping creates.
      return bnode(`_${token.text.slice(2)}`);
    }
    return iri(this.iriOf(token));
  }

  private iriOf(token: Token): string {
    if (token.kind === 'iri') return resolveIri(this.baseIri, token.text.slice(1, -1));
    if (token.kind !== 'name') throw this.error(`Expected a name, found "${token.text}".`, token);
    const colon = token.text.indexOf(':');
    const prefix = colon < 0 ? '' : token.text.slice(0, colon);
    const namespace = this.declared[prefix] ?? DEFAULT_PREFIXES[prefix];
    if (namespace === undefined) throw this.error(`Unknown prefix "${prefix}:".`, token);
    return namespace + token.text.slice(colon + 1);
  }

  private skipRule(): void {
    while (this.peek() && !this.atFrame()) this.next();
  }

  private atFrame(): boolean {
    const token = this.peek();
    return token?.kind === 'keyword' && FRAMES.has(token.text.slice(0, -1));
  }

  private add(name: string, annotations: OwlCall[], args: OwlArg[]): void {
    this.axioms.push({ name, args: [...annotations, ...args] });
  }

  private startsPrimary(): boolean {
    const token = this.peek();
    if (!token) return false;
    if (token.kind === 'iri' || token.kind === 'blank') return true;
    if (token.kind === 'punct') return token.text === '(' || token.text === '{';
    return token.kind === 'name' && !CONNECTIVES.has(token.text);
  }

  private atKeyword(word: string): boolean {
    const token = this.peek();
    return token?.kind === 'keyword' && token.text === `${word}:`;
  }

  private atName(word: string): boolean {
    const token = this.peek();
    return token?.kind === 'name' && token.text === word;
  }

  private atPunct(text: string): boolean {
    const token = this.peek();
    return token?.kind === 'punct' && token.text === text;
  }

  private comma(): boolean {
    if (!this.atPunct(',')) return false;
    this.next();
    return true;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private next(): Token {
    const token = this.tokens[this.position];
    if (!token) throw this.error('The file ends in the middle of a frame.');
    this.position += 1;
    return token;
  }

  private expect(kind: TokenKind): Token {
    const token = this.next();
    if (token.kind !== kind) throw this.error(`Unexpected "${token.text}".`, token);
    return token;
  }

  private expectPunct(text: string): void {
    const token = this.next();
    if (token.text !== text) throw this.error(`Expected "${text}", found "${token.text}".`, token);
  }

  private tokenize(): Token[] {
    const tokens: Token[] = [];
    let offset = 0;
    while (offset < this.text.length) {
      const match = matchToken(this.text, offset);
      if (match.kind !== 'skip') tokens.push({ kind: match.kind, text: match.text, offset });
      offset += match.text.length;
    }
    return tokens;
  }

  private error(message: string, token?: Token): ParseError {
    return parseErrorAt(this.text, token?.offset ?? this.text.length, message);
  }
}

function matchToken(text: string, offset: number): { kind: TokenKind | 'skip'; text: string } {
  for (const [kind, pattern] of TOKEN_PATTERNS) {
    pattern.lastIndex = offset;
    const match = pattern.exec(text);
    if (match) return { kind: kindOf(kind, match[0]), text: match[0] };
  }
  return { kind: 'other', text: text.charAt(offset) };
}

/** `Class:` opens a frame, while `owl:` alone is a prefix name. */
function kindOf(kind: TokenKind | 'skip', text: string): TokenKind | 'skip' {
  if (kind !== 'name' || !text.endsWith(':')) return kind;
  const word = text.slice(0, -1);
  return FRAMES.has(word) || SECTIONS.has(word) ? 'keyword' : kind;
}

function toAnnotation({ annotations, value }: Item<AnnotationValue>): OwlCall {
  return { name: 'Annotation', args: [...annotations, value.property, value.value] };
}

function numberLiteral(text: string): Term {
  if (/[fF]$/.test(text)) return literal(text.slice(0, -1), `${XSD}float`);
  if (/[eE]/.test(text)) return literal(text, `${XSD}double`);
  if (text.includes('.')) return literal(text, `${XSD}decimal`);
  return literal(text, `${XSD}integer`);
}
