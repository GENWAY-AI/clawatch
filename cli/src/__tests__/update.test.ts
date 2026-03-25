import { describe, it, expect, vi } from "vitest";
import { compareVersions, detectPackageManager, checkForUpdate } from "../update";

// ─── compareVersions ───

describe("compareVersions", () => {
  it("returns up-to-date for identical versions", () => {
    expect(compareVersions("1.2.2", "1.2.2")).toBe("up-to-date");
  });

  it("detects patch update available", () => {
    expect(compareVersions("1.2.2", "1.2.3")).toBe("update-available");
  });

  it("detects minor update available", () => {
    expect(compareVersions("1.2.2", "1.3.0")).toBe("update-available");
  });

  it("detects major update available", () => {
    expect(compareVersions("1.2.2", "2.0.0")).toBe("update-available");
  });

  it("detects current is ahead (patch)", () => {
    expect(compareVersions("1.2.3", "1.2.2")).toBe("ahead");
  });

  it("detects current is ahead (minor)", () => {
    expect(compareVersions("1.3.0", "1.2.9")).toBe("ahead");
  });

  it("detects current is ahead (major)", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe("ahead");
  });

  it("handles v-prefix on current version", () => {
    expect(compareVersions("v1.2.2", "1.2.3")).toBe("update-available");
  });

  it("handles v-prefix on latest version", () => {
    expect(compareVersions("1.2.2", "v1.2.3")).toBe("update-available");
  });

  it("handles v-prefix on both versions", () => {
    expect(compareVersions("v1.2.2", "v1.2.2")).toBe("up-to-date");
  });

  it("handles 0.x versions", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBe("update-available");
    expect(compareVersions("0.0.1", "0.0.2")).toBe("update-available");
  });

  it("handles single-segment versions gracefully", () => {
    expect(compareVersions("1", "2")).toBe("update-available");
    expect(compareVersions("2", "1")).toBe("ahead");
  });

  it("handles two-segment versions", () => {
    expect(compareVersions("1.2", "1.3")).toBe("update-available");
  });

  it("handles non-numeric segments as 0", () => {
    expect(compareVersions("1.beta.0", "1.0.1")).toBe("update-available");
  });
});

// ─── detectPackageManager ───

