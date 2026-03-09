import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { ClaWatchConfig, paths } from './config';
import { AgentEvent, postEvent } from './api';
import { parseLine, mapEventToApiEvents, parseGatewayError } from './parser';

interface FileOffsets {
  [filePath: string]: number;
}

let offsets: FileOffsets = {};
let config: ClaWatchConfig;
let watcher: chokidar.FSWatcher | null = null;
let gatewayWatcher: chokidar.FSWatcher | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let activeAgents = new Set<string>();

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(paths.log, line);
}

function loadOffsets(): void {
  if (fs.existsSync(paths.offsets)) {
    try {
      offsets = JSON.parse(fs.readFileSync(paths.offsets, 'utf-8'));
    } catch {
      offsets = {};
    }
  }
}

function saveOffsets(): void {
  fs.writeFileSync(paths.offsets, JSON.stringify(offsets, null, 2));
}

function extractAgentId(filePath: string): string | null {
  // Path: .../agents/<agentId>/sessions/<file>.jsonl
  const parts = filePath.split(path.sep);
  const agentsIdx = parts.indexOf('agents');
  if (agentsIdx >= 0 && agentsIdx + 1 < parts.length) {
    return parts[agentsIdx + 1];
  }
  return null;
}

async function sendEvent(event: AgentEvent): Promise<void> {
  try {
    await postEvent(config.backendUrl, event);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Failed to send event: ${msg}`);
  }
}

async function processLines(lines: string[], agentId: string): Promise<void> {
  for (const line of lines) {
    const event = parseLine(line);
    if (!event) continue;

    const apiEvents = mapEventToApiEvents(event, agentId);
    for (const apiEvent of apiEvents) {
      await sendEvent(apiEvent);
    }
  }
}

async function readNewLines(filePath: string): Promise<void> {
  const agentId = extractAgentId(filePath);
  if (!agentId) return;

  activeAgents.add(agentId);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }

  const currentOffset = offsets[filePath] || 0;
  if (stat.size <= currentOffset) return;

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(stat.size - currentOffset);
  fs.readSync(fd, buffer, 0, buffer.length, currentOffset);
  fs.closeSync(fd);

  const content = buffer.toString('utf-8');
  const lines = content.split('\n').filter((l) => l.trim());

  if (lines.length > 0) {
    log(`Processing ${lines.length} new lines from ${path.basename(filePath)} (agent: ${agentId})`);
    await processLines(lines, agentId);
  }

  offsets[filePath] = stat.size;
  saveOffsets();
}

async function initialScan(): Promise<void> {
  const agentsDir = path.join(config.openclawDir, 'agents');
  if (!fs.existsSync(agentsDir)) {
    log(`Agents directory not found: ${agentsDir}`);
    return;
  }

  const agents = fs.readdirSync(agentsDir).filter((name) => {
    const sessionsDir = path.join(agentsDir, name, 'sessions');
    return fs.existsSync(sessionsDir) && fs.statSync(path.join(agentsDir, name)).isDirectory();
  });

  log(`Found ${agents.length} agents: ${agents.join(', ')}`);

  for (const agentId of agents) {
    activeAgents.add(agentId);
    const sessionsDir = path.join(agentsDir, agentId, 'sessions');
    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      await readNewLines(filePath);
    }
  }

  log(`Initial scan complete. ${activeAgents.size} agents, offsets tracked for ${Object.keys(offsets).length} files`);
}

function startFileWatcher(): void {
  const pattern = path.join(config.openclawDir, 'agents', '*', 'sessions', '*.jsonl');
  log(`Watching: ${pattern}`);

  watcher = chokidar.watch(pattern, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('add', async (filePath) => {
    log(`New file detected: ${path.basename(filePath)}`);
    await readNewLines(filePath);
  });

  watcher.on('change', async (filePath) => {
    await readNewLines(filePath);
  });

  watcher.on('error', (err) => {
    log(`Watcher error: ${err.message}`);
  });
}

function startGatewayWatcher(): void {
  const errLog = path.join(config.openclawDir, 'logs', 'gateway.err.log');
  if (!fs.existsSync(errLog)) {
    log(`Gateway error log not found: ${errLog}`);
    return;
  }

  let errOffset = 0;
  try {
    errOffset = fs.statSync(errLog).size;
  } catch {
    // start from beginning
  }

  gatewayWatcher = chokidar.watch(errLog, {
    persistent: true,
    ignoreInitial: true,
  });

  gatewayWatcher.on('change', async () => {
    try {
      const stat = fs.statSync(errLog);
      if (stat.size <= errOffset) return;

      const fd = fs.openSync(errLog, 'r');
      const buffer = Buffer.alloc(stat.size - errOffset);
      fs.readSync(fd, buffer, 0, buffer.length, errOffset);
      fs.closeSync(fd);

      const lines = buffer.toString('utf-8').split('\n').filter((l) => l.trim());
      for (const line of lines) {
        const event = parseGatewayError(line, 'gateway');
        if (event) {
          await sendEvent(event);
        }
      }

      errOffset = stat.size;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Gateway watcher error: ${msg}`);
    }
  });

  log('Gateway error log watcher started');
}

function startHeartbeat(): void {
  const os = require('os');
  heartbeatInterval = setInterval(async () => {
    for (const agentId of activeAgents) {
      await sendEvent({
        agentId,
        agentName: agentId,
        host: os.hostname(),
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      });
    }
    log(`Heartbeat sent for ${activeAgents.size} agents`);
  }, config.scanIntervalMs);
}

export async function startCollector(cfg: ClaWatchConfig): Promise<void> {
  config = cfg;

  log('=== ClaWatch Collector Starting ===');
  log(`Backend: ${config.backendUrl}`);
  log(`OpenClaw dir: ${config.openclawDir}`);

  loadOffsets();
  await initialScan();
  startFileWatcher();
  startGatewayWatcher();
  startHeartbeat();

  log('Collector running. Watching for changes...');
}

export function stopCollector(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (gatewayWatcher) {
    gatewayWatcher.close();
    gatewayWatcher = null;
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  log('Collector stopped');
}
