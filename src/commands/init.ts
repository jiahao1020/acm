import * as prompts from "@clack/prompts";
import { getAllAdapters, getDetectedAdapters } from "../clients/registry";
import { updateAcmConfig, getSelectedClientIds } from "../utils/acm-config";
import { supportedList } from "../utils/ui";

export async function initCommand(): Promise<void> {
  prompts.intro("acm — Agent Config Manager");

  const detected = getDetectedAdapters();

  if (detected.length === 0) {
    prompts.log.warn("No AI agent clients detected on this system.");
    // Built from the registry: a hand-written list silently went stale every
    // time an adapter was added.
    prompts.log.info(supportedList(getAllAdapters().map((a) => a.displayName)));
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
