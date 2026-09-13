/**
 * Resolve a `--client <ids>` option against the clients available on this
 * machine.
 *
 * The ids that match nothing are returned rather than dropped: a typo like
 * `--client cursro` must not be reported as "no clients configured", which
 * sends the user off to re-run `acm init` for no reason.
 *
 * `--client ,,,` (or `--client ""`) parses to zero ids. That is an empty
 * request, not "every client" — returning the full list would silently widen
 * the blast radius of a command the user meant to narrow, so it is reported
 * through `empty` instead.
 */
export function selectClientIds<T extends { id: string }>(
  available: T[],
  clientOpt?: string
): { targets: T[]; unknown: string[]; empty: boolean } {
  // `undefined` means the flag was not passed at all — that is "all clients".
  // An empty or blank string means it *was* passed with no ids, which is a
  // different thing entirely and must not widen to the full list.
  if (clientOpt === undefined) return { targets: available, unknown: [], empty: false };

  const ids = clientOpt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) return { targets: [], unknown: [], empty: true };

  const targets = available.filter((a) => ids.includes(a.id));
  const known = new Set(available.map((a) => a.id));
  const unknown = ids.filter((id) => !known.has(id));

  return { targets, unknown, empty: false };
}

/** Message for ids that are not installed (or not selected) on this machine. */
export function unknownClientMessage(
  unknown: string[],
  available: { id: string }[]
): string {
  const known = available.map((a) => a.id).join(", ") || "(none detected)";
  return `Unknown or unavailable client id(s): ${unknown.join(", ")}. Available: ${known}`;
}

/** Message for a `--client` value that contains no ids at all. */
export function emptyClientMessage(available: { id: string }[]): string {
  const known = available.map((a) => a.id).join(", ") || "(none detected)";
  return `--client was given without any client id. Available: ${known}`;
}
