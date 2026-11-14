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
  assert.equal((landing.match(/<details>/g)||[]).length,4);
  assert.match(landing,/For example,/); // Useful occasion-specific message guidance is present in initial HTML.
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

test('homepage keeps its emotional hook while explaining signing, access and PDF export without JavaScript',async()=>{
 const response=await send('/');
 const html=await response.text();
 const head=html.slice(0,html.indexOf('</head>'));
 const home=html.slice(html.indexOf('<section id="homeView"'),html.indexOf('<section id="createView"'));
 assert.match(head,/<title>Free Online Group Greeting Cards \| GroupNote<\/title>/);
 assert.match(head,/<meta property="og:title" content="Free Online Group Greeting Cards \| GroupNote"/);
 const description=/<meta name="description" content="([^"]+)"/.exec(head)[1];
 assert.ok(head.includes(`property="og:description" content="${description}"`));
 assert.ok(shell.includes(`<meta name="description" content="${description}"`));
 assert.match(home,/<h1>Little messages\.<br\/><em>Big feelings\.<\/em><\/h1>/);
 assert.match(home,/class="hero-subtitle">[^<]*free online group greeting card/);
 const faq=home.slice(home.indexOf('<section class="occasion-faq"'),home.indexOf('<div class="bottom-banner"'));
 assert.equal((faq.match(/<details>/g)||[]).length,6);
 assert.match(faq,/different places or time zones/);
 assert.match(faq,/up to 200 messages/);
 assert.match(faq,/Anyone with the invitation link can read/);
 assert.match(faq,/no sign-in or password check/);
 assert.match(faq,/private organiser link/);
 assert.match(faq,/close contributions/);
 assert.match(faq,/reopen contributions/);
 assert.match(faq,/Save as PDF/);
 assert.ok(!html.includes('<!-- home-faq -->'));
 assert.equal((home.match(/id="faqHeading"/g)||[]).length,1);
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
  assert.ok(!html.includes('application/ld+json'));
  assert.ok(!html.includes('private-test-key'));
 }
 assert.equal((await send('/api/health')).headers.get('x-robots-tag'),'noindex, nofollow');
 const headers=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
 assert.match(headers,/\/\*\s+X-Robots-Tag: noindex, nofollow/);
});

test('public structured data is factual, parseable and follows the configured origin on every page',async()=>{
 const paths=['/',...Object.values(occasions).filter(entry=>entry.slug).map(entry=>'/'+entry.slug)];
 for(const publicOrigin of [site,'https://future.example','http://localhost:8787']){
  for(const path of paths){
   const html=await (await send(path+'?src=uni_email',{}, {...env,PUBLIC_SITE_ORIGIN:publicOrigin})).text();
   const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
   assert.equal(scripts.length,1);
   const data=JSON.parse(scripts[0][1]);
   assert.equal(data['@context'],'https://schema.org');
   const [website,app,page]=data['@graph'];
   assert.deepEqual(website,{'@type':'WebSite','@id':publicOrigin+'/#website',url:publicOrigin+'/',name:'GroupNote'});
   assert.deepEqual(app,{'@type':'WebApplication','@id':publicOrigin+'/#application',url:publicOrigin+'/',name:'GroupNote',
    description:'Make a free group greeting card online for birthdays, farewells and thank-yous. Share one link, collect messages without accounts, and save as PDF.',
    applicationCategory:'LifestyleApplication',offers:{'@type':'Offer',price:0},isAccessibleForFree:true});
   assert.equal(page['@type'],'WebPage');
   assert.equal(page.url,publicOrigin+path);
   assert.equal(page['@id'],page.url+'#webpage');
   assert.equal(page.isPartOf['@id'],website['@id']);
   assert.equal(page.about['@id'],app['@id']);
   assert.ok(html.includes(`<title>${page.name}</title>`));
   assert.ok(html.includes(`name="description" content="${page.description}"`));
   assert.ok(html.includes(`rel="canonical" href="${page.url}"`));
   assert.ok(!scripts[0][1].includes('uni_email'));
  }
 }
 // With no production binding, local preview still has valid, loopback identities.
 const local=await (await send('/',{}, {...env,PUBLIC_SITE_ORIGIN:undefined})).text();
 assert.match(local,/"url":"https:\/\/local.test\/"/);
 assert.match(local,/rel="canonical" href="https:\/\/local.test\/"/);
});

test('crawler agents see the same public content and wildcard robots permission as people',async()=>{
 const agents=['OAI-SearchBot','ChatGPT-User','Googlebot','bingbot','PerplexityBot','GPTBot'];
 for(const path of ['/', '/birthday-card']){
  const human=await (await send(path)).text();
  for(const agent of agents){
   const response=await send(path,{headers:{'user-agent':agent}});
   assert.equal(response.status,200);
   assert.equal(response.headers.get('x-robots-tag'),'index, follow');
   assert.equal(await response.text(),human);
   assert.equal(await (await send('/robots.txt',{headers:{'user-agent':agent}})).text(),`User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
  }
 }
});

test('alternating private and campaign requests cannot share indexing directives or structured data',async()=>{
 for(const path of ['/', '/farewell-card']){
  for(const suffix of ['?key=secret','?src=uni_email','?card=private','?analytics=off','?occasion=Birthday','']){
   const privateState=/key=|card=|occasion=/.test(suffix);
   const response=await send(path+suffix);
   const html=await response.text();
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal(response.headers.get('etag'),null);
   assert.equal(response.headers.get('x-robots-tag'),privateState?'noindex, nofollow':'index, follow');
   assert.equal(html.includes('application/ld+json'),!privateState);
   assert.equal(html.includes('rel="canonical"'),!privateState);
  }
 }
});

test('an unsuccessful shell response is never promoted to an indexable marketing page',async()=>{
 for(const status of [404,500]){
  const response=await send('/',{}, {...env,ASSETS:{fetch:async()=>new Response(shell,{status,headers:{'content-type':'text/html'}})}});
  assert.equal(response.status,status);
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
  const html=await response.text();
  assert.match(html,/name="robots" content="noindex, nofollow"/);
  assert.ok(!html.includes('application/ld+json'));
  assert.ok(!html.includes('rel="canonical"'));
 }
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
