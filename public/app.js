import {occasions,templates,getTemplate,defaultTemplate,suggestedTitle,templateClass,templateStyle,overline,decoration,miniature} from './templates.js';

// A browser-only opt-out contains no identifier and is never stored in D1.
const analyticsPreference = (() => {
  let excluded = false, notice = '';
  try {
    const choice = new URLSearchParams(location.search).get('analytics');
    if (choice === 'off') {
      excluded = true;
      notice = 'Analytics excluded in this browser. Reload other open GroupNote tabs.';
      try { localStorage.setItem('groupnote-analytics-excluded', '1'); }
      catch { notice = 'Analytics excluded for this page only; browser storage is blocked.'; }
    } else if (choice === 'on') {
      localStorage.removeItem('groupnote-analytics-excluded');
      notice = 'Analytics enabled in this browser. Reload other open GroupNote tabs.';
    } else {
      excluded = localStorage.getItem('groupnote-analytics-excluded') === '1';
      if (excluded) notice = 'Analytics excluded in this browser.';
    }
  } catch {} // Storage restrictions must not stop normal use.
  return {excluded, notice};
})();

// Optional analytics: initialization and sending failures never block the app.
const acquisition = (() => {
  if (analyticsPreference.excluded) return {source: 'direct', track() {}};
  try {
    // Keep campaign labels in sync with src/worker.js.
    const sources = new Set(['direct', 'uni_email', 'other']);
    const normalize = value => value == null ? 'direct' : sources.has(value) ? value : 'other';
    const params = new URLSearchParams(location.search);
    let source = 'direct';
    try { source = normalize(sessionStorage.getItem('groupnote-source')); } catch {}
    if (!params.has('card') && !params.has('key') && params.has('src')) source = normalize(params.get('src'));
    try { sessionStorage.setItem('groupnote-source', source); } catch {}
    const seen = new Set();
    const formatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    function track(view) {
      try {
        const event = {home: 'landing', create: 'create_open'}[view];
        if (!event || (view === 'home' && new URLSearchParams(location.search).has('card'))) return;
        const parts = formatter.formatToParts(new Date());
        const day = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
        const key = `groupnote-acquisition:${day}:${source}:${event}`;
        if (seen.has(key)) return;
        try { if (sessionStorage.getItem(key) === '1') return; } catch {}
        seen.add(key);
        try { sessionStorage.setItem(key, '1'); } catch {}
        // Never send the page URL/referrer, a session ID, or any card/form data.
        void fetch('/api/acquisition', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({event, source}), credentials: 'omit',
          referrerPolicy: 'no-referrer', keepalive: true
        }).catch(() => {});
      } catch {} // Analytics must not interrupt navigation or card forms.
    }
    return {source, track};
  } catch { return {source: 'direct', track() {}}; }
})();

// Per-card tab-session event IDs deduplicate refreshes; no visitor ID is used.
const lifecycle = (() => {
  const invites = new Map();
  const token = () => {
    try { return Array.from(crypto.getRandomValues(new Uint8Array(24)), x => x.toString(16).padStart(2,'0')).join(''); }
    catch { return null; }
  };
  function send(id, event) {
    try {
      if (analyticsPreference.excluded || !event.eventId) return;
      void fetch(`/api/cards/${id}/events`, {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(event), credentials:'omit', referrerPolicy:'no-referrer', keepalive:true}).catch(()=>{});
    } catch {}
  }
  return {token,
    invite(id) {
      try {
        if (analyticsPreference.excluded || new URLSearchParams(location.search).has('key') || invites.has(id)) return;
        const storageKey=`groupnote-invite-event:${id}`;
        let eventId;
        try { eventId=sessionStorage.getItem(storageKey); } catch {}
        if (!/^[a-f0-9]{48}$/.test(eventId || '')) eventId=token();
        if (!eventId) return;
        invites.set(id,eventId);
        try { sessionStorage.setItem(storageKey,eventId); } catch {}
        send(id,{event:'invite_opened',eventId});
      } catch {}
    },
    share(id,method) {
      const eventId=token();
      send(id,{event:'share_clicked',eventId,method,outcome:'attempted'});
      return outcome=>send(id,{event:'share_clicked',eventId,method,outcome});
    }
  };
})();

