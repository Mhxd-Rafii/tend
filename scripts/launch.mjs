import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
async function node(args) { await new Promise((resolve, reject) => { const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Launch stopped at a failed step; previous successful steps are preserved.'))) }) }
try {
  const tsx = resolve('node_modules/tsx/dist/cli.mjs'), vite = resolve('node_modules/vite/bin/vite.js'), vitest = resolve('node_modules/vitest/vitest.mjs')
  await node([tsx, 'scripts/migrate.ts'])
  await node([resolve('node_modules/typescript/bin/tsc'), '-b'])
  await node([resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.server.json'])
  await node([vitest, 'run']); await node([vitest, 'run', '--config', 'vitest.server.config.ts'])
  await node([vite, 'build']); await node(['scripts/verify-build.mjs']); await node(['scripts/check-secrets.mjs'])
  await node([tsx, 'scripts/verify-api.ts', '--direct'])
  await node(['scripts/github.mjs', 'publish'])
  await node(['scripts/deploy.mjs'])
} catch (error) { console.error(error instanceof Error ? error.message : 'Launch failed.'); process.exitCode = 1 }
