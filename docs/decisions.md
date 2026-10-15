# Decisions

Short notes on choices where the requirements were open or met reality. Newest last.

## License: MIT

The repository already had an MIT `LICENSE`. All runtime dependencies are MIT, ISC, BSD or Apache-2.0, which fit.

## VS Code 1.101 or newer

`engines.vscode` is `^1.101.0`, the first release that ships Node 22 (the extension bundle targets `node22`). `@types/vscode` stays on 1.101 so the build cannot use newer APIs. Earlier this was `^1.140.0`, which blocked install on older but current-enough editors.

## TypeScript 6.0

TypeScript 6.0.3 is the newest version that `typescript-eslint` supports.

## JSON-LD through `jsonld-streaming-parser`

It accepts a custom document loader. Triples passes one that refuses every remote context, so a JSON-LD file never causes a network request. The user gets a clear error asking to inline the context.

## `.owl` files are sniffed

The extension `.owl` is used for RDF/XML, Turtle, OWL/XML, Functional Syntax and Manchester Syntax. The parser looks at the start of the file to pick one.

## Blank nodes in the diff use a structural hash

OWL restrictions, unions and lists are blank-node trees. Each blank node gets an id from a hash of its own triples and its children's ids (a Merkle hash). Equal structures get equal ids, so an unchanged restriction never shows up as changed, whatever its blank node labels are. This is simpler than RDFC-1.0 and good enough because ontologies rarely contain blank-node cycles. When a cycle exists, the nodes in it fall back to their labels, which may report a spurious change.

A changed restriction is reported once, on the named entity that owns it, as a readable expression such as `subClassOf [ hasTopping some Cheese ]`.

## Renames are removed + added

As the requirements say, no rename guessing in v1.

## Properties drawn as arrows

When a property has both a domain and a range, the graph draws an arrow from domain to range labeled with the property name, instead of a separate property node. This is how people sketch ontologies and halves the node count. The toggle "Draw properties as arrows between domain and range" turns it off. The property node stays visible when something else connects to it, such as a `subPropertyOf` edge.

## Parsing runs in a Web Worker inside the webview

The worker gets the file text from the host and returns the model or diff. This keeps the extension host free of heavy work and keeps `src/core` independent of Node. VS Code webviews cannot start a worker from a `vscode-resource` URL, so the page fetches the worker bundle and starts it from a `blob:` URL. The CSP allows `worker-src blob:` and `connect-src` for the extension's own resources only.

## Strict CSP and Cytoscape's stylesheet

Cytoscape inserts a `<style>` element on start, which a strict `style-src` blocks. The page ships that exact stylesheet with a nonce, so Cytoscape finds it and skips the insert. Inline style attributes are never used; dynamic values are set through the CSSOM.

## Both diff sides share one base IRI

Relative IRIs resolve against the file location. When comparing HEAD with the working copy, or two different files, both sides resolve against the newer file. Otherwise every relative IRI would show as changed. `SourceDocument.uri` still points at the real source, so "Go to line" opens the right document.

## A missing side is an empty graph

When the file does not exist at a revision (added or deleted file), that side is `null` and everything shows as added or removed. Diff editors show a missing side as an empty document, so blank text from a diff editor also counts as "no file".

## Stable layouts

The force layout seeds `Math.random` while it runs, so the same file gives the same picture. On refresh, node positions are reused when at least 60% of the nodes are unchanged; new nodes are placed next to a neighbor. Above 2,500 nodes the layout uses fcose draft quality, and above 3,000 nodes Cytoscape hides edges and labels while panning.

## Hierarchy view expansion

Below 300 nodes the tree starts fully expanded; above that only roots are expanded. Children are shown 200 at a time with a "Show more" row. A node with several parents appears under each parent with a `⑂ n` badge.

## Strings

Webview strings are in `src/webview/strings.ts`, extension strings use `vscode.l10n.t` in `src/extension/strings.ts`, and contribution titles are in `package.nls.json`. No translation bundles exist yet.

## Panel state

Each panel keeps context when hidden (`retainContextWhenHidden`), so large graphs do not need a new layout when the user switches tabs. The Graph/Hierarchy choice is stored per file in workspace state. Panels are not restored after a window reload.

## Screenshots outside VS Code

`scripts/screenshots.mjs` serves `dist/` and `media/` locally and loads the webview in headless Chrome. The page sets the VS Code Dark Modern or Light Modern theme variables and stubs `acquireVsCodeApi`. This keeps screenshots reproducible without driving a real VS Code window. The script is a dev tool only and is not packaged.

## Performance budget

`test/unit/performance.test.ts` generates a 5,000-class ontology, then parses it, builds the model, projects the graph and runs the force layout in headless Cytoscape. The test fails above 2 seconds, or 6 seconds on CI, where shared runners are several times slower. Canvas drawing is not part of the measurement, because it needs a browser; it is fast next to the layout.

## Huge graphs

Above 20,000 visible nodes the graph view does not draw anything until the user asks. Drawing that many nodes freezes the webview for several seconds and the picture is unreadable anyway. The notice offers the hierarchy view and a "Draw anyway" button, and search still works: picking a result draws only that node's neighborhood. The limit counts nodes after filters, so hiding kinds or namespaces can bring a graph under it.

## Pull request file tree

The GitHub Pull Requests extension has no public API for the base and head of a changed file. "View Ontology Changes" on a file in its tree runs that extension's own `pr.openDiffView` command with the tree item, then reads both sides of the diff editor it opens, the same way as the diff editor title button. If the extension changes that command, only this menu entry breaks; the title button keeps working. Its tree items carry no file extension context key, so the entry shows on every changed file and says so when the file is not an ontology.

## Translations

Extension strings use `vscode.l10n.t`. The webview cannot call it, so the extension embeds `vscode.l10n.bundle` in the page as JSON, and `src/webview/strings.ts` looks each English message up in it with the same `{0}` placeholders. One bundle per language therefore covers both sides. No translations ship yet; English is the fallback for any missing message.

## OWL syntaxes are mapped to RDF

OWL Functional Syntax, OWL/XML and Manchester Syntax are parsed into the same small tree of constructs (OWL/XML uses the construct names as element names) and turned into triples with the W3C "OWL 2 Mapping to RDF Graphs". The rest of Triples (model, views, diff) then works unchanged, and a Functional Syntax file diffs cleanly against its Turtle version. Axioms with no RDF mapping that the views could show, such as SWRL rules (`DLSafeRule`), are skipped instead of failing the whole file. The Functional Syntax parser is hand-written (about 200 lines) because no small, maintained JavaScript parser for it exists. OWL/XML is read with `@rubensworks/saxes`, the XML parser already bundled for RDF/XML; `DOMParser` is not available in the Web Worker. Manchester Syntax is also hand-written. It reads data properties first so that restrictions on them use the data constructs, `and` binds tighter than `or`, and SWRL `Rule:` frames are skipped.

## Open command title

The open command reads "Open with Triples by Radost IT" instead of "Triples: Open Visualizer", as requested, so the Explorer menu and the editor title button name the extension and its maker. The command has no category, because "Triples: Open with Triples by Radost IT" would repeat the name in the Command Palette. The command ID stays `triples.openVisualizer`, so keybindings keep working.