const $=(selector)=>document.querySelector(selector);
const $$=(selector)=>[...document.querySelectorAll(selector)];
const views={home:$('#homeView'),create:$('#createView'),card:$('#cardView'),sample:$('#sampleView')};
let currentCard=null,cardId=null,ownerKey=null,pollTimer=null,toastTimer=null;
const landingOccasion=$('#homeView')?.dataset?.occasion;
const initialRobots=$('meta[name="robots"]')?.content;
let presetApplied=false;
const turn = view => {
  for(const [key,el] of Object.entries(views))el.classList.toggle('hidden',key!==view);
  if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
  window.scrollTo({top:0,behavior:'instant'});
  acquisition.track(view);
  $('meta[name="robots"]')?.setAttribute?.('content',view==='home'?initialRobots||'noindex, nofollow':'noindex, nofollow');
};
const toast=(text)=>{clearTimeout(toastTimer);const el=$('#toast');el.textContent=text;el.classList.remove('hidden');toastTimer=setTimeout(()=>el.classList.add('hidden'),3500)};
const error=(id,text)=>{const el=$(id);el.textContent=text;el.classList.toggle('hidden',!text)};
const api=async(path,options={})=>{
 const res=await fetch(path,{headers:{'Content-Type':'application/json'},...options});
 let data;try{data=await res.json()}catch{throw Error('Server is unavailable. Check your connection and try again.')}
 if(!res.ok)throw Error(data.error||'Something went wrong.');
 return data;
};
const routes = () => {
 const qs=new URLSearchParams(location.search);
 const id=qs.get('card');
 if(id && /^[a-f0-9]{24}$/.test(id)){
   cardId=id;ownerKey=qs.get('key')||null;
   turn('card');loadCard();return;
 }
 if(location.hash==='#create'){
   const occasion=qs.get('occasion')||landingOccasion;
   if(Object.hasOwn(occasions,occasion)&&!presetApplied){
     $('#occasion').value=occasion;
     chooseOccasion();presetApplied=true;
   }
   turn('create');return;
 }
 if(location.hash==='#sample'){turn('sample');return;}
 turn('home');
};
const nav = (target,params='')=>{
 if(target==='home'&&landingOccasion){location.assign('/');return;}
 const base=location.protocol==='file:'? location.pathname : '/';
 const formBase=landingOccasion?location.pathname:base;
 const query=new URLSearchParams(location.search);
 query.delete('card');query.delete('key');
 const formQuery=query.size?'?'+query.toString():'';
 history.pushState({},'',target==='home'?base:target==='card'?`${base}?${params}`:`${formBase}${formQuery}#${target}`);
 routes();
};
window.addEventListener('popstate',routes);
$('#navCreate').onclick=$('#heroCreate').onclick=$('#bottomCreate').onclick=$('#sampleCreate').onclick=e=>{e?.preventDefault();nav('create');};
$('#backHome').onclick=$('#cardBack').onclick=$('#sampleBack').onclick=()=>nav('home');
$('#seeSample').onclick=()=>{if(landingOccasion){$('.occasion-example').scrollIntoView({behavior:'smooth'});return;}nav('sample');};
$('#navHow').addEventListener('click',e=>{if(!views.home.classList.contains('hidden'))return;e.preventDefault();nav('home');setTimeout(()=>$('#how').scrollIntoView({behavior:'smooth'}),60)});
$('#year').textContent=new Date().getFullYear();

