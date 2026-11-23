import { describe, it, expect } from "vitest";
import {
  parseProgressLine,
  parseDataSize,
  extractProgressLines,
  detectSuccess,
  extractErrorMessage,
} from "../progress-parser";

describe("progress-parser", () => {
  describe("parseDataSize", () => {
    it("should parse bytes", () => {
      expect(parseDataSize("512 B")).toBe(512);
    });

    it("should parse kilobytes", () => {
      expect(parseDataSize("1.5 KB")).toBe(1.5 * 1024);
    });

    it("should parse megabytes", () => {
      expect(parseDataSize("10 MB")).toBe(10 * 1024 * 1024);
    });

    it("should parse gigabytes", () => {
      expect(parseDataSize("2.5 GB")).toBe(2.5 * 1024 * 1024 * 1024);
    });

    it("should return 0 for invalid input", () => {
      expect(parseDataSize("invalid")).toBe(0);
    });
  });

  describe("parseProgressLine", () => {
    it("should parse a valid progress line", () => {
      const line = "Sending  32% |████████░░░░░░░░░░░░| (10 MB, 1.5 MB/s)";
      const progress = parseProgressLine(line);

      expect(progress).not.toBeNull();
      expect(progress?.percentage).toBe(32);
      expect(progress?.bytesPerSecond).toBeGreaterThan(0); // 1.5 MB/s
    });

    it("should handle receiving progress", () => {
      const line = "Receiving  45% |███████████░░░░░░░░| (25 MB, 2.1 MB/s)";
      const progress = parseProgressLine(line);

      expect(progress).not.toBeNull();
      expect(progress?.percentage).toBe(45);
    });

    it("should return null for non-progress lines", () => {
      expect(parseProgressLine("Some random text")).toBeNull();
      expect(parseProgressLine("")).toBeNull();
    });

    it("should handle ANSI color codes", () => {
      const line = "\x1b[32mSending  50% |██████████░░░░░░░░░░| (5 MB, 1 MB/s)\x1b[0m";
      const progress = parseProgressLine(line);

      expect(progress).not.toBeNull();
      expect(progress?.percentage).toBe(50);
    });
  });

  describe("extractProgressLines", () => {
    it("should split by carriage return", () => {
      const output = "Line 1\rLine 2\rLine 3";
      const lines = extractProgressLines(output);

      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it("should split by newline", () => {
      const output = "Line 1\nLine 2\nLine 3";
      const lines = extractProgressLines(output);

      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it("should handle mixed line endings", () => {
      const output = "Line 1\r\nLine 2\nLine 3\rLine 4";
      const lines = extractProgressLines(output);

      expect(lines.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("detectSuccess", () => {
    it("should detect success from 'received' message", () => {
      expect(detectSuccess("file received in 5 seconds")).toBe(true);
    });

    it("should detect success from 'sent' message", () => {
      expect(detectSuccess("files sent successfully")).toBe(true);
    });

    it("should detect success from 'sending' message", () => {
      expect(detectSuccess("sending 1 file")).toBe(true);
    });

    it("should return false for non-success output", () => {
      expect(detectSuccess("Error: timeout")).toBe(false);
      expect(detectSuccess("Failed to connect")).toBe(false);
    });
  });

  describe("extractErrorMessage", () => {
    it("should extract error message", () => {
      const output = "Line 1\nError: connection refused\nLine 3";
      const error = extractErrorMessage(output);

      expect(error).toContain("Error");
    });

    it("should find timeout message", () => {
      const output = "Starting transfer...\ntimeout waiting for receiver";
      const error = extractErrorMessage(output);

      expect(error).not.toBeNull();
    });

    it("should return null if no error", () => {
      const output = "Transfer successful\nfile received";
      const error = extractErrorMessage(output);

      expect(error).toBeNull();
    });
  });
});
