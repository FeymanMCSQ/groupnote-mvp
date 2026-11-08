// Only fixed marketing copy is interpolated. Never render card data or query values.
const pages = {
 '/farewell-card': {
  occasion:'Farewell', title:'Free Online Group Farewell Cards | GroupNote',
  description:'Bring colleagues, classmates or committee members together to sign a free online farewell card. Share one link and collect messages without accounts.',
  heading:'A proper goodbye,', emphasis:'from all of you.',
  intro:'For the colleague moving on, the classmate heading overseas or the committee member passing the baton. Gather everyone’s good wishes in one free group farewell card.',
  label:'A VERY SPECIAL FAREWELL', sample:'Here’s to your<br/>next adventure!', theme:'peach', mark:'✿',
  note:'Thank you for the laughs, the advice and the tea breaks. You’ll be missed!',
  steps:['Make a leaving card','Choose a title and a look for the person starting their next chapter.', 'Gather the goodbyes','Pass the invitation link around your team, class or committee. Everyone signs without an account.', 'Send them off together','Close contributions when everyone has signed, then send the same card link to the recipient.'],
  faqs:[['Can colleagues sign from different places?','Yes. Share the invitation link with your team, including remote colleagues. Each person adds their own name and message without creating an account.'],['Can I keep collecting messages before the farewell?','Yes. Keep your private organiser link to close contributions when you’re ready. You can reopen them if someone missed out.'],['How do I give someone their farewell card?','Send the invitation link to the recipient when the card is ready. You can also use Save as PDF in your browser to keep or print a copy.']]
 },
 '/birthday-card': {
  occasion:'Birthday', title:'Free Online Group Birthday Cards | GroupNote',
  description:'Create a free online group birthday card for friends or family. Invite everyone to add birthday wishes with one shared link. No accounts needed.',
  heading:'All their favourite people.', emphasis:'One happy birthday.',
  intro:'Near or far, give friends and family a place to leave birthday wishes together. Start a free group birthday card, share the signing link and make their day a little brighter.',
  label:'HAPPIEST OF BIRTHDAYS', sample:'Another year,<br/>more reasons<br/>to celebrate!', theme:'sky', mark:'✧',
  note:'Here’s to more adventures, more cake and another wonderful year together!',
  steps:['Start the celebration','Pick a birthday title and a look, then make it personal with your own opening note.', 'Invite their people','Send one invitation link to friends or family. They can leave birthday wishes without signing up.', 'Make their day','When the wishes are in, share the finished card with the birthday person or save it as a PDF.'],
  faqs:[['Can friends and family sign the same birthday card?','Yes. Anyone with the invitation link can add a message without an account, even if they’re in a different city or time zone.'],['Can I change the birthday message on the cover?','Yes. Before creating the card, you can edit the suggested title, recipient, opening note and theme in the existing creator.'],['Is the birthday card a surprise?','Only people with the card link can open it. Keep the invitation within your signing group until you’re ready to send it to the birthday person.']]
 },
 '/christmas-card': {
  occasion:'Christmas', title:'Free Online Group Christmas Cards | GroupNote',
  description:'Make a free online group Christmas card for your team, society or group. Collect festive messages through one signing link, with no contributor accounts.',
  heading:'A little festive cheer,', emphasis:'from everyone here.',
  intro:'Bring your workplace team, society or group together for a shared Christmas greeting. Collect festive wishes in one free card, whether everyone’s at the same table or celebrating miles apart.',
  label:'A LITTLE CHRISTMAS CHEER', sample:'Warm wishes<br/>from all<br/>of us.', theme:'sage', mark:'❄',
  note:'Wishing you a peaceful Christmas and a new year full of good things.',
  steps:['Set a festive tone','Start with Christmas selected, then personalise the cover and opening greeting for your group.', 'Bring the group together','Share the signing link with your team or society. Contributors add their festive wishes without accounts.', 'Share the good wishes','Close contributions when your group is finished and send the card link, or save a PDF to print.'],
  faqs:[['Can a whole team contribute to one Christmas card?','Yes. A workplace team, society or group can all use the same invitation link. Each card supports up to 200 messages.'],['Can I write my own holiday greeting?','Yes. The suggested Christmas title is editable. Choose your own wording, opening note and theme before creating the card.'],['Do contributors need to register?','No. They open the shared link, enter their name and message, and sign. There’s no account or subscription required.']]
 }
};

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const marketingPaths = ['/', ...Object.keys(pages)];

function origin(value) {
 const url = new URL(value);
 if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Invalid public site origin');
 return url.origin;
}

