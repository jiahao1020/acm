/**
 * Small shared helpers for the command layer.
 *
 * These exist because every command module needs them and three hand-rolled
 * copies of the same fifteen lines is exactly how they drift apart.
 */
import * as prompts from "@clack/prompts";
import { selectClientIds, unknownClientMessage, emptyClientMessage } from "./targets";

/** The message of an unknown thrown value, for user-facing error lines. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Resolve a `--client` option against the clients available on this machine.
 *
 * Returns null (after reporting) when an id matches nothing or the value holds
 * no ids at all, so callers can bail out instead of acting on a silently
 * narrowed (or silently widened) list. The caller supplies the adapter list so
 * this can serve the MCP, skills and API-gateway registries alike.
 */
export function resolveTargets<T extends { id: string }>(
  available: T[],
  clientOpt?: string
): T[] | null {
  const { targets, unknown, empty } = selectClientIds(available, clientOpt);
  if (empty) {
    prompts.log.error(emptyClientMessage(available));
    process.exitCode = 1;
    return null;
  }
  if (unknown.length > 0) {
    prompts.log.error(unknownClientMessage(unknown, available));
    process.exitCode = 1;
    return null;
  }
  return targets;
}
