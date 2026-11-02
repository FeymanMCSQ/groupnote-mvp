const $=(selector)=>document.querySelector(selector);
const $$=(selector)=>[...document.querySelectorAll(selector)];
const views={home:$('#homeView'),create:$('#createView'),card:$('#cardView'),sample:$('#sampleView')};
let currentCard=null,cardId=null,ownerKey=null,pollTimer=null,toastTimer=null;
const occasionTitles={Farewell:'A VERY SPECIAL FAREWELL',Birthday:'HAPPIEST OF BIRTHDAYS','Thank you':'WITH SO MUCH GRATITUDE',Congratulations:'THREE CHEERS FOR YOU','Get well':'SENDING GOOD THOUGHTS','Just because':'A LITTLE SOMETHING FOR YOU'};
const turn = view => {
  for(const [key,el] of Object.entries(views))el.classList.toggle('hidden',key!==view);
  if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
  window.scrollTo({top:0,behavior:'instant'});
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
 if(location.hash==='#create'){turn('create');return;}
 if(location.hash==='#sample'){turn('sample');return;}
 turn('home');
};
const nav = (target,params='')=>{
 const base=location.protocol==='file:'? location.pathname : '/';
 history.pushState({},'',target==='home'?base:target==='card'?`${base}?${params}`:`${base}#${target}`);
 routes();
};
window.addEventListener('popstate',routes);
$('#navCreate').onclick=$('#heroCreate').onclick=$('#bottomCreate').onclick=$('#sampleCreate').onclick=()=>nav('create');
$('#backHome').onclick=$('#cardBack').onclick=$('#sampleBack').onclick=()=>nav('home');
$('#seeSample').onclick=()=>nav('sample');
$('#navHow').addEventListener('click',e=>{if(!views.home.classList.contains('hidden'))return;e.preventDefault();nav('home');setTimeout(()=>$('#how').scrollIntoView({behavior:'smooth'}),60)});
$('#year').textContent=new Date().getFullYear();

const form=$('#createForm');
const updatePreview=()=>{
 const title=$('#title').value.trim() || "We'll miss you, Jordan!";
 $('#previewTitle').textContent=title;
 const selected=form.elements.theme.value||'peach';
 $('#createPreview').className=`live-preview theme-${selected}`;
 $$('.theme-select').forEach(el=>el.classList.toggle('active',el.dataset.theme===selected));
 $('#preview-flower');
 $('#createPreview .preview-flower').textContent={peach:'✿',sage:'✺',sky:'✧'}[selected];
};
form.addEventListener('input',updatePreview);
form.addEventListener('change',updatePreview);
form.addEventListener('submit',async e=>{
 e.preventDefault();error('#createError','');
 const btn=$('#createSubmit');btn.disabled=true;btn.firstChild.textContent='Creating your card… ';
 const fields=Object.fromEntries(new FormData(form));
 try{
  const result=await api('/api/cards',{method:'POST',body:JSON.stringify(fields)});
  const id=result.id,key=result.ownerKey;
  // The organiser's private link includes a key: share the *invite* link, never this one.
  localStorage.setItem(`groupnote-owner-${id}`,key);
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
  $('#cardCover').className=`card-display theme-${c.theme}`;
  $('#cardOccasion').textContent=occasionTitles[c.occasion]||'A LITTLE SOMETHING FOR YOU';
  $('#cardTitle').textContent=c.title;
  $('#cardRecipient').textContent=c.recipient.toUpperCase();
  $('#cardIntro').textContent=c.intro||'A whole lot of love, just for you.';
  $('#cardMain .card-mark').textContent={peach:'✿',sage:'✺',sky:'✧'}[c.theme]||'✿';
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
 try{
  await api(`/api/cards/${cardId}/messages`,{method:'POST',body:JSON.stringify(fields)});
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
  await api(`/api/cards/${cardId}`,{method:'DELETE',body:JSON.stringify({ownerKey})});
  try{localStorage.removeItem(`groupnote-owner-${cardId}`)}catch{}
  currentCard=null;cardId=null;ownerKey=null;form.reset();updatePreview();nav('home');toast('Card permanently deleted.');
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
 try{await navigator.clipboard.writeText(url);toast('Invite link copied — send it to everyone!')}
 catch{window.prompt('Copy this invite link:',url)}
};
$('#nativeShare').onclick=async()=>{
 const url=shareUrl();
 if(navigator.share){try{await navigator.share({title:currentCard?.title||'GroupNote',text:'Add your message to this group card!',url})}catch{}}
 else {try{await navigator.clipboard.writeText(url);toast('Link copied!')}catch{window.prompt('Copy your link:',url)}}
};
$('#cardPrint').onclick=()=>window.print();
routes();
