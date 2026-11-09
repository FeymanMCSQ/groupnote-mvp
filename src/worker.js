// GroupNote — Cloudflare Worker + D1.
// No external email, AI, auth, or payment services required.
import {mutate, creationStatements, contributionStatements, deletionStatements, clientEvent, validToken, eventKey} from './analytics.js';
import {marketing} from './marketing.js';
import {templates,occasions} from '../public/templates.js';
const allowedThemes = new Set(templates.map(template=>template.id));
const allowedOccasions = new Set(Object.keys(occasions));
const allowedEmoji = new Set(['💛','✨','🎉','🌻','🫶','🥳','🌸','🤍']);
const jsonHeaders = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'};
const response = (data,status=200,extras={}) => new Response(JSON.stringify(data),{status,headers:{...jsonHeaders,...extras}});
const fail = (text,status=400) => response({error:text},status);
const clean = (s,limit)=> typeof s === 'string' ? s.trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,limit) : '';
const digest = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const randomId = (bytes=12) => Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const safeId = (id) => /^[a-f0-9]{24}$/.test(id);
const cardFields = 'id,occasion,title,recipient,creator,intro,theme,is_closed,created_at';
// Keep campaign labels in sync with public/app.js. Never store free-form sources.
const acquisitionSources = new Set(['direct','uni_email','other']);
const acquisitionSource = value => value == null ? 'direct' : acquisitionSources.has(value) ? value : 'other';
const acquisitionDate = new Intl.DateTimeFormat('en-AU', {
 timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'
});

