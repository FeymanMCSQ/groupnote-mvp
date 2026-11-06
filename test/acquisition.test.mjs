import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import worker from '../src/worker.js';
import {sqliteBinding} from './d1.mjs';

const initial = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0002_acquisition_counts.sql', import.meta.url), 'utf8');
const appCode = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const lifecycleMigration = readFileSync(new URL('../migrations/0003_card_lifecycle.sql', import.meta.url), 'utf8');

function backend({migrated = true, lifecycle = false, failTracking = false} = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(initial);
  if (migrated) db.exec(migration);
  if (lifecycle) db.exec(lifecycleMigration);
  const tasks = [];
  const env = {RATE_SALT: 'test-only', DB: sqliteBinding(db, sql => failTracking && sql.includes('acquisition_counts'))};
  return {db, env, async send(path, method = 'GET', body, headers = {}) {
    const response = await worker.fetch(new Request(`https://groupnote.test${path}`, {
      method, headers: {'content-type': 'application/json', origin: 'https://groupnote.test', ...headers},
      body: body === undefined ? undefined : JSON.stringify(body)
    }), env, {waitUntil(task) { tasks.push(task); }});
    await Promise.all(tasks.splice(0));
    return response;
  }};
}

test('migration adds only counters and preserves existing cards and messages', async () => {
  const {db, send} = backend({migrated: false});
  const created = await send('/api/cards', 'POST', {title: 'Fixture', recipient: 'Fixture', creator: 'Fixture'});
  const {id} = await created.json();
  assert.equal((await send(`/api/cards/${id}/messages`, 'POST', {author: 'Fixture', body: 'Fixture message'})).status, 201);
  db.exec(migration);
  db.exec(migration); // Also safe for the local demo's startup migration loading.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM acquisition_counts').get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA table_info(acquisition_counts)').all().map(row => row.name), ['day', 'source', 'event', 'count']);
});

test('ingestion stores only daily aggregates and allowed campaign labels, without quota/IP tracking', async () => {
  const {db, send} = backend();
  for (let i = 0; i < 2; i++) assert.equal((await send('/api/acquisition', 'POST', {event: 'landing', source: 'uni_email'})).status, 204);
  assert.equal((await send('/api/acquisition', 'POST', {event: 'create_open', source: 'person@example.test'})).status, 204);
  const rows = db.prepare('SELECT * FROM acquisition_counts ORDER BY event').all();
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.event === 'landing').count, 2);
  assert.equal(rows.find(row => row.event === 'create_open').source, 'other');
  assert.match(rows[0].day, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!JSON.stringify(rows).includes('person@example.test'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM quotas').get().n, 0);
});

test('ingestion is write-only, same-origin, bounded, and rejects extra/private fields', async () => {
  const {db, send} = backend();
  assert.equal((await send('/api/acquisition')).status, 405);
  assert.equal((await send('/api/acquisition', 'POST', {event: 'landing'}, {origin: 'https://elsewhere.test'})).status, 403);
  assert.equal((await send('/api/acquisition', 'POST', {event: 'landing'}, {'content-type': 'text/plain'})).status, 415);
  assert.equal((await send('/api/acquisition', 'POST', {event: 'card_created'})).status, 400);
  assert.equal((await send('/api/acquisition', 'POST', {event: 'landing', ownerKey: 'private-fixture', email: 'fixture@example.test'})).status, 400);
  assert.equal((await send('/api/acquisition', 'POST', {event: 'landing', source: 'x'.repeat(300)})).status, 413);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM acquisition_counts').get().n, 0);
});

test('only successful card creation increments its source counter; guest contributions stay separate', async () => {
  const {db, send} = backend();
  assert.equal((await send('/api/cards', 'POST', {acquisitionSource: 'uni_email'})).status, 400);
  const created = await send('/api/cards', 'POST', {title: 'Fixture', recipient: 'Fixture', creator: 'Fixture', acquisitionSource: 'uni_email'});
  assert.equal(created.status, 201);
  const {id} = await created.json();
  assert.equal((await send(`/api/cards/${id}/messages`, 'POST', {author: 'Fixture', body: 'Guest fixture'})).status, 201);
  const rows = db.prepare('SELECT source,event,count FROM acquisition_counts').all();
  assert.deepEqual(rows.map(row => ({...row})), [{source: 'uni_email', event: 'card_created', count: 1}]);
});

