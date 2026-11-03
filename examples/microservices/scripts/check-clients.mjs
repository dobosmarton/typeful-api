/**
 * Checks that the clients committed in checkout-service match the APIs they call.
 *
 * Starts the orders service, regenerates checkout's clients from its /api-doc and fails when the
 * result differs from what is committed: someone changed the orders API without regenerating
 * the client. This is the check a caller's CI would run against the real service.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const docsUrl = 'http://localhost:3001/api/api-doc';

const waitFor = async (url, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not respond within ${timeoutMs / 1000}s`);
};

// detached: the service runs in its own process group, so it can be stopped with its children
const orders = spawn('pnpm', ['exec', 'tsx', 'src/index.ts'], {
  cwd: `${root}/orders-service`,
  env: { ...process.env, PORT: '3001' },
  stdio: 'ignore',
  detached: true,
});

try {
  await waitFor(docsUrl);
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
    {
      cwd: root,
      encoding: 'utf8',
    },
  ).trim();
  if (changed || untracked) {
    execFileSync('git', ['--no-pager', 'diff', '--', 'checkout-service/src/clients'], {
      cwd: root,
      stdio: 'inherit',
    });
    console.error(
      '\nThe generated clients are out of date. Run `pnpm generate` in examples/microservices ' +
        '(with the orders service running) and commit the result.',
    );
    process.exitCode = 1;
  } else {
    console.log('Generated clients match the orders service API.');
  }
} finally {
  process.kill(-orders.pid);
}
