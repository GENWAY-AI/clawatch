import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ClaWatchConfig {
  openclawDir: string;
  backendUrl: string;
  apiKey: string;
  scanIntervalMs: number;
}

const CLAWATCH_DIR = path.join(os.homedir(), '.clawatch');
const CONFIG_PATH = path.join(CLAWATCH_DIR, 'config.json');
const PID_PATH = path.join(CLAWATCH_DIR, 'clawatch.pid');
const LOG_PATH = path.join(CLAWATCH_DIR, 'daemon.log');
const OFFSETS_PATH = path.join(CLAWATCH_DIR, 'offsets.json');

export const paths = {
  dir: CLAWATCH_DIR,
  config: CONFIG_PATH,
  pid: PID_PATH,
  log: LOG_PATH,
  offsets: OFFSETS_PATH,
};

const DEFAULT_CONFIG: ClaWatchConfig = {
  openclawDir: path.join(os.homedir(), '.openclaw'),
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
    return DEFAULT_CONFIG;
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
}

export function saveConfig(config: ClaWatchConfig): void {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_PATH);
}
