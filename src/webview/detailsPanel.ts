import type { ChangeStatus, EntityChange } from '../core/diff/diff';
import type { Edge, Entity, LiteralFact, OntologyModel } from '../core/model/types';
import { h } from './dom';
import { kindNames, statusNames, strings } from './strings';
import { STATUS_MARK } from './theme';

export interface DetailsContext {
  readonly model: OntologyModel;
  readonly edgesBySource: ReadonlyMap<string, Edge[]>;
  readonly edgesByTarget: ReadonlyMap<string, Edge[]>;
  readonly status: (entityId: string) => ChangeStatus;
  readonly changesOf: (entityId: string) => EntityChange | undefined;
  readonly onNavigate: (entityId: string) => void;
}

export function indexEdges(edges: readonly Edge[], end: 'source' | 'target'): Map<string, Edge[]> {
  const index = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = index.get(edge[end]) ?? [];
    list.push(edge);
    index.set(edge[end], list);
  }
  return index;
}

/** Fills the side panel with everything known about one entity, or the ontology header when nothing is selected. */
export function renderDetails(
  target: HTMLElement,
  entityId: string | null,
  context: DetailsContext,
): void {
  const entity = entityId ? context.model.entities[entityId] : undefined;
  target.replaceChildren(
    ...(entity ? entityDetails(entity, context) : ontologyDetails(context.model)),
  );
}

function entityDetails(entity: Entity, context: DetailsContext): Node[] {
  const status = context.status(entity.id);
  const change = context.changesOf(entity.id);
  const annotations = entity.literals.filter((fact) => fact.isAnnotation);
  const values = entity.literals.filter((fact) => !fact.isAnnotation);
  return [
    h('h2', { class: `details-title status-${status}` }, `${STATUS_MARK[status]}${entity.label}`),
    h(
      'dl',
      { class: 'facts' },
      h('dt', {}, strings.kind),
      h('dd', {}, kindNames[entity.kind]),
      h('dt', {}, strings.compactName),
      h('dd', {}, entity.displayName),
      entity.iri ? h('dt', {}, strings.iri) : null,
      entity.iri ? h('dd', { class: 'iri' }, entity.iri) : null,
      status !== 'unchanged' ? h('dt', {}, strings.changes) : null,
      status !== 'unchanged' ? h('dd', {}, statusNames[status]) : null,
    ),
    change && change.changes.length > 0 ? section(strings.changes, changeList(change)) : null,
    annotations.length > 0 ? section(strings.annotations, literalList(annotations)) : null,
    values.length > 0 ? section(strings.values, literalList(values)) : null,
    relationSection(
      strings.outgoing,
      context.edgesBySource.get(entity.id) ?? [],
      'target',
      context,
    ),
    relationSection(
      strings.incoming,
      context.edgesByTarget.get(entity.id) ?? [],
      'source',
      context,
    ),
  ].filter((node): node is HTMLElement => node !== null);
}

function ontologyDetails(model: OntologyModel): Node[] {
  if (!model.ontology) return [h('p', { class: 'empty-note' }, strings.noDetails)];
  return [
    h('h2', { class: 'details-title' }, model.ontology.label),
    h(
      'dl',
      { class: 'facts' },
      h('dt', {}, strings.iri),
      h('dd', { class: 'iri' }, model.ontology.iri),
    ),
    model.ontology.literals.length > 0
      ? section(strings.ontologyHeader, literalList(model.ontology.literals))
      : null,
    h('p', { class: 'empty-note' }, strings.noDetails),
  ].filter((node): node is HTMLElement => node !== null);
}

function section(title: string, body: HTMLElement): HTMLElement {
  return h('section', { class: 'details-section' }, h('h3', {}, title), body);
}

function literalList(facts: readonly LiteralFact[]): HTMLElement {
  return h(
    'dl',
    { class: 'literals' },
    ...facts.flatMap((fact) => [
      h('dt', {}, fact.predicateLabel),
      h(
        'dd',
        {},
        fact.value,
        fact.language ? h('span', { class: 'lang' }, ` @${fact.language}`) : null,
      ),
    ]),
  );
}

function changeList(change: EntityChange): HTMLElement {
  return h(
    'ul',
    { class: 'change-lines' },
    ...change.changes.map((line) =>
      h('li', { class: `status-${line.status}` }, `${STATUS_MARK[line.status]}${line.text}`),
    ),
  );
}

function relationSection(
  title: string,
  edges: readonly Edge[],
  end: 'source' | 'target',
  context: DetailsContext,
): HTMLElement | null {
  if (edges.length === 0) return null;
  const items = edges.map((edge) => {
    const other = context.model.entities[edge[end]];
    const status = context.status(edge[end]);
    return h(
      'li',
      {},
      h('span', { class: 'predicate' }, `${edge.label || edge.kind} `),
      other
        ? h(
            'button',
            { class: `link status-${status}`, onclick: () => context.onNavigate(other.id) },
            other.label,
          )
        : edge[end],
    );
  });
  return section(title, h('ul', { class: 'relations' }, ...items));
}
