import * as fs from 'fs';
import * as path from 'path';

/**
 * Compare two semver version strings.
 * Returns: "up-to-date" | "update-available" | "ahead"
 */
export function compareVersions(
  current: string,
  latest: string
): "up-to-date" | "update-available" | "ahead" {
  if (current === latest) return "up-to-date";

  const parseSemver = (v: string) => {
    const cleaned = v.replace(/^v/, "");
    const parts = cleaned.split(".").map((p) => parseInt(p, 10) || 0);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
  };

  const c = parseSemver(current);
  const l = parseSemver(latest);

  if (l.major > c.major) return "update-available";
  if (l.major < c.major) return "ahead";
  if (l.minor > c.minor) return "update-available";
  if (l.minor < c.minor) return "ahead";
  if (l.patch > c.patch) return "update-available";
  if (l.patch < c.patch) return "ahead";

  return "up-to-date";
}

export interface PackageManagerInfo {
  manager: "npm" | "yarn" | "pnpm";
  command: string;
}

/**
 * Detect which package manager installed clawatch globally.
 * Uses dependency injection for testability.
 */
export function detectPackageManager(opts: {
  execSync: (cmd: string) => string;
  existsSync: (p: string) => boolean;
}): PackageManagerInfo | null {
  const { execSync, existsSync } = opts;

  // Check npm global
  try {
    const npmGlobalPrefix = execSync("npm prefix -g 2>/dev/null").trim();
    const npmGlobalModules = path.join(npmGlobalPrefix, "lib", "node_modules", "clawatch");
    if (existsSync(npmGlobalModules)) {
      return { manager: "npm", command: "npm update -g clawatch" };
    }
    // Windows-style (no /lib)
    const npmGlobalModulesAlt = path.join(npmGlobalPrefix, "node_modules", "clawatch");
    if (existsSync(npmGlobalModulesAlt)) {
      return { manager: "npm", command: "npm update -g clawatch" };
    }
  } catch {
    /* npm not available */
  }

  // Check yarn global
  try {
    const yarnGlobalDir = execSync("yarn global dir 2>/dev/null").trim();
    if (yarnGlobalDir && existsSync(path.join(yarnGlobalDir, "node_modules", "clawatch"))) {
      return { manager: "yarn", command: "yarn global upgrade clawatch" };
    }
  } catch {
    /* yarn not available */
  }

  // Check pnpm global
  try {
    const pnpmGlobalDir = execSync("pnpm root -g 2>/dev/null").trim();
    if (pnpmGlobalDir && existsSync(path.join(pnpmGlobalDir, "clawatch"))) {
      return { manager: "pnpm", command: "pnpm update -g clawatch" };
    }
  } catch {
    /* pnpm not available */
  }

  // Fallback: npm exists → install fresh
  try {
    execSync("npm --version 2>/dev/null");
    return { manager: "npm", command: "npm install -g clawatch@latest" };
  } catch {
    /* no npm */
  }

  return null;
}

/**
 * Determine the update action based on current state.
 */
export interface UpdateCheckResult {
  action: "up-to-date" | "update-available" | "check-only" | "no-registry" | "no-version";
  currentVersion: string;
  latestVersion?: string;
  packageManager?: PackageManagerInfo | null;
}

export function checkForUpdate(opts: {
  currentVersion: string;
  latestVersion: string | null;
  checkOnly: boolean;
}): UpdateCheckResult {
  if (!opts.latestVersion) {
    return {
      action: "no-version",
      currentVersion: opts.currentVersion,
    };
  }

  const comparison = compareVersions(opts.currentVersion, opts.latestVersion);

  if (comparison === "up-to-date" || comparison === "ahead") {
    return {
      action: "up-to-date",
      currentVersion: opts.currentVersion,
      latestVersion: opts.latestVersion,
    };
  }

  if (opts.checkOnly) {
    return {
      action: "check-only",
      currentVersion: opts.currentVersion,
      latestVersion: opts.latestVersion,
    };
  }

  return {
    action: "update-available",
    currentVersion: opts.currentVersion,
    latestVersion: opts.latestVersion,
  };
}
