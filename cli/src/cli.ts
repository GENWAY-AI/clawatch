#!/usr/bin/env node

import { Command } from 'commander';
import chalk = require('chalk');
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fork, spawn, ChildProcess } from 'child_process';
import { loadConfig, saveConfig, configExists, paths, ensureDir, ClaWatchConfig } from './config';
import { execSync } from 'child_process';

// SSOT: read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

// --- Helper: ensure better-sqlite3 native addon is built ---
function ensureNativeAddon(backendDir: string): void {
  const bsqlite = path.join(backendDir, 'node_modules', 'better-sqlite3');
  if (!fs.existsSync(bsqlite)) return;

  // Check if the binding exists
  const buildDir = path.join(bsqlite, 'build', 'Release');
  const bindingFile = path.join(buildDir, 'better_sqlite3.node');

  if (!fs.existsSync(bindingFile)) {
    console.log(chalk.blue('Building native SQLite addon (first run)...'));
    try {
      execSync('npm rebuild better-sqlite3', {
        cwd: backendDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      });
      console.log(chalk.green('  Native addon built successfully'));
    } catch (err: any) {
      console.log(chalk.red('  Failed to build native addon. Trying node-gyp directly...'));
      try {
        execSync('npx node-gyp rebuild', {
          cwd: bsqlite,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 60000,
        });
        console.log(chalk.green('  Native addon built successfully'));
      } catch {
        console.log(chalk.red('  Could not build better-sqlite3. You may need to install build tools:'));
        console.log(chalk.yellow('  macOS: xcode-select --install'));
        console.log(chalk.yellow('  Linux: sudo apt install build-essential python3'));
        process.exit(1);
      }
    }
  }
}

const program = new Command();

program
  .name('clawatch')
  .description('ClaWatch — AI Agent Observability. One command to monitor all your agents.')
  .version(pkg.version);

// --- Helper: find backend dir relative to CLI ---
function findBackendDir(): string {
  // When installed via npm, backend is sibling to cli
  const candidates = [
    path.join(__dirname, '..', '..', 'backend'),          // dev: cli/dist/../backend
    path.join(__dirname, '..', '..', '..', 'backend'),    // npm global: node_modules/clawatch/../backend
    path.join(__dirname, '..', 'backend'),                 // bundled
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  }
  return '';
}

// --- Helper: auto-init if not configured ---
function autoInit(): ClaWatchConfig {
  const openclawDir = path.join(os.homedir(), '.openclaw');
  const config: ClaWatchConfig = {
    openclawDir,
    backendUrl: 'http://localhost:3001',
    apiKey: '',
    scanIntervalMs: 60000,
  };
  ensureDir();
  saveConfig(config);
  return config;
}

// --- Default command: start everything ---
program
  .command('start', { isDefault: true })
  .description('Start ClaWatch: backend + monitoring + dashboard')
  .option('-p, --port <port>', 'Dashboard port', '3001')
  .option('--no-open', 'Don\'t open browser')
  .action(async (opts) => {
    console.log(chalk.bold('\n🔍 ClaWatch — AI Agent Observability\n'));

    // Kill existing daemon if running
    if (fs.existsSync(paths.pid)) {
      const oldPid = parseInt(fs.readFileSync(paths.pid, 'utf-8').trim(), 10);
      try {
        process.kill(oldPid, 'SIGTERM');
        console.log(chalk.yellow(`Stopped previous daemon (PID: ${oldPid})`));
      } catch {
        // Already dead
      }
      fs.unlinkSync(paths.pid);
    }

    // Auto-init if needed
    if (!configExists()) {
      const openclawDir = path.join(os.homedir(), '.openclaw');
      if (!fs.existsSync(openclawDir)) {
        console.log(chalk.red('OpenClaw directory not found: ~/.openclaw'));
        console.log(chalk.yellow('Install OpenClaw first: https://openclaw.ai'));
        process.exit(1);
      }
      console.log(chalk.blue('First run — auto-configuring...'));
      autoInit();

      const agentsDir = path.join(openclawDir, 'agents');
      const agents = fs.existsSync(agentsDir)
        ? fs.readdirSync(agentsDir).filter(n => fs.existsSync(path.join(agentsDir, n, 'sessions')))
        : [];
      console.log(chalk.green(`  Found ${agents.length} agents: ${agents.join(', ')}`));
    }

    const config = loadConfig();
    const port = opts.port || '3001';

    // 1. Start backend server
    const backendDir = findBackendDir();
    let backendProcess: ChildProcess | null = null;

    if (backendDir) {
      // Ensure native SQLite addon is compiled for this machine
      ensureNativeAddon(backendDir);
      console.log(chalk.blue('Starting backend server...'));

      // Check if tsx or ts-node is available, otherwise use compiled JS
      const distIndex = path.join(backendDir, 'dist', 'index.js');
      const srcIndex = path.join(backendDir, 'src', 'index.ts');

      if (fs.existsSync(distIndex)) {
        backendProcess = spawn('node', [distIndex], {
          cwd: backendDir,
          env: { ...process.env, PORT: port },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        // Try tsx for dev mode
        backendProcess = spawn('npx', ['tsx', srcIndex], {
          cwd: backendDir,
          env: { ...process.env, PORT: port },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        });
      }

      backendProcess.stdout?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line) console.log(chalk.gray(`  [server] ${line}`));
      });
      backendProcess.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line && !line.includes('ExperimentalWarning')) console.log(chalk.red(`  [server] ${line}`));
      });
    } else {
      console.log(chalk.yellow('Backend not found locally — using configured URL: ' + config.backendUrl));
    }

    // 2. Start monitoring daemon (inline, not forked)
    console.log(chalk.blue('Starting monitoring...'));
    const daemonPath = path.join(__dirname, 'daemon.js');
    if (fs.existsSync(daemonPath)) {
      const daemonProcess = fork(daemonPath, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      daemonProcess.stdout?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line) console.log(chalk.gray(`  [monitor] ${line}`));
      });
    }

    // 3. Wait for server to be ready, then open browser
    const dashUrl = `http://localhost:${port}`;
    console.log(chalk.blue(`\nWaiting for server...`));

    let ready = false;
    for (let i = 0; i < 20; i++) {
      try {
        const http = require('http');
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`${dashUrl}/health`, { timeout: 1000 }, (res: any) => {
            res.resume();
            resolve();
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        ready = true;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (ready) {
      console.log(chalk.green.bold(`\n✅ ClaWatch is running!`));
      console.log(chalk.green(`   Dashboard: ${dashUrl}`));
      console.log(chalk.gray(`   API:       ${dashUrl}/api/agents`));
      console.log(chalk.gray(`\n   Press Ctrl+C to stop\n`));

      if (opts.open !== false) {
        const { exec: execCmd } = require('child_process');
        const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        execCmd(`${openCmd} ${dashUrl}`);
      }
    } else {
      console.log(chalk.yellow(`\n⚠️  Server not ready yet, but processes started.`));
      console.log(chalk.yellow(`   Try opening ${dashUrl} manually.`));
    }

    // Keep process alive
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nShutting down...'));
      if (backendProcess) backendProcess.kill();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      if (backendProcess) backendProcess.kill();
      process.exit(0);
    });
  });

