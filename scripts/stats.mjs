import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const sql = readFileSync(new URL('./stats.sql', import.meta.url), 'utf8');
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

console.log('GroupNote production statistics (UTC)');
console.log('Deleted cards and their contributions are excluded; existing test cards may appear.\n');

// --command returns SELECT results; --file uses Wrangler's import workflow.
try {
  const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'groupnote-db', '--remote', '--json', `--command=${sql}`], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {...process.env, WRANGLER_SEND_METRICS: 'false'}
  });
  const [summary, daily] = JSON.parse(output);
  if (!summary?.success || !daily?.success) throw new Error('Statistics query failed');
  for (const {metric, count} of summary.results) console.log(`${metric}: ${count}`);
  console.log('\nDaily card creation (UTC; today is partial):');
  console.table(daily.results);
} catch {
  console.error('Could not read statistics. Check wrangler.toml and authenticate with npx wrangler login (or npx wrangler login --device). Install missing dependencies with npm ci.');
  process.exitCode = 1;
}
