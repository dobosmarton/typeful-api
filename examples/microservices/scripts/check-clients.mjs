/**
 * Checks that the clients committed in checkout-service match the APIs they call.
 *
 * Starts the orders service, regenerates checkout's clients from its /api-doc and fails when the
 * result differs from what is committed: someone changed the orders API without regenerating
 * the client. This is the check a caller's CI would run against the real service.
 *
 * The orders service must use port 3001, the URL the committed client was generated from.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 3001;
const docsUrl = `http://localhost:${port}/api/api-doc`;

const assertPortFree = () =>
  new Promise((resolve, reject) => {
    const probe = createServer()
      .once('error', () =>
        reject(new Error(`Port ${port} is in use. Stop whatever runs there and try again.`)),
      )
      .once('listening', () => probe.close(resolve))
      .listen(port);
  });

const waitFor = async (url, service, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (service.exitCode !== null) throw new Error('The orders service exited during startup');
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not respond within ${timeoutMs / 1000}s`);
};

try {
  await assertPortFree();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// detached: the service runs in its own process group, so it can be stopped with its children
const orders = spawn('pnpm', ['exec', 'tsx', 'src/index.ts'], {
  cwd: `${root}/orders-service`,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
  detached: true,
});

try {
  await waitFor(docsUrl, orders);
  execFileSync('pnpm', ['--filter', '@example/checkout-service', 'generate:clients'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ORDERS_DOCS_URL: docsUrl },
  });

  const clients = ['--', 'checkout-service/src/clients'];
  const changed = spawnSync('git', ['diff', '--quiet', ...clients], { cwd: root }).status !== 0;
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', ...clients],
    { cwd: root, encoding: 'utf8' },
  ).trim();

  if (changed || untracked) {
    execFileSync('git', ['--no-pager', 'diff', ...clients], { cwd: root, stdio: 'inherit' });
    console.error(
      '\nThe generated clients are out of date. Run `pnpm generate` in examples/microservices ' +
        '(with the orders service running) and commit the result.',
    );
    process.exitCode = 1;
  } else {
    console.log('Generated clients match the orders service API.');
  }
} finally {
  if (orders.exitCode === null) {
    try {
      process.kill(-orders.pid);
    } catch {
      // already stopped
    }
  }
}
