import type { OntologyModel } from '../core/model/types';
import { searchEntities, type SearchHit } from '../core/view/search';
import { h } from './dom';
import { strings } from './strings';

const MAX_HITS = 20;

/** Combobox with a listbox popup, following the WAI-ARIA combobox pattern. */
export function createSearchBox(onPick: (entityId: string) => void): {
  element: HTMLElement;
  setModel(model: OntologyModel): void;
} {
  let model: OntologyModel | null = null;
  let hits: SearchHit[] = [];
  let active = -1;
  const list = h('ul', {
    role: 'listbox',
    id: 'search-results',
    class: 'search-results',
    hidden: true,
  });
  const input = h('input', {
    type: 'search',
    role: 'combobox',
    class: 'search-input',
    placeholder: strings.searchPlaceholder,
    'aria-label': strings.searchLabel,
    'aria-controls': 'search-results',
    'aria-expanded': 'false',
    'aria-autocomplete': 'list',
    oninput: () => {
      hits = model ? searchEntities(model, input.value, MAX_HITS) : [];
      active = hits.length > 0 ? 0 : -1;
      draw();
    },
    onkeydown: (event) => onKey(event as KeyboardEvent),
    onblur: () => setTimeout(close, 150),
  });

  function draw(): void {
    const open = input.value.trim().length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    list.replaceChildren(
      ...(hits.length === 0
        ? [
            h(
              'li',
              { class: 'muted', role: 'option', 'aria-disabled': 'true' },
              strings.noSearchResults,
            ),
          ]
        : hits.map((hit, index) =>
            h(
              'li',
              {
                role: 'option',
                id: `search-hit-${index}`,
                'aria-selected': String(index === active),
                class: index === active ? 'active' : '',
                onmousedown: (event) => {
                  event.preventDefault();
                  pick(index);
                },
              },
              h('span', {}, hit.label),
              h('span', { class: 'muted' }, ` ${hit.detail}`),
            ),
          )),
    );
    if (active >= 0) input.setAttribute('aria-activedescendant', `search-hit-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (hits.length === 0) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
      draw();
    } else if (event.key === 'Enter' && active >= 0) {
      pick(active);
    } else if (event.key === 'Escape') {
      input.value = '';
      close();
    } else {
      return;
    }
    event.preventDefault();
  }

  function pick(index: number): void {
    const hit = hits[index];
    if (!hit) return;
    onPick(hit.id);
    input.value = hit.label;
    close();
  }

  function close(): void {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  return {
    element: h('div', { class: 'search' }, input, list),
    setModel(next) {
      model = next;
    },
  };
}
