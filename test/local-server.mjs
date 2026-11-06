/**
 * Self-contained demo server for GroupNote. Uses Node.js 22+ built-in SQLite.
 * The production app uses Cloudflare Workers and D1 instead.
 * Run: npm run demo
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';
import {sqliteBinding} from './d1.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dbPath=process.env.GROUPNOTE_DEMO_DB||path.join(root,'.local-demo.sqlite');
const port=Number(process.env.PORT||8787);
const sqlite=new DatabaseSync(dbPath);
sqlite.exec('PRAGMA foreign_keys=ON;');
for(const file of fs.readdirSync(path.join(root,'migrations')).filter(file=>file.endsWith('.sql')).sort()){
 sqlite.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
}
const binding=sqliteBinding(sqlite);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
const env={DB:binding,RATE_SALT:'local-demo-salt',ASSETS:{async fetch(request){let pathname=new URL(request.url).pathname;
  let file=path.join(root,'public',pathname==='/'?'index.html':pathname);
  if(!file.startsWith(path.join(root,'public')))return new Response('No',{status:403});
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'public','index.html');
  return new Response(fs.readFileSync(file),{headers:{'content-type':MIME[path.extname(file)]||'text/plain'}});
}}};
const handleRequest=async(req,res)=>{
 try{
  const body=[];for await(const c of req)body.push(c);
  const url=`http://${req.headers.host||`127.0.0.1:${port}`}${req.url}`;
  const request=new Request(url,{method:req.method,headers:{...req.headers,'cf-connecting-ip':req.socket.remoteAddress||'127.0.0.1'},body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(body)});
  const r=await worker.fetch(request,env);
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
 }catch(err){console.error(err);res.writeHead(500);res.end('Error')}
};
const server=http.createServer(handleRequest);
server.listen(port,'127.0.0.1',()=>console.log(`GroupNote local preview: http://127.0.0.1:${port}`));
// localhost can resolve to IPv6 first; serve both loopback addresses without
// exposing the demo to other devices on the network.
const ipv6Server=http.createServer(handleRequest);
ipv6Server.on('error',err=>{
 if(err.code==='EAFNOSUPPORT'||err.code==='EADDRNOTAVAIL')console.warn('IPv6 loopback unavailable; use http://127.0.0.1:'+port);
 else {console.error(err);process.exitCode=1;server.close();}
});
ipv6Server.listen(port,'::1',()=>console.log(`GroupNote local preview: http://localhost:${port}`));