for (const options of [{migrated: false}, {failTracking: true}]) {
  test(`tracking storage failure never blocks creation or contributions: ${JSON.stringify(options)}`, async () => {
    const {send} = backend(options);
    assert.equal((await send('/api/acquisition', 'POST', {event: 'landing', source: 'uni_email'})).status, 204);
    const created = await send('/api/cards', 'POST', {title: 'Fixture', recipient: 'Fixture', creator: 'Fixture', acquisitionSource: 'uni_email'});
    assert.equal(created.status, 201);
    const {id} = await created.json();
    assert.equal((await send(`/api/cards/${id}/messages`, 'POST', {author: 'Fixture', body: 'Guest fixture'})).status, 201);
    const card = await (await send(`/api/cards/${id}`)).json();
    assert.equal(card.messages.length, 1);
  });
}

test('a stalled acquisition write does not delay card creation or guest contributions', {timeout: 2000}, async () => {
  const {env} = backend({lifecycle:true});
  const batch = env.DB.batch.bind(env.DB);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  env.DB.batch = statements => statements.some(statement=>statement.sql.includes('acquisition_counts')) ? pending : batch(statements);
  const tasks = [];
  const created = await worker.fetch(new Request('https://groupnote.test/api/cards', {method: 'POST', body: JSON.stringify({title: 'Fixture', recipient: 'Fixture', creator: 'Fixture'})}), env, {waitUntil: task => tasks.push(task)});
  assert.equal(created.status, 201);
  const {id} = await created.json();
  const message = await worker.fetch(new Request(`https://groupnote.test/api/cards/${id}/messages`, {method: 'POST', body: JSON.stringify({author: 'Fixture', body: 'Guest fixture'})}), env);
  assert.equal(message.status, 201);
  release({meta: {changes: 0}});
  await Promise.all(tasks);
});

function browser({query = '', storage = new Map(), preferences = new Map(), blocked = false, preferencesBlocked = false, fetchImpl, brokenTracker = false, missingCard = false} = {}) {
  const elements = new Map(), requests = [], eventRequests = [], apiRequests = [], apiBodies = [], messages = [];
  const id = 'a'.repeat(24);
  function element(selector) {
    if (!elements.has(selector)) {
      const classes = new Set(['#createView', '#cardView', '#sampleView'].includes(selector) ? ['hidden'] : []);
      elements.set(selector, {
        handlers: {}, fields: [], value: '', firstChild: {textContent: ''}, elements: {theme: {value: 'peach'}},
        classList: {toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name)},
        addEventListener(name, handler) { this.handlers[name] = handler; }, reset() {}, replaceChildren() {}, append() {}
      });
    }
    return elements.get(selector);
  }
  const location = {search: query, hash: '', pathname: '/', protocol: 'https:', origin: 'https://groupnote.test'};
  const context = vm.createContext({
    URLSearchParams, URL, Date, Promise, crypto, Uint8Array,
    Intl: brokenTracker ? {DateTimeFormat: function() { throw new Error('Analytics initialization failed'); }} : Intl,
    location, history: {pushState(state, unused, target) { const url = new URL(target, location.origin); Object.assign(location, {search: url.search, hash: url.hash}); }},
    window: {scrollTo() {}, addEventListener() {}, prompt() {}, confirm:()=>true},
    document: {querySelector: element, querySelectorAll: () => [], createElement: () => ({append() {}})},
    localStorage: {
      getItem(key) { if (preferencesBlocked) throw new Error('Storage blocked'); return preferences.get(key) ?? null; },
      setItem(key, value) { if (preferencesBlocked) throw new Error('Storage blocked'); preferences.set(key, value); },
      removeItem(key) { if (preferencesBlocked) throw new Error('Storage blocked'); preferences.delete(key); }
    },
    sessionStorage: {
      getItem(key) { if (blocked) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); }
    },
    navigator: {}, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    FormData: class {constructor(form) { this.fields = form.fields; } [Symbol.iterator]() { return this.fields[Symbol.iterator](); }},
    fetch(url, options = {}) {
      if (url === '/api/acquisition') {
        requests.push({url, ...options});
        return fetchImpl ? fetchImpl(url, options) : Promise.resolve({status: 204});
      }
      if(url.endsWith('/events')){eventRequests.push({url,...options});return fetchImpl?fetchImpl(url,options):Promise.resolve({status:204});}
      apiRequests.push(url);
      apiBodies.push({url, body: options.body ? JSON.parse(options.body) : undefined});
      if (url === '/api/cards') return Promise.resolve({ok: true, json: async () => ({id, ownerKey: 'fixture-key'})});
      if (url.endsWith('/messages')) { messages.push({author: 'Fixture', body: 'Guest fixture', emoji: ''}); return Promise.resolve({ok: true, json: async () => ({ok: true})}); }
      if(missingCard)return Promise.resolve({ok:false,json:async()=>({error:'Card not found'})});
      return Promise.resolve({ok: true, json: async () => ({id, title: 'Fixture', recipient: 'Fixture', theme: 'peach', occasion: 'Birthday', intro: '', is_closed: false, messages})});
    }
  });
  vm.runInContext(appCode, context);
  return {context, requests, eventRequests, tracker: vm.runInContext('acquisition', context), element, location, id, messages, apiRequests, apiBodies};
}

