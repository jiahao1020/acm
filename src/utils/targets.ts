/**
 * Resolve a `--client <ids>` option against the clients available on this
 * machine.
 *
 * The ids that match nothing are returned rather than dropped: a typo like
 * `--client cursro` must not be reported as "no clients configured", which
 * sends the user off to re-run `acm init` for no reason.
 */
export function selectClientIds<T extends { id: string }>(
  available: T[],
  clientOpt?: string
): { targets: T[]; unknown: string[] } {
  if (!clientOpt) return { targets: available, unknown: [] };

  const ids = clientOpt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const targets = available.filter((a) => ids.includes(a.id));
  const known = new Set(available.map((a) => a.id));
  const unknown = ids.filter((id) => !known.has(id));

  return { targets, unknown };
}

/** Message for ids that are not installed (or not selected) on this machine. */
export function unknownClientMessage(
  unknown: string[],
  available: { id: string }[]
): string {
  const known = available.map((a) => a.id).join(", ") || "(none detected)";
  return `Unknown or unavailable client id(s): ${unknown.join(", ")}. Available: ${known}`;
}
