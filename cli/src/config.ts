import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ClaWatchConfig {
  openclawDirs: string[];
  backendUrl: string;
  apiKey: string;
  scanIntervalMs: number;
  /** @deprecated Use openclawDirs instead. Kept for backward compat when loading old configs. */
  openclawDir?: string;
}

const CLAWATCH_DIR = path.join(os.homedir(), '.clawatch');
const CONFIG_PATH = path.join(CLAWATCH_DIR, 'config.json');
const PID_PATH = path.join(CLAWATCH_DIR, 'clawatch.pid');
const PIDS_PATH = path.join(CLAWATCH_DIR, 'clawatch.pids.json');
const LOG_PATH = path.join(CLAWATCH_DIR, 'daemon.log');
const OFFSETS_PATH = path.join(CLAWATCH_DIR, 'offsets.json');

export const paths = {
  dir: CLAWATCH_DIR,
  config: CONFIG_PATH,
  pid: PID_PATH,
  pids: PIDS_PATH,
  log: LOG_PATH,
  offsets: OFFSETS_PATH,
};

export interface ManagedPids {
  daemon?: number;
  backend?: number;
  frontend?: number;
}

export function savePids(pids: ManagedPids): void {
  ensureDir();
  fs.writeFileSync(PIDS_PATH, JSON.stringify(pids, null, 2) + '\n');
}

export function loadPids(): ManagedPids {
  if (!fs.existsSync(PIDS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(PIDS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

export function clearPids(): void {
  if (fs.existsSync(PIDS_PATH)) fs.unlinkSync(PIDS_PATH);
  if (fs.existsSync(PID_PATH)) fs.unlinkSync(PID_PATH);
}

/**
 * Auto-discover all ~/.openclaw and ~/.openclaw-* directories that have an agents/ subdirectory.
 */
export function discoverOpenclawDirs(): string[] {
  const home = os.homedir();
  const dirs: string[] = [];
  try {
    const entries = fs.readdirSync(home, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.openclaw' || entry.name.startsWith('.openclaw-')) {
        const dir = path.join(home, entry.name);
        if (fs.existsSync(path.join(dir, 'agents'))) {
          dirs.push(dir);
        }
      }
    }
  } catch {
    // Fallback
  }
  if (dirs.length === 0) {
    // Always include the default dir even if it doesn't exist yet
    dirs.push(path.join(home, '.openclaw'));
  }
  return dirs.sort();
}

const DEFAULT_CONFIG: ClaWatchConfig = {
  openclawDirs: discoverOpenclawDirs(),
  backendUrl: 'http://localhost:3001',
  apiKey: '',
  scanIntervalMs: 60000,
};

export function ensureDir(): void {
  if (!fs.existsSync(CLAWATCH_DIR)) {
    fs.mkdirSync(CLAWATCH_DIR, { recursive: true });
  }
}

export function loadConfig(): ClaWatchConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG, openclawDirs: discoverOpenclawDirs() };
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  // Backward compat: convert old openclawDir (string) to openclawDirs (array)
  if (raw.openclawDir && !raw.openclawDirs) {
    raw.openclawDirs = [raw.openclawDir];
    delete raw.openclawDir;
  }

  const config: ClaWatchConfig = { ...DEFAULT_CONFIG, ...raw };

  // Always re-discover to pick up new profiles
  config.openclawDirs = discoverOpenclawDirs();

  return config;
}

export function saveConfig(config: ClaWatchConfig): void {
  ensureDir();
  // Don't persist the deprecated field
  const { openclawDir, ...rest } = config;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(rest, null, 2) + '\n');
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_PATH);
}
