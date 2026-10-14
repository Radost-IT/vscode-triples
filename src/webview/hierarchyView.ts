import cytoscape, { type Core, type NodeSingular } from 'cytoscape';
import type { ChangeStatus } from '../core/diff/diff';
import type { OntologyModel } from '../core/model/types';
import { buildHierarchy, type Hierarchy, type HierarchyTab } from '../core/view/hierarchy';
import { h } from './dom';
import { graphStylesheet, nodeSize } from './graphStyle';
import { layeredLayout, type TreeDirection } from './layout';
import { kindNames, statusNames, strings } from './strings';
import { STATUS_MARK, readPalette } from './theme';

export type HierarchyMode = 'outline' | 'diagram';

export interface HierarchySettings {
  readonly tab: HierarchyTab;
  readonly mode: HierarchyMode;
  readonly direction: TreeDirection;
}

export interface HierarchyViewEvents {
  readonly onSelect: (entityId: string | null) => void;
  readonly onSettingsChange: (settings: HierarchySettings) => void;
}

export interface HierarchyView {
  readonly element: HTMLElement;
  setModel(model: OntologyModel, statuses: Readonly<Record<string, ChangeStatus>> | null): void;
  reveal(entityId: string | null): void;
  show(): void;
  applyTheme(): void;
  /** The diagram, when it is the visible part; the outline cannot be exported. */
  diagram(): Core | null;
}

/** Lists past this size are cut so a flat ontology does not render thousands of rows at once. */
const CHILD_PAGE = 200;
const AUTO_EXPAND_LIMIT = 300;

interface Row {
  readonly id: string;
  readonly level: number;
  readonly parentId: string | null;
}

