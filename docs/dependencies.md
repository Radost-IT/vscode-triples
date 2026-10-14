# Dependencies

Every dependency is checked for license and bundle size before it is added. Sizes are for the minified production bundle (`npm run build:production`).

## Runtime (bundled into the webview)

| Package                   | Version | License | Why                                                    |
| ------------------------- | ------- | ------- | ------------------------------------------------------ |
| `n3`                      | 2.13.12 | MIT     | Turtle, TriG, N-Triples, N-Quads and N3 parser         |
| `rdfxml-streaming-parser` | 3.3.0   | MIT     | RDF/XML parser for most `.owl` and `.rdf` files        |
| `jsonld-streaming-parser` | 5.0.2   | MIT     | JSON-LD parser that accepts a custom document loader   |
| `cytoscape`               | 3.34.3  | MIT     | Canvas graph rendering; ships its own TypeScript types |
| `cytoscape-fcose`         | 2.2.0   | MIT     | Force-directed layout                                  |
| `cytoscape-dagre`         | 4.0.1   | MIT     | Layered layout and tree diagram                        |

Notable transitive packages: `readable-stream`, `buffer`, `events`, `process` (MIT), `canonicalize` (Apache-2.0), `@rubensworks/saxes` (ISC), `ieee754` (BSD-3-Clause), `cose-base` and `layout-base` (MIT). All are compatible with the MIT license of this extension. esbuild writes their notices to `dist/webview/*.LEGAL.txt`, which ships in the `.vsix`.

Bundle sizes:

| Bundle                   | Size    | Contents                          |
| ------------------------ | ------- | --------------------------------- |
| `dist/extension.js`      | ~10 KB  | Extension host code               |
| `dist/webview/main.js`   | ~645 KB | UI, Cytoscape and the two layouts |
| `dist/webview/worker.js` | ~324 KB | Parsers, model and diff engine    |

## Development only

| Package                                                                                           | License    | Why                                                 |
| ------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| `typescript` 6.0.3                                                                                | Apache-2.0 | Type checking (typescript-eslint supports < 6.1)    |
| `esbuild`                                                                                         | MIT        | Bundling                                            |
| `vitest`, `vite`                                                                                  | MIT        | Unit tests                                          |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals`                                            | MIT        | Linting                                             |
| `prettier`                                                                                        | MIT        | Formatting                                          |
| `@vscode/test-electron`                                                                           | MIT        | Runs integration tests in a real VS Code            |
| `mocha`                                                                                           | MIT        | Test runner inside the extension host               |
| `@vscode/vsce`                                                                                    | MIT        | Builds the `.vsix` and publishes to the Marketplace |
| `@types/vscode`, `@types/node`, `@types/mocha`, `@types/n3`, `@types/cytoscape-*`, `@rdfjs/types` | MIT        | Type definitions                                    |

## Considered and rejected

| Package            | Reason                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `jsonld`           | Large, and fetches remote contexts by default; Triples must stay offline                  |
| `rdf-canonize`     | Blank nodes are matched by a structural hash instead, which also gives readable diffs     |
| `cytoscape-svg`    | GPL-3.0; replaced by a small SVG exporter in `src/webview/svgExport.ts`                   |
| `elkjs`            | EPL-2.0; dagre covers layered layouts                                                     |
| `@vscode/test-cli` | Pulled in a mocha version with a known advisory; `@vscode/test-electron` is used directly |
| `@types/cytoscape` | Deprecated stub; Cytoscape ships its own types                                            |
