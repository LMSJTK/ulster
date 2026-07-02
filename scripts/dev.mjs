// Runs the API server and the Vite dev server together for local development.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', '@redearl/server'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', '@redearl/web'], { stdio: 'inherit' }),
];

function shutdown() {
  for (const p of procs) p.kill('SIGINT');
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const p of procs) p.on('exit', (code) => {
  if (code && code !== 0) {
    shutdown();
    process.exitCode = code;
  }
});
