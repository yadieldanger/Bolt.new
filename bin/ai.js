#!/usr/bin/env node
// Binary entry for the `ai` command. Loads compiled TS from ./dist.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, '..', 'dist', 'index.js');

if (!existsSync(distEntry)) {
  console.error('\u001b[31m✗ ai: dist/index.js not found.\u001b[0m');
  console.error('  Run "npm install" (which builds via the prepare script)');
  console.error('  or run "npm run build" explicitly.');
  process.exit(1);
}

try {
  await import(distEntry);
} catch (err) {
  console.error('\u001b[31m✗ ai: failed to start.\u001b[0m');
  console.error(err?.message || err);
  process.exit(1);
}
