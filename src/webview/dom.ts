type Child = Node | string | number | null | undefined | false;
type Attributes = Record<string, string | number | boolean | null | undefined | EventListener>;

/** Creates an element. Keys starting with "on" become event listeners, `false` and `null` attributes are left out. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (typeof value === 'function') {
      element.addEventListener(name.slice(2), value);
    } else if (value === true) {
      element.setAttribute(name, '');
    } else if (value !== false && value !== null && value !== undefined) {
      element.setAttribute(name, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }
  return element;
}
