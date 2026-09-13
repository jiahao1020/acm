import { readAcmConfig, updateAcmConfig, GatewayConfig } from "./acm-config";

export type { GatewayConfig };

/** Mask an API key for display: show only last 4 characters. */
export function maskKey(key: string): string {
  if (key.length <= 4) return "****";
  return "…" + key.slice(-4);
}

/** Read the stored gateway config, or null if none. */
export function getGateway(): GatewayConfig | null {
  const gw = readAcmConfig().gateway;
  if (!gw || typeof gw.url !== "string" || typeof gw.key !== "string") return null;
  return {
    url: gw.url,
    key: gw.key,
    providerName:
      (typeof gw.providerName === "string" ? gw.providerName : "") || "omniroute",
  };
}

/** Store or overwrite the gateway config, leaving other settings intact. */
export function setGateway(cfg: GatewayConfig): void {
  updateAcmConfig({ gateway: cfg });
}

/** Remove the gateway config from storage. Returns true if it existed. */
export function clearGateway(): boolean {
  if (!getGateway()) return false;
  updateAcmConfig({ gateway: null });
  return true;
}
