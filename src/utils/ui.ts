/**
 * Shared presentation helpers for the command layer.
 *
 * Two things were wrong with the hand-rolled output. The first is that the
 * column widths were literals — `padEnd(18)` in `mcp`/`key`, `padEnd(14)` in
 * `skill` — which is a guess: a client whose display name is longer than the
 * guess pushes its own column out of line, and one long enough makes the two
 * commands disagree about how the same name is rendered. The second is that
 * "supported clients" was spelled out as a literal string in three places
 * (init, key, README), so adding an adapter left the help text quietly lying.
 *
 * `column` measures the actual list and pads to the longest name, so the
 * columns line up whatever the adapters are called; `supportedList` derives
 * the sentence from the registry so it cannot drift.
 */

/**
 * Pad every name to the width of the longest one, so the column that follows
 * starts at the same offset on every row.
 *
 * The width is measured per list rather than passed in: callers were each
 * choosing a number, and the numbers disagreed. A caller with two lists in one
 * command (e.g. `skill list` prints roots, then statuses) still gets a stable
 * look as long as it renders each list through its own `column`.
 */
export function column<T>(
  items: T[],
  toName: (item: T) => string
): (item: T) => string {
  const width = items.reduce((max, item) => Math.max(max, toName(item).length), 0);
  return (item: T) => toName(item).padEnd(width);
}

/** `a, b, c` — with the tail summarised rather than truncated mid-word. */
export function listNames(names: string[], limit = 20): string {
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")}, … (${names.length - limit} more)`;
}

/**
 * The "Supported: …" sentence, built from the live adapter list.
 *
 * Sorted for a stable message (the registry order is registration order, not
 * alphabetical) and de-duplicated because one file can expose more than one
 * adapter under different ids.
 */
export function supportedList(displayNames: string[]): string {
  const unique = [...new Set(displayNames)].sort((a, b) => a.localeCompare(b));
  return `Supported: ${unique.join(", ")}`;
}
