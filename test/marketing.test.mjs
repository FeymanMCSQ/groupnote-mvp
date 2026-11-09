import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import worker from '../src/worker.js';
import {sqliteBinding} from './d1.mjs';
import {occasions,templates} from '../public/templates.js';

const shell=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const site='https://groupnote.example';
const env={PUBLIC_SITE_ORIGIN:site, ASSETS:{fetch:async()=>new Response(shell,{headers:{'content-type':'text/html','etag':'old-shell'}})}};
const send=(path,options={},bindings=env)=>worker.fetch(new Request('https://local.test'+path,options),bindings);

for(const [occasion,entry] of Object.entries(occasions).filter(([,entry])=>entry.slug)){
 test(`${occasion} landing provides distinct, crawlable HTML, metadata and a creator link without JavaScript`,async()=>{
  const path='/'+entry.slug;
  const response=await send(path,{headers:{'user-agent':'Googlebot','if-none-match':'old-shell'}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-robots-tag'),'index, follow');
  assert.equal(response.headers.get('etag'),null);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const html=await response.text();
  assert.match(html,new RegExp(`<title>Free Online Group ${occasion==='Thank you'?'Thank You':occasion} Cards \\| GroupNote</title>`));
  assert.match(html,new RegExp(`<link rel="canonical" href="${site}${path}"/>`));
  assert.match(html,new RegExp(`<meta property="og:url" content="${site}${path}"/>`));
  assert.match(html,/<meta property="og:title"/);
  assert.match(html,/<meta property="og:description"/);
  assert.match(html,/<meta name="description" content=".{80,}"\/>/);
  assert.equal((html.match(/name="robots"/g)||[]).length,1);
  assert.match(html,/name="robots" content="index, follow"/);
  const landing=html.slice(html.indexOf('<section id="homeView"'),html.indexOf('<section id="createView"'));
  assert.match(landing,/<h1>.+<em>.+<\/em><\/h1>/);
  assert.match(landing,new RegExp(`data-occasion="${occasion}"`));
  assert.match(landing,new RegExp(`href="/\\?occasion=${encodeURIComponent(occasion)}#create"`));
  assert.match(landing,new RegExp(`theme-${entry.template}`));
  assert.match(landing,/aria-label="Related occasions"/);
  assert.ok(!landing.includes('class="hero-collections"'));
  assert.match(landing,/Create free card/);
  assert.match(landing,/No accounts needed/);
  assert.equal((landing.match(/<details>/g)||[]).length,3);
  assert.match(html,/id="createForm"/); // One existing creator, no parallel workflow.
  assert.equal((html.match(/id="createForm"/g)||[]).length,1);
  assert.equal((await send(path+'/',{method:'HEAD'})).status,200);
 });
}

test('homepage links all occasions, and campaign URLs use clean canonical URLs',async()=>{
 const html=await (await send('/?src=uni_email')).text();
 for(const entry of Object.values(occasions).filter(entry=>entry.slug))assert.ok(html.includes(`href="/${entry.slug}"`));
 assert.match(html,new RegExp(`rel="canonical" href="${site}/"`));
 const campaign=await (await send('/birthday-card?src=uni_email&analytics=off')).text();
 assert.match(campaign,new RegExp(`rel="canonical" href="${site}/birthday-card"`));
 assert.ok(!campaign.includes('src=uni_email'));
});

test('homepage renders six linked design previews in the hero before the how-it-works section',async()=>{
 const html=await (await send('/')).text();
 const start=html.indexOf('<section class="hero-collections"');
 const end=html.indexOf('<div class="steps" id="how">');
 assert.ok(start>html.indexOf('<div class="hero-shell">')&&end>start);
 const preview=html.slice(start,end);
 assert.equal((preview.match(/class="collection-preview"/g)||[]).length,6);
 for(const [occasion,entry] of Object.entries(occasions).filter(([,entry])=>entry.slug)){
  assert.ok(preview.includes(`href="/${entry.slug}"`));
  assert.ok(preview.includes('theme-'+entry.template));
  assert.ok(preview.includes(occasion));
 }
 assert.ok(!html.includes('<!-- collection-preview -->'));
});

test('private links, creator queries and API content are noindex, without private values in HTML',async()=>{
 for(const path of ['/?card='+ 'a'.repeat(24), '/?card='+ 'a'.repeat(24)+'&key=private-test-key','/birthday-card?key=private-test-key','/?occasion=Christmas','/index.html','/unlisted-path']){
  const response=await send(path);
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
  const html=await response.text();
  assert.match(html,/name="robots" content="noindex, nofollow"/);
  assert.ok(!html.includes('rel="canonical"'));
  assert.ok(!html.includes('private-test-key'));
 }
 assert.equal((await send('/api/health')).headers.get('x-robots-tag'),'noindex, nofollow');
 const headers=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
 assert.match(headers,/\/\*\s+X-Robots-Tag: noindex, nofollow/);
});

test('sitemap lists only seven public marketing pages, and robots allows noindex directives to be crawled',async()=>{
 const sitemap=await send('/sitemap.xml');
 assert.equal(sitemap.status,200);
 assert.match(sitemap.headers.get('content-type'),/application\/xml/);
 const xml=await sitemap.text();
 assert.equal((xml.match(/<url>/g)||[]).length,7);
 for(const path of ['/',...Object.values(occasions).filter(entry=>entry.slug).map(entry=>'/'+entry.slug)])assert.ok(xml.includes(`<loc>${site}${path}</loc>`));
 for(const [,location] of xml.matchAll(/<loc>(.*?)<\/loc>/g))assert.ok(!/[?#]|api\/|privacy/.test(location));
 const robots=await send('/robots.txt');
 assert.equal(robots.status,200);
 assert.equal(await robots.text(),`User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
 assert.equal(await (await send('/sitemap.xml',{method:'HEAD'})).text(),'');
});

test('public origin, optional real verification token and opt-in marketing redirects are configurable',async()=>{
 const bindings={...env,GOOGLE_SITE_VERIFICATION:'actual-token-"<&',MARKETING_REDIRECT_FROM:'https://old.example'};
 const html=await (await send('/',{},bindings)).text();
 assert.match(html,/name="google-site-verification" content="actual-token-&quot;&lt;&amp;"/);
 const redirect=await worker.fetch(new Request('https://old.example/farewell-card?src=uni_email'),bindings);
 assert.equal(redirect.status,301);
 assert.equal(redirect.headers.get('location'),site+'/farewell-card?src=uni_email');
 const privatePage=await worker.fetch(new Request('https://old.example/?card='+ 'a'.repeat(24)+'&key=test'),bindings);
 assert.equal(privatePage.status,200);
 assert.equal(privatePage.headers.get('location'),null);
});

test('Christmas and every existing occasion persist through the same card, contributor and organiser API',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const migrations=new URL('../migrations/',import.meta.url);
 for(const file of readdirSync(migrations).filter(file=>file.endsWith('.sql')).sort())db.exec(readFileSync(new URL(file,migrations),'utf8'));
 const bindings={...env,DB:sqliteBinding(db),RATE_SALT:'test-only'};
 const post=(path,body)=>send(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},bindings);
 for(const occasion of Object.keys(occasions)){
  // Each iteration uses a distinct simulated local actor to stay within the normal quota.
  const created=await send('/api/cards',{method:'POST',headers:{'cf-connecting-ip':occasion},body:JSON.stringify({occasion,title:'Test card',recipient:'Fixture',creator:'Fixture',excludeFromAnalytics:true})},bindings);
  assert.equal(created.status,201);
  const {id,ownerKey}=await created.json();
  assert.equal((await (await send('/api/cards/'+id,{},bindings)).json()).occasion,occasion);
  assert.equal((await post(`/api/cards/${id}/messages`,{author:'Fixture',body:'A local test message',excludeFromAnalytics:true})).status,201);
  assert.equal((await post(`/api/cards/${id}/close`,{closed:true})).status,403);
  assert.equal((await post(`/api/cards/${id}/close`,{closed:true,ownerKey})).status,200);
  assert.equal((await post(`/api/cards/${id}/messages`,{author:'Fixture',body:'Cannot be added'})).status,409);
  assert.equal((await post(`/api/cards/${id}/close`,{closed:false,ownerKey})).status,200);
  const card=await send('/api/cards/'+id,{},bindings);
  assert.match(card.headers.get('x-robots-tag'),/noindex/);
  assert.equal((await card.json()).messages.length,1);
 }
 assert.equal(db.prepare('SELECT COUNT(*) n FROM cards').get().n,9);
 db.close();
});