function landing(page) {
 const cta=`/?occasion=${page.occasion}#create`;
 return `<section id="homeView" class="home-view occasion-view" data-occasion="${page.occasion}">
 <div class="hero-shell"><div class="hero-copy"><p class="eyebrow">A GROUPNOTE FOR ${page.occasion.toUpperCase()}</p><h1>${page.heading}<br/><em>${page.emphasis}</em></h1><p class="hero-subtitle">${page.intro}</p><div class="hero-actions"><a class="btn btn-coral" id="heroCreate" href="${cta}">Create free card <span aria-hidden="true">↗</span></a><button class="btn btn-text" id="seeSample">See an example <span aria-hidden="true">→</span></button></div><div class="hero-benefits"><span>✓ Free to create</span><span>✓ No accounts needed</span><span>✓ One shared link</span></div></div>
 <div class="occasion-example" aria-label="Example ${page.occasion.toLowerCase()} card"><p class="preview-label">A LITTLE INSPIRATION</p><div class="live-preview theme-${page.theme}"><div class="mini-eyebrow">${page.label}</div><div class="preview-flower" aria-hidden="true">${page.mark}</div><div class="preview-title">${page.sample}</div><div class="preview-rule"></div><div class="preview-foot">with love, from all of us ♡</div></div><article class="message-bubble"><span aria-hidden="true">💛</span><p>${page.note}</p><small>An example message from your group</small></article></div></div>
 <div class="steps" id="how"><p class="kicker">ONE CARD, EVERYONE’S WORDS</p><h2>A little effort. <em>A lot of love.</em></h2><div class="steps-grid">${[0,2,4].map((index,i)=>`<article><span class="step-icon icon-${['orange','mint','lavender'][i]}" aria-hidden="true">${['✎','↗','♡'][i]}</span><div class="step-number">0${i+1}</div><h3>${page.steps[index]}</h3><p>${page.steps[index+1]}</p></article>`).join('')}</div></div>
 <section class="occasion-faq" aria-labelledby="faqHeading"><p class="kicker">A FEW LITTLE DETAILS</p><h2 id="faqHeading">Your ${page.occasion.toLowerCase()} card questions</h2>${page.faqs.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>
 <div class="bottom-banner"><div><p class="kicker">BETTER SAID TOGETHER</p><h2>Make their ${page.occasion.toLowerCase()} <em>one to remember.</em></h2></div><a id="bottomCreate" class="btn btn-dark" href="${cta}">Create free card <span aria-hidden="true">↗</span></a></div>
 </section>`;
}

export async function marketing(request, env) {
 const url=new URL(request.url), path=url.pathname.replace(/\/$/,'')||'/';
 const publicPage=marketingPaths.includes(path) && !url.searchParams.has('card') && !url.searchParams.has('key') && !url.searchParams.has('occasion');
 const site=origin(env.PUBLIC_SITE_ORIGIN || url.origin);
 // Enable only after attaching a future custom domain. Never redirect private links.
 if(publicPage && env.MARKETING_REDIRECT_FROM && url.origin===origin(env.MARKETING_REDIRECT_FROM) && url.origin!==site){
  return Response.redirect(site+url.pathname+url.search,301);
 }
 if(url.pathname==='/sitemap.xml'){
  const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${marketingPaths.map(path=>`<url><loc>${escape(site+path)}</loc></url>`).join('')}</urlset>`;
  return new Response(request.method==='HEAD'?null:xml,{headers:{'content-type':'application/xml; charset=utf-8'}});
 }
 if(url.pathname==='/robots.txt'){
  // Allow crawling private URLs so search engines can see their noindex directive.
  return new Response(request.method==='HEAD'?null:`User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`,{headers:{'content-type':'text/plain; charset=utf-8'}});
 }
 const page=pages[path];
 const shell=path==='/'||path==='/index.html'||page;
 const assetUrl=new URL(shell?'/':url.pathname,url);
 // Fetch an unconditional shell, then supply our own response headers after rendering.
 const asset=await env.ASSETS.fetch(new Request(assetUrl));
 const headers=new Headers(asset.headers);
 headers.set('X-Robots-Tag','noindex, nofollow');
 if(!shell||!headers.get('content-type')?.includes('text/html'))return new Response(request.method==='HEAD'?null:asset.body,{status:asset.status,headers});
 let html=await asset.text();
 if(page)html=html.replace(/<!-- home:start -->[\s\S]*?<!-- home:end -->/,landing(page));
 const title=page?.title||'GroupNote — Little messages. Big feelings.';
 const description=page?.description||'Create a beautiful group card. Invite friends and teammates to add notes, then share one unforgettable keepsake. Free to start.';
 html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${escape(title)}</title>`)
  .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${escape(description)}"/>`);
 if(publicPage){
  headers.set('X-Robots-Tag','index, follow');
  html=html.replace('<meta name="robots" content="noindex, nofollow"/>',`<meta name="robots" content="index, follow"/>
<link rel="canonical" href="${escape(site+path)}"/>
<meta property="og:type" content="website"/><meta property="og:site_name" content="GroupNote"/>
<meta property="og:title" content="${escape(title)}"/><meta property="og:description" content="${escape(description)}"/><meta property="og:url" content="${escape(site+path)}"/>`);
 }
 // Verification token belongs to the operator. It is public and optional.
 if(env.GOOGLE_SITE_VERIFICATION)html=html.replace('</head>',`<meta name="google-site-verification" content="${escape(env.GOOGLE_SITE_VERIFICATION)}"/></head>`);
 headers.set('content-type','text/html; charset=utf-8');
 headers.set('cache-control','no-store'); // Query-dependent indexing directives must never leak across requests.
 headers.delete('etag');headers.delete('content-length');headers.delete('content-encoding');
 return new Response(request.method==='HEAD'?null:html,{status:asset.status,headers});
}