program
  .command('init')
  .description('[deprecated] Initialization is now automatic on start')
  .action(() => {
    console.log(chalk.yellow('Note: "clawatch init" is deprecated. Just run "clawatch start" — it auto-initializes.'));
    autoInit();
    console.log(chalk.green('Config created.'));
  });

// 'start' is the default command (see above) — no separate start needed

program
  .command('stop')
  .description('Stop the ClaWatch daemon')
  .action(() => {
    if (!fs.existsSync(paths.pid)) {
      console.log(chalk.yellow('No daemon running'));
      process.exit(0);
    }

    const pid = parseInt(fs.readFileSync(paths.pid, 'utf-8').trim(), 10);
    try {
      process.kill(pid, 'SIGTERM');
      fs.unlinkSync(paths.pid);
      console.log(chalk.green(`Daemon stopped (PID: ${pid})`));
    } catch {
      fs.unlinkSync(paths.pid);
      console.log(chalk.yellow('Daemon was not running (stale PID removed)'));
    }
  });

program
  .command('status')
  .description('Show ClaWatch status')
  .action(() => {
    if (!configExists()) {
      console.log(chalk.red('Not initialized. Run: clawatch init'));
      process.exit(1);
    }

    const config = loadConfig();
    let daemonRunning = false;
    let daemonPid = 0;
    if (fs.existsSync(paths.pid)) {
      daemonPid = parseInt(fs.readFileSync(paths.pid, 'utf-8').trim(), 10);
      try {
        process.kill(daemonPid, 0);
        daemonRunning = true;
      } catch {
        daemonRunning = false;
      }
    }

    const agentsDir = path.join(config.openclawDir, 'agents');
    let agentCount = 0;
    let sessionCount = 0;

    if (fs.existsSync(agentsDir)) {
      const agents = fs.readdirSync(agentsDir).filter(n => fs.existsSync(path.join(agentsDir, n, 'sessions')));
      agentCount = agents.length;
      for (const agent of agents) {
        const sessionsDir = path.join(agentsDir, agent, 'sessions');
        sessionCount += fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl')).length;
      }
    }

    console.log(chalk.bold('\n🔍 ClaWatch Status\n'));
    console.log(`  Daemon:   ${daemonRunning ? chalk.green(`running (PID: ${daemonPid})`) : chalk.red('stopped')}`);
    console.log(`  Backend:  ${config.backendUrl}`);
    console.log(`  Agents:   ${agentCount}`);
    console.log(`  Sessions: ${sessionCount}`);
  });

program
  .command('logs')
  .description('Tail daemon logs')
  .option('-n <lines>', 'Number of lines', '50')
  .action((opts) => {
    if (!fs.existsSync(paths.log)) {
      console.log(chalk.yellow('No log file yet'));
      process.exit(0);
    }

    const content = fs.readFileSync(paths.log, 'utf-8');
    const lines = content.trim().split('\n');
    const n = parseInt(opts.n || opts.N || '50', 10);
    console.log(lines.slice(-n).join('\n'));
  });

program.parse();
