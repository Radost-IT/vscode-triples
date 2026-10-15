# Changelog

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