async function countAcquisition(env,event,source){
 const parts=acquisitionDate.formatToParts(new Date());
 const day=['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
 await env.DB.prepare(`INSERT INTO acquisition_counts(day,source,event,count) VALUES(?,?,?,1)
  ON CONFLICT(day,source,event) DO UPDATE SET count=count+1`).bind(day,acquisitionSource(source),event).run();
}

async function handleAcquisition(request,env,url){
 if(request.method!=='POST')return fail('Method not allowed',405);
 if(request.headers.get('origin')!==url.origin)return fail('Origin not allowed',403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return fail('JSON required',415);
 if(Number(request.headers.get('content-length')||0)>256)return fail('Request too large',413);
 let b;
 try{
  const text=await request.text();
  if(text.length>256)return fail('Request too large',413);
  b=JSON.parse(text);
 }catch{return fail('Invalid JSON');}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(key=>!['event','source'].includes(key))||!['landing','create_open'].includes(b.event))return fail('Invalid event');
 try{await countAcquisition(env,b.event,b.source)}catch{} // Missing migration/storage failure is non-fatal.
 return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
}

function countCreatedCard(env,ctx,source,id,inserted){
 try{
  const task=Promise.resolve().then(async()=>{
   const key=await eventKey('card_created',id);
   let entry;
   try{entry=await env.DB.prepare('SELECT occurred_at,source,acquisition_counted FROM card_events WHERE event_id=?').bind(key).first();}
   catch{if(inserted)await countAcquisition(env,'card_created',source);return;}
   if(!entry){if(inserted)await countAcquisition(env,'card_created',source);return;}
   if(entry.acquisition_counted)return;
   const parts=acquisitionDate.formatToParts(new Date(entry.occurred_at.replace(' ','T')+'Z'));
   const day=['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
   // Increment and mark together: replayed create requests cannot count twice.
   await env.DB.batch([
    env.DB.prepare(`INSERT INTO acquisition_counts(day,source,event,count)
     SELECT ?,?,'card_created',1 WHERE EXISTS(SELECT 1 FROM card_events WHERE event_id=? AND acquisition_counted=0)
     ON CONFLICT(day,source,event) DO UPDATE SET count=count+1`).bind(day,entry.source,key),
    env.DB.prepare('UPDATE card_events SET acquisition_counted=1 WHERE event_id=?').bind(key)
   ]);
  }).catch(()=>{});
  ctx?.waitUntil?.(task);
 }catch{} // Never turn an already-created card into a failed request.
}

async function bodyJson(request){
  if((Number(request.headers.get('content-length')||0))>12000) throw Error('Request too large');
  const text=await request.text();
  if(text.length>12000) throw Error('Request too large');
  try{return JSON.parse(text);}catch{throw Error('Invalid JSON');}
}

// Quotas reduce basic abuse but are not a substitute for production bot protection.
async function allowAction(request,env,action,maxPerDay){
  const day=new Date().toISOString().slice(0,10);
  const ip=request.headers.get('CF-Connecting-IP') || 'local-dev';
  const actor=await digest(`${day}:${ip}:${env.RATE_SALT || 'replace-rate-salt-before-launch'}`);
  const q=await env.DB.prepare(`INSERT INTO quotas(day,actor,action,count) VALUES(?,?,?,1)
    ON CONFLICT(day,actor,action) DO UPDATE SET count=count+1
    RETURNING count`).bind(day,actor,action).first();
  return q && q.count<=maxPerDay;
}

async function fetchCard(env,id){
 const card=await env.DB.prepare(`SELECT ${cardFields} FROM cards WHERE id=?`).bind(id).first();
 if(!card) return null;
 const result=await env.DB.prepare('SELECT id,author,body,emoji,created_at FROM messages WHERE card_id=? ORDER BY created_at ASC,id ASC LIMIT 201').bind(id).all();
 return {...card,is_closed:!!card.is_closed,messages:result.results||[]};
}

async function handle(request,env,url,ctx){
 const path=url.pathname;
 const method=request.method;
 if(method==='GET' && path==='/api/health') return response({ok:true});
 if(method==='POST' && path==='/api/cards'){
   let b; try{b=await bodyJson(request)}catch(e){return fail(e.message)}
   const title=clean(b.title,80), recipient=clean(b.recipient,40), creator=clean(b.creator,40),intro=clean(b.intro||'',260);
   const occasion=allowedOccasions.has(b.occasion)? b.occasion : 'Just because';
   const theme=allowedThemes.has(b.theme)? b.theme : 'peach';
   if(!title||!recipient||!creator) return fail('Please enter a title, recipient, and your name.');
   if(b.requestId!=null&&!validToken(b.requestId))return fail('Invalid request ID');
   // The 192-bit browser-generated request token is private and never retained.
   // Domain-separated hashes allow a retry to recover the same private result.
   const id=b.requestId?(await digest('card:'+b.requestId)).slice(0,24):randomId(12);
   const ownerKey=b.requestId?(await digest('owner:'+b.requestId)).slice(0,48):randomId(24),adminHash=await digest(ownerKey);
   const requestHash=b.requestId?await digest('request:'+b.requestId):null;
   if(requestHash){
    let receipt;
    try{receipt=await env.DB.prepare('SELECT card_id FROM card_creation_requests WHERE request_hash=?').bind(requestHash).first();}
    catch(e){if(!/no such table:.*card_creation_requests/i.test(String(e)))throw e;}
    const existing=await env.DB.prepare('SELECT id FROM cards WHERE id=? AND admin_hash=?').bind(id,adminHash).first();
    if(existing){if(b.excludeFromAnalytics!==true)countCreatedCard(env,ctx,b.acquisitionSource,id,false);return response({id,ownerKey},201);}
    if(receipt)return fail('This card was already created and deleted. Start a new card.',410);
   }
   if(!await allowAction(request,env,'create',5)) return fail('Too many cards created today. Try again tomorrow.',429);
   const operations=[env.DB.prepare('INSERT INTO cards(id,admin_hash,occasion,title,recipient,creator,intro,theme) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,adminHash,occasion,title,recipient,creator,intro,theme)];
   if(requestHash){
    try{operations.push(env.DB.prepare('INSERT INTO card_creation_requests(request_hash,card_id) VALUES(?,?) ON CONFLICT(request_hash) DO NOTHING').bind(requestHash,id));}
    catch(e){if(!/no such table:.*card_creation_requests/i.test(String(e)))throw e;}
   }
   const result=await mutate(env,operations,b.excludeFromAnalytics===true?null:()=>creationStatements(env,id,acquisitionSource(b.acquisitionSource)));
   if(b.excludeFromAnalytics!==true)countCreatedCard(env,ctx,b.acquisitionSource,id,!!result.meta?.changes);
   return response({id,ownerKey},201);
 }
 const m=/^\/api\/cards\/([a-f0-9]{24})(?:\/(messages|close|events))?$/.exec(path);
 if(!m) return fail('Not found',404);
 const [,id,action] = m;
 if(!safeId(id))return fail('Not found',404);
 if(action==='events')return clientEvent(request,env,url,id);
 if(method==='GET'&&!action){
  const c=await fetchCard(env,id);return c?response(c):fail('Card not found',404);
 }
 if(method==='DELETE'&&!action){
  let b; try{b=await bodyJson(request)}catch(e){return fail(e.message)}
  const key=clean(b.ownerKey,64);
  if(!key)return fail('Owner key required',403);
  const hash=await digest(key);
  const result=await mutate(env,[env.DB.prepare('DELETE FROM cards WHERE id=? AND admin_hash=?').bind(id,hash)],b.excludeFromAnalytics===true?null:()=>deletionStatements(env,id,hash),true);
  if(!result.meta?.changes)return fail('Invalid owner link or missing card',403);
  return response({ok:true});
 }
 if(method==='POST'&&action==='messages'){
   let b; try{b=await bodyJson(request)}catch(e){return fail(e.message)}
   const author=clean(b.author,40),body=clean(b.body,650),emoji=allowedEmoji.has(b.emoji)?b.emoji:'💛';
   if(!author||body.length<3) return fail('Add your name and a message of at least 3 characters.');
   if(b.requestId!=null&&!validToken(b.requestId))return fail('Invalid request ID');
   const idMsg=b.requestId?(await digest(`message:${id}:${b.requestId}`)).slice(0,24):randomId(12);
   if(b.requestId&&await env.DB.prepare('SELECT id FROM messages WHERE id=? AND card_id=?').bind(idMsg,id).first())return response({ok:true,id:idMsg},201);
   if(!await allowAction(request,env,'message',30)) return fail('Daily message limit reached. Try again tomorrow.',429);
   // One SQL statement ensures closed cards cannot accept messages and caps each card.
   const operation=env.DB.prepare(`INSERT INTO messages(id,card_id,author,body,emoji)
       SELECT ?,id,?,?,? FROM cards WHERE id=? AND is_closed=0
       AND (SELECT COUNT(*) FROM messages WHERE card_id=?) < 200
       ON CONFLICT(id) DO NOTHING`).bind(idMsg,author,body,emoji,id,id);
   const result=await mutate(env,[operation],b.excludeFromAnalytics===true?null:()=>contributionStatements(env,id,idMsg));
   if(!result.meta?.changes&&!await env.DB.prepare('SELECT id FROM messages WHERE id=? AND card_id=?').bind(idMsg,id).first())return fail('This card is closed, full, or unavailable.',409);
   return response({ok:true,id:idMsg},201);
 }
 if(method==='POST'&&action==='close'){
   let b; try{b=await bodyJson(request)}catch(e){return fail(e.message)}
   const key=clean(b.ownerKey,64);
   if(!key) return fail('Owner key required',403);
   const hash=await digest(key);
   const result=await env.DB.prepare('UPDATE cards SET is_closed=? WHERE id=? AND admin_hash=?').bind(b.closed?1:0,id,hash).run();
   if(!result.meta?.changes) return fail('Invalid owner link or missing card',403);
   return response({ok:true,is_closed:!!b.closed});
 }
 return fail('Method not allowed',405);
}

export default {
 async fetch(request,env,ctx){
   const url=new URL(request.url);
   if(!url.pathname.startsWith('/api/')) return marketing(request,env);
   if(url.pathname==='/api/acquisition')return handleAcquisition(request,env,url);
   if(!env.DB) return fail('Database not configured',503);
   try {return await handle(request,env,url,ctx);}
   catch{console.error('GroupNote API request failed.');return fail('Something went wrong. Please retry.',500);}
 }
};
