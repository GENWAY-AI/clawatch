#!/usr/bin/env node

import { Command } from 'commander';
import chalk = require('chalk');
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fork } from 'child_process';
import { loadConfig, saveConfig, configExists, paths, ensureDir, ClaWatchConfig } from './config';

const program = new Command();

program
  .name('clawatch')
  .description('ClaWatch CLI - Monitor OpenClaw agents')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize ClaWatch configuration')
  .option('--backend <url>', 'Backend URL', 'http://localhost:3001')
  .action((opts) => {
    const openclawDir = path.join(os.homedir(), '.openclaw');

    if (!fs.existsSync(openclawDir)) {
      console.log(chalk.red(`OpenClaw directory not found: ${openclawDir}`));
      process.exit(1);
    }

    const agentsDir = path.join(openclawDir, 'agents');
    const agents = fs.existsSync(agentsDir)
      ? fs.readdirSync(agentsDir).filter((name) => {
          const sessionsDir = path.join(agentsDir, name, 'sessions');
          return fs.existsSync(sessionsDir);
        })
      : [];

    const config: ClaWatchConfig = {
      openclawDir,
      backendUrl: opts.backend,
      apiKey: '',
      scanIntervalMs: 60000,
    };

    saveConfig(config);

    console.log(chalk.green('ClaWatch initialized!'));
    console.log(`  Config: ${paths.config}`);
    console.log(`  OpenClaw: ${openclawDir}`);
    console.log(`  Backend: ${config.backendUrl}`);
    console.log(`  Agents found: ${agents.length} (${agents.join(', ')})`);
  });

program
  .command('start')
  .description('Start the ClaWatch daemon')
  .action(() => {
    ensureDir();

    if (!configExists()) {
      console.log(chalk.red('Not initialized. Run: clawatch init'));
      process.exit(1);
    }

    // Check if already running
    if (fs.existsSync(paths.pid)) {
      const pid = parseInt(fs.readFileSync(paths.pid, 'utf-8').trim(), 10);
      try {
        process.kill(pid, 0);
        console.log(chalk.yellow(`Daemon already running (PID: ${pid})`));
        process.exit(0);
      } catch {
        // PID stale, remove it
        fs.unlinkSync(paths.pid);
      }
    }

    const daemonPath = path.join(__dirname, 'daemon.js');
    const child = fork(daemonPath, [], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    if (child.pid) {
      fs.writeFileSync(paths.pid, String(child.pid));
      child.unref();
      child.disconnect();
      console.log(chalk.green(`Daemon started (PID: ${child.pid})`));
      console.log(`  Logs: ${paths.log}`);
    } else {
      console.log(chalk.red('Failed to start daemon'));
      process.exit(1);
    }
  });

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

    // Daemon status
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

    // Agent stats
    const agentsDir = path.join(config.openclawDir, 'agents');
    let agentCount = 0;
    let sessionCount = 0;
    let latestEvent = '';

    if (fs.existsSync(agentsDir)) {
      const agents = fs.readdirSync(agentsDir).filter((name) => {
        return fs.existsSync(path.join(agentsDir, name, 'sessions'));
      });
      agentCount = agents.length;

      for (const agent of agents) {
        const sessionsDir = path.join(agentsDir, agent, 'sessions');
        const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));
        sessionCount += files.length;

        for (const file of files) {
          const stat = fs.statSync(path.join(sessionsDir, file));
          const mtime = stat.mtime.toISOString();
          if (mtime > latestEvent) latestEvent = mtime;
        }
      }
    }

    console.log(chalk.bold('ClaWatch Status'));
    console.log('─'.repeat(40));
    console.log(`  Daemon:      ${daemonRunning ? chalk.green(`running (PID: ${daemonPid})`) : chalk.red('stopped')}`);
    console.log(`  Backend:     ${config.backendUrl}`);
    console.log(`  Agents:      ${agentCount}`);
    console.log(`  Sessions:    ${sessionCount}`);
    console.log(`  Last event:  ${latestEvent || 'none'}`);

    // Check backend connectivity
    const http = require('http');
    const url = new (require('url').URL)('/api/events', config.backendUrl);
    let replied = false;
    const req = http.get(url, { timeout: 3000 }, (res: any) => {
      if (!replied) {
        replied = true;
        const ok = res.statusCode && res.statusCode < 500;
        console.log(`  Connection:  ${ok ? chalk.green('ok') : chalk.yellow(`HTTP ${res.statusCode}`)}`);
      }
      res.resume();
    });
    req.on('error', () => {
      if (!replied) {
        replied = true;
        console.log(`  Connection:  ${chalk.red('unreachable')}`);
      }
    });
    req.on('timeout', () => {
      if (!replied) {
        replied = true;
        req.destroy();
        console.log(`  Connection:  ${chalk.red('timeout')}`);
      }
    });
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
    const tail = lines.slice(-n);
    console.log(tail.join('\n'));
  });

program.parse();