const form=$('#createForm');
let createAttempt=null, messageAttempt=null;
let titleEdited=!!$('#title').value;
function requestAttempt(fields,previous) {
 const values=JSON.stringify(fields);
 const attempt=previous?.values===values?previous:{values,requestId:lifecycle.token()};
 if(attempt.requestId)fields.requestId=attempt.requestId;
 return attempt;
}
const updatePreview=()=>{
 const selected=getTemplate(form.elements.theme.value);
 const title=$('#title').value.trim() || suggestedTitle(selected,$('#occasion').value);
 $('#previewTitle').textContent=title;
 $('#createPreview').className=templateClass(selected,'live-preview');
 $('#createPreview').setAttribute('style',templateStyle(selected));
 $('#createPreview').dataset.template=selected.id;
 $$('.template-choice').forEach(el=>el.classList.toggle('active',el.dataset.theme===selected.id));
 $('#createPreview .mini-eyebrow').textContent=overline(selected,$('#occasion').value);
 $('#createPreview .preview-flower').innerHTML=decoration(selected,$('#occasion').value);
};
function chooseOccasion(){
 const occasion=$('#occasion').value;
 const matching=templates.filter(template=>template.occasion===occasion);
 const classics=templates.filter(template=>template.occasion===null);
 const choice=template=>`<label class="template-choice" data-theme="${template.id}"><input type="radio" name="theme" value="${template.id}"/>${miniature(template,{occasion})}<span class="template-choice-name">${template.name}</span><span class="template-selected" aria-hidden="true">✓ Selected</span></label>`;
 $('#occasionTemplates').innerHTML=matching.map(choice).join('');
 $('#classicTemplates').innerHTML=classics.map(choice).join('');
 $('#occasionTemplateLabel').textContent=matching.length?'Made for '+occasion.toLowerCase():'Choose a classic look';
 form.elements.theme.value=defaultTemplate(occasion).id;
 if(!titleEdited)$('#title').value=suggestedTitle(defaultTemplate(occasion),occasion);
 updatePreview();
}
form.addEventListener('input',e=>{if(e.target?.id==='title')titleEdited=true;updatePreview();});
form.addEventListener('change',e=>{
 if(e.target?.id==='occasion'){chooseOccasion();return;}
 if(e.target?.name==='theme'&&!titleEdited)$('#title').value=suggestedTitle(getTemplate(e.target.value),$('#occasion').value);
 updatePreview();
});
form.addEventListener('submit',async e=>{
 e.preventDefault();error('#createError','');
 const btn=$('#createSubmit');btn.disabled=true;btn.firstChild.textContent='Creating your card… ';
 const fields=Object.fromEntries(new FormData(form));
 fields.acquisitionSource=acquisition.source;
 if(analyticsPreference.excluded)fields.excludeFromAnalytics=true;
 createAttempt=requestAttempt(fields,createAttempt);
 try{
  const result=await api('/api/cards',{method:'POST',body:JSON.stringify(fields)});
  const id=result.id,key=result.ownerKey;
  createAttempt=null;
  // The organiser's private link includes a key: share the *invite* link, never this one.
  try{localStorage.setItem(`groupnote-owner-${id}`,key)}catch{}
  nav('card',`card=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`);
  toast('Your card is ready. Invite people to sign!');
 }catch(err){error('#createError',err.message)}finally{btn.disabled=false;btn.firstChild.textContent='Create my card '}
});

