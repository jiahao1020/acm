/** MCP server configuration (stdio or remote) */
export interface McpServerConfig {
  /**
   * Transport discriminator, **derived** rather than user-supplied: an entry
   * with a `url` is remote, otherwise it is stdio. Adapters that store a
   * transport field (OpenCode's `type: "local" | "remote"`) write it
   * themselves; the others ignore it.
   *
   * It is deliberately not part of `OPTIONAL_CAPABILITIES`: reporting it as an
   * "unsupported field" would warn about something the user never asked for.
   */
  type?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
  /** Preserve any client-specific fields we do not model explicitly */
  [key: string]: unknown;
}

/** Top-level MCP configuration as stored by clients */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Fields of `McpServerConfig` that an adapter can actually persist.
 *
 * A client's schema is narrower than the common model: most JSON clients have
 * no place for `cwd`, and Claude Desktop cannot express a remote server at all.
 * Without a declaration those values are dropped on write with no trace, so
 * `acm mcp add ... --cwd /work` looks like it worked and silently did nothing.
 *
 * `command`/`args`/`url` are always required, since a server without either a
 * command or a URL is meaningless; `type` is derived and never user-facing.
 */
export const OPTIONAL_CAPABILITIES = [
  "cwd",
  "env",
  "headers",
  "disabled",
] as const;

export type OptionalCapability = (typeof OPTIONAL_CAPABILITIES)[number];

/** Contract every client adapter must implement */
export interface ClientAdapter {
  id: string;
  displayName: string;
  detect(): boolean;
  getConfigPath(): string | null;
  readConfig(): McpConfig;
  writeConfig(config: McpConfig): void;
  supportsRemote(): boolean;
  /**
   * Which optional fields this client can persist. Fields outside this set are
   * reported to the user instead of being dropped in silence.
   *
   * Optional so a new adapter still compiles; an adapter that omits it is
   * assumed to accept nothing beyond command/args/url, which is the safe
   * reading — a false "unsupported" warning beats a silent data loss.
   */
  capabilities?(): readonly OptionalCapability[];
}
