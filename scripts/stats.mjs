import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const sql = readFileSync(new URL('./stats.sql', import.meta.url), 'utf8');
const activationSql = readFileSync(new URL('./activation.sql', import.meta.url), 'utf8');
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

console.log('GroupNote production statistics (Australia/Sydney)');
console.log('Stored-card/contribution counts exclude deleted data; tests may appear. Acquisition counts are cumulative.\n');

// --command returns SELECT results; --file uses Wrangler's import workflow.
function queryStatistics(query) {
  const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'groupnote-db', '--remote', '--json', `--command=${query}`], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {...process.env, WRANGLER_SEND_METRICS: 'false'}
  });
  return JSON.parse(output);
}

function readStatistics() {
  let results;
  try { results = queryStatistics(sql); }
  catch (error) {
    if (!/no such table:\s*acquisition_counts/i.test(`${error.stderr ?? ''}\n${error.stdout ?? ''}`)) throw error;
    results = queryStatistics(sql.split('-- Acquisition counters (new counters only; no historical backfill).')[0]);
  }
  const [summary, daily, funnel, acquisitionDaily] = results;
  if (!summary?.success || !daily?.success || !Array.isArray(summary.results) || !Array.isArray(daily.results)) {
    throw new SyntaxError('Invalid statistics response');
  }
  if (funnel && (!funnel.success || !acquisitionDaily?.success || !Array.isArray(funnel.results) || !Array.isArray(acquisitionDaily.results))) {
    throw new SyntaxError('Invalid acquisition response');
  }
  let activation;
  if(funnel){
    try{activation=queryStatistics(activationSql);}
    catch(error){if(!/no such table:\s*card_events/i.test(`${error.stderr ?? ''}\n${error.stdout ?? ''}`))throw error;}
    if(activation&&(activation.length!==4||activation.some(result=>!result.success||!Array.isArray(result.results))))throw new SyntaxError('Invalid activation response');
  }
  return {summary, daily, funnel, acquisitionDaily, activation};
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
  const {summary, daily, funnel, acquisitionDaily, activation} = statistics;
  for (const {metric, count} of summary.results) console.log(`${metric}: ${count}`);
  console.log('\nDaily card creation (Australia/Sydney; today is partial):');
  console.table(dailyCardCounts(daily.results));
  console.log('\nAcquisition since tracking enabled (approximate tab sessions, not unique people):');
  if (!funnel) {
    console.log('Acquisition counts unavailable: migration 0002_acquisition_counts.sql has not been applied.');
  } else if (!funnel.results.length) {
    console.log('No acquisition events recorded yet.');
  } else {
    const total = {source: 'all_sources', landing_sessions: 0, create_open_sessions: 0, cards_created: 0};
    for (const row of funnel.results) for (const key of ['landing_sessions', 'create_open_sessions', 'cards_created']) total[key] += row[key];
    console.table([total, ...funnel.results]);
    console.log('Independent counts: create-form sessions may have no landing; one session can create several cards.');
    const rows = new Map(acquisitionDaily.results.map(row => [`${row.sydney_date}:${row.source}`, row]));
    const days = dailyCardCounts([]).map(row => row.sydney_date);
    console.log('\nDaily acquisition by campaign (Australia/Sydney; today is partial):');
    console.table(days.flatMap(day => funnel.results.map(({source}) => rows.get(`${day}:${source}`) || {
      sydney_date: day, source, landing_sessions: 0, create_open_sessions: 0, cards_created: 0
    })));
  }
  console.log('\nGroupNote activation funnel');
  if(!activation){
    console.log('Unavailable: migration 0003_card_lifecycle.sql has not been applied. No historical events are backfilled.');
  }else{
    const [totals,events,outcomes,reconciliation]=activation;
    console.log('Lifetime recorded activity since lifecycle tracking began; exclusions and tracking failures can leave gaps.');
    console.log('Historical distinct-card counts include deleted cards. Currently stored cards describe a different population.');
    const labels={
      cards_created:'Cards successfully created (recorded, includes deleted)',
      cards_deleted:'Cards deleted (recorded)',
      currently_stored:'Cards currently stored (all, includes older/test/excluded cards)',
      cards_shared:'Cards with at least one share action',
      cards_opened:'Cards whose invitation was opened',
      cards_contributed:'Cards with at least one recorded contribution',
      cards_three_contributions:'Cards with 3+ recorded contributions',
      contributions:'Total recorded contributions (includes deleted cards)',
      share_actions:'Total share-button actions (events, attempted shares)',
      invitation_sessions:'Total invitation opens (approximate per-card tab sessions)'
    };
    for(const [key,label] of Object.entries(labels))console.log(`${label}: ${totals.results[0][key]}`);
    const types=['card_created','share_clicked','invite_opened','contribution_added','card_deleted'];
    const counts=new Map(types.map(type=>[type,dailyCardCounts(events.results.filter(row=>row.event===type).map(row=>({utc_hour:row.utc_hour,cards_created:row.count})))]));
    console.log('\nDaily lifecycle events (Australia/Sydney; last 14 dates; today is partial):');
    console.table(dailyCardCounts([]).map(({sydney_date},index)=>Object.fromEntries([['sydney_date',sydney_date],...types.map(type=>[type,counts.get(type)[index].cards_created])])));
    console.log('Share clicks/copies/native-share completion do not confirm delivery. Invitation opens do not identify unique people or prove a contributor is someone else.');
    if(outcomes.results.length){console.log('\nShare action outcomes (events and distinct cards):');console.table(outcomes.results);}
    const row=reconciliation.results[0];
    console.log(`\nCreation reconciliation: acquisition lifetime=${row.acquisition_creations_all_time}; lifecycle recorded=${row.lifecycle_creations}; lifecycle linked to acquisition=${row.lifecycle_creations_in_acquisition}; awaiting acquisition sync=${row.lifecycle_creations_pending_acquisition}.`);
    console.log(`Acquisition creations without a lifecycle link: ${row.acquisition_creations_all_time-row.lifecycle_creations_in_acquisition}. These may predate lifecycle tracking or reflect tracking gaps; deletion or persistence cannot be inferred from this difference.`);
    console.log('No conversion percentages: session, event, historical-card and current-record populations differ.');
  }
}
