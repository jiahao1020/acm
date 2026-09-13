/**
 * A client config file that exists but cannot be parsed.
 *
 * Adapters merge their own keys into whatever they read, so a parse failure
 * must never degrade to "empty config": that would silently drop every
 * unrelated setting the file holds on the next write.
 */
export class ConfigParseError extends Error {
  constructor(
    readonly filePath: string,
    cause: unknown
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Cannot parse ${filePath}: ${detail}`);
    this.name = "ConfigParseError";
  }
}
