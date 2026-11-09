import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import worker from '../src/worker.js';
import {sqliteBinding} from './d1.mjs';
import {templates,occasions,getTemplate,defaultTemplate,miniature,decoration,templateClass} from '../public/templates.js';

test('shared catalogue defines twelve distinct designs, six collections and three stable classic themes',()=>{
 const designed=templates.filter(template=>template.decoration);
 assert.equal(designed.length,12);
 assert.equal(new Set(templates.map(template=>template.id)).size,15);
 assert.equal(new Set(designed.map(template=>template.decoration)).size,12);
 assert.equal(new Set(designed.map(template=>template.layout)).size,12);
 assert.deepEqual(templates.filter(template=>template.occasion===null).map(template=>template.id),['peach','sage','sky']);
 for(const [occasion,entry] of Object.entries(occasions).filter(([,entry])=>entry.slug)){
  assert.equal(designed.filter(template=>template.occasion===occasion).length,2);
  assert.equal(defaultTemplate(occasion).id,entry.template);
 }
 assert.equal(getTemplate('unknown').id,'peach');
 assert.equal(getTemplate('__proto__').id,'peach');
});

test('every miniature references real lightweight artwork and keeps inserted text escaped',()=>{
 const art=readFileSync(new URL('../public/card-art.svg',import.meta.url),'utf8');
 const ids=[...art.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const [,id] of art.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(id));
 for(const template of templates){
  const html=miniature(template,{title:'<img src=x onerror=alert(1)>'});
  assert.ok(html.includes(templateClass(template,'template-mini')));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img'));
  if(template.decoration){
   assert.ok(ids.includes(template.decoration));
   assert.ok(decoration(template).includes('/card-art.svg#'+template.decoration));
  }
 }
 assert.ok(!templates.filter(template=>template.occasion==='New Year').some(template=>/20\d{2}/.test(JSON.stringify(template))));
});

test('new cover palettes retain readable text contrast',()=>{
 const luminance=hex=>{
  const values=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return values[0]*.2126+values[1]*.7152+values[2]*.0722;
 };
 for(const template of templates.filter(template=>template.decoration)){
  const values=[luminance(template.palette.background),luminance(template.palette.ink)].sort((a,b)=>b-a);
  assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,template.id);
 }
});

test('all fifteen template IDs persist unchanged through existing APIs, independently of occasion',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const migrationDirectory=new URL('../migrations/',import.meta.url);
 for(const file of readdirSync(migrationDirectory).filter(file=>file.endsWith('.sql')).sort())db.exec(readFileSync(new URL(file,migrationDirectory),'utf8'));
 const env={DB:sqliteBinding(db),RATE_SALT:'test-only'};
 for(const template of templates){
  const created=await worker.fetch(new Request('https://local.test/api/cards',{method:'POST',headers:{'cf-connecting-ip':template.id},body:JSON.stringify({title:'Local fixture',recipient:'Fixture',creator:'Fixture',occasion:template.occasion||'Just because',theme:template.id,excludeFromAnalytics:true})}),env);
  assert.equal(created.status,201,template.id);
  const {id}=await created.json();
  const card=await (await worker.fetch(new Request('https://local.test/api/cards/'+id),env)).json();
  assert.equal(card.theme,template.id);
  assert.equal(card.occasion,template.occasion||'Just because');
 }
 const crossOccasion=await worker.fetch(new Request('https://local.test/api/cards',{method:'POST',body:JSON.stringify({title:'Fixture',recipient:'Fixture',creator:'Fixture',occasion:'Farewell',theme:'birthday-balloons',excludeFromAnalytics:true})}),env);
 const card=await crossOccasion.json();
 assert.equal(db.prepare('SELECT theme FROM cards WHERE id=?').get(card.id).theme,'birthday-balloons');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM card_events').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM acquisition_counts').get().n,0);
 db.close();
});
