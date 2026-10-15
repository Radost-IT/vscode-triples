# Roadmap

What is left before a 1.0 release, grouped by milestone from `AGENTS.md`. M1 to M5 are done; the items below are gaps found while reviewing them, plus M6.

## Release blockers

1. **Publishing.** Needs the maintainer: create the Marketplace publisher and Open VSX namespace (see Deploy in the README), then publish to both.

## M5 follow-ups (diff)

- Apply "show only changes" in the hierarchy view, not just the graph view.
- Respect the staged state when comparing from the Source Control view (index vs HEAD, working tree vs index).

## M6 (PR workflow and polish)

- "View ontology changes" for files in the GitHub Pull Requests extension, comparing the PR base with the head.
- Keyboard navigation between graph nodes (arrow keys to move to neighbors) and screen reader announcements of the selected node.
- Keep zoom and pan after a window reload by storing the viewport with `setState`.
- Translation bundles for webview strings (`src/webview/strings.ts` is ready for them).
- Disambiguate nodes that share a label but come from different namespaces, for example by adding the prefix.

## Later

- OWL Functional Syntax (`.ofn`, `.owx`) and Manchester Syntax (`.omn`) parsers.
- Optional minimap.
- More integration tests: custom editor, Git compare commands, refresh on save.

## Known visual rough edges

- Property-only components (for example `contains` and `made with` linked by `rdfs:subPropertyOf`) are placed far from the main graph by the force layout.
- In the tree diagram, classes with several parents draw long edges that cross other branches.
- Faded nodes are very light in the light theme.
