# Changelog

## 0.11.0

- OWL Functional Syntax: `.ofn` files, and `.owl` files written in Functional Syntax, now open in the graph and hierarchy views and work in the semantic diff.

## 0.10.0

- Translations: the webview now reads the same `l10n` bundle as the extension, so adding `l10n/bundle.l10n.<locale>.json` translates the whole UI. See "Development" in the README.

## 0.9.0

- When several nodes share a label, the graph and the hierarchy add the compact name, such as `Person (foaf:Person)`, so they can be told apart.

## 0.8.0

- The graph keeps its zoom and pan after a window reload.

## 0.7.0

- Keyboard: with a node selected, arrow keys move to the connected node in that direction and Enter focuses on it. With nothing selected, Enter selects the node in the middle of the view. Screen readers announce the selected node's label, kind and change status.

## 0.6.0

- GitHub Pull Requests: "View Ontology Changes" in the pull request file tree opens the semantic diff of the PR base against the head.

## 0.5.0

- Source Control: "View Ontology Changes" on a file under Changes compares the staged file with the working copy, and the new "View Staged Ontology Changes" under Staged Changes compares HEAD with the staged file, the same as Git's own diffs.
- Comparing with a branch or commit after comparing with HEAD now opens a new panel instead of showing the old comparison.

## 0.4.0

- "Show only changes" now also filters the hierarchy view: it keeps changed classes and properties and the path from each one up to its root.

## 0.3.0

- The changes panel groups changes by entity: each changed class, property or individual lists its added and removed statements underneath. Short lists start expanded.

## 0.2.1

- CI: the performance budget allows for slower shared runners, and the VS Code download for integration tests is cached.

## 0.2.0

- Large files: above 20,000 nodes the graph view no longer draws everything at once. It offers the hierarchy view or "Draw anyway", and search shows the neighborhood of the chosen node.

## 0.1.2

- Tests: a 5,000-node ontology must parse, project and lay out in under 2 seconds, and the same file must always give the same layout.

## 0.1.1

- Continuous integration: lint, format check, unit tests, integration tests and packaging run on Linux, Windows and macOS for every push and pull request.

## 0.1.0

First release.

- Graph view of Turtle, TriG, N-Triples, N-Quads, N3, RDF/XML (`.owl`, `.rdf`) and JSON-LD files.
- Readable labels from `rdfs:label` in the VS Code language, distinct shapes and colors per kind, and a legend.
- Declutter options, filters by kind, namespace and relation, search, neighborhood focus, force and layered layouts.
- Hierarchy view of classes and properties as an outline or a tree diagram, with cross-selection.
- Details panel with IRI, annotations, data values and relations.
- Semantic diff against HEAD, any branch, tag or commit, another file, or the open diff editor.
- Summary panel with added, removed and modified counts and a list of changes.
- Export as SVG or PNG.
- Live refresh while editing, and parse errors with a "Go to line" link.
- Visual refresh: soft halos around nodes, bolder labels, a dot grid behind the graph, rounded panels, and line samples for each edge style in the legend.
- The packaged extension now includes the webview stylesheet.
- README screenshots and example ontologies in `examples/`.
