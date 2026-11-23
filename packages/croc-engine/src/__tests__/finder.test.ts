import { describe, it, expect } from "vitest";
import { getPlatform, getArch, getCrocFilename } from "../finder";

describe("finder", () => {
  describe("getPlatform", () => {
    it("should return valid platform", () => {
      const platform = getPlatform();
      expect(["win32", "darwin", "linux"]).toContain(platform);
    });
  });

  describe("getArch", () => {
    it("should return valid architecture", () => {
      const arch = getArch();
      expect(["x64", "arm64", "ia32"]).toContain(arch);
    });
  });

  describe("getCrocFilename", () => {
    it("should return .exe on Windows", () => {
      const original = process.platform;
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: false,
      });

      expect(getCrocFilename()).toBe("croc.exe");
    });

    it("should return croc on Unix", () => {
      const original = process.platform;
      Object.defineProperty(process, "platform", {
        value: "linux",
        writable: false,
      });

      expect(getCrocFilename()).toBe("croc");
    });
  });
});
