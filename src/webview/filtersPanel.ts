import type { EntityKind, OntologyModel } from '../core/model/types';
import { BUSY_CLASS_INSTANCES, type ViewOptions } from '../core/view/project';
import { h } from './dom';
import { filterableKinds, kindNames, strings } from './strings';

type Toggle =
  | 'showOwlThing'
  | 'showAnnotationLinks'
  | 'showLiterals'
  | 'showBusyTypeLinks'
  | 'propertiesAsEdges'
  | 'onlyChanges';

export interface FilterState {
  readonly options: ViewOptions;
  readonly hops: number;
  readonly diff: boolean;
}

/** Declutter switches plus include/exclude lists built from what the file actually contains. */
export function renderFilters(
  target: HTMLElement,
  model: OntologyModel,
  state: FilterState,
  onChange: (next: FilterState) => void,
): void {
  const { options } = state;
  const toggle = (key: Toggle, label: string) =>
    checkbox(label, options[key], (checked) =>
      onChange({ ...state, options: { ...options, [key]: checked } }),
    );
  const listToggle = <T extends string>(
    list: readonly T[],
    value: T,
    key: 'hiddenKinds' | 'hiddenNamespaces' | 'hiddenPredicates',
    label: string,
  ) =>
    checkbox(label, !list.includes(value), (checked) => {
      const next = checked ? list.filter((item) => item !== value) : [...list, value];
      onChange({ ...state, options: { ...options, [key]: next } });
    });

  const entities = Object.values(model.entities);
  const kindCounts = countBy(entities.map((entity) => entity.kind));
  const namespaceCounts = countBy(
    entities.filter((entity) => entity.iri && !entity.builtin).map((entity) => entity.namespace),
  );
  const predicates = new Map<string, string>();
  for (const edge of model.edges) {
    if (edge.kind !== 'subClassOf' && !predicates.has(edge.predicate))
      predicates.set(edge.predicate, edge.label || edge.kind);
  }

  const hops = h('input', {
    type: 'number',
    min: 1,
    max: 6,
    value: state.hops,
    'aria-label': strings.focusHops,
    onchange: () => onChange({ ...state, hops: Math.max(1, Math.min(6, Number(hops.value) || 1)) }),
  });

  const groups = [
    group(
      strings.declutter,
      toggle('propertiesAsEdges', strings.propertiesAsEdges),
      toggle('showOwlThing', strings.showOwlThing),
      toggle('showAnnotationLinks', strings.showAnnotationLinks),
      toggle('showLiterals', strings.showLiterals),
      toggle('showBusyTypeLinks', strings.showBusyTypeLinks(BUSY_CLASS_INSTANCES)),
      state.diff ? toggle('onlyChanges', strings.onlyChanges) : null,
      h('label', { class: 'field' }, strings.focusHops, ' ', hops),
    ),
    group(
      strings.nodeKinds,
      ...filterableKinds
        .filter((kind) => kindCounts.has(kind))
        .map((kind: EntityKind) =>
          listToggle(
            options.hiddenKinds,
            kind,
            'hiddenKinds',
            `${kindNames[kind]} (${kindCounts.get(kind)})`,
          ),
        ),
    ),
    namespaceCounts.size > 1
      ? group(
          strings.namespaces,
          ...[...namespaceCounts]
            .sort()
            .map(([namespace, count]) =>
              listToggle(
                options.hiddenNamespaces,
                namespace,
                'hiddenNamespaces',
                `${namespace} (${count})`,
              ),
            ),
        )
      : null,
    predicates.size > 0
      ? group(
          strings.relations,
          ...[...predicates]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([predicate, label]) =>
              listToggle(options.hiddenPredicates, predicate, 'hiddenPredicates', label),
            ),
        )
      : null,
  ];
  target.replaceChildren(...groups.filter((element) => element !== null));
}

function group(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('fieldset', { class: 'filter-group' }, h('legend', {}, title), ...children);
}

function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const input = h('input', { type: 'checkbox', checked, onchange: () => onChange(input.checked) });
  return h('label', { class: 'check' }, input, ` ${label}`);
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