const drawMessages=(messages)=>{
 const grid=$('#messageGrid');grid.replaceChildren();
 if(!messages.length){
  const empty=document.createElement('div');empty.className='empty-card';
  const img=document.createElement('div');img.textContent='💌';
  const p=document.createElement('p');p.textContent='Good things are coming.';
  const sm=document.createElement('small');sm.textContent='Be the first to leave a message.';
  empty.append(img,p,sm);grid.append(empty);return;
 }
 for(const message of messages){
  const card=document.createElement('article');card.className='message-bubble';
  const emoji=document.createElement('span');emoji.textContent=message.emoji;
  const p=document.createElement('p');p.textContent=message.body;
  const author=document.createElement('small');author.textContent=`— ${message.author}`;
  card.append(emoji,p,author);grid.append(card);
 }
};
const loadCard=async(silent=false)=>{
 if(!cardId)return;
 try{
  const c=await api(`/api/cards/${cardId}`);
  // Avoid stale response replacing another card when navigating rapidly.
  if(cardId!==c.id||views.card.classList.contains('hidden'))return;
  const msgCountBefore=currentCard?.messages.length;
  currentCard=c;
  lifecycle.invite(c.id);
  const design=getTemplate(c.theme);
  $('#cardCover').className=templateClass(design,'card-display');
  $('#cardCover').setAttribute('style',templateStyle(design));
  $('#cardCover').dataset.template=design.id;
  $('#cardOccasion').textContent=overline(design,c.occasion);
  $('#cardTitle').textContent=c.title;
  $('#cardRecipient').textContent=c.recipient.toUpperCase();
  $('#cardIntro').textContent=c.intro||'A whole lot of love, just for you.';
  $('#cardMain .card-mark').innerHTML=decoration(design,c.occasion);
  $('#messageCount').textContent=c.messages.length;
  if(msgCountBefore!==c.messages.length || !silent)drawMessages(c.messages);
  $('#signSection').classList.toggle('hidden',c.is_closed);
  $('#closedNote').classList.toggle('hidden',!c.is_closed);
  $('#ownerBanner').classList.toggle('hidden',!ownerKey);
  $('#toggleClose').textContent=c.is_closed?'Reopen messages':'Close messages';
  if(!pollTimer)pollTimer=setInterval(()=>{if(!document.hidden&&cardId)loadCard(true)},15000);
 }catch(err){if(!silent){toast(err.message);$('#cardTitle').textContent='Card unavailable';$('#cardIntro').textContent='Please check the invite link.';$('#signSection').classList.add('hidden');}}
};
$('#messageForm').addEventListener('submit',async e=>{
 e.preventDefault();error('#messageError','');
 const btn=$('#postMessage');btn.disabled=true;btn.firstChild.textContent='Adding your message… ';
 const fields=Object.fromEntries(new FormData(e.currentTarget));
 if(analyticsPreference.excluded)fields.excludeFromAnalytics=true;
 messageAttempt=requestAttempt(fields,messageAttempt?.cardId===cardId?messageAttempt:null);
 messageAttempt.cardId=cardId;
 try{
  await api(`/api/cards/${cardId}/messages`,{method:'POST',body:JSON.stringify(fields)});
  messageAttempt=null;
  $('#messageBody').value='';
  // Keep name so participant can add another message if desired.
  await loadCard();
  toast('Message added! You just made their day.');
 }catch(err){error('#messageError',err.message)}finally{btn.disabled=false;btn.firstChild.textContent='Add my message '}
});
$$('#emojiChoices label').forEach(label=>label.onclick=()=>{$$('#emojiChoices label').forEach(x=>x.classList.remove('chosen'));label.classList.add('chosen')});
$('#deleteCard').onclick=async()=>{
 if(!ownerKey||!cardId)return;
 if(!window.confirm('Permanently delete this card and all its messages? This cannot be undone.'))return;
 try{
  await api(`/api/cards/${cardId}`,{method:'DELETE',body:JSON.stringify({ownerKey,...(analyticsPreference.excluded?{excludeFromAnalytics:true}:{})})});
  try{localStorage.removeItem(`groupnote-owner-${cardId}`)}catch{}
  currentCard=null;cardId=null;ownerKey=null;form.reset();titleEdited=false;chooseOccasion();nav('home');toast('Card permanently deleted.');
 }catch(err){toast(err.message)}
};
$('#toggleClose').onclick=async()=>{
 if(!ownerKey||!cardId)return;
 const closed=!currentCard?.is_closed;
 if(closed && !window.confirm('Close this card to new messages? You can reopen it using your organiser link.'))return;
 try{await api(`/api/cards/${cardId}/close`,{method:'POST',body:JSON.stringify({ownerKey,closed})});await loadCard();toast(closed?'Card closed to new messages.':'Card reopened.')}catch(err){toast(err.message)}
};
const shareUrl=()=>new URL(`/?card=${encodeURIComponent(cardId)}`,location.origin).toString();
$('#copyCardLink').onclick=async()=>{
 const url=shareUrl();
 const finish=lifecycle.share(cardId,'copy_link');
 try{await navigator.clipboard.writeText(url);finish('copied');toast('Invite link copied — send it to everyone!')}
 catch{finish('manual_copy');window.prompt('Copy this invite link:',url)}
};
$('#nativeShare').onclick=async()=>{
 const url=shareUrl();
 const finish=lifecycle.share(cardId,'native_share');
 if(navigator.share){try{await navigator.share({title:currentCard?.title||'GroupNote',text:'Add your message to this group card!',url});finish('completed')}catch(err){finish(err?.name==='AbortError'?'cancelled':'failed')}}
 else {try{await navigator.clipboard.writeText(url);finish('fallback_copied');toast('Link copied!')}catch{finish('manual_copy');window.prompt('Copy your link:',url)}}
};
$('#cardPrint').onclick=()=>window.print();
chooseOccasion();
routes();
if(analyticsPreference.notice)toast(analyticsPreference.notice);
