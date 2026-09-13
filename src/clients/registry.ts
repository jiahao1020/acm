import { ClientAdapter } from "../types";
import { applyClientSelection } from "../utils/acm-config";
import { ClaudeDesktopAdapter } from "./claude-desktop";
import { ClaudeCodeAdapter } from "./claude-code";
import { CursorAdapter } from "./cursor";
import { ClineAdapter } from "./cline";
import { WindsurfAdapter } from "./windsurf";
import { WorkbuddyAdapter } from "./workbuddy";
import { CodexAdapter } from "./codex";
import { HermesAdapter } from "./hermes";
import { ZCodeAdapter } from "./zcode";
import { OpenCodeAdapter } from "./open-code";
import { SIMPLE_JSON_CLIENTS, SpecJsonAdapter } from "./simple-json-clients";

export function getAllAdapters(): ClientAdapter[] {
  return [
    new ClaudeDesktopAdapter(),
    new ClaudeCodeAdapter(),
    new CursorAdapter(),
    new ClineAdapter(),
    new WindsurfAdapter(),
    new WorkbuddyAdapter(),
    new CodexAdapter(),
    new HermesAdapter(),
    new ZCodeAdapter(),
    new OpenCodeAdapter(),
    ...SIMPLE_JSON_CLIENTS.map((spec) => new SpecJsonAdapter(spec)),
  ];
}

/** Every client installed on this machine (used by `acm init`). */
export function getDetectedAdapters(): ClientAdapter[] {
  return getAllAdapters().filter((a) => a.detect());
}

/** Detected clients narrowed to the selection saved by `acm init`. */
export function getSelectedAdapters(): ClientAdapter[] {
  return applyClientSelection(getDetectedAdapters());
}
