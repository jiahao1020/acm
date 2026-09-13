import { ApiConfigAdapter } from "./api-adapter";
import { applyClientSelection } from "../utils/acm-config";
import { ClaudeCodeApiAdapter } from "./claude-code-api";
import { ZCodeApiAdapter } from "./zcode-api";
import { OpenCodeApiAdapter } from "./opencode-api";

export function getAllApiAdapters(): ApiConfigAdapter[] {
  return [
    new ClaudeCodeApiAdapter(),
    new ZCodeApiAdapter(),
    new OpenCodeApiAdapter(),
  ];
}

/** Every client with a writable API config (used by `acm init`). */
export function getDetectedApiAdapters(): ApiConfigAdapter[] {
  return getAllApiAdapters().filter((a) => a.detect());
}

/** Detected clients narrowed to the selection saved by `acm init`. */
export function getSelectedApiAdapters(): ApiConfigAdapter[] {
  return applyClientSelection(getDetectedApiAdapters());
}
