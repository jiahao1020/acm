/**
 * Interface for reading/writing a client's API gateway config.
 *
 * Unlike McpServerConfig (which lives under mcpServers), API config is
 * client-specific: some use a flat api section, others use named providers.
 */
export interface ApiConfigAdapter {
  id: string;
  displayName: string;
  detect(): boolean;
  getConfigPath(): string | null;

  /** Return the current gateway URL + key if present, else null.
   *  For provider-based clients, providerName hints which entry to read. */
  readGateway(providerName?: string): { baseUrl?: string; apiKey?: string } | null;

  /**
   * Write the gateway into the client's config file.
   * Preserves all non-API fields (mcp, permissions, etc.).
   */
  writeGateway(cfg: {
    baseUrl: string;
    apiKey: string;
    providerName: string;
  }): void;
}
