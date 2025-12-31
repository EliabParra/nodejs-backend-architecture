import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createInterface } from 'node:readline';

function isTruthy(value) {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

function resolveMaybeRelative(p, baseDir) {
  const raw = String(p ?? '').trim();
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(baseDir, raw);
}

function ensureFrontendPath(frontendPath) {
  if (!frontendPath) {
    throw new Error('FRONTEND_PATH is missing.');
  }

  const pkg = path.join(frontendPath, 'package.json');
  if (!fs.existsSync(pkg)) {
    throw new Error(
      `FRONTEND_PATH does not look like a Node frontend (package.json not found): ${pkg}`
    );
  }
}

async function promptForFrontendPathIfMissing(backendDir) {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const current = resolveMaybeRelative(process.env.FRONTEND_PATH, backendDir);
  if (current) return current;

  const help =
    'FRONTEND_PATH is required for `npm run full`.\n' +
    'Set it in .env to your frontend folder (must contain package.json).\n' +
    'Example: FRONTEND_PATH=..\\frontend-angular-repo\n';

  if (!interactive) {
    console.error(help);
    process.exit(1);
  }

  console.log(help);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question('Enter FRONTEND_PATH: ', (val) => resolve(val));
  });
  rl.close();

  const entered = String(answer ?? '').trim();
  if (!entered) {
    console.error('FRONTEND_PATH is required to run `npm run full`.');
    process.exit(1);
  }

  process.env.FRONTEND_PATH = entered;
  return resolveMaybeRelative(entered, backendDir);
}

function startProcess(name, cmd, args, options) {
  const child = spawn(cmd, args, { ...options, stdio: 'inherit', shell: false });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`);
    } else {
      console.log(`[${name}] exited with code ${code}`);
    }
  });
  return child;
}

function startNpmScript(name, scriptName, cwd) {
  const isWin = process.platform === 'win32';

  if (isWin) {
    const comspec = process.env.ComSpec || 'cmd.exe';
    // Use cmd.exe explicitly so .cmd shims work, without Node's shell=true.
    return startProcess(name, comspec, ['/d', '/s', '/c', 'npm', 'run', scriptName], {
      cwd,
      env: process.env,
    });
  }

  return startProcess(name, 'npm', ['run', scriptName], { cwd, env: process.env });
}

const backendDir = process.cwd();
const frontendPath = await promptForFrontendPathIfMissing(backendDir);
const frontendScript = String(process.env.FRONTEND_SCRIPT ?? 'start').trim() || 'start';
const backendScript = String(process.env.BACKEND_SCRIPT ?? 'dev').trim() || 'dev';
const keepAlive = isTruthy(process.env.FULL_KEEP_ALIVE);

ensureFrontendPath(frontendPath);

console.log(`[full] backend: ${backendDir} (npm run ${backendScript})`);
console.log(`[full] frontend: ${frontendPath} (npm run ${frontendScript})`);

const backend = startNpmScript('backend', backendScript, backendDir);
const frontend = startNpmScript('frontend', frontendScript, frontendPath);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    backend.kill('SIGTERM');
  } catch {}
  try {
    frontend.kill('SIGTERM');
  } catch {}

  // Give processes a moment to stop.
  setTimeout(() => process.exit(code), 250);
}

backend.on('exit', (code) => {
  if (keepAlive) return;
  shutdown(typeof code === 'number' ? code : 0);
});
frontend.on('exit', (code) => {
  if (keepAlive) return;
  shutdown(typeof code === 'number' ? code : 0);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