test('browser opt-out persists across new tab sessions, without affecting other browsers, and can be reversed', () => {
  const preferences = new Map();
  const optedOut = browser({query: '?analytics=off&src=uni_email', preferences});
  optedOut.tracker.track('create');
  assert.equal(optedOut.requests.length, 0);
  assert.equal(preferences.get('groupnote-analytics-excluded'), '1');
  assert.match(optedOut.element('#toast').textContent, /excluded in this browser/);
  const nextSession = browser({preferences});
  nextSession.tracker.track('create');
  assert.equal(nextSession.requests.length, 0);
  assert.equal(browser().requests.length, 1);
  const enabled = browser({query: '?analytics=on', preferences});
  assert.equal(enabled.requests.length, 1);
  assert.equal(preferences.has('groupnote-analytics-excluded'), false);
  assert.equal(browser({preferences}).requests.length, 1);
});

for (const mode of ['normal', 'blocked-preferences', 'broken-tracker']) {
  test(`excluded browser can create cards and contribute without acquisition counts: ${mode}`, async () => {
    const client = browser({query: '?analytics=off&src=uni_email', preferencesBlocked: mode === 'blocked-preferences', brokenTracker: mode === 'broken-tracker'});
    vm.runInContext('nav("create")', client.context);
    const create = client.element('#createForm');
    create.fields = [['title', 'Fixture'], ['recipient', 'Fixture'], ['creator', 'Fixture']];
    await create.handlers.submit({preventDefault() {}});
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(client.location.search.includes(`card=${client.id}`));
    assert.equal(client.requests.length, 0);
    const payload = client.apiBodies.find(request => request.url === '/api/cards').body;
    assert.equal(payload.excludeFromAnalytics, true);
    const {db, send} = backend();
    const created = await send('/api/cards', 'POST', payload);
    assert.equal(created.status, 201);
    const {id} = await created.json();
    assert.equal((await send(`/api/cards/${id}/messages`, 'POST', {author: 'Fixture', body: 'Guest fixture'})).status, 201);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM acquisition_counts').get().n, 0);
    if (mode === 'blocked-preferences') assert.match(client.element('#toast').textContent, /Your card is ready/);
    db.close();
  });
}

test('client deduplicates home/create events across route changes and reloads in the tab session', () => {
  const storage = new Map();
  const first = browser({query: '?src=uni_email', storage});
  for (let i = 0; i < 3; i++) { first.tracker.track('home'); first.tracker.track('create'); }
  assert.equal(first.requests.length, 2);
  for (const request of first.requests) {
    assert.deepEqual(Object.keys(JSON.parse(request.body)).sort(), ['event', 'source']);
    assert.equal(JSON.parse(request.body).source, 'uni_email');
    assert.equal(request.referrerPolicy, 'no-referrer');
    assert.equal(request.credentials, 'omit');
  }
  const reloaded = browser({storage});
  reloaded.tracker.track('home'); reloaded.tracker.track('create');
  assert.equal(reloaded.requests.length, 0);
  assert.equal(reloaded.tracker.source, 'uni_email');
});

test('shared cards and samples emit no visits; unknown source values never leave the browser', () => {
  const shared = browser({query: '?card=private-fixture&key=private-fixture&src=uni_email'});
  shared.tracker.track('card'); shared.tracker.track('home'); shared.tracker.track('sample');
  assert.equal(shared.requests.length, 0);
  assert.equal(shared.tracker.source, 'direct');
  const unknown = browser({query: '?src=person%40example.test'});
  unknown.tracker.track('home');
  assert.equal(JSON.parse(unknown.requests[0].body).source, 'other');
});

