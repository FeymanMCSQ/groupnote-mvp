// GroupNote — Cloudflare Worker + D1.
// No external email, AI, auth, or payment services required.
const allowedThemes = new Set(['peach','sage','sky']);
const allowedOccasions = new Set(['Farewell','Birthday','Thank you','Congratulations','Get well','Just because']);
const allowedEmoji = new Set(['💛','✨','🎉','🌻','🫶','🥳','🌸','🤍']);
const jsonHeaders = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const response = (data,status=200,extras={}) => new Response(JSON.stringify(data),{status,headers:{...jsonHeaders,...extras}});
const fail = (text,status=400) => response({error:text},status);
const clean = (s,limit)=> typeof s === 'string' ? s.trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,limit) : '';
const digest = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const randomId = (bytes=12) => Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const safeId = (id) => /^[a-f0-9]{24}$/.test(id);
const cardFields = 'id,occasion,title,recipient,creator,intro,theme,is_closed,created_at';

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

async function handle(request,env,url){
 const path=url.pathname;
 const method=request.method;
 if(method==='GET' && path==='/api/health') return response({ok:true});
 if(method==='POST' && path==='/api/cards'){
   if(!await allowAction(request,env,'create',5)) return fail('Too many cards created today. Try again tomorrow.',429);
   let b; try{b=await bodyJson(request)}catch(e){return fail(e.message)}
   const title=clean(b.title,80), recipient=clean(b.recipient,40), creator=clean(b.creator,40),intro=clean(b.intro||'',260);
   const occasion=allowedOccasions.has(b.occasion)? b.occasion : 'Just because';
   const theme=allowedThemes.has(b.theme)? b.theme : 'peach';
   if(!title||!recipient||!creator) return fail('Please enter a title, recipient, and your name.');
   const id=randomId(12), ownerKey=randomId(24),adminHash=await digest(ownerKey);
   await env.DB.prepare('INSERT INTO cards(id,admin_hash,occasion,title,recipient,creator,intro,theme) VALUES(?,?,?,?,?,?,?,?)').bind(id,adminHash,occasion,title,recipient,creator,intro,theme).run();
   return response({id,ownerKey},201);
 }
 const m=/^\/api\/cards\/([a-f0-9]{24})(?:\/(messages|close))?$/.exec(path);
 if(!m) return fail('Not found',404);
 const [,id,action] = m;
 if(!safeId(id))return fail('Not found',404);
 if(method==='GET'&&!action){
  const c=await fetchCard(env,id);return c?response(c):fail('Card not found',404);
 }
 if(method==='DELETE'&&!action){
  let b; try{b=await bodyJson(request)}catch(e){return fail(e.message)}
  const key=clean(b.ownerKey,64);
  if(!key)return fail('Owner key required',403);
  const hash=await digest(key);
  const result=await env.DB.prepare('DELETE FROM cards WHERE id=? AND admin_hash=?').bind(id,hash).run();
  if(!result.meta?.changes)return fail('Invalid owner link or missing card',403);
  return response({ok:true});
 }
 if(method==='POST'&&action==='messages'){
   if(!await allowAction(request,env,'message',30)) return fail('Daily message limit reached. Try again tomorrow.',429);
   let b; try{b=await bodyJson(request)}catch(e){return fail(e.message)}
   const author=clean(b.author,40),body=clean(b.body,650),emoji=allowedEmoji.has(b.emoji)?b.emoji:'💛';
   if(!author||body.length<3) return fail('Add your name and a message of at least 3 characters.');
   const idMsg=randomId(12);
   // One SQL statement ensures closed cards cannot accept messages and caps each card.
   const result=await env.DB.prepare(`INSERT INTO messages(id,card_id,author,body,emoji)
       SELECT ?,id,?,?,? FROM cards WHERE id=? AND is_closed=0
       AND (SELECT COUNT(*) FROM messages WHERE card_id=?) < 200`).bind(idMsg,author,body,emoji,id,id).run();
   if(!result.meta?.changes)return fail('This card is closed, full, or unavailable.',409);
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
 async fetch(request,env){
   const url=new URL(request.url);
   if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
   if(!env.DB) return fail('Database not configured',503);
   try {return await handle(request,env,url);}
   catch(err){console.error('GroupNote API error',err);return fail('Something went wrong. Please retry.',500);}
 }
};
