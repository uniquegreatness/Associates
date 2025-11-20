// public.js
// Place this file as public.js and link from public.html

// ---------- CONFIG / mock data ----------
const viewer = {
  id: "viewer-1",
  name: "You",
  country: "Nigeria",           // change to test local vs intl
  interests: ["Fitness","Food"]
};

// mock users with posts
const users = [
  { id:"u1", name:"David", country:"Nigeria", nickname:"David(Real Estate)", avatar:"https://i.pravatar.cc/80?img=12", interests:["Real Estate","Food"],
    posts:[{id:"p1", text:"Selling houses near the lagoon. Affordable and secure. Call me to arrange a viewing this weekend.", views:2}]
  },
  { id:"u2", name:"Moses", country:"Ghana", nickname:"Moses(marketing)", avatar:"https://i.pravatar.cc/80?img=32", interests:["Marketing","Business"],
    posts:[{id:"p2", text:"I help startups scale fast with performance marketing campaigns. DM for a free audit.", views:5}]
  },
  { id:"u3", name:"Pauline", country:"Nigeria", nickname:"Pauline(Nurse)", avatar:"https://i.pravatar.cc/80?img=48", interests:["Health","Wellness","Fitness"],
    posts:[{id:"p3", text:"Group fitness sessions starting next month. Limited slots.", views:1},{id:"p4", text:"Healthy recipes that fit busy lifestyles.", views:0}]
  }
];

// persistent stores in localStorage
const LS = {
  likesKey: 'public_likes',
  connectionsKey: 'public_connections',
  viewsKey: 'public_views'
};
const likesStore = JSON.parse(localStorage.getItem(LS.likesKey) || '{}');
const connStore = JSON.parse(localStorage.getItem(LS.connectionsKey) || '{}');
const viewsStore = JSON.parse(localStorage.getItem(LS.viewsKey) || '{}');

// ---------- utilities ----------
function saveStores(){ localStorage.setItem(LS.likesKey, JSON.stringify(likesStore)); localStorage.setItem(LS.connectionsKey, JSON.stringify(connStore)); localStorage.setItem(LS.viewsKey, JSON.stringify(viewsStore)); }
function el(tag, props={}, children=[]){ const e=document.createElement(tag); Object.entries(props).forEach(([k,v])=>{ if(k==='class') e.className=v; else if(k==='html') e.innerHTML=v; else e.setAttribute(k,v)}); (Array.isArray(children)?children:[children]).flat().forEach(c=>{ if(typeof c==='string') e.appendChild(document.createTextNode(c)); else if(c) e.appendChild(c); }); return e; }

// algorithmic sort: simple scoring by interest overlap + same country
function scoreUser(u){
  let s=0;
  for(const it of u.interests) if(viewer.interests.includes(it)) s+=3;
  if(u.country===viewer.country) s+=2;
  return s;
}

