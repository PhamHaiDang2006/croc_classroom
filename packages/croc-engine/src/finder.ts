/**
 * Find the croc executable in different environments
 * Dev: node_modules/.bin
 * Packaged app: resources/bin
 * Container: /usr/local/bin
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Platform, Architecture } from "./types";

/**
 * Get current platform
 */
export function getPlatform(): Platform {
  const platform = process.platform;
  if (platform === "win32" || platform === "darwin" || platform === "linux") {
    return platform;
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

/**
 * Get current architecture
 */
export function getArch(): Architecture {
  const arch = process.arch;
  if (arch === "x64") return "x64";
  if (arch === "arm64") return "arm64";
  if (arch === "ia32") return "ia32";
  throw new Error(`Unsupported architecture: ${arch}`);
}

/**
 * Get the filename for croc executable on the current platform
 */
export function getCrocFilename(): string {
  const platform = getPlatform();
  if (platform === "win32") return "croc.exe";
  return "croc";
}

/**
 * Find croc executable in common locations
 * Returns the absolute path if found, throws if not found
 */
export function findCrocExecutable(): string {
  const filename = getCrocFilename();
  const locations = getCrocSearchLocations();

  for (const location of locations) {
    if (fs.existsSync(location)) {
      // Verify it's executable
      try {
        fs.accessSync(location, fs.constants.X_OK);
        return location;
      } catch {
        // File exists but not executable, continue searching
      }
    }
  }

  throw new Error(
    `croc executable not found. Searched: ${locations.join(", ")}. ` +
      `Please run 'npm run download-croc' in @croc-classroom/croc-engine package.`
  );
}

/**
 * Get list of locations to search for croc, in priority order
 */
function getCrocSearchLocations(): string[] {
  const filename = getCrocFilename();
  const locations: string[] = [];

  // 1. In development: node_modules/.bin
  locations.push(path.join(getPackageRoot(), "node_modules", ".bin", filename));

  // 2. In development: bin directory (if downloaded)
  locations.push(path.join(getPackageRoot(), "bin", filename));

  // 3. If running from built app: resources/bin
  const appRoot = getAppResourcesPath();
  if (appRoot) {
    locations.push(path.join(appRoot, "bin", filename));
  }

  // 4. System PATH (might be installed globally)
  if (process.platform !== "win32") {
    locations.push("/usr/local/bin/croc");
    locations.push("/usr/bin/croc");
  }

  // 5. In container: /usr/local/bin
  locations.push("/usr/local/bin/" + filename);

  return locations;
}

/**
 * Get the root directory of the croc-engine package
 */
export function getPackageRoot(): string {
  // This file is at packages/croc-engine/src/finder.ts
  // So we go up 3 levels to get to packages/croc-engine
  return path.resolve(import.meta.url, "../../../");
}

/**
 * Get the app resources path if running in an Electron context
 * Returns undefined if not in an Electron context
 */
function getAppResourcesPath(): string | undefined {
  try {
    // If running in Electron main process
    // Note: This is a bit tricky in pure Node context, so we just check
    // if certain paths exist
    const electronAppPath = process.env.ELECTRON_APP_PATH;
    if (electronAppPath) {
      return path.join(electronAppPath, "resources");
    }
  } catch {
    // Not in Electron context
  }

  return undefined;
}

/**
 * Verify that croc is available and get its version
 * This will throw if croc is not available
 */
export function verifyCrocVersion(): string {
  const crocPath = findCrocExecutable();
  try {
    const output = execSync(`"${crocPath}" --version`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return output;
  } catch (error) {
    throw new Error(`Failed to verify croc version: ${error}`);
  }
}
