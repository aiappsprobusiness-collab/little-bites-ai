#!/usr/bin/env node
/**
 * Deploy Supabase Edge Function with extended timeout.
 * Use when "Bundle generation timed out" occurs (default CLI/API timeout may be too short).
 *
 * Usage:
 *   node scripts/deploy-function.mjs [function-name]
 *   node scripts/deploy-function.mjs deepseek-chat
 *
 * Env:
 *   DEPLOY_TIMEOUT_MS  - timeout in ms (default: 300000 = 5 min)
 *   USE_DOCKER        - set to "1" to bundle with Docker (avoids server-side bundle timeout)
 */

import { spawn } from 'child_process';

const DEFAULT_TIMEOUT_MS = 300000; // 5 min
const timeoutMs = Number(process.env.DEPLOY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
const functionName = process.argv[2] || 'deepseek-chat';
const useDocker = process.env.USE_DOCKER === '1';

const args = ['supabase', 'functions', 'deploy', functionName];
if (useDocker) {
  args.push('--use-docker');
} else {
  args.push('--use-api');
}

console.log(`Deploying "${functionName}" (timeout: ${timeoutMs / 1000}s, use-docker: ${useDocker})...`);

const child = spawn('npx', args, {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
});

let killed = false;
const timer = setTimeout(() => {
  killed = true;
  child.kill('SIGTERM');
  console.error(`\nDeploy timed out after ${timeoutMs / 1000}s. Try: DEPLOY_TIMEOUT_MS=600000 node scripts/deploy-function.mjs ${functionName}`);
  console.error('Or use Docker bundling: USE_DOCKER=1 node scripts/deploy-function.mjs ' + functionName);
  process.exit(124);
}, timeoutMs);

child.on('close', (code) => {
  clearTimeout(timer);
  if (!killed) {
    process.exit(code ?? 0);
  }
});

child.on('error', (err) => {
  clearTimeout(timer);
  console.error(err);
  process.exit(1);
});
