import { SkillAdapter } from "./skill-adapter";
import { applyClientSelection } from "../utils/acm-config";
import { SKILL_CLIENTS, SpecSkillAdapter, HermesSkillAdapter } from "./adapters";

export function getAllSkillAdapters(): SkillAdapter[] {
  return [
    ...SKILL_CLIENTS.map((spec) => new SpecSkillAdapter(spec)),
    new HermesSkillAdapter(),
  ];
}

/** Every client with a skills directory (used by `acm init`). */
export function getDetectedSkillAdapters(): SkillAdapter[] {
  return getAllSkillAdapters().filter((a) => a.detect());
}

/** Detected clients narrowed to the selection saved by `acm init`. */
export function getSelectedSkillAdapters(): SkillAdapter[] {
  return applyClientSelection(getDetectedSkillAdapters());
}
