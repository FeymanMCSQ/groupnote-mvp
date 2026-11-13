// Only fixed marketing copy is interpolated. Never render card data or query values.
import {occasions,defaultTemplate,miniature,escapeHtml as escape} from '../public/templates.js';
const pages = {
 '/farewell-card': {
  occasion:'Farewell', title:'Free Online Group Farewell Cards | GroupNote',
  description:'Bring colleagues, classmates or committee members together to sign a free online farewell card. Share one link and collect messages without accounts.',
  heading:'A proper goodbye,', emphasis:'from all of you.',
  intro:'For the colleague moving on, the classmate heading overseas or the committee member passing the baton. Gather everyone’s good wishes in one free group farewell card.',
  note:'Thank you for the laughs, the advice and the tea breaks. You’ll be missed!',
  steps:['Make a leaving card','Choose a title and a look for the person starting their next chapter.', 'Gather the goodbyes','Pass the invitation link around your team, class or committee. Everyone signs without an account.', 'Send them off together','Close contributions when everyone has signed, then send the same card link to the recipient.'],
  faqs:[['Can colleagues sign from different places?','Yes. Share the invitation link with your team, including remote colleagues. Each person adds their own name and message without creating an account.'],['Can I keep collecting messages before the farewell?','Yes. Keep your private organiser link to close contributions when you’re ready. You can reopen them if someone missed out.'],['How do I give someone their farewell card?','Send the invitation link to the recipient when the card is ready. You can also use Save as PDF in your browser to keep or print a copy.']]
 },
 '/birthday-card': {
  occasion:'Birthday', title:'Free Online Group Birthday Cards | GroupNote',
  description:'Create a free online group birthday card for friends or family. Invite everyone to add birthday wishes with one shared link. No accounts needed.',
  heading:'All their favourite people.', emphasis:'One happy birthday.',
  intro:'Near or far, give friends and family a place to leave birthday wishes together. Start a free group birthday card, share the signing link and make their day a little brighter.',
  note:'Here’s to more adventures, more cake and another wonderful year together!',
  steps:['Start the celebration','Pick a birthday title and a look, then make it personal with your own opening note.', 'Invite their people','Send one invitation link to friends or family. They can leave birthday wishes without signing up.', 'Make their day','When the wishes are in, share the finished card with the birthday person or save it as a PDF.'],
  faqs:[['Can friends and family sign the same birthday card?','Yes. Anyone with the invitation link can add a message without an account, even if they’re in a different city or time zone.'],['Can I change the birthday message on the cover?','Yes. Before creating the card, you can edit the suggested title, recipient, opening note and theme in the existing creator.'],['Is the birthday card a surprise?','Only people with the card link can open it. Keep the invitation within your signing group until you’re ready to send it to the birthday person.']]
 },
 '/christmas-card': {
  occasion:'Christmas', title:'Free Online Group Christmas Cards | GroupNote',
  description:'Make a free online group Christmas card for your team, society or group. Collect festive messages through one signing link, with no contributor accounts.',
  heading:'A little festive cheer,', emphasis:'from everyone here.',
  intro:'Bring your workplace team, society or group together for a shared Christmas greeting. Collect festive wishes in one free card, whether everyone’s at the same table or celebrating miles apart.',
  note:'Wishing you a peaceful Christmas and a new year full of good things.',
  steps:['Set a festive tone','Start with Christmas selected, then personalise the cover and opening greeting for your group.', 'Bring the group together','Share the signing link with your team or society. Contributors add their festive wishes without accounts.', 'Share the good wishes','Close contributions when your group is finished and send the card link, or save a PDF to print.'],
  faqs:[['Can a whole team contribute to one Christmas card?','Yes. A workplace team, society or group can all use the same invitation link. Each card supports up to 200 messages.'],['Can I write my own holiday greeting?','Yes. The suggested Christmas title is editable. Choose your own wording, opening note and theme before creating the card.'],['Do contributors need to register?','No. They open the shared link, enter their name and message, and sign. There’s no account or subscription required.']]
 },
 '/thank-you-card': {
  occasion:'Thank you', title:'Free Online Group Thank You Cards | GroupNote',
  description:'Gather a group’s gratitude in a free online thank-you card. Invite teammates, friends or society members to sign one shared card without accounts.',
  heading:'So many reasons to say it.', emphasis:'One heartfelt thank you.',
  intro:'For the mentor who made time, the volunteer who showed up or the team that went the extra mile. Bring your group’s appreciation together in a floral or handwritten-inspired thank-you card.',
  note:'Thank you for all the little things you do. They make a bigger difference than you know.',
  steps:['Choose a thoughtful look','Pick a floral or handwritten-inspired design and personalise your thank-you message.', 'Gather the gratitude','Share one signing link with everyone who wants to say thanks. Contributors sign without accounts.', 'Deliver your appreciation','Send the finished card link, or save a PDF to print and give in person.'],
  faqs:[['Can our society thank a volunteer together?','Yes. Start one card and pass the invitation link to members. Each person can add a name and message without signing up.'],['Can I write my own thank-you title?','Yes. All suggested titles are editable. Changing designs keeps the title you have written yourself.'],['Can late contributors still sign?','Keep your private organiser link to reopen contributions if you have already closed the card.']]
 },
 '/diwali-card': {
  occasion:'Diwali', title:'Free Online Group Diwali Cards | GroupNote',
  description:'Create a free online group Diwali card with diya and rangoli-inspired designs. Collect festival wishes from your society, friends or team without accounts.',
  heading:'Light up the celebration,', emphasis:'together.',
  intro:'Bring your society, friends or workplace group together for Diwali. Choose a diya or rangoli-inspired design and collect everyone’s festival wishes in one shared card.',
  note:'May this festival bring light, happiness and wonderful moments with the people you love.',
  steps:['Choose your Diwali design','Start with warm diya lights or gold rangoli-inspired ornamentation, then add your own greeting.', 'Invite your group','Pass around the signing link so friends, society members or teammates can add wishes without accounts.', 'Share the celebration','Send your card link when everyone has contributed, or save a PDF keepsake.'],
  faqs:[['Can a university society create one shared Diwali greeting?','Yes. Invite society members using the same signing link. Everyone can contribute their own message without an account.'],['What decorations are available?','Festival of Lights features diyas. Golden Celebration uses rangoli-inspired ornamentation. Both designs allow your own wording.'],['Can we write greetings in different languages?','Yes. Titles and messages support Unicode text. The appearance of each script depends on the fonts available in the reader’s browser.']]
 },
 '/new-year-card': {
  occasion:'New Year', title:'Free Online Group New Year Cards | GroupNote',
  description:'Welcome a new year together with a free online group card. Choose midnight or golden fireworks, collect group wishes and share one card without accounts.',
  heading:'New beginnings.', emphasis:'All your people.',
  intro:'Celebrate the year ahead with friends, colleagues or your society. Choose midnight fireworks or a champagne-gold design, then collect the group’s hopes and good wishes in one free card.',
  note:'Here’s to new adventures, shared successes and plenty of good moments together.',
  steps:['Set the celebratory mood','Choose a midnight or gold design and make the cover greeting your own.', 'Collect everyone’s wishes','Share one invitation link with your group. People add messages without registering.', 'Welcome what comes next','Send the completed card link or save the group’s wishes as a printable PDF.'],
  faqs:[['Will these designs work next year too?','Yes. The artwork has no fixed year. You can put a year in your own title if you wish.'],['Can a remote team contribute?','Yes. Anyone with the signing link can add a message from their browser, without an account.'],['Can I choose a quieter design?','Yes. The three classic neutral looks remain available in the creator alongside the occasion designs.']]
 }
};

