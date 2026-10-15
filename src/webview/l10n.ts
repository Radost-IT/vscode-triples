/** Translations from the extension's `l10n` bundle, keyed by the English message. */
export type Bundle = Readonly<Record<string, string>>;

/** Looks the message up in the bundle and fills `{0}`, `{1}`, ... like `vscode.l10n.t`. */
export function translate(
  bundle: Bundle,
  message: string,
  args: readonly (string | number)[],
): string {
  return (bundle[message] ?? message).replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    index in args ? String(args[Number(index)]) : placeholder,
  );
}
