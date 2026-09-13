import * as prompts from "@clack/prompts";
import { getDetectedAdapters } from "../clients/registry";
import { updateAcmConfig, getSelectedClientIds } from "../utils/acm-config";

export async function initCommand(): Promise<void> {
  prompts.intro("acm — Agent Config Manager");

  const detected = getDetectedAdapters();

  if (detected.length === 0) {
    prompts.log.warn("No AI agent clients detected on this system.");
    prompts.log.info(
      "Supported: Claude Desktop, Claude Code, Cursor, Cline, Windsurf, Workbuddy, Codex, ZCode, OpenCode, QwenCode, Trae, Roo, Kiro, CodeBuddy"
    );
    prompts.outro("Install a client first, then run acm init again.");
    return;
  }

  prompts.log.success(`Detected ${detected.length} client(s):`);
  for (const a of detected) {
    const cfg = a.getConfigPath();
    prompts.log.info(`  ${a.displayName}  ${cfg ?? "(no config yet)"}`);
  }

  const previousIds = getSelectedClientIds();

  const selected = await prompts.multiselect({
    message: "Select clients to manage with acm:",
    options: detected.map((a) => ({ value: a.id, label: a.displayName })),
    initialValues: previousIds.filter((id) => detected.some((a) => a.id === id)),
    required: true,
  });

  if (prompts.isCancel(selected)) {
    prompts.cancel("Cancelled.");
    return;
  }

  // isCancel already handled the cancel path, so narrow to the id list
  // explicitly instead of relying on the compiler to drop the cancel symbol.
  const selectedIds = Array.isArray(selected) ? selected : [];
  if (selectedIds.length === 0) {
    prompts.log.warn("No clients selected — nothing saved.");
    return;
  }

  // Merge: other sections of ~/.acm/config.json (e.g. the gateway saved by
  // `acm key set-gateway`) must survive re-running init.
  updateAcmConfig({ clients: selectedIds });
  prompts.outro(`Saved. Managing ${selectedIds.length} client(s).`);
}
