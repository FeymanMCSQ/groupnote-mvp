// Shared by the browser and Worker. IDs are stored in the existing cards.theme field.
export const occasions = {
 Farewell: {slug:'farewell-card', overline:'A VERY SPECIAL FAREWELL', template:'farewell-botanical'},
 Birthday: {slug:'birthday-card', overline:'HAPPIEST OF BIRTHDAYS', template:'birthday-confetti'},
 'Thank you': {slug:'thank-you-card', overline:'WITH SO MUCH GRATITUDE', template:'thankyou-floral'},
 Diwali: {slug:'diwali-card', overline:'A FESTIVAL OF LIGHT AND JOY', template:'diwali-lights'},
 Christmas: {slug:'christmas-card', overline:'A LITTLE CHRISTMAS CHEER', template:'christmas-evergreen'},
 'New Year': {slug:'new-year-card', overline:'HERE’S TO NEW BEGINNINGS', template:'newyear-midnight'},
 Congratulations: {overline:'THREE CHEERS FOR YOU', template:'peach', title:'So much to celebrate. Congratulations!'},
 'Get well': {overline:'SENDING GOOD THOUGHTS', template:'sage', title:'Sending a little sunshine your way'},
 'Just because': {overline:'A LITTLE SOMETHING FOR YOU', template:'sky', title:'A little something, just for you'}
};

export const templates = [
 {id:'farewell-botanical', name:'New Beginnings', occasion:'Farewell', title:'Here’s to your next adventure!', decoration:'botanical', layout:'botanical', palette:{background:'#f3f0e4',ink:'#304c40',accent:'#5d7a59',secondary:'#b69b6a'}},
 {id:'farewell-letterpress', name:'Best Wishes', occasion:'Farewell', title:'The best is yet to come', decoration:'branches', layout:'letterpress', palette:{background:'#eadac8',ink:'#543d30',accent:'#8c5c40',secondary:'#9b733f'}},
 {id:'birthday-confetti', name:'Birthday Confetti', occasion:'Birthday', title:'Happy birthday to you!', decoration:'confetti', layout:'confetti', palette:{background:'#fff3db',ink:'#704039',accent:'#d65654',secondary:'#3b7c83'}},
 {id:'birthday-balloons', name:'Birthday Balloons', occasion:'Birthday', title:'A whole lot of birthday joy', decoration:'balloons', layout:'balloons', palette:{background:'#e9edf8',ink:'#394370',accent:'#a35b9c',secondary:'#cc6849'}},
 {id:'thankyou-floral', name:'Floral Gratitude', occasion:'Thank you', title:'You make the little things matter', decoration:'flowers', layout:'floral', palette:{background:'#fcf1e9',ink:'#634137',accent:'#b76168',secondary:'#507355'}},
 {id:'thankyou-letter', name:'Warm Appreciation', occasion:'Thank you', title:'A little note of thanks', decoration:'postcard', layout:'handwritten', palette:{background:'#f3e5d0',ink:'#61462e',accent:'#956b32',secondary:'#af6255'}},
 {id:'diwali-lights', name:'Festival of Lights', occasion:'Diwali', title:'Wishing you a bright and joyful Diwali', decoration:'diyas', layout:'lights', palette:{background:'#522340',ink:'#fff0ca',accent:'#edc66b',secondary:'#f3a176'}},
 {id:'diwali-rangoli', name:'Golden Celebration', occasion:'Diwali', title:'May your Diwali shine with happiness', decoration:'rangoli', layout:'rangoli', palette:{background:'#253450',ink:'#fff1ce',accent:'#e1bb66',secondary:'#cc7899'}},
 {id:'christmas-evergreen', name:'Evergreen Christmas', occasion:'Christmas', title:'Merry Christmas from all of us', decoration:'pine', layout:'evergreen', palette:{background:'#f7f2e7',ink:'#264e40',accent:'#365c42',secondary:'#a34b4e'}},
 {id:'christmas-winter', name:'Winter Wishes', occasion:'Christmas', title:'Warm wishes for the holidays', overline:'A SEASON OF WARM WISHES', decoration:'winter', layout:'winter', palette:{background:'#e9eff3',ink:'#35536a',accent:'#52798c',secondary:'#9d7843'}},
 {id:'newyear-midnight', name:'Midnight Celebration', occasion:'New Year', title:'Here’s to a wonderful new year', decoration:'fireworks', layout:'midnight', palette:{background:'#19263f',ink:'#fff1d0',accent:'#e5c27c',secondary:'#9eb7d6'}},
 {id:'newyear-gold', name:'Golden Fireworks', occasion:'New Year', title:'A bright new year', decoration:'golden', layout:'deco', palette:{background:'#fff3d9',ink:'#513f28',accent:'#9e7137',secondary:'#99724d'}},
 // Existing cards retain these IDs, colours, typography and simple motifs.
 {id:'peach', name:'Peachy', occasion:null, title:'A little something for you', mark:'✿', palette:{background:'#fae5d8',ink:'#62644c',accent:'#da8c7b',secondary:'#da8c7b'}},
 {id:'sage', name:'Fresh', occasion:null, title:'A little something for you', mark:'✺', palette:{background:'#e1eddd',ink:'#3f6555',accent:'#7c9f76',secondary:'#7c9f76'}},
 {id:'sky', name:'Dreamy', occasion:null, title:'A little something for you', mark:'✧', palette:{background:'#e1e9f7',ink:'#4b6079',accent:'#8c9ac3',secondary:'#8c9ac3'}}
];

const byId = new Map(templates.map(template=>[template.id,template]));
export const getTemplate = id => byId.get(id) || byId.get('peach');
export const defaultTemplate = occasion => getTemplate(occasions[occasion]?.template);
export const suggestedTitle = (template,occasion) => template.occasion===null ? occasions[occasion]?.title || defaultTemplate(occasion).title : template.title;
export const escapeHtml = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const templateClass = (template,base) => `${base} theme-${template.id}${template.decoration?' designed-card layout-'+template.layout:''}`;
export const templateStyle = template => Object.entries(template.palette).map(([key,value])=>`--design-${key}:${value}`).join(';');
export const overline = (template,occasion) => template.overline || occasions[occasion]?.overline || occasions['Just because'].overline;
export const decoration = (template,occasion) => template.decoration
 ? `<svg viewBox="0 0 360 480" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="/card-art.svg#${template.decoration}"/></svg>`
 : escapeHtml(occasion==='Christmas'?'❄':template.mark);

// Fixed catalogue text is escaped too. User-entered text is rendered with textContent in app.js.
export function miniature(template, {title, occasion=template.occasion, className='template-mini'} = {}) {
 return `<div class="${templateClass(template,className)}" style="${templateStyle(template)}" aria-hidden="true"><div class="mini-eyebrow">${escapeHtml(overline(template,occasion))}</div><div class="preview-flower">${decoration(template,occasion)}</div><div class="preview-title">${escapeHtml(title??suggestedTitle(template,occasion))}</div><div class="preview-rule"></div><div class="preview-foot">with love, from all of us ♡</div></div>`;
}
