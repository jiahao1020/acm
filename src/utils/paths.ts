import * as path from "path";
import * as os from "os";

export function homeDir(): string {
  return os.homedir();
}

export function appDataDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(homeDir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(homeDir(), "Library", "Application Support");
  }
  return path.join(homeDir(), ".config");
}

export function acmConfigDir(): string {
  return path.join(homeDir(), ".acm");
}

export function acmConfigPath(): string {
  return path.join(acmConfigDir(), "config.json");
}
