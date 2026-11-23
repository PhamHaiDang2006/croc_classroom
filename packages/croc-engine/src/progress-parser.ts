/**
 * Parse progress output from croc CLI
 * croc prints progress lines with \r (carriage return) like:
 * "Sending  32% |████████░░░░░░░░░░░░| (10 MB, 1.5 MB/s)"
 */

import { TransferProgress } from "./types";

/**
 * Parse a single progress line from croc output
 * Returns null if the line is not a progress line
 *
 * Example progress lines:
 * - "Sending  32% |████████░░░░░░░░░░░░| (10 MB, 1.5 MB/s)"
 * - "Receiving  45% |███████████░░░░░░░░| (25 MB, 2.1 MB/s)"
 */
export function parseProgressLine(line: string): TransferProgress | null {
  // Clean up the line (remove ANSI codes, trim)
  const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, "").trim();

  if (!cleanLine) {
    return null;
  }

  // Pattern: "Sending|Receiving  XX% |████░░| (Y MB, Z MB/s)"
  // Try to extract percentage
  const percentMatch = cleanLine.match(/(\d+)%/);
  if (!percentMatch) {
    return null;
  }

  const percentage = parseInt(percentMatch[1], 10);

  // Extract bytes and speed from the end: "(Y MB, Z MB/s)" or "(Y B, Z B/s)" etc.
  const statsMatch = cleanLine.match(
    /\(([0-9.]+\s+(?:B|KB|MB|GB)),\s*([0-9.]+\s+(?:B|KB|MB|GB)\/s)\)/
  );

  let bytesPerSecond = 0;
  if (statsMatch) {
    bytesPerSecond = parseDataSize(statsMatch[2]);
  }

  return {
    bytes: 0, // We don't have exact byte count from croc output
    totalBytes: undefined, // Unknown until transfer completes
    files: 0, // croc doesn't report file count
    totalFiles: undefined,
    bytesPerSecond,
    percentage,
    raw: cleanLine,
  };
}

/**
 * Parse a data size string like "1.5 MB" or "512 B" or "2.1 KB"
 * Returns size in bytes
 */
export function parseDataSize(sizeStr: string): number {
  const match = sizeStr.trim().match(/^([0-9.]+)\s*([A-Z]+)$/);
  if (!match) {
    return 0;
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return value * (units[unit] || 1);
}

/**
 * Extract lines from output that may contain multiple progress updates
 * separated by \r (carriage return) instead of \n (newline)
 */
export function extractProgressLines(output: string): string[] {
  // Split by both \r and \n to get all lines
  const lines = output.split(/[\r\n]+/).filter((line) => line.trim());
  return lines;
}

/**
 * Parse complete progress from raw croc output
 * Returns the last valid progress line found
 */
export function parseProgress(output: string): TransferProgress | null {
  const lines = extractProgressLines(output);

  // Work backwards to find the most recent progress line
  for (let i = lines.length - 1; i >= 0; i--) {
    const progress = parseProgressLine(lines[i]);
    if (progress) {
      return progress;
    }
  }

  return null;
}

/**
 * Check if output contains success indication from croc
 * croc prints something like: "file received in X seconds" or "sending 1 file"
 */
export function detectSuccess(output: string): boolean {
  const lowerOutput = output.toLowerCase();
  return (
    lowerOutput.includes("received") ||
    lowerOutput.includes("sending") ||
    lowerOutput.includes("sent") ||
    lowerOutput.includes("done")
  );
}

/**
 * Extract error message from croc output
 */
export function extractErrorMessage(output: string): string | null {
  const lines = output.split("\n");

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Look for common error patterns
    if (
      lowerLine.includes("error") ||
      lowerLine.includes("failed") ||
      lowerLine.includes("refused") ||
      lowerLine.includes("timeout") ||
      lowerLine.includes("invalid") ||
      lowerLine.includes("wrong") ||
      lowerLine.includes("cannot") ||
      lowerLine.includes("denied")
    ) {
      return line.trim();
    }
  }

  return null;
}