test('blocked session storage and failed fetch remain non-fatal and deduplicate in memory', async () => {
  for (const fetchImpl of [() => Promise.reject(new Error('Offline')), () => { throw new Error('Blocked'); }]) {
    const {tracker, requests} = browser({query: '?src=uni_email', blocked: true, fetchImpl});
    assert.doesNotThrow(() => { tracker.track('home'); tracker.track('home'); tracker.track('create'); });
    await Promise.resolve();
    assert.equal(requests.length, 2);
    assert.equal(tracker.source, 'uni_email');
  }
});

test('existing stats remain SELECT-only and correctly aggregate the acquisition funnel', async () => {
  const {db, send} = backend();
  await send('/api/acquisition', 'POST', {event: 'landing', source: 'uni_email'});
  await send('/api/acquisition', 'POST', {event: 'create_open', source: 'uni_email'});
  const created = await send('/api/cards', 'POST', {title: 'Fixture', recipient: 'Fixture', creator: 'Fixture', acquisitionSource: 'uni_email'});
  const {id} = await created.json();
  await send(`/api/cards/${id}/messages`, 'POST', {author: 'Fixture', body: 'Guest fixture'});
  const sql = readFileSync(new URL('../scripts/stats.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
  db.exec('PRAGMA query_only=ON');
  const [summary, , funnel, daily] = sql.split(';').map(part => part.trim()).filter(Boolean).map(query => db.prepare(query).all());
  assert.deepEqual(summary.map(row => row.count), [1, 1, 1, 0]);
  assert.deepEqual(funnel.map(row => ({...row})), [{source: 'uni_email', landing_sessions: 1, create_open_sessions: 1, cards_created: 1}]);
  assert.equal(daily.length, 1);
});

async function statsOutput(db) {
  const logs = [], tables = [], calls = [];
  const processStub = {execPath: process.execPath, env: {}, exitCode: undefined};
  const context = vm.createContext({URL, process: processStub, console: {log: text => logs.push(text), error: text => logs.push(text), table: rows => tables.push(JSON.parse(JSON.stringify(rows)))}});
  const url = new URL('../scripts/stats.mjs', import.meta.url);
  const module = new vm.SourceTextModule(readFileSync(url, 'utf8'), {context, identifier: url.href, initializeImportMeta(meta) { meta.url = url.href; }});
  const stubs = {
    'node:fs': {readFileSync}, 'node:url': {fileURLToPath},
    'node:child_process': {execFileSync(exe, args) {
      assert.ok(args.includes('--remote')); assert.ok(!args.includes('--file'));
      const sql = args.find(arg => arg.startsWith('--command=')).slice('--command='.length);
      calls.push(sql);
      try { return JSON.stringify(sql.replace(/--[^\n]*/g, '').split(';').map(query => query.trim()).filter(Boolean).map(query => ({success: true, results: db.prepare(query).all()}))); }
      catch (error) { throw Object.assign(new Error('Query failed'), {stderr: error.message}); }
    }}
  };
  db.exec('PRAGMA query_only=ON');
  await module.link(name => new vm.SyntheticModule(Object.keys(stubs[name]), function() { for (const [key, value] of Object.entries(stubs[name])) this.setExport(key, value); }, {context}));
  await module.evaluate();
  assert.notEqual(processStub.exitCode, 1);
  return {logs, tables, calls};
}

test('stats command renders campaign funnel and 14 daily rows with zeros', async () => {
  const {db, send} = backend();
  await send('/api/acquisition', 'POST', {event: 'landing', source: 'uni_email'});
  await send('/api/acquisition', 'POST', {event: 'create_open', source: 'uni_email'});
  const output = await statsOutput(db);
  assert.equal(output.tables.length, 3);
  assert.deepEqual(output.tables[1][0], {source: 'all_sources', landing_sessions: 1, create_open_sessions: 1, cards_created: 0});
  assert.equal(output.tables[2].length, 14);
  assert.equal(output.tables[2].reduce((sum, row) => sum + row.landing_sessions, 0), 1);
  assert.match(output.logs.join('\n'), /not unique people/);
});

test('stats command handles an empty acquisition table and a missing migration', async () => {
  const empty = await statsOutput(backend().db);
  assert.ok(empty.logs.includes('No acquisition events recorded yet.'));
  const old = await statsOutput(backend({migrated: false}).db);
  assert.equal(old.calls.length, 2);
  assert.ok(!old.calls[1].includes('FROM acquisition_counts'));
  assert.ok(old.logs.some(line => line.includes('migration 0002_acquisition_counts.sql has not been applied')));
  assert.ok(old.logs.includes('Total currently stored cards: 0'));
});

// Exercise the real app's create and contribution handlers with analytics failures.
for (const mode of ['offline', 'blocked-storage', 'broken-tracker']) {
  test(`card and guest forms still work with tracking ${mode}`, async () => {
    const {context, element, location, id, messages, apiRequests} = browser({
      query: '?src=uni_email', blocked: mode === 'blocked-storage', brokenTracker: mode === 'broken-tracker',
      fetchImpl: () => Promise.reject(new Error('Tracking offline'))
    });
    vm.runInContext('nav("create")', context);
    const create = element('#createForm');
    create.fields = [['title', 'Fixture'], ['recipient', 'Fixture'], ['creator', 'Fixture']];
    await create.handlers.submit({preventDefault() {}});
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(location.search.includes(`card=${id}`));
    assert.equal(element('#createSubmit').disabled, false);
    location.search = `?card=${id}`;
    vm.runInContext('routes()', context);
    const form = element('#messageForm'); form.fields = [['author', 'Fixture'], ['body', 'Guest fixture']];
    await form.handlers.submit({preventDefault() {}, currentTarget: form});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.length, 1);
    assert.equal(element('#postMessage').disabled, false);
    assert.ok(apiRequests.includes('/api/cards'));
    assert.ok(apiRequests.includes(`/api/cards/${id}/messages`));
  });
}

const cardInput={title:'Private fixture title',recipient:'Private recipient',creator:'Private organiser',acquisitionSource:'uni_email'};
const noteInput={author:'Private contributor',body:'Private message contents'};
const rowsFor=(db,event)=>db.prepare('SELECT * FROM card_events WHERE event=?').all(event);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('lifecycle migration is additive, repeatable, and fabricates no historical events',async()=>{
  const {db,send}=backend();
  const {id}=await (await send('/api/cards','POST',cardInput)).json();
  await send(`/api/cards/${id}/messages`,'POST',noteInput);
  const prior=db.prepare('SELECT * FROM acquisition_counts').all();
  db.exec(lifecycleMigration);db.exec(lifecycleMigration);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1);
  assert.deepEqual(db.prepare('SELECT * FROM acquisition_counts').all(),prior);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_events').get().n,0);
});

