import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const sql = readFileSync(new URL('./stats.sql', import.meta.url), 'utf8');
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

console.log('GroupNote production statistics (Australia/Sydney)');
console.log('Deleted cards and their contributions are excluded; existing test cards may appear.\n');

// --command returns SELECT results; --file uses Wrangler's import workflow.
function readStatistics() {
  const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'groupnote-db', '--remote', '--json', `--command=${sql}`], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {...process.env, WRANGLER_SEND_METRICS: 'false'}
  });
  const [summary, daily] = JSON.parse(output);
  if (!summary?.success || !daily?.success || !Array.isArray(summary.results) || !Array.isArray(daily.results)) {
    throw new SyntaxError('Invalid statistics response');
  }
  return {summary, daily};
}

function failureMessage(error) {
  // Classify diagnostics in memory; never print raw CLI output or credentials.
  const details = `${error.stderr ?? ''}\n${error.stdout ?? ''}\n${error.message ?? ''}`;
  if (/Cannot find module|MODULE_NOT_FOUND/.test(details)) return 'Wrangler is missing. Run npm ci, then npm run stats.';
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|UND_ERR|network|socket/i.test(details)) return 'Could not reach Cloudflare. Check your internet connection or proxy, then run npm run stats again.';
  if (/authentication|authorization|oauth|CLOUDFLARE_API_TOKEN|not logged in|invalid.token|expired.token/i.test(details)) return 'Cloudflare authentication failed. Run npx wrangler login --device, authorize in your browser, then npm run stats.';
  if (error instanceof SyntaxError) return 'Wrangler returned an incomplete or non-JSON response. Run npm run stats again.';
  const exit = Number.isInteger(error.status) ? ` (Wrangler exit code ${error.status})` : '';
  return `Could not read statistics${exit}. Retry npm run stats; if it keeps failing, check Wrangler authentication and wrangler.toml.`;
}

function dailyCardCounts(rows, now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const dateKey = date => {
    const parts = formatter.formatToParts(date);
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  };
  const today = dateKey(now);
  const counts = new Map();
  for (let ago = 13; ago >= 0; ago--) {
    // UTC arithmetic here steps calendar labels, not Sydney midnight instants.
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - ago);
    counts.set(day.toISOString().slice(0, 10), 0);
  }
  for (const {utc_hour, cards_created} of rows) {
    const day = dateKey(new Date(`${utc_hour.replace(' ', 'T')}Z`));
    if (counts.has(day)) counts.set(day, counts.get(day) + cards_created);
  }
  return Array.from(counts, ([sydney_date, cards_created]) => ({sydney_date, cards_created}));
}

let statistics;
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    statistics = readStatistics();
    break;
  } catch (error) {
    if (attempt === 0) {
      console.error('Statistics request failed; retrying once (read-only SELECT queries).');
    } else {
      console.error(failureMessage(error));
      process.exitCode = 1;
    }
  }
}

if (statistics) {
  const {summary, daily} = statistics;
  for (const {metric, count} of summary.results) console.log(`${metric}: ${count}`);
  console.log('\nDaily card creation (Australia/Sydney; today is partial):');
  console.table(dailyCardCounts(daily.results));
}