const marketingPaths = ['/', ...Object.keys(pages)];

const homeTitle = 'Free Online Group Greeting Cards | GroupNote';
const homeDescription = 'Make a free group greeting card online for birthdays, farewells and thank-yous. Share one link, collect messages without accounts, and save as PDF.';
const homeQuestions = [
 ['How does an online group greeting card work?', 'Choose an occasion and design, add your greeting, then share the invitation link with your group. Everyone opens the same card and adds their name and message in their browser. When the messages are ready, send that card link to the recipient.'],
 ['Is GroupNote free, and do people need accounts?', 'GroupNote is free to create and sign. Organisers and contributors do not need accounts, a subscription or payment details. Each card can collect up to 200 messages.'],
 ['Can I finish collecting messages before sending the card?', 'Yes. Keep the private organiser link you receive when you create the card. Use it to close contributions before sharing the finished card with the recipient. You can reopen contributions if someone needs to sign later.'],
 ['Can I save or print the finished card?', 'Open the card and choose Save as PDF. Your browser opens its print dialog, where you can save a PDF or choose a printer. Check the print preview before saving, and enable background graphics if you want the design colours.'],
 ['Who can open the card and read its messages?', 'Anyone with the invitation link can read the card and, while contributions are open, add a message. There is no sign-in or password check. Share it only with the people you intend, and keep the separate organiser link private. Public search engines are instructed not to index individual cards.']
];

