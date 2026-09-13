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

/**
 * Hermes Agent's home directory.
 *
 * Unlike every other client acm supports, Hermes keeps its home under the
 * platform's *local* app-data directory (Windows: `%LOCALAPPDATA%\hermes`,
 * macOS: `~/Library/Application Support/hermes`, Linux: `~/.local/share/hermes`)
 * rather than a dotfolder in `$HOME`. `~/.hermes` also exists on macOS/Linux
 * but is not where `config.yaml` lives, so overriding it keeps every platform
 * pointed at the real config.
 */
export function hermesHome(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || path.join(homeDir(), "AppData", "Local"),
      "hermes"
    );
  }
  if (process.platform === "darwin") {
    return path.join(homeDir(), "Library", "Application Support", "hermes");
  }
  return path.join(homeDir(), ".local", "share", "hermes");
}

