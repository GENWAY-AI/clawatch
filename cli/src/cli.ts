#!/usr/bin/env node

import { Command } from 'commander';
import chalk = require('chalk');
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fork, spawn, ChildProcess } from 'child_process';
import { loadConfig, saveConfig, configExists, paths, ensureDir, ClaWatchConfig, savePids, loadPids, clearPids, ManagedPids } from './config';
import { execSync } from 'child_process';
import { compareVersions, detectPackageManager, checkForUpdate } from './update';

import * as net from 'net';

// SSOT: read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

// --- Helper: check if a port is free ---
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // Check on 0.0.0.0 (IPv4) explicitly — must match what Next.js binds to
    const server = net.createServer();
    server.listen(port, '0.0.0.0', () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

// --- Helper: kill a process by PID (returns true if killed) ---
function killPid(pid: number): boolean {
  try {
    process.kill(pid, 0); // check if alive
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

// --- Helper: kill process occupying a port (macOS/Linux) ---
function killProcessOnPort(port: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  try {
    const output = execSync(`lsof -ti :${port} 2>/dev/null || /usr/sbin/lsof -ti :${port} 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (!output) return false;
    const pids = output.split('\n').map(p => parseInt(p, 10)).filter(p => !isNaN(p));
    for (const pid of pids) {
      try { process.kill(pid, signal); } catch { /* already dead */ }
    }
    return pids.length > 0;
  } catch {
    return false;
  }
}

// --- Helper: kill ALL managed ClaWatch processes ---
function killAllManagedProcesses(): void {
  // 1. Kill tracked PIDs from pids file
  const pids = loadPids();
  for (const [role, pid] of Object.entries(pids)) {
    if (pid && typeof pid === 'number') {
      if (killPid(pid)) {
        console.log(chalk.yellow(`  Killed previous ${role} (PID: ${pid})`));
      }
    }
  }

  // 2. Also kill legacy single PID file
  if (fs.existsSync(paths.pid)) {
    const oldPid = parseInt(fs.readFileSync(paths.pid, 'utf-8').trim(), 10);
    if (!isNaN(oldPid)) killPid(oldPid);
  }

  clearPids();

  // 3. Also kill anything occupying our ports (handles untracked/crashed processes)
  killProcessOnPort(3001, 'SIGTERM');
  killProcessOnPort(3456, 'SIGTERM');
}

// --- Helper: ensure port is available, killing stale ClaWatch processes if needed ---
async function ensurePort(port: number, label: string): Promise<void> {
  if (await isPortFree(port)) return;

  // Try SIGTERM first
  console.log(chalk.yellow(`  Port ${port} is occupied (${label}). Killing stale process (SIGTERM)...`));
  killProcessOnPort(port, 'SIGTERM');

  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isPortFree(port)) return;
  }

  // Escalate to SIGKILL
  console.log(chalk.yellow(`  Process didn't exit cleanly. Sending SIGKILL...`));
  killProcessOnPort(port, 'SIGKILL');

  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isPortFree(port)) return;
  }

  console.log(chalk.red(`  ERROR: Port ${port} is still occupied after cleanup. Cannot start ${label}.`));
  console.log(chalk.red(`  Run: lsof -i :${port}   to see what's using it.`));
  process.exit(1);
}



const program = new Command();

program
  .name('clawatch')
  .description('ClaWatch — AI Agent Observability. One command to monitor all your agents.')
  .version(pkg.version);

// --- Helper: find dirs relative to CLI ---
function findDir(name: string): string {
  const candidates = [
    path.join(__dirname, '..', name),                      // bundled: cli/backend or cli/frontend
    path.join(__dirname, '..', '..', name),                // dev: cli/dist/../../backend
    path.join(__dirname, '..', '..', '..', name),          // npm global
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return '';
}

// --- Helper: auto-init if not configured ---
function autoInit(): ClaWatchConfig {
  const { discoverOpenclawDirs } = require('./config');
  const openclawDirs = discoverOpenclawDirs();
  const config: ClaWatchConfig = {
    openclawDirs,
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
  .option('-p, --port <port>', 'Dashboard port', '3456')
  .option('-d, --daemon', 'Run in background (daemon mode)')
  .option('--no-open', 'Don\'t open browser')
  .action(async (opts) => {
    // --- Daemon mode: re-spawn self as detached background process ---
    if (opts.daemon && !process.env.__CLAWATCH_DAEMON) {
      // Check if already running
      const pids = loadPids();
      const alreadyRunning = Object.entries(pids).some(([, pid]) => {
        if (!pid) return false;
        try { process.kill(pid, 0); return true; } catch { return false; }
      });
      if (alreadyRunning) {
        console.log(chalk.red('\n❌ ClaWatch is already running.'));
        console.log(chalk.yellow('   Run "clawatch stop" first, or "clawatch status" to check.\n'));
        process.exit(1);
      }

      ensureDir();
      const logFile = paths.log;
      const logFd = fs.openSync(logFile, 'a');

      // Build args: pass through all flags except -d/--daemon, add __CLAWATCH_DAEMON env
      const args = process.argv.slice(2).filter(a => a !== '-d' && a !== '--daemon');
      args.unshift('--no-open'); // parent handles browser open, not the background child

      const child = spawn(process.execPath, [__filename, ...args], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env, __CLAWATCH_DAEMON: '1', FORCE_COLOR: '0' },
      });

      child.unref();
      fs.closeSync(logFd);

      const dashPort = opts.port || '3456';
      const dashUrl = `http://localhost:${dashPort}`;

      console.log(chalk.green.bold(`\n✅ ClaWatch daemon started (PID ${child.pid})`));
      console.log(chalk.green(`   Dashboard: ${dashUrl}`));
      console.log(chalk.gray(`   Logs: ${logFile}`));
      console.log(chalk.gray(`   Stop: clawatch stop`));
      console.log(chalk.gray(`   Status: clawatch status\n`));

      // Open browser after a short delay (give backend/frontend time to boot)
      if (opts.open !== false) {
        setTimeout(() => {
          const { exec: execCmd } = require('child_process');
          const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          execCmd(`${openCmd} ${dashUrl}`);
        }, 3000);
      }

      // Exit after browser opens
      setTimeout(() => process.exit(0), 3500);
    }

    console.log(chalk.bold('\n🔍 ClaWatch — AI Agent Observability\n'));

    // Kill ALL existing ClaWatch processes (daemon + backend + frontend)
    console.log(chalk.blue('Cleaning up previous processes...'));
    killAllManagedProcesses();
    // Brief pause so OS can release ports after killing processes
    await new Promise(r => setTimeout(r, 1000));

    // Auto-init if needed
    if (!configExists()) {
      const { discoverOpenclawDirs } = require('./config');
      const openclawDirs: string[] = discoverOpenclawDirs();
      if (openclawDirs.length === 0 || !openclawDirs.some((d: string) => fs.existsSync(d))) {
        console.log(chalk.red('No OpenClaw directories found (~/.openclaw or ~/.openclaw-*)'));
        console.log(chalk.yellow('Install OpenClaw first: https://openclaw.ai'));
        process.exit(1);
      }
      console.log(chalk.blue('First run — auto-configuring...'));
      autoInit();

      let totalAgents = 0;
      for (const openclawDir of openclawDirs) {
        const agentsDir = path.join(openclawDir, 'agents');
        const agents = fs.existsSync(agentsDir)
          ? fs.readdirSync(agentsDir).filter(n => fs.existsSync(path.join(agentsDir, n, 'sessions')))
          : [];
        const profileName = path.basename(openclawDir) === '.openclaw' ? 'default' : path.basename(openclawDir).slice('.openclaw-'.length);
        if (agents.length > 0) {
          console.log(chalk.green(`  Profile "${profileName}": ${agents.length} agents (${agents.join(', ')})`));
        }
        totalAgents += agents.length;
      }
      console.log(chalk.green(`  Total: ${totalAgents} agents across ${openclawDirs.length} profile(s)`));
    }

    const config = loadConfig();

    const backendPort = 3001;
    const frontendPort = parseInt(opts.port, 10) || 3456;

    // Ensure ports are available — kill stale processes, don't silently pick random ports
    await ensurePort(backendPort, 'backend API');
    await ensurePort(frontendPort, 'dashboard');

    const BACKEND_PORT = String(backendPort);
    const FRONTEND_PORT = String(frontendPort);

    // 1. Start backend server (API)
    const backendDir = findDir('backend');
    let backendProcess: ChildProcess | null = null;

    if (backendDir) {
      console.log(chalk.blue('Starting backend API...'));

      const distIndex = path.join(backendDir, 'dist', 'index.js');
      const srcIndex = path.join(backendDir, 'src', 'index.ts');

      if (fs.existsSync(distIndex)) {
        backendProcess = spawn('node', ['--no-deprecation', distIndex], {
          cwd: backendDir,
          env: { ...process.env, PORT: BACKEND_PORT },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        backendProcess = spawn('npx', ['tsx', srcIndex], {
          cwd: backendDir,
          env: { ...process.env, PORT: BACKEND_PORT },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        });
      }

      backendProcess.stdout?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line) console.log(chalk.gray(`  [api] ${line}`));
      });
      backendProcess.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line && !line.includes('ExperimentalWarning') && !line.includes('DEP0060') && !line.includes('DeprecationWarning')) {
          console.log(chalk.red(`  [api] ${line}`));
        }
      });

      // Wait for backend to be ready before starting frontend (prevents ECONNREFUSED)
      console.log(chalk.blue('Waiting for backend API...'));
      let backendReady = false;
      for (let i = 0; i < 30; i++) {
        try {
          const http = require('http');
          await new Promise<void>((resolve, reject) => {
            const req = http.get(`http://localhost:${BACKEND_PORT}/api/version`, { timeout: 1000 }, (res: any) => {
              res.resume();
              resolve();
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
          });
          backendReady = true;
          console.log(chalk.green('  Backend API ready'));
          break;
        } catch {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      if (!backendReady) {
        console.log(chalk.yellow('  Backend API slow to start — continuing anyway'));
      }
    } else {
      console.log(chalk.yellow('Backend not found — using configured URL: ' + config.backendUrl));
    }

    // 2. Start frontend (Next.js standalone)
    const frontendDir = findDir('frontend');
    let frontendProcess: ChildProcess | null = null;

    if (frontendDir) {
      // Use default standalone server.js — it handles static files AND API proxying
      // (via next.config.ts rewrites). server-with-proxy.js is no longer needed.
      const standaloneServer = path.join(frontendDir, '.next', 'standalone', 'server.js');
      const serverJs = fs.existsSync(standaloneServer) ? standaloneServer : path.join(frontendDir, 'server.js');
      if (fs.existsSync(serverJs)) {
        console.log(chalk.blue('Starting dashboard...'));
        frontendProcess = spawn('node', ['--no-deprecation', serverJs], {
          cwd: frontendDir,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: FRONTEND_PORT,
            HOSTNAME: '0.0.0.0',
            BACKEND_PORT: BACKEND_PORT,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        frontendProcess.stdout?.on('data', (d: Buffer) => {
          const line = d.toString().trim();
          if (line) console.log(chalk.gray(`  [dashboard] ${line}`));
        });
        frontendProcess.stderr?.on('data', (d: Buffer) => {
          const line = d.toString().trim();
          if (line && !line.includes('ExperimentalWarning') && !line.includes('DEP0060') && !line.includes('DeprecationWarning') && !line.includes('ECONNREFUSED')) {
            console.log(chalk.red(`  [dashboard] ${line}`));
          }
        });
      }
    }

    // 3. Start monitoring daemon
    console.log(chalk.blue('Starting monitoring...'));
    const daemonPath = path.join(__dirname, 'daemon.js');
    let daemonProcess: ChildProcess | null = null;
    if (fs.existsSync(daemonPath)) {
      daemonProcess = fork(daemonPath, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      daemonProcess.stdout?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line) console.log(chalk.gray(`  [monitor] ${line}`));
      });
    }

    // 4. Save ALL process PIDs for reliable cleanup
    const managedPids: ManagedPids = {};
    if (daemonProcess?.pid) managedPids.daemon = daemonProcess.pid;
    if (backendProcess?.pid) managedPids.backend = backendProcess.pid;
    if (frontendProcess?.pid) managedPids.frontend = frontendProcess.pid;
    savePids(managedPids);
    // Also write legacy PID file for backward compat
    if (daemonProcess?.pid) {
      fs.writeFileSync(paths.pid, String(daemonProcess.pid));
    }
    console.log(chalk.gray(`  Tracking PIDs: ${JSON.stringify(managedPids)}`));

    // 5. Wait for dashboard to be ready, then open browser
    const dashUrl = `http://localhost:${FRONTEND_PORT}`;
    console.log(chalk.blue(`\nWaiting for dashboard...`));

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
      console.log(chalk.gray(`   API:       http://localhost:${BACKEND_PORT}/api/agents`));
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

    // Keep process alive — clean shutdown kills ALL child processes and clears PID files
    const shutdown = (signal: string) => {
      console.log(chalk.yellow(`\nShutting down (${signal})...`));
      if (backendProcess) backendProcess.kill();
      if (frontendProcess) frontendProcess.kill();
      if (daemonProcess) daemonProcess.kill();
      clearPids();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('exit', () => {
      // Last-resort cleanup: if parent dies, kill children
      if (backendProcess?.pid) try { process.kill(backendProcess.pid, 'SIGTERM'); } catch {}
      if (frontendProcess?.pid) try { process.kill(frontendProcess.pid, 'SIGTERM'); } catch {}
      if (daemonProcess?.pid) try { process.kill(daemonProcess.pid, 'SIGTERM'); } catch {}
      clearPids();
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
  .description('Stop all ClaWatch processes (backend, frontend, daemon)')
  .action(() => {
    const pids = loadPids();
    const hasPids = Object.keys(pids).length > 0;
    const hasLegacyPid = fs.existsSync(paths.pid);

    if (!hasPids && !hasLegacyPid) {
      // Last resort: try killing processes on known ports
      const killedBackend = killProcessOnPort(3001);
      const killedFrontend = killProcessOnPort(3456);
      if (killedBackend || killedFrontend) {
        console.log(chalk.green('Killed ClaWatch processes found on ports 3001/3456'));
      } else {
        console.log(chalk.yellow('No ClaWatch processes found'));
      }
      process.exit(0);
    }

    let stopped = 0;
    for (const [role, pid] of Object.entries(pids)) {
      if (pid && typeof pid === 'number') {
        if (killPid(pid)) {
          console.log(chalk.green(`Stopped ${role} (PID: ${pid})`));
          stopped++;
        } else {
          console.log(chalk.yellow(`${role} (PID: ${pid}) was not running`));
        }
      }
    }

    // Also handle legacy PID file
    if (hasLegacyPid) {
      const legacyPid = parseInt(fs.readFileSync(paths.pid, 'utf-8').trim(), 10);
      if (!isNaN(legacyPid) && !Object.values(pids).includes(legacyPid)) {
        if (killPid(legacyPid)) {
          console.log(chalk.green(`Stopped legacy daemon (PID: ${legacyPid})`));
          stopped++;
        }
      }
    }

    // Also kill anything left on known ports
    killProcessOnPort(3001);
    killProcessOnPort(3456);

    clearPids();
    console.log(chalk.green(`\nAll ClaWatch processes stopped (${stopped} killed)`));
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
    const pids = loadPids();
    const processStatus = (role: string, pid?: number): string => {
      if (!pid) return chalk.red('not tracked');
      try {
        process.kill(pid, 0);
        return chalk.green(`running (PID: ${pid})`);
      } catch {
        return chalk.red(`stopped (stale PID: ${pid})`);
      }
    };

    let totalAgentCount = 0;
    let totalSessionCount = 0;

    // Determine if running as daemon (detached) or foreground
    const isAnyRunning = Object.entries(pids).some(([, pid]) => {
      if (!pid) return false;
      try { process.kill(pid, 0); return true; } catch { return false; }
    });
    const mode = isAnyRunning ? chalk.green('daemon (background)') : chalk.red('stopped');

    console.log(chalk.bold('\n🔍 ClaWatch Status\n'));
    console.log(`  Mode:      ${mode}`);
    console.log(`  Backend:   ${processStatus('backend', pids.backend)}`);
    console.log(`  Frontend:  ${processStatus('frontend', pids.frontend)}`);
    console.log(`  Daemon:    ${processStatus('daemon', pids.daemon)}`);
    console.log(`  API URL:   ${config.backendUrl}`);
    console.log(`  Profiles:  ${config.openclawDirs.length}`);

    for (const openclawDir of config.openclawDirs) {
      const dirName = path.basename(openclawDir);
      const profileName = dirName === '.openclaw' ? 'default' : dirName.slice('.openclaw-'.length);
      const agentsDir = path.join(openclawDir, 'agents');
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

      totalAgentCount += agentCount;
      totalSessionCount += sessionCount;
      console.log(`  Profile "${profileName}": ${agentCount} agents, ${sessionCount} sessions`);
    }

    console.log(`  Total:     ${totalAgentCount} agents, ${totalSessionCount} sessions`);
  });

program
  .command('logs')
  .description('Tail daemon logs')
  .option('-n <lines>', 'Number of lines', '50')
  .option('-f, --follow', 'Follow log output (like tail -f)')
  .action((opts) => {
    if (!fs.existsSync(paths.log)) {
      console.log(chalk.yellow('No log file yet. Start ClaWatch with -d first.'));
      process.exit(0);
    }

    const content = fs.readFileSync(paths.log, 'utf-8');
    const lines = content.trim().split('\n');
    const n = parseInt(opts.n || opts.N || '50', 10);
    console.log(lines.slice(-n).join('\n'));

    if (opts.follow) {
      // Tail -f mode: watch for new content
      let pos = fs.statSync(paths.log).size;
      const watcher = fs.watchFile(paths.log, { interval: 300 }, () => {
        const stat = fs.statSync(paths.log);
        if (stat.size > pos) {
          const fd = fs.openSync(paths.log, 'r');
          const buf = Buffer.alloc(stat.size - pos);
          fs.readSync(fd, buf, 0, buf.length, pos);
          fs.closeSync(fd);
          process.stdout.write(buf.toString());
          pos = stat.size;
        } else if (stat.size < pos) {
          // Log was truncated/rotated
          pos = 0;
        }
      });

      process.on('SIGINT', () => {
        fs.unwatchFile(paths.log);
        process.exit(0);
      });
    }
  });

// --- Update command ---
program
  .command('update')
  .description('Check for updates and upgrade clawatch to the latest version')
  .option('--check', 'Only check for updates without installing')
  .action(async (opts) => {
    const currentVersion = pkg.version;
    console.log(chalk.bold('\n🔄 ClaWatch Update\n'));
    console.log(`  Current version: ${chalk.cyan(currentVersion)}`);

    // 1. Fetch latest version from npm registry
    console.log(chalk.gray('  Checking npm registry...'));
    let latestVersion: string;
    try {
      latestVersion = execSync('npm view clawatch version 2>/dev/null', { encoding: 'utf-8' }).trim();
    } catch {
      console.log(chalk.red('\n  ❌ Could not reach npm registry.'));
      console.log(chalk.yellow('     Check your internet connection and try again.\n'));
      process.exit(1);
    }

    if (!latestVersion) {
      console.log(chalk.red('\n  ❌ Could not determine latest version.\n'));
      process.exit(1);
    }

    console.log(`  Latest version:  ${chalk.cyan(latestVersion)}`);

    // 2. Check update status using extracted logic
    const updateCheck = checkForUpdate({
      currentVersion,
      latestVersion,
      checkOnly: !!opts.check,
    });

    if (updateCheck.action === 'up-to-date') {
      console.log(chalk.green('\n  ✅ Already on the latest version!\n'));
      process.exit(0);
    }

    console.log(chalk.yellow(`\n  ⬆️  Update available: ${currentVersion} → ${latestVersion}`));

    if (updateCheck.action === 'check-only') {
      console.log(chalk.gray('  Run "clawatch update" (without --check) to install.\n'));
      process.exit(0);
    }

    // 3. Detect package manager using extracted logic
    const pm = detectPackageManager({
      execSync: (cmd) => execSync(cmd, { encoding: 'utf-8' }),
      existsSync: (p) => fs.existsSync(p),
    });

    if (!pm) {
      console.log(chalk.red('\n  ❌ Could not detect package manager (npm, yarn, or pnpm).'));
      console.log(chalk.yellow('     Install one first: https://nodejs.org\n'));
      process.exit(1);
    }

    // 5. Prompt user (unless stdin is not a TTY)
    const readline = require('readline');
    if (process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.white(`\n  Update via ${pm.manager}? [Y/n] `), (a: string) => {
          rl.close();
          resolve(a.trim().toLowerCase());
        });
      });

      if (answer && answer !== 'y' && answer !== 'yes') {
        console.log(chalk.yellow('\n  Update cancelled.\n'));
        process.exit(0);
      }
    }

    // 6. Run update
    console.log(chalk.blue(`\n  Running: ${pm.command}\n`));
    try {
      execSync(pm.command, { stdio: 'inherit' });
      console.log(chalk.green.bold(`\n  ✅ Updated to ${latestVersion}!`));
      console.log(chalk.gray('     Restart ClaWatch to use the new version.\n'));
    } catch (err) {
      console.log(chalk.red(`\n  ❌ Update failed. Try manually: ${pm.command}`));
      if (pm.manager === 'npm') {
        console.log(chalk.yellow('     You may need: sudo npm install -g clawatch@latest'));
      }
      console.log('');
      process.exit(1);
    }
  });

program.parse();