// generate vcf and trigger download
function downloadVcf(userA, userB){
  // create vcard for each
  function vcard(u){
    const name = u.name || '';
    const nick = u.nickname || '';
    const tel = u.whatsapp || u.phone || '';
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${name}`,
      `NICKNAME:${nick}`,
      tel?`TEL;TYPE=CELL:${tel}`:'',
      "END:VCARD"
    ].filter(Boolean).join("\r\n");
  }
  const a = vcard(userA), b = vcard(userB);
  // download both
  const now = Date.now();
  const blobA = new Blob([a], {type:'text/vcard'}); const urlA = URL.createObjectURL(blobA);
  const aLink = document.createElement('a'); aLink.href=urlA; aLink.download=(userA.name||'contact')+"_"+now+".vcf"; document.body.appendChild(aLink); aLink.click(); aLink.remove();
  const blobB = new Blob([b], {type:'text/vcard'}); const urlB = URL.createObjectURL(blobB);
  const bLink = document.createElement('a'); bLink.href=urlB; bLink.download=(userB.name||'contact')+"_"+(now+1)+".vcf"; document.body.appendChild(bLink); bLink.click(); bLink.remove();
}

// ---------- render ----------
const feedEl = document.getElementById('feed');
document.getElementById('viewerName').textContent = viewer.name;
document.getElementById('viewerCountryLabel').textContent = `(${viewer.country})`;

// sort users by score desc
users.sort((a,b)=> scoreUser(b)-scoreUser(a));

function render(){
  feedEl.innerHTML = '';
  users.forEach(u=>{
    const card = el('article',{class:'user-card'});
    // avatar
    const avWrap = el('div',{class:'avatar-wrap'}, [
      el('img',{class:'avatar', src:u.avatar, alt:u.name}),
      // badge
      el('div',{class:'badge ' + (u.country===viewer.country? 'local':'intl')}, u.country===viewer.country? 'Local':'Int\'l')
    ]);
    // content
    const content = el('div',{class:'content-col'});
    const header = el('div',{class:'header-row'}, [
      el('div',{class:'username'}, u.name),
      el('div',{class:'meta'}, ` ${u.nickname} • ${u.country}`)
    ]);
    content.appendChild(header);

    // posts
    u.posts.forEach(post=>{
      const postBox = el('div',{class:'post'});
      // text (collapsed)
      const ptext = el('p',{class:'post-text collapsed', id:`pt-${post.id}`}, post.text);
      postBox.appendChild(ptext);

      // more button
      const moreBtn = el('button',{class:'more-btn'}, 'More');
      moreBtn.addEventListener('click', ()=>{
        // expand toggle
        const elp = document.getElementById(`pt-${post.id}`);
        const isCollapsed = elp.classList.contains('collapsed');
        if(isCollapsed){
          elp.classList.remove('collapsed');
          // count view once per viewer session for this post
          const key = `${post.id}`;
          if(!viewsStore[key]){ viewsStore[key]=1; post.views = (post.views||0)+1; saveStores(); }
          render(); // update views number
          moreBtn.textContent = 'Less';
        } else {
          elp.classList.add('collapsed');
          moreBtn.textContent = 'More';
        }
      });

      postBox.appendChild(moreBtn);

      // actions row
      const actions = el('div',{class:'post-actions'});
      // like button
      const likeBtn = el('button',{class:'action-btn'}, [
        el('span',{html: likesStore[post.id] ? '💙' : '🤍'}),
        ' Like'
      ]);
      likeBtn.addEventListener('click', ()=>{
        if(likesStore[post.id]){ delete likesStore[post.id]; } else { likesStore[post.id]=true; }
        saveStores(); render(); // update UI
      });
      actions.appendChild(likeBtn);

      // comment button
      const commentBtn = el('button',{class:'action-btn'}, '💬 Comment');
      commentBtn.addEventListener('click', ()=> openCommentModal(u, post));
      actions.appendChild(commentBtn);

      // connect button (handshake svg)
      const connectBtn = el('button',{class:'action-btn'}, [
        el('span',{html: handshakeSvg()}), ' Connect'
      ]);
      connectBtn.addEventListener('click', ()=> connectFlow(u));
      actions.appendChild(connectBtn);

      // views count
      const viewsEl = el('div',{class:'views'}, `👁 ${post.views || 0}`);
      actions.appendChild(viewsEl);

      postBox.appendChild(actions);
      content.appendChild(postBox);
    });

    card.appendChild(avWrap);
    card.appendChild(content);
    feedEl.appendChild(card);
  });
}
render();

// ---------- handshake svg helper ----------
function handshakeSvg(){ 
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 12l5 5 7-7" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14 6l8 8" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// ---------- comment modal ----------
const commentModal = document.getElementById('commentModal');
const commentsList = document.getElementById('commentsList');
const commentInput = document.getElementById('commentInput');
let currentCommentContext = null;
document.getElementById('closeCommentBtn').addEventListener('click', ()=> commentModal.classList.add('hidden'));
document.getElementById('postCommentBtn').addEventListener('click', ()=> {
  if(!currentCommentContext) return;
  const text = commentInput.value.trim(); if(!text) return;
  // store in localStorage per post
  const key = `comments_${currentCommentContext.post.id}`;
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  arr.push({from:viewer.name, text, at:Date.now()});
  localStorage.setItem(key, JSON.stringify(arr));
  commentInput.value='';
  loadCommentsFor(currentCommentContext.post);
});

function openCommentModal(user, post){
  currentCommentContext = {user, post};
  loadCommentsFor(post);
  commentModal.classList.remove('hidden');
}
function loadCommentsFor(post){
  const key = `comments_${post.id}`;
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  commentsList.innerHTML = arr.map(c=>`<div style="padding:6px;border-bottom:1px solid #f0f0f0"><strong>${c.from}</strong><div style="font-size:13px">${c.text}</div></div>`).join('') || '<div style="color:#666">No comments yet</div>';
}

// ---------- connect flow ----------
function connectFlow(targetUser){
  // send request immediately with requester details (viewer)
  // show inline toast and ask 'Accept' (simulate target user accept)
  const toast = el('div',{class:'request-toast'},[
    el('img',{src: viewer.avatar||'https://i.pravatar.cc/80?img=1', style:'width:36px;height:36px;border-radius:6px'}),
    el('div',{html:`<strong>${viewer.name}</strong> wants to connect`}),
    el('button',{class:'action-btn', style:'margin-left:auto'}, 'Accept'),
    el('button',{class:'action-btn'}, 'Reject')
  ]);
  // we will use confirm dialog to simulate accept
  const ok = confirm(`${viewer.name} will send connection request to ${targetUser.name}.\nSimulate that ${targetUser.name} ACCEPTS?`);
  if(ok){
    // increment connection count for both users
    connStore[viewer.id] = (connStore[viewer.id]||0)+1;
    connStore[targetUser.id] = (connStore[targetUser.id]||0)+1;
    saveStores();
    // prepare minimal vcard info
    const viewerCard = { name: viewer.name, nickname: viewer.name+"(you)", whatsapp: "+234000000" };
    const targetCard = { name: targetUser.name, nickname: targetUser.nickname, whatsapp: targetUser.whatsapp||'+000000' };
    // download both vcards
    downloadVcf(viewerCard, targetCard);
    alert('Connection accepted. VCFs downloaded.');
  } else {
    alert('Connection rejected (simulated).');
  }
  render(); // update UI counters if any
}￼Enter// public.js
// Place this file as public.js and link from public.html

// ---------- CONFIG / mock data ----------
const viewer = {
  id: "viewer-1",
  name: "You",
  country: "Nigeria",           // change to test local vs intl
  interests: ["Fitness","Food"]
};

// mock users with posts
const users = [
  { id:"u1", name:"David", country:"Nigeria", nickname:"David(Real Estate)", avatar:"https://i.pravatar.cc/80?img=12", interests:["Real Estate","Food"],
    posts:[{id:"p1", text:"Selling houses near the lagoon. Affordable and secure. Call me to arrange a viewing this weekend.", views:2}]
  },
  { id:"u2", name:"Moses", country:"Ghana", nickname:"Moses(marketing)", avatar:"https://i.pravatar.cc/80?img=32", interests:["Marketing","Business"],
sts:[{id:"p2", text:"I help startups scale fast with performance marketing campaigns. DM for a free audit.", views:5}]
  },
  { id:"u3", name:"Pauline", country:"Nigeria", nickname:"Pauline(Nurse)", avatar:"https://i.pravatar.cc/80?img=48", interests:["Health","Wellness","Fitness"],
    posts:[{id:"p3", text:"Group fitness sessions starting next month. Limited slots.", views:1},{id:"p4", text:"Healthy recipes that fit busy lifestyles.", views:0}]
  }
];

// persistent stores in localStorage
const LS = {
  likesKey: 'public_likes',
  connectionsKey: 'public_connections',
  viewsKey: 'public_views'
};
const likesStore = JSON.parse(localStorage.getItem(LS.likesKey) || '{}');
const connStore = JSON.parse(localStorage.getItem(LS.connectionsKey) || '{}');
const viewsStore = JSON.parse(localStorage.getItem(LS.viewsKey) || '{}');

// ---------- utilities ----------
function saveStores(){ localStorage.setItem(LS.likesKey, JSON.stringify(likesStore)); localStorage.setItem(LS.connectionsKey, JSON.stringify(connStore)); localStorage.setItem(LS.viewsKey, JSON.stringify(viewsStore)); }
function el(tag, props={}, children=[]){ const e=document.createElement(tag); Object.entries(props).forEach(([k,v])=>{ if(k==='class') e.className=v; else if(k==='html') e.innerHTML=v; else e.setAttribute(k,v)}); (Array.isArray(children)?children:[children]).flat().forEach(c=>{ if(typeof c==='string') e.appendChild(document.createTextNode(c)); else if(c) e.appendChild(c); }); return e; }

// algorithmic sort: simple scoring by interest overlap + same country
function scoreUser(u){
  let s=0;
  for(const it of u.interests) if(viewer.interests.includes(it)) s+=3;
  if(u.country===viewer.country) s+=2;
  return s;
}

// generate vcf and trigger download
function downloadVcf(userA, userB){
  // create vcard for each
  function vcard(u){
    const name = u.name || '';
    const nick = u.nickname || '';
    const tel = u.whatsapp || u.phone || '';
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${name}`,
      `NICKNAME:${nick}`,
      tel?`TEL;TYPE=CELL:${tel}`:'',
      "END:VCARD"
    ].filter(Boolean).join("\r\n");
  }
  const a = vcard(userA), b = vcard(userB);
  // download both
  const now = Date.now();
  const blobA = new Blob([a], {type:'text/vcard'}); const urlA = URL.createObjectURL(blobA);
  const aLink = document.createElement('a'); aLink.href=urlA; aLink.download=(userA.name||'contact')+"_"+now+".vcf"; document.body.appendChild(aLink); aLink.click(); aLink.remove();
  const blobB = new Blob([b], {type:'text/vcard'}); const urlB = URL.createObjectURL(blobB);
  const bLink = document.createElement('a'); bLink.href=urlB; bLink.download=(userB.name||'contact')+"_"+(now+1)+".vcf"; document.body.appendChild(bLink); bLink.click(); bLink.remove();
}

