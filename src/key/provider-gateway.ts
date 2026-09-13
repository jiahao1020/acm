/**
 * Shared reading logic for provider-based API configs.
 *
 * ZCode and OpenCode both keep their gateway under `provider.<name>.options`,
 * with `baseURL`/`apiKey` keys. The only real difference is which providers
 * count as usable — ZCode ignores a provider whose `enabled` flag is false,
 * OpenCode has no such flag. That difference is a predicate, not a reason for
 * two near-identical twenty-eight-line functions.
 */

/** A provider entry is only usable if it is a plain object. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** Pull `baseURL`/`apiKey` out of one provider entry. */
function readOptions(entry: unknown): { baseUrl?: string; apiKey?: string } | null {
  const provider = asRecord(entry);
  const options = provider ? asRecord(provider.options) : undefined;
  if (!options) return null;
  const baseUrl = typeof options.baseURL === "string" ? options.baseURL : undefined;
  const apiKey = typeof options.apiKey === "string" ? options.apiKey : undefined;
  return baseUrl ? { baseUrl, apiKey } : null;
}

/**
 * Find the gateway in a `provider` map.
 *
 * The named provider is preferred; otherwise the first entry accepted by
 * `isUsable` wins, so a stale custom provider cannot mask a working one.
 */
export function readProviderGateway(
  raw: Record<string, unknown> | null,
  providerName: string | undefined,
  isUsable: (entry: Record<string, unknown>) => boolean
): { baseUrl?: string; apiKey?: string } | null {
  const providers = asRecord(raw?.provider);
  if (!providers) return null;

  if (providerName) {
    const named = readOptions(providers[providerName]);
    if (named) return named;
  }

  for (const entry of Object.values(providers)) {
    const record = asRecord(entry);
    if (!record || !isUsable(record)) continue;
    const found = readOptions(record);
    if (found) return found;
  }
  return null;
}

/** OpenCode has no `enabled` flag: any provider with a baseURL counts. */
export function alwaysUsable(): boolean {
  return true;
}

/** ZCode marks a provider disabled with `enabled: false`. */
export function enabledOnly(entry: Record<string, unknown>): boolean {
  return entry.enabled !== false;
}
