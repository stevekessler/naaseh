import { spawn, spawnSync } from 'node:child_process';
import console from 'node:console';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';

/* global fetch */

const defaultDriver = '/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver';
const driverPath = process.env.NAASEH_SAFARI_DRIVER || defaultDriver;
const browserName = driverPath.includes('Safari Technology Preview')
  ? 'Safari Technology Preview'
  : 'Safari';
const children = new Set();

function fail(message) {
  throw new Error(message);
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      server.close(() => (port ? resolve(port) : reject(new Error('No local port available.'))));
    });
  });
}

function start(command, args) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function waitFor(url, label, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local process is still starting.
    }
    await delay(250);
  }
  fail(`${label} did not become ready.`);
}

async function webdriver(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.value?.error)
    fail(
      `Safari WebDriver rejected ${method} ${new URL(url).pathname}: ${result?.value?.message || response.status}`,
    );
  return result.value;
}

async function main() {
  if (process.platform !== 'darwin') fail('Safari Technology Preview smoke tests require macOS.');
  if (!existsSync(driverPath))
    fail(
      `Safari Technology Preview driver was not found at ${driverPath}. Install Safari Technology Preview or set NAASEH_SAFARI_DRIVER.`,
    );

  const build = spawnSync(
    'npm',
    ['exec', '-w', '@naaseh/web', 'vite', 'build', '--', '--mode', 'test'],
    {
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (build.status !== 0) fail('The Safari smoke-test web build failed.');

  const [webPort, driverPort] = await Promise.all([availablePort(), availablePort()]);
  start('npm', [
    'exec',
    '-w',
    '@naaseh/web',
    'vite',
    'preview',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    String(webPort),
    '--strictPort',
  ]);
  const driver = start(driverPath, ['--diagnose', '--port', String(driverPort)]);
  let driverLog = '';
  const captureDriverLog = (value) => {
    driverLog = `${driverLog}${String(value)}`.slice(-12_000);
  };
  driver.stdout.on('data', captureDriverLog);
  driver.stderr.on('data', captureDriverLog);

  await waitFor(`http://127.0.0.1:${webPort}`, 'Vite preview');
  try {
    await waitFor(
      `http://127.0.0.1:${driverPort}/status`,
      'Safari Technology Preview WebDriver',
      40,
    );
  } catch (error) {
    fail(
      `${error.message} Run the Technology Preview driver once and enable Settings > Developer > Allow remote automation. ${driverLog.trim()}`,
    );
  }

  let session;
  try {
    session = await webdriver(`http://127.0.0.1:${driverPort}/session`, 'POST', {
      capabilities: { alwaysMatch: { browserName } },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Safari session creation failed.';
    const guidance = message.includes('timed out while connecting to a Safari instance')
      ? 'Remote automation was accepted, but Safari never registered the session. No Na’aseh navigation or assertion ran. Fully quit Safari Technology Preview and retry once after restarting macOS. If the same 30-second timeout remains, record a native WebDriver environmental blocker.'
      : `Quit Safari Technology Preview completely, run "${driverPath}" --enable once, confirm Settings > Developer > Allow remote automation remains enabled, and retry.`;
    fail(
      `${message}${driverLog.trim() ? `\nSafari diagnostic log:\n${driverLog.trim()}` : ''}\n${guidance} Native logs are in ~/Library/Logs/com.apple.WebDriver/.`,
    );
  }
  const sessionId = session.sessionId;
  if (!sessionId) fail('Safari WebDriver did not return a session identifier.');
  const endpoint = `http://127.0.0.1:${driverPort}/session/${sessionId}`;

  try {
    const appUrl = `http://127.0.0.1:${webPort}`;
    await webdriver(`${endpoint}/url`, 'POST', { url: appUrl });
    await webdriver(`${endpoint}/execute/sync`, 'POST', {
      script: 'sessionStorage.clear(); localStorage.clear(); return true;',
      args: [],
    });
    await webdriver(`${endpoint}/url`, 'POST', { url: appUrl });
    const result = await webdriver(`${endpoint}/execute/sync`, 'POST', {
      script: `
        const username = document.querySelector('input[name="username"]');
        const password = document.querySelector('input[name="password"]');
        const logo = document.querySelector('img[alt*="Na\\'aseh"]');
        const button = document.querySelector('button[type="submit"]');
        const card = document.querySelector('.login-card');
        const rect = card?.getBoundingClientRect();
        return {
          ready: document.readyState,
          hasUsername: Boolean(username),
          passwordType: password?.type,
          hasLogo: Boolean(logo),
          buttonText: button?.textContent?.trim(),
          responsive: Boolean(rect && rect.width <= window.innerWidth && rect.left >= 0),
          inputCount: document.querySelectorAll('.login-card input').length,
        };
      `,
      args: [],
    });
    if (!['interactive', 'complete'].includes(result.ready))
      fail('The page did not finish loading.');
    if (!result.hasUsername || result.passwordType !== 'password' || !result.hasLogo)
      fail('The branded username/password controls were not rendered correctly.');
    if (result.buttonText !== 'Sign in' || result.inputCount !== 2)
      fail('The login screen contains unexpected controls.');
    if (!result.responsive) fail('The login card exceeds the Safari viewport.');
    console.info('Safari Technology Preview smoke test passed.');
  } finally {
    await webdriver(endpoint, 'DELETE').catch(() => undefined);
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Safari Technology Preview smoke test failed.',
  );
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill('SIGTERM');
}
