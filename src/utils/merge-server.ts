import { McpServerConfig } from "../types";

/**
 * Merge a server entry we are about to write into the one already on disk.
 *
 * A write replaces the whole `mcpServers` object, so any key the common model
 * does not know about — a client-specific option a user hand-wrote, or a field
 * an adapter cannot express — is lost. That is invisible and destructive, so
 * entries are merged rather than swapped.
 *
 * Semantics:
 * - keys the incoming entry defines win (it is the newer intent);
 * - keys present only on disk are kept;
 * - `env` and `headers` are merged key-by-key, since they are open-ended maps
 *   where dropping the user's extra variables would be the worst outcome;
 * - `undefined` never overwrites a concrete on-disk value.
 *
 * `args` is *not* merged: it is an ordered list where the incoming value is
 * meaningful in full, and a union of old and new flags would be nonsense.
 */
export function mergeServerEntry(
  onDisk: McpServerConfig | undefined,
  incoming: McpServerConfig
): McpServerConfig {
  if (!onDisk) return { ...incoming };

  const merged: McpServerConfig = { ...onDisk };

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    merged[key] = value;
  }

  for (const mapKey of ["env", "headers"] as const) {
    const before = onDisk[mapKey];
    const after = incoming[mapKey];
    if (before && typeof before === "object" && after && typeof after === "object") {
      merged[mapKey] = { ...before, ...after };
    }
  }

  return merged;
}

/**
 * Merge a whole `mcpServers` object into the one already on disk.
 *
 * A write replaces the entire map, so every adapter that stores servers in a
 * plain object needs this same step. Keeping it in one place means the
 * no-silent-data-loss rule is enforced once rather than nine times: each
 * adapter that hand-rolled this loop was a place the rule could quietly regress.
 */
export function mergeServersMap(
  onDisk: Record<string, McpServerConfig> | undefined,
  incoming: Record<string, McpServerConfig>
): Record<string, McpServerConfig> {
  const next: Record<string, McpServerConfig> = {};
  for (const [name, server] of Object.entries(incoming)) {
    next[name] = mergeServerEntry(onDisk?.[name], server);
  }
  return next;
}

/**
 * Report the fields an adapter cannot persist, so the caller can warn instead
 * of letting `acm mcp add --cwd /work` look like it worked.
 *
 * An adapter that declares nothing is treated as accepting nothing beyond the
 * essentials — the safe reading, because a wrong warning is recoverable and a
 * silent drop is not.
 */
export function unsupportedFields(
  server: McpServerConfig,
  supported: readonly string[] | undefined
): string[] {
  const allowed = new Set(supported ?? []);
  const problems: string[] = [];

  for (const field of ["cwd", "env", "headers"] as const) {
    if (server[field] !== undefined && !allowed.has(field)) problems.push(field);
  }
  // `disabled: false` is the implicit default everywhere, so only an explicit
  // `true` is worth reporting as unrepresentable.
  if (server.disabled === true && !allowed.has("disabled")) problems.push("disabled");

  return problems;
}