const writingQuestions = {
 Farewell: ['What can we write in a colleague’s leaving card?', 'Share a favourite moment, thank them for something specific and wish them well in their next chapter. For example, “Thank you for helping me find my feet on the team. I’ll miss our Monday coffee breaks. Good luck with the new role!”'],
 Birthday: ['What can we write in a group birthday card?', 'Mix a birthday wish with a shared memory or something you are looking forward to together. For example, “Happy birthday! Here’s to another year of weekend walks, questionable karaoke and celebrating the little wins with you.” Each person can add their own note.'],
 'Thank you': ['How can we make our thank-you messages more personal?', 'Name what the person did and the difference it made. For example, “Thank you for staying after every rehearsal to help us practise. Your patience gave us the confidence to get on stage.” Different memories from your group make the appreciation specific.'],
 Diwali: ['What can our group write in a Diwali card?', 'Add a greeting that suits your relationship with the recipient, alongside your own wishes for the celebration. For example, “Wishing you and your loved ones a joyful Diwali, with light, happiness and time together.” Group members can each choose their own wording.'],
 Christmas: ['What can a team write in a shared Christmas card?', 'Combine festive wishes with a genuine thank-you from the year. For example, “Merry Christmas, and thank you for bringing so much kindness to our team. Wishing you a restful break and happy moments with your favourite people.” Contributors can write their own individual greetings.'],
 'New Year': ['What can we write in a group New Year card?', 'Reflect on a moment you shared and something you hope the new year brings. For example, “Thank you for the adventures and encouragement this year. Here’s to new plans, more time together and celebrating whatever comes next.” You can put the year in your own title.']
};

function faq(heading, questions) {
 return `<section class="occasion-faq" aria-labelledby="faqHeading"><p class="kicker">A FEW LITTLE DETAILS</p><h2 id="faqHeading">${escape(heading)}</h2>${questions.map(([q,a])=>`<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('')}</section>`;
}

function origin(value) {
 const url = new URL(value);
 if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Invalid public site origin');
 return url.origin;
}

function collectionPreview() {
 const collections=Object.entries(occasions).filter(([,entry])=>entry.slug);
 return `<section class="hero-collections" aria-labelledby="collectionsHeading"><p class="kicker">A LITTLE LOOK AT OUR CARDS</p><h2 id="collectionsHeading">Pick your occasion.</h2><div class="collection-grid">${collections.map(([occasion,entry])=>`<a class="collection-preview" href="/${entry.slug}">${miniature(defaultTemplate(occasion),{occasion})}<span class="collection-name">${escape(occasion)} <span aria-hidden="true">↗</span></span><span class="collection-caption">2 designs to make your own</span></a>`).join('')}</div></section>`;
}

function landing(page) {
 const cta=`/?occasion=${encodeURIComponent(page.occasion)}#create`;
 const related=Object.entries(occasions).filter(([occasion,entry])=>entry.slug&&occasion!==page.occasion);
 return `<section id="homeView" class="home-view occasion-view" data-occasion="${page.occasion}">
 <div class="hero-shell"><div class="hero-copy"><p class="eyebrow">A GROUPNOTE FOR ${page.occasion.toUpperCase()}</p><h1>${page.heading}<br/><em>${page.emphasis}</em></h1><p class="hero-subtitle">${page.intro}</p><div class="hero-actions"><a class="btn btn-coral" id="heroCreate" href="${cta}">Create free card <span aria-hidden="true">↗</span></a><button class="btn btn-text" id="seeSample">See an example <span aria-hidden="true">→</span></button></div><div class="hero-benefits"><span>✓ Free to create</span><span>✓ No accounts needed</span><span>✓ One shared link</span></div></div>
 <div class="occasion-example" aria-label="Example ${page.occasion.toLowerCase()} card"><p class="preview-label">A LITTLE INSPIRATION</p>${miniature(defaultTemplate(page.occasion),{occasion:page.occasion,className:'live-preview'})}<article class="message-bubble"><span aria-hidden="true">💛</span><p>${page.note}</p><small>An example message from your group</small></article></div></div>
 <div class="steps" id="how"><p class="kicker">ONE CARD, EVERYONE’S WORDS</p><h2>A little effort. <em>A lot of love.</em></h2><div class="steps-grid">${[0,2,4].map((index,i)=>`<article><span class="step-icon icon-${['orange','mint','lavender'][i]}" aria-hidden="true">${['✎','↗','♡'][i]}</span><div class="step-number">0${i+1}</div><h3>${page.steps[index]}</h3><p>${page.steps[index+1]}</p></article>`).join('')}</div></div>
 ${faq(`Your ${page.occasion.toLowerCase()} card questions`, [...page.faqs, writingQuestions[page.occasion]])}
 <div class="bottom-banner"><div><p class="kicker">BETTER SAID TOGETHER</p><h2>Make their ${page.occasion.toLowerCase()} <em>one to remember.</em></h2></div><a id="bottomCreate" class="btn btn-dark" href="${cta}">Create free card <span aria-hidden="true">↗</span></a></div>
 <aside class="related-occasions"><p class="kicker">MORE MOMENTS TO SHARE</p><nav aria-label="Related occasions">${related.map(([occasion,entry])=>`<a href="/${entry.slug}">${escape(occasion)} cards</a>`).join('')}</nav></aside>
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
 else html=html.replace('<!-- collection-preview -->',collectionPreview()).replace('<!-- home-faq -->',faq('A group card, without the guesswork.',homeQuestions));
 const title=page?.title||homeTitle;
 const description=page?.description||homeDescription;
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
