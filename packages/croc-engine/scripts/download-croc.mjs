#!/usr/bin/env node

/**
 * Download croc 10.7.0 binaries for all supported platforms
 * This script:
 * 1. Checks the official croc release page
 * 2. Downloads binaries for: Windows x64, macOS x64, macOS arm64, Linux x64
 * 3. Verifies checksums
 * 4. Stores them in the bin/ directory
 * 5. Makes them executable (on Unix)
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const binDir = path.join(packageRoot, "bin");

const CROC_VERSION = "10.7.0";
const GITHUB_RELEASE_URL = `https://api.github.com/repos/schollz/croc/releases/tags/v${CROC_VERSION}`;

/**
 * Configuration for each platform
 */
const PLATFORMS = {
  "win32-x64": {
    filename: "croc-v10.7.0-Windows-x64.exe",
    execName: "croc.exe",
    platform: "win32",
    arch: "x64",
  },
  "darwin-x64": {
    filename: "croc-v10.7.0-macOS-x64",
    execName: "croc",
    platform: "darwin",
    arch: "x64",
  },
  "darwin-arm64": {
    filename: "croc-v10.7.0-macOS-arm64",
    execName: "croc",
    platform: "darwin",
    arch: "arm64",
  },
  "linux-x64": {
    filename: "croc-v10.7.0-Linux-x64",
    execName: "croc",
    platform: "linux",
    arch: "x64",
  },
};

/**
 * Fetch the release data from GitHub
 */
async function fetchReleaseData() {
  return new Promise((resolve, reject) => {
    const req = https.get(GITHUB_RELEASE_URL, { headers: { "User-Agent": "croc-engine" } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${res.statusCode}`));
        return;
      }

      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
  });
}

/**
 * Download a file from a URL
 */
async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers["content-length"] || "0", 10);
      let downloadedSize = 0;

      response.on("data", (chunk) => {
        downloadedSize += chunk.length;
        const percent = Math.round((downloadedSize / totalSize) * 100);
        process.stdout.write(`\rDownloading... ${percent}%`);
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        console.log(); // New line after progress
        resolve();
      });

      file.on("error", (err) => {
        fs.unlink(outputPath, () => {}); // Delete partial file
        reject(err);
      });
    }).on("error", reject);
  });
}

/**
 * Verify file checksum using SHA256
 */
async function verifyChecksum(filePath, expectedHash) {
  const crypto = await import("crypto");
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => {
      const actualHash = hash.digest("hex");
      resolve(actualHash.toLowerCase() === expectedHash.toLowerCase());
    });
    stream.on("error", reject);
  });
}

/**
 * Make file executable on Unix systems
 */
async function makeExecutable(filePath) {
  if (process.platform === "win32") {
    return; // Windows handles executable bit differently
  }

  try {
    fs.chmodSync(filePath, 0o755);
  } catch (error) {
    console.warn(`Warning: Could not make ${filePath} executable:`, error.message);
  }
}

/**
 * Main download logic
 */
async function main() {
  try {
    console.log("🔍 Fetching croc release information from GitHub...");
    const releaseData = await fetchReleaseData();

    if (!releaseData.assets) {
      throw new Error("No assets found in release");
    }

    // Create bin directory
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
      console.log(`✅ Created bin directory: ${binDir}`);
    }

    // Build a map of filename -> (download_url, checksum)
    const checksumMap = {};
    const assetMap = {};

    for (const asset of releaseData.assets) {
      assetMap[asset.name] = asset.browser_download_url;

      // Look for SHA256 file
      if (asset.name.includes("SHA256")) {
        // Download the checksum file
        const checksumPath = path.join(binDir, asset.name);
        console.log(`⬇️  Downloading checksums from ${asset.name}...`);
        await downloadFile(asset.browser_download_url, checksumPath);

        // Parse the checksum file
        const checksumContent = fs.readFileSync(checksumPath, "utf-8");
        for (const line of checksumContent.split("\n")) {
          const match = line.match(/^([a-f0-9]+)\s+(.+)$/i);
          if (match) {
            checksumMap[match[2]] = match[1];
          }
        }

        fs.unlinkSync(checksumPath); // Remove temporary checksum file
      }
    }

    // Download each platform
    for (const [key, config] of Object.entries(PLATFORMS)) {
      if (!assetMap[config.filename]) {
        console.warn(`⚠️  Binary not found for ${key}: ${config.filename}`);
        continue;
      }

      const downloadUrl = assetMap[config.filename];
      const outputPath = path.join(binDir, config.execName);

      console.log(`\n⬇️  Downloading croc for ${key}...`);
      await downloadFile(downloadUrl, outputPath);

      // Verify checksum if available
      if (checksumMap[config.filename]) {
        console.log(`🔐 Verifying checksum for ${config.execName}...`);
        const isValid = await verifyChecksum(outputPath, checksumMap[config.filename]);
        if (!isValid) {
          throw new Error(`Checksum verification failed for ${config.filename}`);
        }
        console.log(`✅ Checksum verified for ${config.execName}`);
      } else {
        console.warn(`⚠️  No checksum found for ${config.filename}`);
      }

      // Make executable
      await makeExecutable(outputPath);
      console.log(`✅ Downloaded and prepared: ${config.execName}`);
    }

    console.log(`\n✨ Successfully downloaded croc v${CROC_VERSION} to ${binDir}`);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

// Run the script
main();