// ---------- render ----------
const feedEl = document.getElementById('feed');
document.getElementById('viewerName').textContent = viewer.name;
document.getElementById('viewerCountryLabel').textContent = `(${viewer.country})`;

// sort users by score desc
users.sort((a,b)=> scoreUser(b)-scoreUser(a));

function render(){
  feedEl.innerHTML = '';
  users.forEach(u=>{
    const card = el('article',{class:'user-card'});
    // avatar
    const avWrap = el('div',{class:'avatar-wrap'}, [
      el('img',{class:'avatar', src:u.avatar, alt:u.name}),
      // badge
      el('div',{class:'badge ' + (u.country===viewer.country? 'local':'intl')}, u.country===viewer.country? 'Local':'Int\'l')
    ]);
    // content
    const content = el('div',{class:'content-col'});
    const header = el('div',{class:'header-row'}, [
      el('div',{class:'username'}, u.name),
      el('div',{class:'meta'}, ` ${u.nickname} • ${u.country}`)
    ]);
    content.appendChild(header);

    // posts
    u.posts.forEach(post=>{
      const postBox = el('div',{class:'post'});
      // text (collapsed)
      const ptext = el('p',{class:'post-text collapsed', id:`pt-${post.id}`}, post.text);
      postBox.appendChild(ptext);

      // more button
      const moreBtn = el('button',{class:'more-btn'}, 'More');
      moreBtn.addEventListener('click', ()=>{
        // expand toggle
        const elp = document.getElementById(`pt-${post.id}`);
        const isCollapsed = elp.classList.contains('collapsed');
        if(isCollapsed){
          elp.classList.remove('collapsed');
          // count view once per viewer session for this post
          const key = `${post.id}`;
          if(!viewsStore[key]){ viewsStore[key]=1; post.views = (post.views||0)+1; saveStores(); }
          render(); // update views number
          moreBtn.textContent = 'Less';
        } else {
          elp.classList.add('collapsed');
          moreBtn.textContent = 'More';
        }
      });