test('creation and concurrent retries persist one card, one lifecycle event and one acquisition count',async()=>{
  const {db,send}=backend({lifecycle:true});
  const payload={...cardInput,requestId:'1'.repeat(48)};
  const responses=await Promise.all([send('/api/cards','POST',payload),send('/api/cards','POST',payload)]);
  for(const response of responses)assert.equal(response.status,201);
  const first=await responses[0].json();
  assert.deepEqual(await responses[1].json(),first);
  assert.deepEqual(await (await send('/api/cards','POST',payload)).json(),first);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n,1);
  const events=rowsFor(db,'card_created');assert.equal(events.length,1);
  assert.notEqual(events[0].analytics_id,first.id);
  assert.equal(events[0].source,'uni_email');
  assert.equal(events[0].occurred_at,db.prepare('SELECT created_at FROM cards').get().created_at);
  assert.equal(events[0].acquisition_counted,1);
  assert.equal(db.prepare("SELECT count FROM acquisition_counts WHERE event='card_created'").get().count,1);
});

test('invalid creation and a rejected operational insert record no success events',async()=>{
  const {db,send}=backend({lifecycle:true});
  assert.equal((await send('/api/cards','POST',{...cardInput,title:''})).status,400);
  db.exec("CREATE TRIGGER reject_creation BEFORE INSERT ON cards BEGIN SELECT RAISE(ABORT,'Operational failure fixture'); END;");
  assert.equal((await send('/api/cards','POST',cardInput)).status,500);
  assert.equal(rowsFor(db,'card_created').length,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM acquisition_counts').get().n,0);
});

test('contribution retries insert once and failures record no successful contributions',async()=>{
  const {db,send}=backend({lifecycle:true});
  const {id,ownerKey}=await (await send('/api/cards','POST',cardInput)).json();
  const payload={...noteInput,requestId:'2'.repeat(48)};
  const replies=await Promise.all([send(`/api/cards/${id}/messages`,'POST',payload),send(`/api/cards/${id}/messages`,'POST',payload)]);
  assert.equal(replies[0].status,201);assert.deepEqual(await replies[0].json(),await replies[1].json());
  assert.equal(rowsFor(db,'contribution_added').length,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1);
  assert.equal((await send(`/api/cards/${id}/messages`,'POST',{author:'',body:'x'})).status,400);
  await send(`/api/cards/${id}/close`,'POST',{ownerKey,closed:true});
  assert.equal((await send(`/api/cards/${id}/messages`,'POST',{...noteInput,requestId:'3'.repeat(48)})).status,409);
  assert.equal((await send(`/api/cards/${'f'.repeat(24)}/messages`,'POST',noteInput)).status,409);
  assert.equal(rowsFor(db,'contribution_added').length,1);
});

test('deletion retains content-free creation/contribution history and prevents create retry resurrection',async()=>{
  const {db,send}=backend({lifecycle:true});
  const payload={...cardInput,requestId:'4'.repeat(48)};
  const {id,ownerKey}=await (await send('/api/cards','POST',payload)).json();
  await send(`/api/cards/${id}/messages`,'POST',noteInput);
  assert.equal((await send(`/api/cards/${id}`,'DELETE',{ownerKey:'wrong'})).status,403);
  assert.equal(rowsFor(db,'card_deleted').length,0);
  assert.equal((await send(`/api/cards/${id}`,'DELETE',{ownerKey})).status,200);
  assert.equal((await send(`/api/cards/${id}`,'DELETE',{ownerKey})).status,403);
  assert.equal((await send('/api/cards','POST',payload)).status,410);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_analytics').get().n,0);
  for(const event of ['card_created','contribution_added','card_deleted'])assert.equal(rowsFor(db,event).length,1);
  const history=db.prepare('SELECT * FROM card_events').all();
  assert.equal(new Set(history.map(row=>row.analytics_id)).size,1);
  for(const privateValue of [...Object.values(cardInput).filter(value=>value!=='uni_email'),...Object.values(noteInput),id,ownerKey,payload.requestId])assert.ok(!JSON.stringify(history).includes(privateValue));
  assert.equal(db.prepare("SELECT count FROM acquisition_counts WHERE event='card_created'").get().count,1);
});

test('browser exclusions never suppress real card/message persistence, including deletion retry receipts',async()=>{
  const {db,send}=backend({lifecycle:true});
  const payload={...cardInput,excludeFromAnalytics:true,requestId:'5'.repeat(48)};
  const {id,ownerKey}=await (await send('/api/cards','POST',payload)).json();
  assert.equal((await send(`/api/cards/${id}/messages`,'POST',{...noteInput,excludeFromAnalytics:true})).status,201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_events').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM acquisition_counts').get().n,0);
  await send(`/api/cards/${id}`,'DELETE',{ownerKey,excludeFromAnalytics:true});
  assert.equal((await send('/api/cards','POST',payload)).status,410);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_events').get().n,0);
});

