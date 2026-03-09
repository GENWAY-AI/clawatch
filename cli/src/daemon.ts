import { loadConfig, paths, ensureDir } from './config';
import { startCollector, stopCollector } from './collector';

ensureDir();

process.on('SIGTERM', () => {
  stopCollector();
  process.exit(0);
});

process.on('SIGINT', () => {
  stopCollector();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  const fs = require('fs');
  fs.appendFileSync(paths.log, `[${new Date().toISOString()}] UNCAUGHT: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});

const config = loadConfig();
startCollector(config).catch((err) => {
  const fs = require('fs');
  fs.appendFileSync(paths.log, `[${new Date().toISOString()}] FATAL: ${err.message}\n`);
  process.exit(1);
});
