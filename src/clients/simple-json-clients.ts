import * as path from "path";
import { homeDir } from "../utils/paths";
import { StandardJsonAdapter } from "./base-json-adapter";

/**
 * Clients that store MCP servers as a plain `mcpServers` object in one or more
 * JSON files. They differ only by id, label and paths, so they are declared as
 * data rather than as one near-identical class each — the same pattern the
 * skills module uses for its client list.
 *
 * `configFiles` are relative to the home directory; every file that exists is
 * kept in sync (see StandardJsonAdapter).
 */
export interface SimpleJsonClientSpec {
  id: string;
  displayName: string;
  /** Candidate config files, most-preferred first. */
  configFiles: string[];
  /** Directory whose existence means the client is installed. */
  installDir: string;
}

export const SIMPLE_JSON_CLIENTS: SimpleJsonClientSpec[] = [
  { id: "qwen-code", displayName: "QwenCode", configFiles: [".qwen/settings.json"], installDir: ".qwen" },
  { id: "trae", displayName: "Trae", configFiles: [".trae/settings.json"], installDir: ".trae" },
  { id: "roo", displayName: "Roo", configFiles: [".roo/settings.json"], installDir: ".roo" },
  { id: "kiro", displayName: "Kiro", configFiles: [".kiro/settings.json"], installDir: ".kiro" },
  {
    id: "codebuddy",
    displayName: "CodeBuddy",
    // settings.json holds unrelated keys (enabledPlugins) and may carry `//`
    // comments; both files are candidates so an existing mcpServers block in
    // either location stays in sync.
    configFiles: [".codebuddy/mcp.json", ".codebuddy/settings.json"],
    installDir: ".codebuddy",
  },
];

/** Concrete adapter built from a spec. */
export class SpecJsonAdapter extends StandardJsonAdapter {
  readonly id: string;
  readonly displayName: string;
  private readonly spec: SimpleJsonClientSpec;

  constructor(spec: SimpleJsonClientSpec) {
    super();
    this.spec = spec;
    this.id = spec.id;
    this.displayName = spec.displayName;
  }

  protected configPaths(): string[] {
    return this.spec.configFiles.map((f) => path.join(homeDir(), ...f.split("/")));
  }

  protected installDir(): string {
    return path.join(homeDir(), ...this.spec.installDir.split("/"));
  }
}