test('failed analytics transactions roll back before retrying only the operational write',async()=>{
  const {db,env,send}=backend({lifecycle:true});
  const batch=env.DB.batch.bind(env.DB);
  env.DB.batch=statements=>batch(statements.map(statement=>statement.sql.includes('INSERT INTO card_events')?{...statement,_run(){throw Error('Analytics insert unavailable');}}:statement));
  const payload={...cardInput,requestId:'6'.repeat(48)};
  const response=await send('/api/cards','POST',payload);assert.equal(response.status,201);
  const {id,ownerKey}=await response.json();
  assert.equal((await send(`/api/cards/${id}/messages`,'POST',noteInput)).status,201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_events').get().n,0);
  assert.equal((await send(`/api/cards/${id}`,'DELETE',{ownerKey})).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_events').get().n,0);
});

test('invitation refreshes reuse a per-card tab-session event ID; private organiser URLs emit no invite',async()=>{
  const storage=new Map(),id='a'.repeat(24);
  const guest=browser({query:`?card=${id}`,storage});await tick();
  vm.runInContext('loadCard(true)',guest.context);await tick();
  assert.equal(guest.eventRequests.length,1);
  const first=JSON.parse(guest.eventRequests[0].body);assert.equal(first.event,'invite_opened');
  const refresh=browser({query:`?card=${id}`,storage});await tick();
  assert.equal(JSON.parse(refresh.eventRequests[0].body).eventId,first.eventId);
  const privateVisit=browser({query:`?card=${id}&key=private-fixture`});await tick();
  assert.equal(privateVisit.eventRequests.length,0);
  const optedOut=browser({query:`?card=${id}&analytics=off`});await tick();
  assert.equal(optedOut.eventRequests.length,0);
  const missing=browser({query:`?card=${id}`,missingCard:true});await tick();
  assert.equal(missing.eventRequests.length,0);
  const {db,send}=backend({lifecycle:true});
  const card=await (await send('/api/cards','POST',cardInput)).json();
  for(let i=0;i<3;i++)assert.equal((await send(`/api/cards/${card.id}/events`,'POST',first)).status,204);
  assert.equal(rowsFor(db,'invite_opened').length,1);
  await send(`/api/cards/${card.id}/events`,'POST',{...first,eventId:'7'.repeat(48)});
  assert.equal(rowsFor(db,'invite_opened').length,2);
  assert.deepEqual(Object.keys(first).sort(),['event','eventId']);
});

test('share handlers report attempts and browser outcomes without URLs, keys or duplicate actions',async()=>{
  const {db,send}=backend({lifecycle:true});
  const card=await (await send('/api/cards','POST',cardInput)).json();
  const client=browser({query:`?card=${'a'.repeat(24)}&key=private-fixture`});await tick();
  client.context.navigator.clipboard={writeText:async()=>{}};
  await client.element('#copyCardLink').onclick();
  client.context.navigator.share=async()=>{};await client.element('#nativeShare').onclick();
  client.context.navigator.share=async()=>{throw Object.assign(Error('Cancelled'),{name:'AbortError'});};await client.element('#nativeShare').onclick();
  client.context.navigator.share=async()=>{throw Error('Failed');};await client.element('#nativeShare').onclick();
  delete client.context.navigator.share;await client.element('#nativeShare').onclick();
  client.context.navigator.clipboard.writeText=async()=>{throw Error('Blocked');};await client.element('#copyCardLink').onclick();
  const payloads=client.eventRequests.map(request=>JSON.parse(request.body));
  assert.deepEqual(payloads.filter(row=>row.outcome!=='attempted').map(row=>row.outcome),['copied','completed','cancelled','failed','fallback_copied','manual_copy']);
  // Final packets may arrive before attempt packets; a late attempt cannot
  // downgrade a completed outcome or increment the number of share actions.
  for(const payload of [...payloads].reverse())assert.equal((await send(`/api/cards/${card.id}/events`,'POST',payload)).status,204);
  const events=rowsFor(db,'share_clicked');assert.equal(events.length,6);
  assert.ok(events.every(row=>row.outcome!=='attempted'));
  assert.equal(new Set(events.map(row=>row.analytics_id)).size,1);
  assert.ok(!JSON.stringify(payloads).includes('private-fixture'));
  assert.ok(!JSON.stringify(payloads).includes('https://'));
});

test('new endpoint rejects forged server events, private fields, cross-origin requests, and missing cards',async()=>{
  const {db,send}=backend({lifecycle:true});
  const {id}=await (await send('/api/cards','POST',cardInput)).json();
  const path=`/api/cards/${id}/events`,event={event:'invite_opened',eventId:'8'.repeat(48)};
  assert.equal((await send(path)).status,405);
  assert.equal((await send(path,'POST',event,{origin:'https://elsewhere.test'})).status,403);
  assert.equal((await send(path,'POST',event,{'content-type':'text/plain'})).status,415);
  for(const type of ['card_created','contribution_added','card_deleted'])assert.equal((await send(path,'POST',{...event,event:type})).status,400);
  assert.equal((await send(path,'POST',{...event,ownerKey:'private-fixture'})).status,400);
  assert.equal((await send(path,'POST',{...event,private:'x'.repeat(600)})).status,413);
  assert.equal((await send(`/api/cards/${'f'.repeat(24)}/events`,'POST',event)).status,404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_events').get().n,1);
});

test('per-card client-event cap bounds growth while permitting share completion and real contributions',async()=>{
  const {db,send}=backend({lifecycle:true});
  const {id}=await (await send('/api/cards','POST',cardInput)).json();
  const alias=rowsFor(db,'card_created')[0].analytics_id;
  db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1999)
    INSERT INTO card_events(event_id,analytics_id,event) SELECT 'fixture-'||x,?,'invite_opened' FROM n`).run(alias);
  const share={event:'share_clicked',eventId:'9'.repeat(48),method:'copy_link',outcome:'attempted'};
  await send(`/api/cards/${id}/events`,'POST',share);
  await send(`/api/cards/${id}/events`,'POST',{...share,outcome:'copied'});
  await send(`/api/cards/${id}/events`,'POST',{event:'invite_opened',eventId:'a'.repeat(48)});
  assert.equal(rowsFor(db,'invite_opened').length,1999);
  assert.equal(rowsFor(db,'share_clicked')[0].outcome,'copied');
  assert.equal((await send(`/api/cards/${id}/messages`,'POST',noteInput)).status,201);
  assert.equal(rowsFor(db,'contribution_added').length,1);
});

test('activation reporting preserves acquisition and historical deleted-card activity, with 14 zero-filled Sydney days',async()=>{
  const {db,send}=backend({lifecycle:true});
  db.prepare("INSERT INTO acquisition_counts(day,source,event,count) VALUES(date('now'),'direct','card_created',2)").run();
  const {id,ownerKey}=await (await send('/api/cards','POST',cardInput)).json();
  for(let i=0;i<3;i++)await send(`/api/cards/${id}/messages`,'POST',noteInput);
  await send(`/api/cards/${id}/events`,'POST',{event:'share_clicked',eventId:'b'.repeat(48),method:'copy_link',outcome:'copied'});
  await send(`/api/cards/${id}/events`,'POST',{event:'invite_opened',eventId:'c'.repeat(48)});
  await send(`/api/cards/${id}`,'DELETE',{ownerKey});
  const output=await statsOutput(db);
  const log=output.logs.join('\n');
  assert.match(log,/GroupNote activation funnel/);
  assert.match(log,/Total currently stored cards: 0/);
  assert.match(log,/Cards successfully created .*: 1/);
  assert.match(log,/Cards deleted .*: 1/);
  assert.match(log,/Cards with 3\+ recorded contributions: 1/);
  assert.match(log,/Total recorded contributions .*: 3/);
  assert.match(log,/Acquisition creations without a lifecycle link: 2/);
  const daily=output.tables.find(table=>table.length===14&&'contribution_added' in table[0]);
  assert.ok(daily);assert.equal(daily.reduce((sum,row)=>sum+row.contribution_added,0),3);
  assert.ok(daily.some(row=>row.card_created===0&&row.contribution_added===0));
  assert.ok(output.calls.every(query=>!query.includes('SELECT *')));
});

test('creation acquisition sync can fail independently and a retry repairs it without duplicating history',async()=>{
  const {db,env,send}=backend({lifecycle:true});
  const batch=env.DB.batch.bind(env.DB);
  env.DB.batch=statements=>{
    if(statements.some(statement=>statement.sql.includes('INSERT INTO acquisition_counts')))return Promise.reject(Error('Counter unavailable'));
    return batch(statements);
  };
  const payload={...cardInput,requestId:'d'.repeat(48)};
  const response=await send('/api/cards','POST',payload);assert.equal(response.status,201);
  assert.equal(rowsFor(db,'card_created').length,1);
  assert.equal(rowsFor(db,'card_created')[0].acquisition_counted,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM acquisition_counts').get().n,0);
  env.DB.batch=batch;
  assert.equal((await send('/api/cards','POST',payload)).status,201);
  assert.equal((await send('/api/cards','POST',payload)).status,201);
  assert.equal(rowsFor(db,'card_created').length,1);
  assert.equal(rowsFor(db,'card_created')[0].acquisition_counted,1);
  assert.equal(db.prepare("SELECT count FROM acquisition_counts WHERE event='card_created'").get().count,1);
});

test('activation daily reporting converts UTC hours to Sydney dates and shows zero days for an empty ledger',async()=>{
  const {db,send}=backend({lifecycle:true});
  await send('/api/cards','POST',cardInput);
  const instant=new Date();instant.setUTCDate(instant.getUTCDate()-1);instant.setUTCHours(23,30,0,0);
  db.prepare("UPDATE card_events SET occurred_at=? WHERE event='card_created'").run(instant.toISOString().slice(0,19).replace('T',' '));
  const parts=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const expected=['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
  assert.notEqual(expected,instant.toISOString().slice(0,10));
  const output=await statsOutput(db);
  const daily=output.tables.find(table=>table.length===14&&'contribution_added' in table[0]);
  assert.equal(daily.find(row=>row.sydney_date===expected).card_created,1);
  const empty=await statsOutput(backend({lifecycle:true}).db);
  const zeroes=empty.tables.find(table=>table.length===14&&'invite_opened' in table[0]);
  assert.ok(zeroes.every(row=>row.card_created===0&&row.share_clicked===0&&row.invite_opened===0&&row.contribution_added===0&&row.card_deleted===0));
});