describe("detectPackageManager", () => {
  it("detects npm when global module exists in lib/node_modules", () => {
    const result = detectPackageManager({
      execSync: (cmd) => {
        if (cmd.includes("npm prefix -g")) return "/usr/local";
        throw new Error("unexpected");
      },
      existsSync: (p) => p === "/usr/local/lib/node_modules/clawatch",
    });
    expect(result).toEqual({ manager: "npm", command: "npm update -g clawatch" });
  });

  it("detects npm on Windows-style path (no /lib)", () => {
    const result = detectPackageManager({
      execSync: (cmd) => {
        if (cmd.includes("npm prefix -g")) return "C:\\Users\\me\\AppData\\Roaming\\npm";
        throw new Error("unexpected");
      },
      existsSync: (p) => {
        // Windows path join uses backslash
        return p.includes("node_modules") && p.includes("clawatch") && !p.includes("lib");
      },
    });
    expect(result).toEqual({ manager: "npm", command: "npm update -g clawatch" });
  });

  it("detects yarn when yarn global dir has clawatch", () => {
    const result = detectPackageManager({
      execSync: (cmd) => {
        if (cmd.includes("npm prefix -g")) return "/usr/local";
        if (cmd.includes("yarn global dir")) return "/home/user/.config/yarn/global";
        throw new Error("unexpected");
      },
      existsSync: (p) => {
        if (p.includes("yarn") && p.includes("node_modules/clawatch")) return true;
        return false;
      },
    });
    expect(result).toEqual({ manager: "yarn", command: "yarn global upgrade clawatch" });
  });

  it("detects pnpm when pnpm root has clawatch", () => {
    const result = detectPackageManager({
      execSync: (cmd) => {
        if (cmd.includes("npm prefix -g")) return "/usr/local";
        if (cmd.includes("yarn global dir")) throw new Error("not found");
        if (cmd.includes("pnpm root -g")) return "/usr/local/lib/node_modules";
        throw new Error("unexpected");
      },
      existsSync: (p) => {
        if (p === "/usr/local/lib/node_modules/clawatch") return true;
        return false;
      },
    });
    // npm check passes first since path exists — but it's under /lib/node_modules
    // Need to ensure npm doesn't match first for pnpm test
    const pnpmResult = detectPackageManager({
      execSync: (cmd) => {
        if (cmd.includes("npm prefix -g")) return "/usr/local";
        if (cmd.includes("yarn global dir")) throw new Error("not found");
        if (cmd.includes("pnpm root -g")) return "/home/user/.pnpm-global";
        throw new Error("unexpected");
      },
      existsSync: (p) => {
        if (p === "/home/user/.pnpm-global/clawatch") return true;
        return false;
      },
    });
    expect(pnpmResult).toEqual({ manager: "pnpm", command: "pnpm update -g clawatch" });
  });

  it("falls back to npm install when npm exists but no global module found", () => {
    const result = detectPackageManager({
      execSync: (cmd) => {
        if (cmd.includes("npm prefix -g")) return "/usr/local";
        if (cmd.includes("yarn global dir")) throw new Error("not found");
        if (cmd.includes("pnpm root -g")) throw new Error("not found");
        if (cmd.includes("npm --version")) return "10.8.0";
        throw new Error("unexpected");
      },
      existsSync: () => false,
    });
    expect(result).toEqual({ manager: "npm", command: "npm install -g clawatch@latest" });
  });

  it("returns null when no package manager is available", () => {
    const result = detectPackageManager({
      execSync: () => {
        throw new Error("not found");
      },
      existsSync: () => false,
    });
    expect(result).toBeNull();
  });

  it("prioritizes npm over yarn and pnpm", () => {
    // If npm global module exists, should pick npm even if yarn/pnpm also have it
    const result = detectPackageManager({
      execSync: (cmd) => {
        if (cmd.includes("npm prefix -g")) return "/usr/local";
        if (cmd.includes("yarn global dir")) return "/home/user/.yarn";
        if (cmd.includes("pnpm root -g")) return "/home/user/.pnpm";
        return "";
      },
      existsSync: () => true, // everything exists
    });
    expect(result?.manager).toBe("npm");
  });

  it("handles empty npm prefix gracefully", () => {
    const result = detectPackageManager({
      execSync: (cmd) => {
        if (cmd.includes("npm prefix -g")) return "";
        if (cmd.includes("yarn global dir")) throw new Error("no");
        if (cmd.includes("pnpm root -g")) throw new Error("no");
        if (cmd.includes("npm --version")) return "10.0.0";
        throw new Error("no");
      },
      existsSync: () => false,
    });
    // Should fall through to npm fallback
    expect(result).toEqual({ manager: "npm", command: "npm install -g clawatch@latest" });
  });
});

// ─── checkForUpdate ───

describe("checkForUpdate", () => {
  it("returns up-to-date when versions match", () => {
    const result = checkForUpdate({
      currentVersion: "1.2.2",
      latestVersion: "1.2.2",
      checkOnly: false,
    });
    expect(result.action).toBe("up-to-date");
  });

  it("returns up-to-date when current is ahead", () => {
    const result = checkForUpdate({
      currentVersion: "2.0.0",
      latestVersion: "1.9.9",
      checkOnly: false,
    });
    expect(result.action).toBe("up-to-date");
  });

  it("returns check-only when update available but --check flag set", () => {
    const result = checkForUpdate({
      currentVersion: "1.2.2",
      latestVersion: "1.3.0",
      checkOnly: true,
    });
    expect(result.action).toBe("check-only");
    expect(result.latestVersion).toBe("1.3.0");
  });

  it("returns update-available when update exists and no --check flag", () => {
    const result = checkForUpdate({
      currentVersion: "1.2.2",
      latestVersion: "1.3.0",
      checkOnly: false,
    });
    expect(result.action).toBe("update-available");
    expect(result.currentVersion).toBe("1.2.2");
    expect(result.latestVersion).toBe("1.3.0");
  });

  it("returns no-version when latest version is null", () => {
    const result = checkForUpdate({
      currentVersion: "1.2.2",
      latestVersion: null,
      checkOnly: false,
    });
    expect(result.action).toBe("no-version");
  });

  it("returns no-version when latest version is empty string treated as null", () => {
    const result = checkForUpdate({
      currentVersion: "1.2.2",
      latestVersion: null,
      checkOnly: true,
    });
    expect(result.action).toBe("no-version");
  });

  it("preserves version strings in result", () => {
    const result = checkForUpdate({
      currentVersion: "1.0.0",
      latestVersion: "2.0.0",
      checkOnly: false,
    });
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("2.0.0");
  });
});
