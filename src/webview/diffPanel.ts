import type { DiffResult, EntityChange, SummaryCategory } from '../core/diff/diff';
import { changeList } from './detailsPanel';
import { h } from './dom';
import { categoryNames, kindNames, statusNames, strings } from './strings';
import { STATUS_MARK } from './theme';

/** Short change lists start expanded; long ones would bury the entity names. */
const OPEN_LIMIT = 10;

export interface DiffTitles {
  readonly before: string;
  readonly after: string;
}

/** Summary counts plus a list of changed entities; clicking one jumps to it. */
export function renderDiffPanel(
  target: HTMLElement,
  diff: DiffResult,
  titles: DiffTitles,
  onNavigate: (entityId: string) => void,
): void {
  const categories = Object.keys(diff.summary) as SummaryCategory[];
  const counts = h(
    'table',
    { class: 'summary' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}, ''),
        ...(['added', 'removed', 'modified'] as const).map((status) =>
          h('th', { class: `status-${status}` }, `${STATUS_MARK[status]}${statusNames[status]}`),
        ),
      ),
    ),
    h(
      'tbody',
      {},
      ...categories.map((category) => {
        const row = diff.summary[category];
        return h(
          'tr',
          {},
          h('th', {}, categoryNames[category]),
          h('td', {}, row.added),
          h('td', {}, row.removed),
          h('td', {}, row.modified),
        );
      }),
    ),
  );
  const list =
    diff.changes.length === 0
      ? h('p', { class: 'empty-note' }, strings.noChanges)
      : h(
          'ul',
          { class: 'change-list' },
          ...diff.changes.map((change) =>
            h('li', {}, changedEntity(change, diff.changes.length <= OPEN_LIMIT, onNavigate)),
          ),
        );
  target.replaceChildren(
    h('h2', {}, strings.diffSummary),
    h('p', { class: 'muted' }, strings.diffTitle(titles.before, titles.after)),
    h('p', { class: 'muted' }, strings.tripleCounts(diff.addedTriples, diff.removedTriples)),
    counts,
    list,
  );
}

function changedEntity(
  change: EntityChange,
  open: boolean,
  onNavigate: (entityId: string) => void,
): HTMLElement {
  return h(
    'details',
    { class: 'changed-entity', open },
    h(
      'summary',
      {},
      h(
        'button',
        {
          class: `link status-${change.status}`,
          onclick: (event: Event) => {
            // Jump to the node without also folding the entry.
            event.preventDefault();
            onNavigate(change.id);
          },
        },
        `${STATUS_MARK[change.status]}${change.label}`,
      ),
      h(
        'span',
        { class: 'muted' },
        ` ${change.kind === 'ontology' ? strings.ontologyHeader : kindNames[change.kind]}`,
      ),
    ),
    changeList(change),
  );
}