export function createHierarchyView(
  initial: HierarchySettings,
  events: HierarchyViewEvents,
): HierarchyView {
  let settings = initial;
  let model: OntologyModel | null = null;
  let statuses: Readonly<Record<string, ChangeStatus>> | null = null;
  const hierarchies = new Map<HierarchyTab, Hierarchy>();
  const expanded = new Map<HierarchyTab, Set<string>>();
  const pages = new Map<string, number>();
  let selectedId: string | null = null;
  let query = '';
  let cy: Core | null = null;

  const tabButtons = (['classes', 'properties'] as const).map((tab) =>
    h(
      'button',
      { role: 'tab', class: 'tab', 'data-tab': tab, onclick: () => update({ tab }) },
      tab === 'classes' ? strings.classesTab : strings.propertiesTab,
    ),
  );
  const modeSelect = h(
    'select',
    {
      'aria-label': strings.viewSwitch,
      onchange: () => update({ mode: modeSelect.value as HierarchyMode }),
    },
    h('option', { value: 'outline' }, strings.outline),
    h('option', { value: 'diagram' }, strings.diagram),
  );
  const directionSelect = h(
    'select',
    {
      'aria-label': strings.layoutLabel,
      onchange: () => update({ direction: directionSelect.value as TreeDirection }),
    },
    h('option', { value: 'LR' }, strings.leftToRight),
    h('option', { value: 'TB' }, strings.topDown),
  );
  const filterInput = h('input', {
    type: 'search',
    class: 'tree-filter',
    placeholder: strings.filterTree,
    'aria-label': strings.filterTree,
    oninput: () => {
      query = filterInput.value.trim().toLowerCase();
      draw();
    },
  });
  const tree = h('div', {
    role: 'tree',
    class: 'tree',
    'aria-label': strings.hierarchy,
    onkeydown: (event) => onTreeKey(event as KeyboardEvent),
  });
  const diagramHost = h('div', { class: 'diagram', tabindex: 0, 'aria-label': strings.diagram });
  const empty = h('p', { class: 'empty-note', hidden: true }, strings.emptyHierarchy);
  const element = h(
    'section',
    { class: 'hierarchy', 'aria-label': strings.hierarchy },
    h(
      'div',
      { class: 'subbar' },
      h('div', { role: 'tablist', class: 'tabs', 'aria-label': strings.hierarchy }, ...tabButtons),
      modeSelect,
      directionSelect,
      h('button', { class: 'text-button', onclick: () => setAllExpanded(true) }, strings.expandAll),
      h(
        'button',
        { class: 'text-button', onclick: () => setAllExpanded(false) },
        strings.collapseAll,
      ),
      filterInput,
    ),
    tree,
    diagramHost,
    empty,
  );

  function update(change: Partial<HierarchySettings>): void {
    settings = { ...settings, ...change };
    events.onSettingsChange(settings);
    draw();
  }

  function hierarchy(): Hierarchy {
    const cached = hierarchies.get(settings.tab);
    if (cached || !model) return cached ?? { roots: [], nodes: {} };
    const built = buildHierarchy(model, settings.tab);
    hierarchies.set(settings.tab, built);
    return built;
  }

  function expandedSet(): Set<string> {
    let set = expanded.get(settings.tab);
    if (!set) {
      const data = hierarchy();
      const all = Object.keys(data.nodes);
      set = new Set(all.length <= AUTO_EXPAND_LIMIT ? all : data.roots);
      expanded.set(settings.tab, set);
    }
    return set;
  }

  function setAllExpanded(open: boolean): void {
    const set = expandedSet();
    set.clear();
    if (open) for (const id of Object.keys(hierarchy().nodes)) set.add(id);
    draw();
  }

  function filterKeep(): Set<string> | null {
    if (!query) return null;
    const data = hierarchy();
    const keep = new Set<string>();
    const stack = Object.values(data.nodes)
      .filter(
        (node) => node.label.toLowerCase().includes(query) || node.id.toLowerCase().includes(query),
      )
      .map((node) => node.id);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (keep.has(id)) continue;
      keep.add(id);
      stack.push(...(data.nodes[id]?.parents ?? []));
    }
    return keep;
  }

  function visibleRows(): { rows: Row[]; more: Map<string, number> } {
    const data = hierarchy();
    const keep = filterKeep();
    const open = expandedSet();
    const rows: Row[] = [];
    const more = new Map<string, number>();
    const visit = (id: string, level: number, parentId: string | null, ancestors: Set<string>) => {
      rows.push({ id, level, parentId });
      const node = data.nodes[id];
      if (!node || !(keep ? keep.has(id) : open.has(id)) || ancestors.has(id)) return;
      const children = keep ? node.children.filter((child) => keep.has(child)) : node.children;
      const limit = keep ? children.length : (pages.get(id) ?? CHILD_PAGE);
      const nextAncestors = new Set(ancestors).add(id);
      for (const child of children.slice(0, limit)) visit(child, level + 1, id, nextAncestors);
      if (children.length > limit) more.set(id, children.length - limit);
    };
    for (const root of data.roots.filter((id) => !keep || keep.has(id)))
      visit(root, 1, null, new Set());
    return { rows, more };
  }

  function draw(): void {
    tabButtons.forEach((button) => {
      const active = button.dataset['tab'] === settings.tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    modeSelect.value = settings.mode;
    directionSelect.value = settings.direction;
    directionSelect.hidden = settings.mode !== 'diagram';
    const { rows, more } = visibleRows();
    empty.hidden = rows.length > 0;
    tree.hidden = settings.mode !== 'outline' || rows.length === 0;
    diagramHost.hidden = settings.mode !== 'diagram' || rows.length === 0;
    if (settings.mode === 'outline') drawOutline(rows, more);
    else drawDiagram(rows);
  }

  function drawOutline(rows: readonly Row[], more: Map<string, number>): void {
    const data = hierarchy();
    const open = expandedSet();
    const items: HTMLElement[] = [];
    let focusable = false;
    rows.forEach((row, index) => {
      const node = data.nodes[row.id];
      const entity = model?.entities[row.id];
      if (!node || !entity) return;
      const status = statuses?.[row.id] ?? 'unchanged';
      const hasChildren = node.children.length > 0;
      const isOpen = hasChildren && (query ? true : open.has(row.id));
      const selected = row.id === selectedId;
      const otherParents = node.parents.filter((parent) => parent !== row.parentId);
      const item = h(
        'div',
        {
          role: 'treeitem',
          class: `tree-row status-${status}${selected ? ' selected' : ''}`,
          'data-id': row.id,
          'aria-level': row.level,
          'aria-selected': String(selected),
          'aria-expanded': hasChildren ? String(isOpen) : null,
          'aria-label': [
            entity.label,
            kindNames[entity.kind],
            status !== 'unchanged' ? statusNames[status] : '',
          ]
            .filter(Boolean)
            .join(', '),
          tabindex: -1,
          onclick: (event) => {
            if ((event.target as HTMLElement).classList.contains('twisty')) toggle(row.id);
            else select(row.id);
          },
        },
        h(
          'span',
          { class: `twisty${hasChildren ? '' : ' leaf'}`, 'aria-hidden': 'true' },
          hasChildren ? (isOpen ? '▾' : '▸') : '',
        ),
        h('span', { class: `kind-dot kind-${entity.kind}`, 'aria-hidden': 'true' }),
        h('span', { class: 'row-label' }, `${STATUS_MARK[status]}${entity.label}`),
        node.instanceCount > 0
          ? h('span', { class: 'badge' }, strings.instances(node.instanceCount))
          : null,
        otherParents.length > 0
          ? h(
              'span',
              {
                class: 'badge multi',
                title: strings.alsoUnder(
                  otherParents.map((id) => data.nodes[id]?.label ?? id).join(', '),
                ),
              },
              `⑂ ${node.parents.length}`,
            )
          : null,
      );
      // Set through CSSOM because the webview CSP blocks inline style attributes.
      item.style.setProperty('--level', String(row.level - 1));
      if (selected && !focusable) {
        item.tabIndex = 0;
        focusable = true;
      }
      items.push(item);
      const hidden = more.get(row.id);
      const nextRow = rows[index + 1];
      if (hidden && (!nextRow || nextRow.level <= row.level)) {
        const button = h(
          'button',
          {
            class: 'show-more',
            onclick: () => {
              pages.set(row.id, (pages.get(row.id) ?? CHILD_PAGE) + CHILD_PAGE);
              draw();
            },
          },
          strings.showMore(Math.min(hidden, CHILD_PAGE)),
        );
        button.style.setProperty('--level', String(row.level));
        items.push(button);
      }
    });
    const first = items.find((item) => item.getAttribute('role') === 'treeitem');
    if (!focusable && first) first.tabIndex = 0;
    tree.replaceChildren(...items);
  }

  function toggle(id: string): void {
    const set = expandedSet();
    if (set.has(id)) set.delete(id);
    else set.add(id);
    draw();
    focusRow(id);
  }

  function select(id: string): void {
    selectedId = id;
    events.onSelect(id);
    draw();
    focusRow(id);
  }

  function focusRow(id: string): void {
    const row = tree.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    tree.querySelectorAll<HTMLElement>('[role=treeitem]').forEach((item) => (item.tabIndex = -1));
    row.tabIndex = 0;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  }

  function onTreeKey(event: KeyboardEvent): void {
    const items = [...tree.querySelectorAll<HTMLElement>('[role=treeitem]')];
    const current =
      document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1;
    const item = items[current];
    const id = item?.dataset['id'];
    if (!item || !id) return;
    const move = (index: number) => {
      const target = items[Math.max(0, Math.min(items.length - 1, index))];
      if (target?.dataset['id']) focusRow(target.dataset['id']);
    };
    const level = Number(item.getAttribute('aria-level'));
    switch (event.key) {
      case 'ArrowDown':
        move(current + 1);
        break;
      case 'ArrowUp':
        move(current - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(items.length - 1);
        break;
      case 'ArrowRight':
        if (item.getAttribute('aria-expanded') === 'false') toggle(id);
        else if (item.getAttribute('aria-expanded') === 'true') move(current + 1);
        break;
      case 'ArrowLeft':
        if (item.getAttribute('aria-expanded') === 'true') toggle(id);
        else
          move(
            items.findLastIndex(
              (other, index) => index < current && Number(other.getAttribute('aria-level')) < level,
            ),
          );
        break;
      case 'Enter':
      case ' ':
        select(id);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function drawDiagram(rows: readonly Row[]): void {
    const data = hierarchy();
    const open = expandedSet();
    if (!cy)
      cy = createDiagram(
        diagramHost,
        (id) => select(id),
        (id) => toggle(id),
      );
    const ids = [...new Set(rows.map((row) => row.id))];
    const shown = new Set(ids);
    const elements = [
      ...ids.map((id) => {
        const entity = model?.entities[id];
        const node = data.nodes[id];
        const status = statuses?.[id] ?? 'unchanged';
        const collapsed =
          node && node.children.length > 0 && !open.has(id) && !query
            ? ` ▸ ${node.children.length}`
            : '';
        const label = `${STATUS_MARK[status]}${node?.label ?? id}${collapsed}`;
        const kind = entity?.kind ?? 'class';
        return {
          group: 'nodes' as const,
          data: { id, label, ...nodeSize(label, kind) },
          classes: `kind-${kind} status-${status}${statuses ? ' diff' : ''}`,
        };
      }),
      ...ids.flatMap((id) =>
        (data.nodes[id]?.parents ?? [])
          .filter((parent) => shown.has(parent))
          .map((parent) => ({
            group: 'edges' as const,
            data: { id: `${parent} ${id}`, source: parent, target: id, label: '' },
            classes: 'tree-edge',
          })),
      ),
    ];
    const core = cy;
    core.batch(() => {
      core.elements().remove();
      core.add(elements);
    });
    core.resize();
    core.layout(layeredLayout(settings.direction)).run();
    if (selectedId && core.getElementById(selectedId).nonempty()) {
      core.getElementById(selectedId).select();
      core.center(core.getElementById(selectedId));
    }
  }

  return {
    element,
    setModel(nextModel, nextStatuses) {
      model = nextModel;
      statuses = nextStatuses;
      hierarchies.clear();
      draw();
    },
    reveal(entityId) {
      selectedId = entityId;
      if (entityId) {
        const tab = model?.entities[entityId] && hierarchyTabOf(model, entityId);
        if (tab && tab !== settings.tab) {
          settings = { ...settings, tab };
          events.onSettingsChange(settings);
        }
        expandAncestors(entityId);
      }
      draw();
      if (entityId && settings.mode === 'outline') {
        tree
          .querySelector(`[data-id="${CSS.escape(entityId)}"]`)
          ?.scrollIntoView({ block: 'center' });
      }
    },
    show() {
      cy?.resize();
      draw();
    },
    applyTheme() {
      cy?.style(diagramStylesheet());
    },
    diagram: () => (settings.mode === 'diagram' ? cy : null),
  };

  function expandAncestors(entityId: string): void {
    const data = hierarchy();
    const open = expandedSet();
    let current = data.nodes[entityId]?.parents[0];
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      open.add(current);
      current = data.nodes[current]?.parents[0];
    }
  }
}

function hierarchyTabOf(model: OntologyModel, entityId: string): HierarchyTab | null {
  const kind = model.entities[entityId]?.kind;
  if (kind === 'class') return 'classes';
  if (
    kind === 'objectProperty' ||
    kind === 'datatypeProperty' ||
    kind === 'annotationProperty' ||
    kind === 'property'
  )
    return 'properties';
  return null;
}

function diagramStylesheet() {
  return [
    ...graphStylesheet(readPalette()),
    {
      selector: 'edge.tree-edge',
      style: {
        'target-arrow-shape': 'none',
        'source-arrow-shape': 'triangle',
        'source-arrow-fill': 'hollow',
        'arrow-scale': 1.3,
        'curve-style': 'taxi',
        'taxi-direction': 'auto',
      },
    },
  ] as cytoscape.StylesheetJson;
}

function createDiagram(
  container: HTMLElement,
  onSelect: (id: string) => void,
  onToggle: (id: string) => void,
): Core {
  const cy = cytoscape({
    container,
    layout: { name: 'preset' },
    style: diagramStylesheet(),
    minZoom: 0.05,
    maxZoom: 3,
    boxSelectionEnabled: false,
  });
  cy.on('tap', 'node', (event) => onSelect((event.target as NodeSingular).id()));
  cy.on('dbltap', 'node', (event) => onToggle((event.target as NodeSingular).id()));
  return cy;
}
