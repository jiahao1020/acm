/** MCP server configuration (stdio or remote) */
export interface McpServerConfig {
  /** "stdio" for local servers, "http"/"sse" for remote ones */
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

/** Contract every client adapter must implement */
export interface ClientAdapter {
  id: string;
  displayName: string;
  detect(): boolean;
  getConfigPath(): string | null;
  readConfig(): McpConfig;
  writeConfig(config: McpConfig): void;
  supportsRemote(): boolean;
}
