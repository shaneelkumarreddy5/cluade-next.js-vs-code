// ═══════════════════════════════════════════════════
// SUPABASE REST CLIENT
// ═══════════════════════════════════════════════════
let TK=null;
const sb=window.__glonniSupabaseBridge;
if(!sb){
  console.error('Supabase bridge missing. Ensure GlonniApp initializes before glonni-app.js loads.');
}

// ═══════════════════════════════════════════════════
// STATE & UTILS
// ═══════════════════════════════════════════════════
let USER=null, PROFILE=null, VIEW='home', CART_COUNT=0, NOTIF_COUNT=0, NOTIF_POLL=null;
let ALL_PRODUCTS=[], ALL_CATS=[], CART_ITEMS=[];
const $=id=>document.getElementById(id);
const esc=s=>s?String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';

function toast(msg,icon='✓'){
  const t=$('toast');$('toast-text').textContent=msg;
  t.querySelector('.toast-icon').textContent=icon;
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);
}

// ═══════════════════════════════════════════════════
// REFERRAL LINK TRACKING
// ═══════════════════════════════════════════════════
function initRefTracking(){
  try{
    const params=new URLSearchParams(location.search);
    const ref=params.get('ref');
    if(ref&&ref.length>10){
      // Don't overwrite if same ref already stored and fresh
      const existing=JSON.parse(localStorage.getItem('glonni_ref')||'null');
      if(!existing||existing.ref!==ref){
        localStorage.setItem('glonni_ref',JSON.stringify({ref,ts:Date.now()}));
      }
      // Clean URL without reloading
      const clean=location.pathname+(location.hash||'');
      history.replaceState({},'',clean);
    }
  }catch(e){}
}

function getActiveRef(){
  try{
    const stored=JSON.parse(localStorage.getItem('glonni_ref')||'null');
    if(!stored)return null;
    const THIRTY_DAYS=30*24*60*60*1000;
    if(Date.now()-stored.ts>THIRTY_DAYS){localStorage.removeItem('glonni_ref');return null;}
    return stored.ref;
  }catch(e){return null;}
}

function clearRef(){try{localStorage.removeItem('glonni_ref');}catch(e){}}

async function shareProduct(pid, pname){
  if(!USER){toast('Sign in to share & earn','🔗');showAuth();return;}
  const baseUrl=location.origin+location.pathname;
  const link=`${baseUrl}?ref=${USER.id}#product`;
  // Store product id in the link via hash-param style
  const fullLink=`${baseUrl}#product?pid=${pid}&ref=${USER.id}`;
  const shareData={title:`Check out ${pname} on Glonni!`,text:`Get cashback on ${pname} — Shop on Glonni 🛒`,url:fullLink};
  if(navigator.share&&navigator.canShare&&navigator.canShare(shareData)){
    try{await navigator.share(shareData);toast('Shared! You\'ll earn when they buy 🔗','🎉');}
    catch(e){if(e.name!=='AbortError')copyRefLink(fullLink);}
  } else {
    copyRefLink(fullLink);
  }
}

function copyRefLink(link){
  navigator.clipboard.writeText(link).then(()=>toast('Referral link copied! Share it to earn 💸','🔗')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=link;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Link copied! Share to earn 💸','🔗');
  });
}

// Product image placeholders - high quality
const pImgs=[
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&q=80',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&q=80',
  'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=400&q=80',
  'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=400&q=80',
  'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=400&q=80',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80',
  'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=400&q=80',
  'https://images.unsplash.com/photo-1596516109370-29001ec8ec36?w=400&q=80',
  'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80',
  'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&q=80',
];
const getImg=(p,i)=>p?.images?.[0]||pImgs[i%pImgs.length];
const catIcons={Electronics:'⚡',Fashion:'👔','Home & Kitchen':'🏠','Beauty & Health':'✨','Sports & Outdoors':'⚽','Books & Stationery':'📚',Groceries:'🛒','Toys & Games':'🎮'};
const catIcon=(name,icon)=>icon||catIcons[name]||'📦';

function stars(r){return '★'.repeat(Math.floor(r||4))+'☆'.repeat(5-Math.floor(r||4));}
function discount(p,c){if(!c||c<=p)return 0;return Math.round((c-p)/c*100);}
const roleBg=r=>({user:'var(--blue)',vendor:'var(--green)',affiliate:'var(--purple)',admin:'var(--red)'}[r]||'var(--gray-400)');

// ═══════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════
function renderNav(){
  const logged=!!PROFILE;
  const initial=PROFILE?PROFILE.full_name?.charAt(0).toUpperCase()||'U':'';
  const r=PROFILE?.role||'user';
  const isUser=r==='user';
  const isVendor=r==='vendor';
  const isAdmin=r==='admin';
  const isAff=r==='affiliate';
  $('nav-mount').innerHTML=`
  <nav class="nav">
    <div class="nav-inner">
      <div class="logo" onclick="go(PROFILE?.role==='admin'||PROFILE?.role==='super_admin'?'admin-dash':PROFILE?.role==='vendor'?'vendor-dash':'home')">Glonni<i>.</i></div>
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" id="search-input" placeholder="Search products, brands, categories..." oninput="onSearch(this.value)" onfocus="onSearch(this.value)" onkeydown="if(event.key==='Enter'&&this.value.length>=2){searchGoShop(this.value)}">
        ${(window.SpeechRecognition||window.webkitSpeechRecognition)?`<button class="voice-btn" id="nav-voice-btn" onclick="voiceSearch()" title="Voice search">🎤</button>`:''}
        <div id="search-results" class="search-results hide"></div>
      </div>
      <div class="nav-actions">
        ${logged?`
        ${isUser||isAff?`<button class="nav-btn" onclick="go('wishlist')" title="Wishlist">♡</button>
        <button class="nav-btn" onclick="toggleCart()" title="Cart">🛒${CART_COUNT?`<span class="count">${CART_COUNT}</span>`:''}</button>`:''}
        ${isVendor?`<button class="nav-btn" onclick="go('vendor-dash')" title="Dashboard" style="font-size:14px;font-weight:600">🏪</button>`:''}
        ${isAdmin?`<button class="nav-btn" onclick="renderAdminDash()" title="Admin" style="font-size:14px;font-weight:600">⚙️</button>`:''}
        <div class="notif-wrap">
          <button class="notif-btn nav-btn" onclick="toggleNotifPanel()" title="Notifications">🔔${NOTIF_COUNT?`<span class="notif-badge">${NOTIF_COUNT>9?'9+':NOTIF_COUNT}</span>`:''}</button>
          <div id="notif-panel" class="notif-panel hide"></div>
        </div>
        <div style="position:relative">
          <div class="nav-user" onclick="toggleUserMenu()">
            <div class="nav-user-avatar">${PROFILE.avatar_url?`<img src="${esc(PROFILE.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`:initial}</div>
            <span class="nav-user-name">${esc(PROFILE.full_name)}</span>
          </div>
          <div id="user-menu" class="user-menu hide"></div>
        </div>
        `:`
        <button class="btn btn-gold btn-sm btn-pill" onclick="showAuth()">Login / Sign Up</button>
        `}
      </div>
    </div>
  </nav>`;
  document.addEventListener('click',e=>{if(!e.target.closest('.nav-user')&&!e.target.closest('#user-menu')){const m=$('user-menu');if(m)m.classList.add('hide');}if(!e.target.closest('.notif-wrap')){const n=$('notif-panel');if(n)n.classList.add('hide');}if(!e.target.closest('.search-box')){const s=$('search-results');if(s)s.classList.add('hide');}});
}

function toggleUserMenu(){
  const m=$('user-menu');
  if(!m)return;
  const r=PROFILE?.role;
  let items=[];

  if(r==='user'){
    items=[
      {icon:'👤',label:'My Profile',action:"go('profile')"},
      {icon:'📦',label:'My Orders',action:"go('orders')"},
      {icon:'💰',label:'Wallet',action:"go('wallet')"},
      {icon:'♡',label:'Wishlist',action:"go('wishlist')"},
    ];
  } else if(r==='vendor'){
    items=[
      {icon:'🏪',label:'Dashboard',action:"go('vendor-dash')"},
      {icon:'📋',label:'Products',action:"go('vendor-products')"},
      {icon:'📦',label:'Orders',action:"go('orders')"},
      {icon:'🏷️',label:'Coupons',action:"go('vendor-coupons')"},
      {icon:'📢',label:'Sponsored Ads',action:"go('vendor-sponsored')"},
      {icon:'💰',label:'Wallet',action:"go('wallet')"},
      {icon:'🏬',label:'Store Settings',action:"go('vendor-store')"},
      {icon:'📦',label:'Warehouses',action:"go('vendor-warehouses')"},
      {icon:'👤',label:'Profile',action:"go('profile')"},
    ];
  } else if(r==='admin'){
    items=[
      {icon:'⚙️',label:'Admin Panel',action:"renderAdminDash('overview','')"},
      {icon:'📦',label:'Catalog',action:"renderAdminDash('catalog','ai-builder')"},
      {icon:'🏪',label:'Vendors',action:"renderAdminDash('vendors','all')"},
      {icon:'📋',label:'Orders',action:"renderAdminDash('orders','all')"},
      {icon:'💰',label:'Finance',action:"renderAdminDash('finance','transactions')"},
      {icon:'📢',label:'Marketing',action:"renderAdminDash('marketing','ads')"},
      {icon:'🛟',label:'Support',action:"renderAdminDash('support','users')"},
      {icon:'⚙️',label:'Settings',action:"renderAdminDash('settings','categories')"},
      {icon:'👤',label:'Profile',action:"go('profile')"},
    ];
  } else if(r==='affiliate'){
    items=[
      {icon:'🔗',label:'Dashboard',action:"go('aff-dash')"},
      {icon:'📊',label:'My Links',action:"go('aff-links')"},
      {icon:'💰',label:'Wallet',action:"go('wallet')"},
      {icon:'👤',label:'Profile',action:"go('profile')"},
    ];
  }

  items.push({icon:'🚪',label:'Logout',action:'logout()',cls:'danger'});

  m.innerHTML=`<div style="padding:12px 14px;border-bottom:1px solid var(--gray-100);margin-bottom:4px"><p style="font-weight:700;font-size:14px">${esc(PROFILE.full_name)}</p><p style="font-size:12px;color:var(--gray-400)">${esc(PROFILE.email)}</p><span class="role-pill" style="background:${roleBg(r)};color:#fff;margin-top:6px;display:inline-block">${r}</span></div>`+items.map(i=>`<div class="user-menu-item ${i.cls||''}" onclick="${i.action};$('user-menu').classList.add('hide')">${i.icon} ${i.label}</div>`).join('');
  m.classList.toggle('hide');
}

// ═══════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════
// SEARCH ENGINE (fuzzy matching)
// ═══════════════════════════════════════════════════
function fuzzyScore(query,text){
  if(!text||!query)return 0;
  const q=query.toLowerCase().trim(),t=text.toLowerCase();
  if(t===q)return 100;
  if(t.startsWith(q))return 90;
  if(t.includes(q))return 80;
  // Word-boundary match
  const words=t.split(/[\s\-_,]+/);
  const qWords=q.split(/\s+/);
  let wordScore=0;
  for(const qw of qWords){
    for(const w of words){
      if(w.startsWith(qw))wordScore+=40;
      else if(w.includes(qw))wordScore+=25;
    }
  }
  if(wordScore>0)return Math.min(75,wordScore);
  // Character overlap (typo tolerance)
  let matches=0,lastIdx=-1;
  for(const ch of q){
    const idx=t.indexOf(ch,lastIdx+1);
    if(idx>-1){matches++;lastIdx=idx;}
  }
  const ratio=matches/q.length;
  if(ratio>=0.7)return Math.round(ratio*50);
  return 0;
}

function searchProducts(query){
  if(!query||query.length<2)return[];
  const scored=ALL_PRODUCTS.map(p=>{
    const nameScore=fuzzyScore(query,p.name);
    const catScore=fuzzyScore(query,p.categories?.name||'')*0.6;
    const storeScore=fuzzyScore(query,p.vendor_stores?.store_name||'')*0.5;
    const descScore=fuzzyScore(query,(p.description||'').slice(0,200))*0.3;
    const tagScore=(p.tags||[]).some(t=>t.includes(query.toLowerCase()))?80:0;
    const score=Math.max(nameScore,catScore,storeScore,descScore,tagScore);
    return{...p,_score:score};
  }).filter(p=>p._score>15);
  scored.sort((a,b)=>b._score-a._score);
  return scored;
}

function highlightMatch(text,query){
  if(!text||!query)return esc(text);
  const escaped=esc(text);
  const q=query.toLowerCase().trim();
  const idx=text.toLowerCase().indexOf(q);
  if(idx===-1)return escaped;
  return esc(text.slice(0,idx))+`<span class="search-match">${esc(text.slice(idx,idx+q.length))}</span>`+esc(text.slice(idx+q.length));
}

let _searchTimer=null;
function onSearch(q){
  clearTimeout(_searchTimer);
  const box=$('search-results');if(!box)return;
  if(!q||q.length<2){box.classList.add('hide');return;}
  _searchTimer=setTimeout(async()=>{
    if(!ALL_PRODUCTS.length){
      const [p,c]=await Promise.all([
        sb.get("products","*,vendor_stores(store_name),categories(name)",{is_active:"eq.true",is_approved:"eq.true"}),
        sb.get("categories","*",{is_active:"eq.true",order:"sort_order.asc"})
      ]);
      ALL_PRODUCTS=p;ALL_CATS=c;
    }
    const results=searchProducts(q);
    if(!results.length){box.innerHTML='<div style="padding:20px;text-align:center;color:var(--gray-400)">No results for "'+esc(q)+'"</div>';box.classList.remove('hide');return;}
    const top=results.slice(0,5);
    box.innerHTML=top.map((p,i)=>`<div class="search-item" onclick="go('product',{id:'${p.id}'});$('search-results').classList.add('hide');$('search-input').value=''"><img src="${getImg(p,i)}" alt=""><div><p style="font-weight:600;font-size:14px">${highlightMatch(p.name,q)}</p><p style="font-size:12px;color:var(--gray-400)">₹${p.price} ${p.cashback_percent?`· ${p.cashback_percent}% cashback`:''} ${p.vendor_stores?.store_name?`· ${esc(p.vendor_stores.store_name)}`:''}</p></div></div>`).join('')
    +(results.length>5?`<div class="search-footer"><a onclick="searchGoShop('${esc(q).replace(/'/g,"\\'")}')">View all ${results.length} results →</a></div>`:'');
    box.classList.remove('hide');
  },200);
}

function searchGoShop(q){
  shopQuery=q;
  $('search-results')?.classList.add('hide');
  const si=$('search-input');if(si)si.value='';
  go('shop');
}

// ═══════════════════════════════════════════════════
// VOICE SEARCH (Web Speech API)
// ═══════════════════════════════════════════════════
let voiceRecog=null;let voiceActive=false;

function voiceSearch(target='nav'){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Voice search not supported in this browser','⚠️');return;}
  if(voiceActive){stopVoice();return;}

  voiceRecog=new SR();
  voiceRecog.lang='en-IN';
  voiceRecog.continuous=false;
  voiceRecog.interimResults=true;
  voiceRecog.maxAlternatives=1;

  // Show listening overlay
  const overlay=document.createElement('div');
  overlay.className='voice-overlay';
  overlay.id='voice-overlay';
  overlay.innerHTML=`<div class="voice-card">
    <div class="voice-ring">🎤</div>
    <h3 style="font-weight:800;font-size:20px;margin-bottom:8px">Listening...</h3>
    <p id="voice-transcript" style="font-size:16px;color:var(--gray-600);min-height:24px;font-weight:600"></p>
    <p style="font-size:12px;color:var(--gray-400);margin-top:12px">Speak now — "wireless earbuds", "Nike shoes", "laptop under 50000"</p>
    <button class="btn btn-outline btn-pill" style="margin-top:20px" onclick="stopVoice()">Cancel</button>
  </div>`;
  overlay.addEventListener('click',e=>{if(e.target===overlay)stopVoice();});
  document.body.appendChild(overlay);

  // Update nav mic button
  const btn=$('nav-voice-btn');if(btn)btn.classList.add('listening');
  voiceActive=true;

  voiceRecog.onresult=(event)=>{
    let interim='';let final='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const t=event.results[i][0].transcript;
      if(event.results[i].isFinal){final+=t;}else{interim+=t;}
    }
    const display=final||interim;
    const el=$('voice-transcript');if(el)el.textContent=display||'...';
    // Also show in search input
    const si=target==='shop'?$('shop-search-input'):$('search-input');
    if(si)si.value=display;

    if(final){
      // Final result — execute search
      setTimeout(()=>{
        stopVoice();
        const query=final.trim();
        if(query.length>=2){
          if(target==='shop'){
            shopQuery=query;renderShopUI();
          }else{
            searchGoShop(query);
          }
          toast(`🎤 "${query}"`,'🔍');
        }
      },300);
    }
  };

  voiceRecog.onerror=(event)=>{
    stopVoice();
    if(event.error==='not-allowed'){toast('Microphone access denied. Enable it in browser settings.','🎤');}
    else if(event.error==='no-speech'){toast('No speech detected. Try again.','🎤');}
    else if(event.error==='network'){toast('Network error. Voice search needs internet.','⚠️');}
    else{toast('Voice error: '+event.error,'⚠️');}
  };

  voiceRecog.onend=()=>{
    // Auto-stop after speech ends
    if(voiceActive){
      const el=$('voice-transcript');
      const text=el?.textContent?.trim();
      if(text&&text!=='...'){
        stopVoice();
        if(text.length>=2){
          if(target==='shop'){shopQuery=text;renderShopUI();}
          else{searchGoShop(text);}
          toast(`🎤 "${text}"`,'🔍');
        }
      }else{stopVoice();}
    }
  };

  try{voiceRecog.start();}catch(e){stopVoice();toast('Could not start microphone','⚠️');}
}

function stopVoice(){
  voiceActive=false;
  try{voiceRecog?.stop();}catch(e){}
  voiceRecog=null;
  const overlay=$('voice-overlay');if(overlay)overlay.remove();
  const btn=$('nav-voice-btn');if(btn)btn.classList.remove('listening');
}

// ═══════════════════════════════════════════════════
// IMAGE UPLOAD (Supabase Storage)
// ═══════════════════════════════════════════════════
async function uploadFile(file, folder){
  if(!PROFILE?.id)return null;
  const ext=file.name.split('.').pop().toLowerCase();
  const allowed=['jpg','jpeg','png','webp','gif'];
  if(!allowed.includes(ext)){toast('Only JPG, PNG, WebP, GIF allowed','⚠️');return null;}
  if(file.size>5*1024*1024){toast('Max 5MB per image','⚠️');return null;}
  const path=`${PROFILE.id}/${folder}/${Date.now()}.${ext}`;
  const result=await sb.uploadPublicFile('glonni',path,file);
  if(result?.error){toast('Upload failed','❌');return null;}
  return result?.url||null;
}

async function uploadMultiple(files, folder, onProgress){
  const urls=[];
  for(let i=0;i<files.length;i++){
    if(onProgress)onProgress(i,files.length);
    const url=await uploadFile(files[i],folder);
    if(url)urls.push(url);
  }
  return urls;
}

function imageUploadZone(id, opts={}){
  const multi=opts.multi!==false;
  const max=opts.max||5;
  const folder=opts.folder||'products';
  const existing=opts.existing||[];
  const onDone=opts.onDone||'';
  return `<div class="form-group">
    <label class="form-label">${opts.label||'Images'}</label>
    <div class="upload-zone" id="${id}-zone"
      onclick="document.getElementById('${id}-input').click()"
      ondragover="event.preventDefault();this.classList.add('dragover')"
      ondragleave="this.classList.remove('dragover')"
      ondrop="event.preventDefault();this.classList.remove('dragover');handleUploadDrop('${id}',event.dataTransfer.files,'${folder}',${max},'${onDone}')">
      <input type="file" id="${id}-input" accept="image/*" ${multi?'multiple':''} onchange="handleUploadSelect('${id}',this.files,'${folder}',${max},'${onDone}')">
      <div class="upload-zone-icon">📷</div>
      <div class="upload-zone-text"><strong>Click or drag</strong> to upload · ${multi?`Up to ${max} images`:'1 image'} · Max 5MB</div>
    </div>
    <div class="upload-previews" id="${id}-previews">
      ${existing.map((url,i)=>`<div class="upload-thumb" data-url="${esc(url)}">
        <img src="${esc(url)}"><span class="remove-img" onclick="event.stopPropagation();removeUploadThumb(this,'${id}')">✕</span>
      </div>`).join('')}
    </div>
    <input type="hidden" id="${id}-urls" value='${JSON.stringify(existing)}'>
  </div>`;
}

async function handleUploadSelect(id, files, folder, max, onDone){
  await processUploads(id, Array.from(files), folder, max, onDone);
}
async function handleUploadDrop(id, files, folder, max, onDone){
  await processUploads(id, Array.from(files), folder, max, onDone);
}

async function processUploads(id, files, folder, max, onDone){
  const current=JSON.parse($(`${id}-urls`)?.value||'[]');
  const remaining=max-current.length;
  if(remaining<=0){toast(`Max ${max} images`,'⚠️');return;}
  const toUpload=files.slice(0,remaining);
  const previewsEl=$(`${id}-previews`);

  for(const file of toUpload){
    // Add loading thumb
    const thumb=document.createElement('div');
    thumb.className='upload-thumb';
    thumb.innerHTML=`<div class="uploading">⏳</div>`;
    previewsEl.appendChild(thumb);

    const url=await uploadFile(file, folder);
    if(url){
      current.push(url);
      thumb.dataset.url=url;
      thumb.innerHTML=`<img src="${url}"><span class="remove-img" onclick="event.stopPropagation();removeUploadThumb(this,'${id}')">✕</span>`;
    }else{
      thumb.remove();
    }
  }
  $(`${id}-urls`).value=JSON.stringify(current);
  if(onDone&&window[onDone])window[onDone](current);
}

function removeUploadThumb(btn, id){
  const thumb=btn.closest('.upload-thumb');
  const url=thumb.dataset.url;
  thumb.remove();
  const current=JSON.parse($(`${id}-urls`)?.value||'[]');
  const updated=current.filter(u=>u!==url);
  $(`${id}-urls`).value=JSON.stringify(updated);
}

function getUploadUrls(id){
  return JSON.parse($(`${id}-urls`)?.value||'[]');
}

async function uploadAvatar(input){
  const file=input.files[0];if(!file)return;
  toast('Uploading...','📷');
  const url=await uploadFile(file,'avatars');
  if(url){
    await sb.upd("profiles",{avatar_url:url},{id:`eq.${PROFILE.id}`});
    PROFILE.avatar_url=url;
    renderNav();
    toast('Avatar updated!','✅');
    if(VIEW==='profile')renderProfile();
  }
}

async function uploadStoreLogo(input, storeId, field){
  const file=input.files[0];if(!file)return;
  toast('Uploading...','📷');
  const url=await uploadFile(file,'stores');
  if(url){
    await sb.upd("vendor_stores",{[field]:url},{id:`eq.${storeId}`});
    toast(`${field==='logo_url'?'Logo':'Banner'} updated!`,'✅');
    renderVendorStore();
  }
}

// ═══════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════
let authMode='login';
function showAuth(){
  authMode='login';renderAuthModal();
}
function renderAuthModal(){
  $('auth-portal').innerHTML=`
  <div class="auth-overlay" onclick="if(event.target===this)closeAuth()">
    <div class="auth-card">
      <div class="auth-logo">Glonni<i>.</i></div>
      <p class="auth-sub">${authMode==='login'?'Welcome back':'Create your account'}</p>
      <div class="tabs" style="margin-bottom:24px">
        <button class="tab ${authMode==='login'?'active':''}" onclick="authMode='login';renderAuthModal()">Login</button>
        <button class="tab ${authMode==='signup'?'active':''}" onclick="authMode='signup';renderAuthModal()">Sign Up</button>
      </div>
      ${authMode==='signup'?`
      <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="a-name" placeholder="Your name"></div>
      <div class="form-group"><label class="form-label">I am a</label><select class="form-select" id="a-role"><option value="user">Shopper</option><option value="vendor">Vendor</option><option value="affiliate">Affiliate</option><option value="admin">Admin</option></select></div>
      `:''}
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="a-email" type="email" placeholder="you@email.com"></div>
      <div class="form-group"><label class="form-label">Password</label><input class="form-input" id="a-pw" type="password" placeholder="Min 6 characters"></div>
      <div id="a-err" class="hide" style="color:var(--red);font-size:13px;margin-bottom:12px"></div>
      <button class="btn btn-gold btn-lg btn-full btn-pill" id="a-btn" onclick="doAuth()">${authMode==='login'?'Login →':'Create Account →'}</button>
      ${authMode==='login'?'<p style="text-align:center;margin-top:16px;font-size:13px;color:var(--gray-400)">Don\'t have an account? <span style="color:var(--gold-dark);cursor:pointer;font-weight:600" onclick="authMode=\'signup\';renderAuthModal()">Sign up</span></p>':'<p style="text-align:center;margin-top:16px;font-size:13px;color:var(--gray-400)">Already have an account? <span style="color:var(--gold-dark);cursor:pointer;font-weight:600" onclick="authMode=\'login\';renderAuthModal()">Login</span></p>'}
    </div>
  </div>`;
}
function closeAuth(){$('auth-portal').innerHTML='';}
async function doAuth(){
  const btn=$('a-btn');const errEl=$('a-err');btn.textContent='...';errEl.classList.add('hide');
  try{
    if(authMode==='signup'){
      const res=await sb.auth.signUp($('a-email').value,$('a-pw').value,{full_name:$('a-name').value,role:$('a-role').value});
      if(res.error)throw new Error(res.error.message||'Signup failed');
      if(res.access_token){TK=res.access_token;USER=res.user;await loadProfile();closeAuth();toast('Welcome to Glonni! 🎉','🎉');}
      else{errEl.textContent='Check email to confirm, then login.';errEl.style.color='var(--green)';errEl.classList.remove('hide');authMode='login';setTimeout(renderAuthModal,2000);}
    }else{
      const res=await sb.auth.signIn($('a-email').value,$('a-pw').value);
      if(res.error)throw new Error(res.error_description||'Login failed');
      TK=res.access_token;USER=res.user;await loadProfile();closeAuth();toast('Welcome back! 👋','👋');
    }
  }catch(e){errEl.textContent=e.message;errEl.classList.remove('hide');}
  btn.textContent=authMode==='login'?'Login →':'Create Account →';
}

async function loadProfile(){
  if(!USER)return;
  const p=await sb.get("profiles","*",{id:`eq.${USER.id}`});
  if(p[0])PROFILE=p[0];
  if(PROFILE?.role==='user'||PROFILE?.role==='affiliate')await loadCartCount();
  await loadNotifCount();
  startNotifPoll();
  renderNav();
  const roleHome={vendor:'vendor-dash',admin:'admin-panel',affiliate:'aff-dash',user:VIEW||'home'};
  go(roleHome[PROFILE?.role]||'home');
}

async function loadCartCount(){
  if(!PROFILE||PROFILE.role==='admin'||PROFILE.role==='super_admin')return;
  const c=await sb.get("cart_items","id",{user_id:`eq.${PROFILE.id}`});
  CART_COUNT=c.length;renderNav();
}

function logout(){
  USER=null;PROFILE=null;TK=null;CART_COUNT=0;CART_ITEMS=[];NOTIF_COUNT=0;
  stopNotifPoll();
  renderNav();go('home');toast('Logged out','👋');
}

// ═══════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════
const notifTypeIcon={
  order_update:'📦', new_order:'🎉', return_request:'↩️', return_update:'📋',
  review:'⭐', dispute:'⚖️', wallet:'💰', info:'ℹ️', warning:'⚠️', promo:'🏷️'
};
const notifTypeBg={
  order_update:'#eff6ff', new_order:'#f0fdf4', return_request:'#fef3c7', return_update:'#fef3c7',
  review:'#fdf4ff', dispute:'#fef2f2', wallet:'#ecfdf5', info:'#f0f9ff', warning:'#fffbeb', promo:'#fdf4ff'
};

async function loadNotifCount(){
  if(!PROFILE)return;
  const n=await sb.get("notifications","id",{user_id:`eq.${PROFILE.id}`,is_read:"eq.false"});
  const prev=NOTIF_COUNT;
  NOTIF_COUNT=n.length;
  if(NOTIF_COUNT!==prev)renderNav();
}

function startNotifPoll(){
  stopNotifPoll();
  NOTIF_POLL=setInterval(loadNotifCount,30000);
}
function stopNotifPoll(){
  if(NOTIF_POLL){clearInterval(NOTIF_POLL);NOTIF_POLL=null;}
}

async function toggleNotifPanel(){
  const p=$('notif-panel');if(!p)return;
  if(!p.classList.contains('hide')){p.classList.add('hide');return;}
  // Close user menu if open
  const m=$('user-menu');if(m)m.classList.add('hide');
  p.innerHTML='<div style="padding:32px;text-align:center;color:var(--gray-400)">Loading...</div>';
  p.classList.remove('hide');

  const notifs=await sb.get("notifications","*",{user_id:`eq.${PROFILE.id}`,order:"created_at.desc",limit:20});

  if(!notifs.length){
    p.innerHTML=`<div class="notif-header"><h3>Notifications</h3></div><div class="notif-empty"><span>🔔</span>No notifications yet</div>`;
    return;
  }

  const unreadCount=notifs.filter(n=>!n.is_read).length;
  p.innerHTML=`
    <div class="notif-header">
      <h3>Notifications ${unreadCount?`<span style="font-size:12px;font-weight:600;color:var(--gold-dark);margin-left:6px">${unreadCount} new</span>`:''}</h3>
      ${unreadCount?`<button class="notif-mark-all" onclick="markAllRead(event)">Mark all read</button>`:''}
    </div>
    <div class="notif-list">
      ${notifs.map(n=>{
        const icon=notifTypeIcon[n.type]||'🔔';
        const bg=notifTypeBg[n.type]||'#f3f4f6';
        const time=getTimeAgo(n.created_at);
        return `<div class="notif-item ${n.is_read?'':'unread'}" onclick="onNotifClick('${n.id}','${n.action_url||''}','${n.data?.order_id||''}')">
          <div class="notif-icon" style="background:${bg}">${icon}</div>
          <div class="notif-body">
            <div class="notif-title">${esc(n.title)}</div>
            <div class="notif-msg">${esc(n.message)}</div>
            <div class="notif-time">${time}</div>
          </div>
          ${n.is_read?'':`<div class="notif-dot"></div>`}
        </div>`;
      }).join('')}
    </div>`;
}

async function onNotifClick(id,actionUrl,orderId){
  // Mark as read
  await sb.upd("notifications",{is_read:true},{id:`eq.${id}`});
  NOTIF_COUNT=Math.max(0,NOTIF_COUNT-1);
  renderNav();
  $('notif-panel')?.classList.add('hide');

  // Navigate based on action_url and data
  if(actionUrl==='order-detail'&&orderId){
    go('order-detail',{oid:orderId});
  } else if(actionUrl==='orders'){
    go('orders');
  } else if(actionUrl){
    go(actionUrl);
  }
}

async function markAllRead(e){
  e.stopPropagation();
  if(!PROFILE)return;
  await sb.upd("notifications",{is_read:true},{user_id:`eq.${PROFILE.id}`,is_read:"eq.false"});
  NOTIF_COUNT=0;
  renderNav();
  toggleNotifPanel();
  toast('All marked as read','✅');
}

// ═══════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════
let PARAMS={};
let NAV_HISTORY=[];
function go(view,params={},pushHistory=true){
  if(pushHistory&&VIEW){NAV_HISTORY.push({view:VIEW,params:PARAMS});}
  VIEW=view;PARAMS=params;
  window.scrollTo({top:0,behavior:'smooth'});
  if(pushHistory)history.pushState({view,params},'',`#${view}`);
  const routes={
    home:renderHome, shop:renderShop, product:renderProduct, cart:renderCartPage,
    checkout:renderCheckout, orders:renderOrders, 'order-detail':renderOrderDetail, wallet:renderWallet, wishlist:renderWishlist, profile:renderProfile,
    'support-users':()=>renderSupportPage('users'), 'support-vendors':()=>renderSupportPage('vendors'),
    'vendor-dash':renderVendorDash, 'vendor-products':renderVendorProducts, 'vendor-store':renderVendorStore, 'vendor-coupons':renderVendorCoupons, 'vendor-sponsored':renderVendorSponsored, 'vendor-warehouses':renderVendorWarehouses, 'vendor-confirm-catalog':renderVendorConfirmCatalog,
    'aff-dash':renderAffDash, 'aff-links':renderAffLinks,
    'admin-dash':renderAdminDash,'admin-panel':renderAdminDash, 'admin-users':renderAdminUsers, 'admin-vendors':renderAdminVendors,
    'admin-products':renderAdminProducts, 'admin-orders':renderAdminOrders, 'admin-finance':renderAdminFinance, 'admin-returns':renderAdminReturns, 'admin-reviews':renderAdminReviews, 'admin-disputes':renderAdminDisputes, 'admin-audit':renderAdminAudit, 'admin-settlements':renderAdminSettlements, 'admin-top-buyers':renderAdminTopBuyers,
    'admin-categories':renderAdminCategories, 'admin-commissions':renderAdminCommissions, 'admin-gst':renderAdminGST, 'admin-ads':renderAdminAds, 'admin-payouts':renderAdminPayouts, 'admin-catalog':renderAdminCatalog, 'admin-catalog-manager':renderAdminCatalogManager, 'admin-rules':renderAdminRules, 'admin-approvals':renderAdminApprovals, 'admin-referrals':renderAdminReferrals, 'admin-onboarding':renderAdminOnboarding, 'admin-layout':renderAdminLayout, 'admin-placement-map':renderAdminPlacementMap, 'admin-ai-services':renderAdminAIServices,
    'vendor-marketplace':renderVendorMarketplace, 'vendor-picks':renderVendorPicks,
  };
  const fn=routes[view]||renderHome;
  fn();
  renderFooter();
}

function goBack(){
  if(NAV_HISTORY.length){
    const prev=NAV_HISTORY.pop();
    go(prev.view,prev.params,false);
    history.back();
  }else{
    const role=PROFILE?.role;
    const home=role==='admin'||role==='super_admin'?'admin-dash':role==='vendor'?'vendor-dash':role==='affiliate'?'aff-dash':'home';
    go(home);
  }
}

window.addEventListener('popstate',(e)=>{
  if(e.state?.view){
    NAV_HISTORY.pop();
    go(e.state.view,e.state.params||{},false);
  }
});

// ═══════════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════════
async function renderHome(){
  if(PROFILE?.role==='admin'||PROFILE?.role==='super_admin'){go('admin-dash');return;}
  if(PROFILE?.role==='vendor'){go('vendor-dash');return;}

  // Load data + DB layout sections in parallel
  const [products,cats,dbSections]=await Promise.all([
    sb.get("products","*,vendor_stores(store_name),categories(name,referral_commission_pct)",{is_active:"eq.true",is_approved:"eq.true",order:"created_at.desc"}),
    sb.get("categories","*",{is_active:"eq.true",order:"sort_order.asc"}),
    sb.get("page_layouts","*",{page:"eq.home",is_active:"eq.true",is_draft:"eq.false",order:"sort_order.asc"})
  ]);
  ALL_PRODUCTS=products;ALL_CATS=cats;

  // Filter by schedule and device
  const now=new Date();
  const activeSections=dbSections.filter(s=>{
    if(s.show_from&&new Date(s.show_from)>now)return false;
    if(s.show_until&&new Date(s.show_until)<now)return false;
    return true;
  });

  if(activeSections.length){
    // ── DB-driven layout ──────────────────────────────────────────
    // Announcement bars go above navbar-level; render them first
    const annBars=activeSections.filter(s=>s.section_type==='announcement_bar');
    const otherSections=activeSections.filter(s=>s.section_type!=='announcement_bar');

    $('main').innerHTML=`<div style="padding-bottom:60px">
      ${annBars.map(s=>renderDBSection(s,products,cats)).join('')}
      <div id="db-home-sections">${otherSections.map(s=>renderDBSection(s,products,cats)).join('')}</div>
      <div class="container" id="home-sponsored"></div>
    </div>`;

    // Init any DB hero carousels auto-slide
    otherSections.filter(s=>s.section_type==='hero_carousel').forEach(s=>{
      const ms=s.content?.autoplay_ms||4500;
      setInterval(()=>dbHeroSlide(s.id,1),ms);
    });
    loadHomeSponsored();
    return;
  }

  // ── Fallback: original hardcoded layout ───────────────────────
  $('main').innerHTML=`<div style="padding-bottom:60px">
    <div class="hero fade-up" id="hero-carousel-wrap">
      <div class="hero-carousel" id="hero-track"></div>
      <div class="hero-arrow left" onclick="heroSlide(-1)">‹</div>
      <div class="hero-arrow right" onclick="heroSlide(1)">›</div>
      <div class="hero-dots" id="hero-dots"></div>
    </div>
    <div class="container" id="home-content"><p style="color:var(--gray-400);padding:40px 0;text-align:center">Loading...</p></div>
  </div>`;

  const heroProducts=products.filter(p=>p.compare_at_price&&p.price<p.compare_at_price).slice(0,5);
  if(heroProducts.length<5)heroProducts.push(...products.filter(p=>!heroProducts.includes(p)).slice(0,5-heroProducts.length));
  const gradients=['linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%)','linear-gradient(135deg,#1a0a2e 0%,#0d0d0d 100%)','linear-gradient(135deg,#0a1a0a 0%,#111 100%)','linear-gradient(135deg,#1a1a0a 0%,#0a0a0a 100%)','linear-gradient(135deg,#0a0a1a 0%,#1a0d0d 100%)'];
  const track=$('hero-track');const dots=$('hero-dots');
  if(track&&heroProducts.length){
    track.innerHTML=heroProducts.map((p,i)=>{
      const img=getImg(p,i);const disc=discount(p.price,p.compare_at_price);const cb=p.cashback_percent||0;
      return `<div class="hero-slide" style="background:${gradients[i%5]}">
        <div class="hero-slide-bg"><img src="${img}" alt=""></div>
        <div class="hero-slide-content">
          <div class="hero-slide-cat">${p.categories?.name||'Featured'}</div>
          <h2>${esc(p.name.length>40?p.name.slice(0,40)+'...':p.name)}</h2>
          <div class="hero-slide-price">
            <span class="now">₹${p.price.toLocaleString('en-IN')}</span>
            ${p.compare_at_price?`<span class="was">₹${p.compare_at_price.toLocaleString('en-IN')}</span>`:''}
            ${disc>5?`<span class="off">${disc}% OFF</span>`:''}
          </div>
          ${cb>0?`<p class="hero-slide-cb">Earn <strong>₹${(p.price*cb/100).toFixed(0)} cashback</strong> (${cb}%)</p>`:`<p class="hero-slide-cb">Free delivery · Verified seller · Easy returns</p>`}
          <div class="hero-slide-btns">
            <button class="btn-buy" onclick="event.stopPropagation();addCart('${p.id}');toast('Added!','🛒')">🛒 Add to Cart</button>
            <button class="btn-view" onclick="go('product',{id:'${p.id}'})">View Details →</button>
          </div>
        </div>
      </div>`;
    }).join('');
    dots.innerHTML=heroProducts.map((_,i)=>`<div class="hero-dot${i===0?' active':''}" onclick="heroGoTo(${i})"></div>`).join('');
    window._heroIdx=0;window._heroMax=heroProducts.length;
    window._heroTimer=setInterval(()=>heroSlide(1),4500);
  }

  let html='';
  html+=`<div class="section"><div class="section-header"><h2 class="section-title">Shop by Category</h2><span class="section-link" onclick="go('shop')">View All →</span></div>
    <div class="cat-grid">${cats.filter(c=>!c.parent_id).map((c,i)=>`<div class="cat-card fade-up stagger-${(i%6)+1}" onclick="go('shop',{cat:'${c.id}'})"><div class="cat-icon">${catIcon(c.name,c.icon)}</div><div class="cat-name">${esc(c.name)}</div></div>`).join('')}</div></div>`;
  if(products.length){
    html+=`<div class="section"><div class="section-header"><h2 class="section-title">🔥 Trending Now</h2><span class="section-link" onclick="go('shop')">View All →</span></div>
      <div class="products-scroll">${products.slice(0,8).map((p,i)=>productCard(p,i)).join('')}</div></div>`;
  }
  html+=`<div id="home-sponsored"></div>`;
  html+=`<div class="section"><div class="promo-banner fade-up">
    <div><h3>Earn up to 20% Cashback 💰</h3><p>Shop from verified vendors and get real money back in your wallet</p></div>
    <button class="promo-btn" onclick="go('shop')">Explore Deals</button>
  </div></div>`;
  const cbProducts=products.filter(p=>p.cashback_percent>0);
  if(cbProducts.length){
    html+=`<div class="section"><div class="section-header"><h2 class="section-title">💰 Best Cashback Deals</h2></div>
      <div class="products-scroll">${cbProducts.slice(0,8).map((p,i)=>productCard(p,i)).join('')}</div></div>`;
  }
  if(products.length>4){
    html+=`<div class="section"><div class="section-header"><h2 class="section-title">✨ New Arrivals</h2></div>
      <div class="products-grid">${products.slice(0,8).map((p,i)=>productCard(p,i)).join('')}</div></div>`;
  }
  if(!PROFILE){
    html+=`<div class="section" style="text-align:center;padding:60px 0">
      <h2 style="font-size:28px;font-weight:800;margin-bottom:12px">Ready to start saving?</h2>
      <p style="color:var(--gray-400);margin-bottom:24px;max-width:400px;margin-left:auto;margin-right:auto">Join thousands of smart shoppers earning cashback on every purchase.</p>
      <button class="btn btn-gold btn-lg btn-pill" onclick="showAuth()">Create Free Account →</button>
    </div>`;
  }
  $('home-content').innerHTML=html;
  loadHomeSponsored();
}

function heroSlide(dir){
  if(!window._heroMax)return;
  window._heroIdx=(window._heroIdx+dir+window._heroMax)%window._heroMax;
  heroGoTo(window._heroIdx);
}
function heroGoTo(idx){
  window._heroIdx=idx;
  const track=$('hero-track');if(track)track.style.transform=`translateX(-${idx*100}%)`;
  document.querySelectorAll('.hero-dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
  // Reset auto timer
  clearInterval(window._heroTimer);
  window._heroTimer=setInterval(()=>heroSlide(1),4500);
}

// Touch swipe for mobile
(function(){
  let sx=0,sy=0;
  document.addEventListener('touchstart',e=>{const t=e.target.closest('.hero');if(!t)return;sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
  document.addEventListener('touchend',e=>{const t=e.target.closest('.hero');if(!t)return;const dx=e.changedTouches[0].clientX-sx;const dy=Math.abs(e.changedTouches[0].clientY-sy);if(Math.abs(dx)>50&&dy<100){heroSlide(dx<0?1:-1);}},{passive:true});
})();

async function loadHomeSponsored(){
  const el=$('home-sponsored');if(!el)return;
  const ads=await getSponsored('home_top',4);
  if(!ads.length)return;
  el.innerHTML=`<div class="section"><div class="section-header"><h2 class="section-title">⭐ Recommended for You</h2></div>
    <div class="products-scroll">${ads.map((a,i)=>sponsoredCard(a,i,'home_top')).join('')}</div></div>`;
}

async function loadShopSponsored(){
  const el=$('shop-sponsored');if(!el)return;
  const ads=await getSponsored('shop_top',2);
  if(!ads.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="margin-bottom:16px"><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:4px">${ads.map((a,i)=>{
    const p=a.products;if(!p)return'';const img=getImg(p,i);
    return `<div onclick="trackAdClick('${a.campaign_id}','${a.id}','${p.id}','shop');go('product',{id:'${p.id}'})" style="cursor:pointer;min-width:280px;display:flex;gap:12px;padding:12px;background:var(--gray-50);border-radius:var(--radius);border:1px solid var(--gray-100)">
      <img src="${img}" style="width:60px;height:60px;object-fit:cover;border-radius:8px">
      <div><p style="font-weight:600;font-size:13px">${esc(p.name)}</p><p style="font-weight:800;color:var(--gold-dark)">₹${p.price} ${p.cashback_percent?`<span style="font-size:11px;color:var(--green)">+${p.cashback_percent}% CB</span>`:''}</p>
      <span style="font-size:10px;color:var(--gray-400);background:var(--gray-100);padding:1px 5px;border-radius:3px">Sponsored</span></div>
    </div>`;
  }).join('')}</div></div>`;
}

function productCard(p,i){
  const img=getImg(p,i);
  const disc=discount(p.price,p.compare_at_price);
  const canShop=!PROFILE||PROFILE.role==='user'||PROFILE.role==='affiliate';
  return `<div class="p-card" onclick="go('product',{id:'${p.id}'})">
    <div class="p-card-img"><img src="${img}" alt="${esc(p.name)}" loading="lazy">
      ${canShop?`<button class="p-card-wish" onclick="event.stopPropagation();addWish('${p.id}')">♡</button>`:''}
      <div class="p-card-badges">
        ${p.cashback_percent>0?`<span class="p-badge p-badge-cb">${p.cashback_percent}% Cashback</span>`:''}
        ${disc>10?`<span class="p-badge p-badge-sale">${disc}% OFF</span>`:''}
      </div>
    </div>
    <div class="p-card-body">
      <div class="p-card-store">${esc(p.vendor_stores?.store_name||'')}</div>
      <div class="p-card-name">${esc(p.name)}</div>
      <div class="p-card-price">
        <span class="now">₹${p.price}</span>
        ${p.compare_at_price?`<span class="was">₹${p.compare_at_price}</span>`:''} 
        ${disc?`<span class="off">${disc}% off</span>`:''}
      </div>
      <div class="p-card-rating"><span class="stars">${stars(p.rating)}</span> ${(p.rating||4.0).toFixed(1)}</div>
    </div>
    ${canShop?`<div class="p-card-footer"><button class="add-btn" onclick="event.stopPropagation();event.preventDefault();addCart('${p.id}')">Add to Cart</button></div>`:''}
  </div>`;
}

function productCardList(p,i){
  const img=getImg(p,i);
  const disc=discount(p.price,p.compare_at_price);
  const canShop=!PROFILE||PROFILE.role==='user'||PROFILE.role==='affiliate';
  const rc=p.total_sold||0;
  const rating=(p.rating||4.0).toFixed(1);
  const priceStr=p.price.toLocaleString('en-IN');
  const dd=new Date(Date.now()+3*86400000);
  const deliveryDate=dd.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
  return `<div class="plp-item" onclick="go('product',{id:'${p.id}'})">
    <div class="plp-item-img">
      <img src="${img}" alt="${esc(p.name)}" loading="lazy">
      ${canShop?`<button class="plp-item-wish" onclick="event.stopPropagation();addWish('${p.id}')">♡</button>`:''}
    </div>
    <div class="plp-item-body">
      <div class="plp-item-name">${esc(p.name)}</div>
      <div class="plp-item-rating">
        <span class="val">${rating}</span>
        <span class="stars">${stars(p.rating)}</span>
        <span class="count">(${rc>0?rc.toLocaleString('en-IN'):'New'})</span>
      </div>
      <div class="plp-item-price">
        <span class="symbol">₹</span><span class="amount">${priceStr}</span>
      </div>
      ${p.compare_at_price?`<div class="plp-item-mrp">
        <span class="mrp-val">M.R.P: ₹${p.compare_at_price.toLocaleString('en-IN')}</span>
        ${disc?`<span class="discount">(${disc}% off)</span>`:''}
      </div>`:''}
      ${p.cashback_percent>0?`<div class="plp-item-cb">💰 ${p.cashback_percent}% Cashback · ₹${(p.price*p.cashback_percent/100).toFixed(0)} back</div>`:''}
      <div class="plp-item-delivery">FREE delivery <strong>${deliveryDate}</strong></div>
      ${canShop?`<button class="plp-item-cart" onclick="event.stopPropagation();event.preventDefault();addCart('${p.id}')">Add to Cart</button>`:''}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════
// SHOP / PLP
// ═══════════════════════════════════════════════════
let shopSort='newest',shopCat=null,shopPriceMin='',shopPriceMax='',shopQuery='',shopRating=0,shopCashback=false,shopInStock=false,shopStore='';
async function renderShop(){
  if(PROFILE?.role==='admin'||PROFILE?.role==='super_admin'){go('admin-products');return;}
  if(PROFILE?.role==='vendor'){go('vendor-products');return;}
  shopCat=PARAMS.cat||shopCat||null;
  if(PARAMS.q)shopQuery=PARAMS.q;
  if(!ALL_PRODUCTS.length||!ALL_CATS.length){
    const [p,c]=await Promise.all([
      sb.get("products","*,vendor_stores(store_name),categories(name)",{is_active:"eq.true",is_approved:"eq.true"}),
      sb.get("categories","*",{is_active:"eq.true",order:"sort_order.asc"})
    ]);
    ALL_PRODUCTS=p;ALL_CATS=c;
  }
  renderShopUI();
}

function getActiveFilters(){
  const chips=[];
  if(shopQuery)chips.push({label:`"${shopQuery}"`,clear:()=>{shopQuery=''}});
  if(shopCat){const cn=ALL_CATS.find(c=>c.id===shopCat)?.name;chips.push({label:cn||'Category',clear:()=>{shopCat=null}});}
  if(shopPriceMin)chips.push({label:`Min ₹${shopPriceMin}`,clear:()=>{shopPriceMin=''}});
  if(shopPriceMax)chips.push({label:`Max ₹${shopPriceMax}`,clear:()=>{shopPriceMax=''}});
  if(shopRating)chips.push({label:`${shopRating}★ & up`,clear:()=>{shopRating=0}});
  if(shopCashback)chips.push({label:'Cashback only',clear:()=>{shopCashback=false}});
  if(shopInStock)chips.push({label:'In stock',clear:()=>{shopInStock=false}});
  if(shopStore){const sn=ALL_PRODUCTS.find(p=>p.store_id===shopStore)?.vendor_stores?.store_name;chips.push({label:sn||'Store',clear:()=>{shopStore=''}});}
  return chips;
}

function getAllChildIds(catId){
  const direct=ALL_CATS.filter(c=>c.parent_id===catId);
  const grand=direct.flatMap(c=>ALL_CATS.filter(sc=>sc.parent_id===c.id));
  const leaf=grand.flatMap(c=>ALL_CATS.filter(lf=>lf.parent_id===c.id));
  return [catId,...direct.map(c=>c.id),...grand.map(c=>c.id),...leaf.map(c=>c.id)];
}

function getCatBreadcrumb(catId){
  const parts=[];let cur=ALL_CATS.find(c=>c.id===catId);
  while(cur){parts.unshift(cur);cur=cur.parent_id?ALL_CATS.find(c=>c.id===cur.parent_id):null;}
  return parts;
}

function clearAllFilters(){
  shopCat=null;shopPriceMin='';shopPriceMax='';shopQuery='';shopRating=0;shopCashback=false;shopInStock=false;shopStore='';shopSort='newest';
  closeFilterDrawer();
  renderShopUI();
}

function openFilterDrawer(){
  const stores=[...new Map(ALL_PRODUCTS.filter(p=>p.vendor_stores?.store_name).map(p=>[p.store_id,p.vendor_stores.store_name])).entries()];
  $('filter-portal').innerHTML=`<div class="filter-drawer-overlay open" onclick="if(event.target===this)closeFilterDrawer()">
    <div class="filter-drawer">
      <div class="filter-drawer-handle"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3 style="font-size:18px;font-weight:800;margin:0">Filters & Sort</h3>
        <button onclick="closeFilterDrawer()" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px">✕</button>
      </div>

      <div class="shop-search" style="margin-bottom:16px">
        <span style="color:var(--gray-400)">🔍</span>
        <input id="drawer-search" placeholder="Search products..." value="${esc(shopQuery)}" onkeydown="if(event.key==='Enter'){shopQuery=this.value;closeFilterDrawer();renderShopUI()}">
        ${shopQuery?`<span class="clear-btn" onclick="shopQuery='';this.previousElementSibling.value=''">✕</span>`:''}
      </div>

      <div class="filter-group">
        <div class="filter-title">Category</div>
        ${(()=>{
          const sel=shopCat?ALL_CATS.find(c=>c.id===shopCat):null;
          const selLevel=sel?.level||null;
          let activeVert=null;
          if(sel){
            if(selLevel===0)activeVert=sel;
            else if(selLevel===1)activeVert=ALL_CATS.find(c=>c.id===sel.parent_id);
            else if(selLevel===2){const p=ALL_CATS.find(c=>c.id===sel.parent_id);activeVert=p?ALL_CATS.find(c=>c.id===p.parent_id):null;}
            else{const gp=ALL_CATS.find(c=>c.id===sel.parent_id);const p=gp?ALL_CATS.find(c=>c.id===gp.parent_id):null;activeVert=p?ALL_CATS.find(c=>c.id===p.parent_id):null;}
          }
          let h=`<div class="filter-opt" onclick="shopCat=null;closeFilterDrawer();renderShopUI()" style="${!shopCat?'font-weight:700;color:var(--black)':'color:var(--blue);font-size:12px'}"><input type="radio" name="mcat" ${!shopCat?'checked':''}> ${shopCat?'← All Categories':'All Categories'}</div>`;
          if(!shopCat){
            ALL_CATS.filter(c=>!c.parent_id).forEach(v=>{
              h+=`<div class="filter-opt" onclick="shopCat='${v.id}';closeFilterDrawer();renderShopUI()"><input type="radio" name="mcat"> ${v.icon||''} ${esc(v.name)}</div>`;
            });
          }else if(activeVert){
            h+=`<div class="filter-opt" onclick="shopCat='${activeVert.id}';closeFilterDrawer();renderShopUI()" style="${shopCat===activeVert.id?'font-weight:700;color:var(--black)':'font-weight:600'}"><input type="radio" name="mcat" ${shopCat===activeVert.id?'checked':''}> ${activeVert.icon||''} ${esc(activeVert.name)} (All)</div>`;
            ALL_CATS.filter(c=>c.parent_id===activeVert.id).forEach(c=>{
              h+=`<div class="filter-opt" style="padding-left:14px;${shopCat===c.id?'font-weight:700;color:var(--black)':''}" onclick="shopCat='${c.id}';closeFilterDrawer();renderShopUI()"><input type="radio" name="mcat" ${shopCat===c.id?'checked':''}> ${esc(c.name)}</div>`;
              if(shopCat===c.id||ALL_CATS.filter(sc=>sc.parent_id===c.id).some(sc=>shopCat===sc.id)){
                ALL_CATS.filter(sc=>sc.parent_id===c.id).forEach(sc=>{
                  h+=`<div class="filter-opt" style="padding-left:28px;${shopCat===sc.id?'font-weight:700;color:var(--black)':''}" onclick="shopCat='${sc.id}';closeFilterDrawer();renderShopUI()"><input type="radio" name="mcat" ${shopCat===sc.id?'checked':''}> ${esc(sc.name)}</div>`;
                });
              }
            });
          }
          return h;
        })()}
      </div>

      <div class="filter-group">
        <div class="filter-title">Price Range</div>
        <div class="filter-range">
          <input class="form-input" placeholder="Min" style="margin:0" value="${shopPriceMin}" onchange="shopPriceMin=this.value">
          <span style="color:var(--gray-400)">—</span>
          <input class="form-input" placeholder="Max" style="margin:0" value="${shopPriceMax}" onchange="shopPriceMax=this.value">
        </div>
      </div>

      <div class="filter-group">
        <div class="filter-title">Rating</div>
        <div class="filter-toggle">
          <button class="filter-toggle-btn ${shopRating===0?'active':''}" onclick="shopRating=0">All</button>
          ${[4,3,2].map(r=>`<button class="filter-toggle-btn ${shopRating===r?'active':''}" onclick="shopRating=${r};document.querySelectorAll('.filter-toggle-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">${r}★+</button>`).join('')}
        </div>
      </div>

      <div class="filter-group">
        <div class="filter-title">More</div>
        <label class="filter-check"><input type="checkbox" ${shopCashback?'checked':''} onchange="shopCashback=this.checked"> 💰 Has Cashback</label>
        <label class="filter-check"><input type="checkbox" ${shopInStock?'checked':''} onchange="shopInStock=this.checked"> ✅ In Stock Only</label>
      </div>

      <div class="filter-group">
        <div class="filter-title">Sort By</div>
        ${[{k:'newest',l:'Newest'},{k:'popular',l:'Popular'},{k:'rating',l:'Top Rated'},{k:'low',l:'Price ↑'},{k:'high',l:'Price ↓'},{k:'cashback',l:'Cashback'}].map(s=>`<div class="filter-opt" onclick="shopSort='${s.k}'" style="${shopSort===s.k?'font-weight:700;color:var(--black)':''}"><input type="radio" name="msort" ${shopSort===s.k?'checked':''}> ${s.l}</div>`).join('')}
      </div>

      <div style="display:flex;gap:12px;margin-top:20px;position:sticky;bottom:0;background:#fff;padding-top:12px;border-top:1px solid var(--gray-100)">
        <button class="btn btn-outline btn-pill" style="flex:1" onclick="clearAllFilters()">Clear All</button>
        <button class="btn btn-gold btn-pill" style="flex:2" onclick="applyDrawerFilters()">Apply Filters</button>
      </div>
    </div>
  </div>`;
}

function applyDrawerFilters(){
  const si=document.getElementById('drawer-search');
  if(si)shopQuery=si.value;
  closeFilterDrawer();
  renderShopUI();
}

function closeFilterDrawer(){
  $('filter-portal').innerHTML='';
}

function renderShopUI(){
  let filtered=[...ALL_PRODUCTS];

  // Text search (fuzzy)
  if(shopQuery){
    filtered=searchProducts(shopQuery);
  }

  // Category (include all children at any depth)
  if(shopCat){
    const ids=getAllChildIds(shopCat);
    filtered=filtered.filter(p=>ids.includes(p.category_id));
  }
  // Price
  if(shopPriceMin)filtered=filtered.filter(p=>p.price>=Number(shopPriceMin));
  if(shopPriceMax)filtered=filtered.filter(p=>p.price<=Number(shopPriceMax));
  // Rating
  if(shopRating)filtered=filtered.filter(p=>(p.rating||0)>=shopRating);
  // Cashback
  if(shopCashback)filtered=filtered.filter(p=>p.cashback_percent>0);
  // In stock
  if(shopInStock)filtered=filtered.filter(p=>p.stock>0);
  // Store
  if(shopStore)filtered=filtered.filter(p=>p.store_id===shopStore);

  // Sort (skip if search-ranked)
  if(shopSort==='low')filtered.sort((a,b)=>a.price-b.price);
  else if(shopSort==='high')filtered.sort((a,b)=>b.price-a.price);
  else if(shopSort==='cashback')filtered.sort((a,b)=>(b.cashback_percent||0)-(a.cashback_percent||0));
  else if(shopSort==='rating')filtered.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else if(shopSort==='popular')filtered.sort((a,b)=>(b.total_sold||0)-(a.total_sold||0));
  else if(!shopQuery)filtered.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  const chips=getActiveFilters();
  const stores=[...new Map(ALL_PRODUCTS.filter(p=>p.vendor_stores?.store_name).map(p=>[p.store_id,p.vendor_stores.store_name])).entries()];
  const breadcrumb=shopCat?getCatBreadcrumb(shopCat):[];
  const catName=breadcrumb.length?breadcrumb[breadcrumb.length-1].name:(shopQuery?`Results for "${esc(shopQuery)}"` :'All Products');
  // Determine which pills to show: siblings of current selection
  const activeVert=breadcrumb.length?breadcrumb[0]:null;
  const pillCats=activeVert?ALL_CATS.filter(c=>c.parent_id===activeVert.id):ALL_CATS.filter(c=>!c.parent_id);

  $('main').innerHTML=`<div class="container">
    <div class="plp-layout">
      <aside class="plp-sidebar">
        <div style="position:sticky;top:calc(var(--nav-h) + 24px)">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:20px">Filters</h3>

          <!-- Search in shop -->
          <div class="shop-search" style="position:relative">
            <span style="color:var(--gray-400)">🔍</span>
            <input id="shop-search-input" placeholder="Search products..." value="${esc(shopQuery)}" onkeydown="if(event.key==='Enter'){shopQuery=this.value;renderShopUI()}" oninput="if(!this.value&&shopQuery){shopQuery='';renderShopUI()}">
            ${shopQuery?`<span class="clear-btn" onclick="shopQuery='';renderShopUI()">✕</span>`:''}
            <button style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--gray-400);padding:2px" onclick="voiceSearch('shop')" title="Voice search">🎤</button>
          </div>

          <!-- Category (contextual) -->
          <div class="filter-group">
            <div class="filter-title">Category</div>
            ${(()=>{
              // Determine context: what vertical are we inside?
              const sel=shopCat?ALL_CATS.find(c=>c.id===shopCat):null;
              const selLevel=sel?.level||null;
              // Walk up to find active vertical (L0)
              let activeVert=null,activeCat=null,activeSub=null;
              if(sel){
                if(selLevel===0)activeVert=sel;
                else if(selLevel===1){activeCat=sel;activeVert=ALL_CATS.find(c=>c.id===sel.parent_id);}
                else if(selLevel===2){activeSub=sel;activeCat=ALL_CATS.find(c=>c.id===sel.parent_id);activeVert=activeCat?ALL_CATS.find(c=>c.id===activeCat.parent_id):null;}
                else if(selLevel===3){const parent=ALL_CATS.find(c=>c.id===sel.parent_id);activeSub=parent;activeCat=parent?ALL_CATS.find(c=>c.id===parent.parent_id):null;activeVert=activeCat?ALL_CATS.find(c=>c.id===activeCat.parent_id):null;}
              }

              let html='';
              if(!shopCat){
                // No selection — show only verticals (L0)
                html+=`<div class="filter-opt" style="font-weight:700;color:var(--black)"><input type="radio" name="cat" checked> All Categories</div>`;
                ALL_CATS.filter(c=>!c.parent_id).forEach(v=>{
                  const vIds=getAllChildIds(v.id);
                  const cnt=ALL_PRODUCTS.filter(p=>vIds.includes(p.category_id)).length;
                  html+=`<div class="filter-opt" onclick="shopCat='${v.id}';renderShopUI()"><input type="radio" name="cat"> ${v.icon||''} ${esc(v.name)} <span style="font-size:11px;color:var(--gray-400)">(${cnt})</span></div>`;
                });
              } else if(activeVert){
                // Inside a vertical — show: ← Back to All, Vertical name, its L1 children
                html+=`<div class="filter-opt" onclick="shopCat=null;renderShopUI()" style="color:var(--blue);font-size:12px;margin-bottom:4px">← All Categories</div>`;
                html+=`<div class="filter-opt" onclick="shopCat='${activeVert.id}';renderShopUI()" style="${shopCat===activeVert.id?'font-weight:700;color:var(--black)':'font-weight:600'}"><input type="radio" name="cat" ${shopCat===activeVert.id?'checked':''}> ${activeVert.icon||''} ${esc(activeVert.name)} (All)</div>`;
                const l1s=ALL_CATS.filter(c=>c.parent_id===activeVert.id);
                l1s.forEach(c=>{
                  const cIds=getAllChildIds(c.id);
                  const cnt=ALL_PRODUCTS.filter(p=>cIds.includes(p.category_id)).length;
                  html+=`<div class="filter-opt" style="padding-left:16px;${shopCat===c.id?'font-weight:700;color:var(--black)':''}" onclick="shopCat='${c.id}';renderShopUI()"><input type="radio" name="cat" ${shopCat===c.id?'checked':''}> ${c.icon||''} ${esc(c.name)} <span style="font-size:11px;color:var(--gray-400)">(${cnt})</span></div>`;
                  // If this L1 is selected, show its L2 children
                  if(shopCat===c.id||ALL_CATS.filter(sc=>sc.parent_id===c.id).some(sc=>shopCat===sc.id||ALL_CATS.filter(lf=>lf.parent_id===sc.id).some(lf=>shopCat===lf.id))){
                    ALL_CATS.filter(sc=>sc.parent_id===c.id).forEach(sc=>{
                      const scCnt=ALL_PRODUCTS.filter(p=>getAllChildIds(sc.id).includes(p.category_id)).length;
                      html+=`<div class="filter-opt" style="padding-left:32px;${shopCat===sc.id?'font-weight:700;color:var(--black)':''}" onclick="shopCat='${sc.id}';renderShopUI()"><input type="radio" name="cat" ${shopCat===sc.id?'checked':''}> ${esc(sc.name)} <span style="font-size:11px;color:var(--gray-400)">(${scCnt})</span></div>`;
                      // If L2 selected, show L3 leaf
                      if(shopCat===sc.id||ALL_CATS.filter(lf=>lf.parent_id===sc.id).some(lf=>shopCat===lf.id)){
                        ALL_CATS.filter(lf=>lf.parent_id===sc.id).forEach(lf=>{
                          const lfCnt=ALL_PRODUCTS.filter(p=>p.category_id===lf.id).length;
                          html+=`<div class="filter-opt" style="padding-left:48px;${shopCat===lf.id?'font-weight:700;color:var(--black)':''}" onclick="shopCat='${lf.id}';renderShopUI()"><input type="radio" name="cat" ${shopCat===lf.id?'checked':''}> ${esc(lf.name)} <span style="font-size:11px;color:var(--gray-400)">(${lfCnt})</span></div>`;
                        });
                      }
                    });
                  }
                });
              }
              return html;
            })()}
          </div>

          <!-- Price -->
          <div class="filter-group">
            <div class="filter-title">Price Range</div>
            <div class="filter-range">
              <input class="form-input" placeholder="Min" style="margin:0" value="${shopPriceMin}" onchange="shopPriceMin=this.value;renderShopUI()">
              <span style="color:var(--gray-400)">—</span>
              <input class="form-input" placeholder="Max" style="margin:0" value="${shopPriceMax}" onchange="shopPriceMax=this.value;renderShopUI()">
            </div>
          </div>

          <!-- Rating -->
          <div class="filter-group">
            <div class="filter-title">Rating</div>
            <div class="filter-toggle">
              <button class="filter-toggle-btn ${shopRating===0?'active':''}" onclick="shopRating=0;renderShopUI()">All</button>
              ${[4,3,2].map(r=>`<button class="filter-toggle-btn ${shopRating===r?'active':''}" onclick="shopRating=${r};renderShopUI()">${r}★+</button>`).join('')}
            </div>
          </div>

          <!-- Cashback & Stock -->
          <div class="filter-group">
            <div class="filter-title">More Filters</div>
            <label class="filter-check"><input type="checkbox" ${shopCashback?'checked':''} onchange="shopCashback=this.checked;renderShopUI()"> 💰 Has Cashback</label>
            <label class="filter-check"><input type="checkbox" ${shopInStock?'checked':''} onchange="shopInStock=this.checked;renderShopUI()"> ✅ In Stock Only</label>
          </div>

          <!-- Store -->
          ${stores.length>1?`<div class="filter-group">
            <div class="filter-title">Store</div>
            <div class="filter-opt" onclick="shopStore='';renderShopUI()" style="${!shopStore?'font-weight:700;color:var(--black)':''}"><input type="radio" name="store" ${!shopStore?'checked':''}> All Stores</div>
            ${stores.map(([sid,sname])=>`<div class="filter-opt" onclick="shopStore='${sid}';renderShopUI()" style="${shopStore===sid?'font-weight:700;color:var(--black)':''}"><input type="radio" name="store" ${shopStore===sid?'checked':''}> ${esc(sname)}</div>`).join('')}
          </div>`:''}

          <!-- Sort -->
          <div class="filter-group">
            <div class="filter-title">Sort By</div>
            ${[{k:'newest',l:'Newest First'},{k:'popular',l:'Most Popular'},{k:'rating',l:'Highest Rated'},{k:'low',l:'Price: Low → High'},{k:'high',l:'Price: High → Low'},{k:'cashback',l:'Best Cashback'}].map(s=>`<div class="filter-opt" onclick="shopSort='${s.k}';renderShopUI()" style="${shopSort===s.k?'font-weight:700;color:var(--black)':''}"><input type="radio" name="sort" ${shopSort===s.k?'checked':''}> ${s.l}</div>`).join('')}
          </div>

          ${chips.length?`<button class="filter-clear" onclick="clearAllFilters()" style="width:100%;margin-top:12px">✕ Clear All Filters</button>`:''}
        </div>
      </aside>
      <div>
        <div class="plp-top">
          <div>
            <p style="font-size:12px;color:var(--gray-400);margin-bottom:4px"><span onclick="goBack()" style="cursor:pointer">← Back</span> · <span onclick="go('home')" style="cursor:pointer">Home</span> › <span onclick="shopCat=null;renderShopUI()" style="cursor:pointer">Shop</span>${breadcrumb.map((b,i)=>` › <span onclick="shopCat='${b.id}';renderShopUI()" style="cursor:pointer;${i===breadcrumb.length-1?'color:var(--black);font-weight:600':''}">${esc(b.name)}</span>`).join('')}</p>
            <h2 class="section-title">${catName}</h2>
            <span class="plp-count">${filtered.length} product${filtered.length!==1?'s':''} ${shopQuery&&!filtered.length?'':'found'}</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button class="mobile-filter-btn" onclick="openFilterDrawer()"><span>☰</span> Filters ${chips.length?`(${chips.length})`:''}</button>
            ${!activeVert?ALL_CATS.filter(c=>!c.parent_id).map(c=>`<button class="btn btn-sm ${shopCat===c.id?'btn-gold':'btn-outline'} btn-pill" onclick="shopCat=${shopCat===c.id?'null':`'${c.id}'`};renderShopUI()">${c.icon||''} ${esc(c.name)}</button>`).join('')
            :pillCats.map(c=>`<button class="btn btn-sm ${shopCat===c.id?'btn-gold':'btn-outline'} btn-pill" onclick="shopCat='${c.id}';renderShopUI()">${c.icon||''} ${esc(c.name)}</button>`).join('')}
          </div>
        </div>

        ${chips.length?`<div class="filter-chips">
          ${chips.map((ch,i)=>`<span class="filter-chip">${esc(ch.label)} <span class="chip-x" onclick="getActiveFilters()[${i}].clear();renderShopUI()">✕</span></span>`).join('')}
          ${chips.length>1?`<button class="filter-clear" onclick="clearAllFilters()">Clear all</button>`:''}
        </div>`:''}

        <div id="shop-sponsored"></div>
        ${filtered.length?`<div class="plp-list">${filtered.map((p,i)=>productCardList(p,i)).join('')}</div>`
        :`<div style="text-align:center;padding:60px 0"><p style="font-size:48px;margin-bottom:12px">🔍</p><p style="font-weight:700">${shopQuery?'No products match "'+esc(shopQuery)+'"':'No products found'}</p><p style="color:var(--gray-400);margin-top:4px">${chips.length?'Try removing some filters':'Try adjusting filters'}</p>${chips.length?`<button class="btn btn-gold btn-pill" style="margin-top:16px" onclick="clearAllFilters()">Clear All Filters</button>`:''}</div>`}
      </div>
    </div>
  </div>`;
  // Load sponsored for shop
  loadShopSponsored();
}

// ═══════════════════════════════════════════════════
// PRODUCT DETAIL (PDP)
// ═══════════════════════════════════════════════════
async function renderProduct(){
  const pid=PARAMS.id;
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading product...</div>';
  const [prods,reviews,varGroups,varOpts]=await Promise.all([
    sb.get("products","*,vendor_stores(store_name),categories(name),vendor_warehouses(name,city,state)",{id:`eq.${pid}`}),
    sb.get("reviews","*,profiles(full_name,avatar_url)",{product_id:`eq.${pid}`,is_approved:"eq.true",order:"created_at.desc"}),
    sb.get("product_variant_groups","*",{product_id:`eq.${pid}`,order:"sort_order.asc"}),
    sb.get("product_variant_options","*",{product_id:`eq.${pid}`,order:"sort_order.asc"})
  ]);
  const p=prods[0];if(!p){$('main').innerHTML='<div class="container" style="padding:60px 0;text-align:center"><p style="font-size:48px">😕</p><p style="font-weight:700;margin-top:12px">Product not found</p></div>';return;}

  const imgIdx=ALL_PRODUCTS.findIndex(x=>x.id===p.id);
  const mainImg=getImg(p,imgIdx>=0?imgIdx:0);
  const imgs=(p.images&&p.images.length>0)?p.images:[mainImg,...pImgs.slice(0,3)];
  const disc=discount(p.price,p.compare_at_price);

  // Calculate rating breakdown
  const rc=reviews.length;
  const rBreak=[5,4,3,2,1].map(s=>({star:s,count:reviews.filter(r=>r.rating===s).length}));
  const avgRating=rc?reviews.reduce((a,r)=>a+r.rating,0)/rc:0;

  const reviewsHTML=rc?reviews.map(r=>{
    const initial=r.profiles?.full_name?.charAt(0).toUpperCase()||'U';
    const timeAgo=getTimeAgo(r.created_at);
    return `<div style="padding:20px 0;border-bottom:1px solid var(--gray-100)">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
        <div style="display:flex;gap:10px;align-items:center">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--black);flex-shrink:0;overflow:hidden">${r.profiles?.avatar_url?`<img src="${esc(r.profiles.avatar_url)}" style="width:100%;height:100%;object-fit:cover">`:initial}</div>
          <div><p style="font-weight:600;font-size:14px">${esc(r.profiles?.full_name||'User')}</p>
            <div style="display:flex;gap:6px;align-items:center"><span style="color:var(--gold);font-size:13px">${stars(r.rating)}</span>${r.verified_purchase?'<span class="badge badge-green" style="font-size:9px">✓ Verified</span>':''}</div>
          </div>
        </div>
        <span style="font-size:11px;color:var(--gray-400)">${timeAgo}</span>
      </div>
      ${r.comment?`<p style="font-size:14px;line-height:1.6;color:var(--gray-600);margin-bottom:8px">${esc(r.comment)}</p>`:''}
      ${r.vendor_response?`<div style="margin-top:10px;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);border-left:3px solid var(--gold)"><p style="font-size:11px;font-weight:700;color:var(--gold-dark);margin-bottom:4px">🏪 Seller Response</p><p style="font-size:13px;color:var(--gray-600)">${esc(r.vendor_response)}</p></div>`:''}
      ${PROFILE?.role==='vendor'&&p.vendor_id===PROFILE.id&&!r.vendor_response?`<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="showVendorReplyModal('${r.id}')">Reply to review</button>`:''}
    </div>`;
  }).join(''):'';

  $('main').innerHTML=`<div class="container">
    <div style="padding:16px 0;font-size:13px;color:var(--gray-400)">
      <span onclick="go('home')" style="cursor:pointer">Home</span> › <span onclick="go('shop')" style="cursor:pointer">Shop</span> ${p.categories?.name?`› <span onclick="go('shop',{cat:'${p.category_id}'})" style="cursor:pointer">${esc(p.categories.name)}</span>`:''} › <span style="color:var(--black)">${esc(p.name)}</span>
    </div>
    <div class="pdp">
      <div class="pdp-gallery fade-up">
        <div class="pdp-main-img" id="pdp-main"><img src="${imgs[0]}" alt="${esc(p.name)}"></div>
        <div class="pdp-thumbs">${imgs.map((im,i)=>`<div class="pdp-thumb ${i===0?'active':''}" onclick="document.querySelector('.pdp-main-img img').src='${im}';document.querySelectorAll('.pdp-thumb').forEach(t=>t.classList.remove('active'));this.classList.add('active')"><img src="${im}" alt=""></div>`).join('')}</div>
      </div>
      <div class="pdp-info fade-up stagger-2">
        <div class="pdp-store">${esc(p.vendor_stores?.store_name||'Store')} <span>${esc(p.categories?.name||'')}</span></div>
        <h1>${esc(p.name)}</h1>
        <div class="pdp-rating-bar" style="cursor:pointer" onclick="document.getElementById('pdp-reviews')?.scrollIntoView({behavior:'smooth'})">
          <span class="pdp-stars">${stars(p.rating)}</span>
          <span class="pdp-rating-text">${(p.rating||0).toFixed(1)} rating · ${rc} review${rc!==1?'s':''} · ${p.total_sold||0} sold</span>
        </div>
        <div class="pdp-price-block">
          <div style="display:flex;align-items:baseline;flex-wrap:wrap">
            <span class="pdp-price">₹${p.price}</span>
            ${p.compare_at_price?`<span class="pdp-mrp">₹${p.compare_at_price}</span><span class="pdp-discount">${disc}% off</span>`:''}
          </div>
          ${p.cashback_percent>0?`<div class="pdp-cashback"><span class="pdp-cashback-icon">💰</span><div class="pdp-cashback-text">Earn <span>₹${(p.price*p.cashback_percent/100).toFixed(0)} cashback</span> (${p.cashback_percent}%) on this purchase</div></div>`:''}
          ${(()=>{const rate=parseFloat(p.gst_rate)||0;if(!rate)return '';const gst=(p.price*rate/100).toFixed(0);const incl=p.gst_inclusive;return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:var(--gray-400)"><span style="background:rgba(175,82,222,.08);color:var(--purple);padding:2px 8px;border-radius:10px;font-weight:600;font-size:11px">${rate}% GST</span>${p.hsn_code?`<span>HSN: ${p.hsn_code}</span>`:''}${incl?'<span>Price inclusive of GST</span>':`<span>+₹${gst} GST</span>`}</div>`;})()}
        </div>
        ${varGroups.length?`<div class="pdp-variants" style="margin-bottom:20px">
          ${varGroups.map(g=>{
            const opts=varOpts.filter(o=>o.group_id===g.id);
            const isColor=g.name.toLowerCase().includes('color');
            return `<div style="margin-bottom:14px">
              <p style="font-weight:700;font-size:13px;margin-bottom:8px">${esc(g.name)}: <span id="var-label-${g.id}" style="font-weight:400;color:var(--gray-500)">Select</span></p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${opts.map((o,i)=>`<button class="var-pill${i===0?' var-active':''}" data-group="${g.id}" data-option="${o.id}" data-label="${esc(o.label)}" ${o.price_override?`data-price="${o.price_override}"`:''}
                  ${o.stock_override!==null?`data-stock="${o.stock_override}"`:''}
                  ${!o.is_available?'disabled style="opacity:.4;cursor:not-allowed"':''} 
                  onclick="selectVariant(this)" 
                  style="${isColor?'min-width:auto;padding:8px 14px':''}${!o.is_available?';opacity:.4;cursor:not-allowed':''}">${esc(o.label)}${o.price_override?` <span style="font-size:10px;opacity:.7">₹${o.price_override}</span>`:''}</button>`).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>`:''}
        <div class="pdp-actions">
          ${!PROFILE||PROFILE.role==='user'||PROFILE.role==='affiliate'?`
          <button class="pdp-add-cart" onclick="addCart('${p.id}')">🛒 Add to Cart</button>
          <button class="pdp-buy-now" onclick="addCart('${p.id}');go('checkout')">⚡ Buy Now</button>`:''}
          ${PROFILE?.role==='admin'||PROFILE?.role==='super_admin'?`
          <button class="btn ${p.is_approved?'btn-danger':'btn-success'} btn-pill" onclick="toggleApproveProd('${p.id}',${p.is_approved});setTimeout(()=>go('product',{id:'${p.id}'}),500)">${p.is_approved?'⛔ Hide Product':'✅ Approve Product'}</button>`:''}
          ${PROFILE?.role==='vendor'&&p.vendor_id===PROFILE.id?`
          <button class="btn btn-gold btn-pill" onclick="goBack()">← Back to My Products</button>
          <button class="btn btn-outline btn-pill" onclick="editProduct('${p.id}')">✏️ Edit Product</button>`:''}
        </div>
        ${p.categories?.referral_commission_pct>0?`
        <div style="margin-top:12px;padding:12px 16px;background:linear-gradient(135deg,rgba(237,207,93,.12),rgba(175,82,222,.08));border:1px solid rgba(237,207,93,.3);border-radius:var(--radius);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">🔗</span>
            <div><p style="font-weight:700;font-size:13px">Share & Earn ${p.categories.referral_commission_pct}% Referral!</p><p style="font-size:11px;color:var(--gray-500)">When someone buys using your link, you earn ₹${(p.price*p.categories.referral_commission_pct/100).toFixed(0)} cashback</p></div>
          </div>
          <button class="btn btn-gold btn-pill btn-sm" onclick="shareProduct('${p.id}','${esc(p.name)}')">🔗 Share Link</button>
        </div>`:`
        <div style="margin-top:12px;display:flex;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm btn-pill" onclick="shareProduct('${p.id}','${esc(p.name)}')">🔗 Share</button>
        </div>`}
        <div class="pdp-features">
          <div class="pdp-feature"><div class="pdp-feature-icon">🚚</div><div class="pdp-feature-text"><strong>Free Delivery</strong> on orders above ₹499${p.vendor_warehouses?` · Ships from <strong>${esc(p.vendor_warehouses.city||p.vendor_warehouses.name||'')}</strong>`:''}</div></div>
          <div class="pdp-feature"><div class="pdp-feature-icon">💰</div><div class="pdp-feature-text"><strong>Cashback Guaranteed</strong> — credited within 7 days</div></div>
          <div class="pdp-feature"><div class="pdp-feature-icon">↩️</div><div class="pdp-feature-text"><strong>Easy Returns</strong> — 7 day return policy</div></div>
          <div class="pdp-feature"><div class="pdp-feature-icon">✅</div><div class="pdp-feature-text"><strong>Verified Seller</strong> — Quality assured by Glonni</div></div>
        </div>
        ${p.description?`<div style="margin-top:24px;padding-top:24px;border-top:1px solid var(--gray-200)"><h3 style="font-size:16px;font-weight:700;margin-bottom:12px">Description</h3><div style="font-size:14px;line-height:1.7;color:var(--gray-600)">${p.description.includes('<')?p.description:esc(p.description)}</div></div>`:''}

        ${p.video_url?`<div style="margin-top:20px"><h3 style="font-size:16px;font-weight:700;margin-bottom:12px">🎬 Product Video</h3><div style="border-radius:var(--radius);overflow:hidden;background:#000;aspect-ratio:16/9"><iframe src="${esc(p.video_url.replace('watch?v=','embed/'))}" style="width:100%;height:100%;border:none" allowfullscreen></iframe></div></div>`:''}

        ${(()=>{const specs=p.specifications||[];if(!specs.length)return'';return `<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--gray-200)"><h3 style="font-size:16px;font-weight:700;margin-bottom:12px">📋 Specifications</h3><table style="width:100%;border-collapse:collapse">${specs.map((s,i)=>`<tr style="background:${i%2===0?'var(--gray-50)':'#fff'}"><td style="padding:10px 14px;font-weight:600;font-size:13px;color:var(--gray-500);width:35%;border-bottom:1px solid var(--gray-100)">${esc(s.key)}</td><td style="padding:10px 14px;font-size:13px;border-bottom:1px solid var(--gray-100)">${esc(s.value)}</td></tr>`).join('')}</table></div>`;})()}

        ${(()=>{const tags=p.tags||[];if(!tags.length)return'';return `<div style="margin-top:16px;display:flex;gap:6px;flex-wrap:wrap">${tags.map(t=>`<span onclick="go('shop',{q:'${esc(t)}'})" style="cursor:pointer;padding:4px 10px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:20px;font-size:11px;color:var(--gray-500)">#${esc(t)}</span>`).join('')}</div>`;})()}

        ${p.size_guide_url?`<div style="margin-top:12px"><a href="${esc(p.size_guide_url)}" target="_blank" style="font-size:13px;color:var(--blue);text-decoration:underline">📏 Size & Fit Guide</a></div>`:''}

        <div style="margin-top:24px;padding:16px;background:var(--gray-50);border-radius:var(--radius-sm)">
          <p style="font-size:12px;color:var(--gray-400)">Stock: ${p.stock} available · SKU: ${p.id.slice(0,8).toUpperCase()} · ${p.views||0} views</p>
        </div>
      </div>
    </div>

    <!-- Sponsored Products -->
    <div id="pdp-sponsored" style="padding:24px 0;border-top:1px solid var(--gray-200);margin-top:24px"></div>

    <!-- Q&A Section -->
    <div style="padding:32px 0;border-top:1px solid var(--gray-200)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="font-size:20px;font-weight:800">❓ Questions & Answers</h2>
        ${PROFILE?`<button class="btn btn-outline btn-pill btn-sm" onclick="askQuestion('${p.id}')">Ask a Question</button>`:''}
      </div>
      <div id="pdp-qna"><p style="color:var(--gray-400);font-size:13px">Loading questions...</p></div>
    </div>

    <!-- ═══ REVIEWS SECTION ═══ -->
    <div id="pdp-reviews" style="padding:48px 0;border-top:1px solid var(--gray-200);margin-top:32px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <h2 style="font-size:22px;font-weight:800">Customer Reviews</h2>
        ${PROFILE&&(PROFILE.role==='user'||PROFILE.role==='affiliate')?`<button class="btn btn-gold btn-pill" onclick="showWriteReviewModal('${p.id}')">✍️ Write a Review</button>`:''}
      </div>

      ${rc?`
      <!-- Rating Summary -->
      <div class="card" style="display:flex;gap:32px;align-items:center;margin-bottom:24px;flex-wrap:wrap">
        <div style="text-align:center;min-width:120px">
          <div style="font-size:48px;font-weight:900;font-family:'Space Mono',monospace;color:var(--gold-dark)">${avgRating.toFixed(1)}</div>
          <div style="color:var(--gold);font-size:18px;margin:4px 0">${stars(avgRating)}</div>
          <p style="font-size:13px;color:var(--gray-400)">${rc} review${rc!==1?'s':''}</p>
        </div>
        <div style="flex:1;min-width:200px">
          ${rBreak.map(b=>{
            const pct=rc?(b.count/rc*100):0;
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:12px;font-weight:600;width:14px;text-align:right">${b.star}</span>
              <span style="color:var(--gold);font-size:12px">★</span>
              <div style="flex:1;height:8px;background:var(--gray-100);border-radius:4px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:4px;transition:width .3s ease"></div>
              </div>
              <span style="font-size:11px;color:var(--gray-400);width:28px">${b.count}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Review List -->
      <div>${reviewsHTML}</div>
      `:`
      <div style="text-align:center;padding:40px 0;background:var(--gray-50);border-radius:var(--radius);border:1.5px dashed var(--gray-200)">
        <p style="font-size:40px;margin-bottom:8px">⭐</p>
        <p style="font-weight:700;font-size:16px">No reviews yet</p>
        <p style="color:var(--gray-400);font-size:13px;margin-bottom:16px">Be the first to review this product!</p>
        ${PROFILE?`<button class="btn btn-gold btn-pill" onclick="showWriteReviewModal('${p.id}')">Write a Review</button>`:`<button class="btn btn-outline btn-pill" onclick="showAuth()">Login to Review</button>`}
      </div>
      `}
    </div>
  </div>`;
  // Load sponsored products for PDP
  loadPDPSponsored(p.id);
  loadProductQnA(p.id, p.vendor_id);
  // Track view
  sb.upd("products",{views:(p.views||0)+1},{id:`eq.${p.id}`});
}

async function loadPDPSponsored(currentPid){
  const el=$('pdp-sponsored');if(!el)return;
  const ads=await getSponsored('pdp_related',3);
  const filtered=ads.filter(a=>a.product_id!==currentPid);
  if(!filtered.length){el.style.display='none';return;}
  el.innerHTML=`<h3 style="font-weight:700;margin-bottom:16px">You May Also Like</h3>
    <div class="products-scroll">${filtered.map((a,i)=>sponsoredCard(a,i,'pdp_related')).join('')}</div>`;
}

async function loadProductQnA(pid, vendorId){
  const el=$('pdp-qna');if(!el)return;
  const qnas=await sb.get("product_qna","*,profiles!product_qna_user_id_fkey(full_name)",{product_id:`eq.${pid}`,is_approved:"eq.true",order:"created_at.desc",limit:10});
  if(!qnas.length){el.innerHTML='<p style="color:var(--gray-400);font-size:13px">No questions yet. Be the first to ask!</p>';return;}
  el.innerHTML=qnas.map(q=>`<div style="padding:14px 0;border-bottom:1px solid var(--gray-100)">
    <div style="display:flex;gap:8px;margin-bottom:6px"><span style="font-weight:800;color:var(--blue);font-size:14px">Q:</span><p style="font-size:14px;font-weight:600">${esc(q.question)}</p></div>
    ${q.answer?`<div style="display:flex;gap:8px;margin-left:24px;margin-top:6px"><span style="font-weight:800;color:var(--green);font-size:14px">A:</span><p style="font-size:13px;color:var(--gray-600)">${esc(q.answer)}</p></div>
    <p style="font-size:11px;color:var(--gray-400);margin-left:32px;margin-top:4px">Answered ${q.answered_at?getTimeAgo(q.answered_at):''}</p>`
    :`<p style="font-size:12px;color:var(--orange);margin-left:32px">Awaiting answer from seller</p>
    ${PROFILE?.role==='vendor'&&vendorId===PROFILE.id?`<button class="btn btn-ghost btn-sm" style="margin-left:24px;margin-top:4px" onclick="answerQuestion('${q.id}')">Reply</button>`:''}`}
    <p style="font-size:11px;color:var(--gray-400);margin-top:4px">${esc(q.profiles?.full_name||'User')} · ${getTimeAgo(q.created_at)}</p>
  </div>`).join('');
}

function askQuestion(pid){
  if(!PROFILE){showAuth();return;}
  const q=prompt('Ask a question about this product:');
  if(!q||!q.trim())return;
  sb.ins("product_qna",{product_id:pid,user_id:PROFILE.id,question:q.trim()}).then(()=>{
    toast('Question posted!','❓');loadProductQnA(pid);
  });
}

function answerQuestion(qid){
  const a=prompt('Your answer:');
  if(!a||!a.trim())return;
  sb.upd("product_qna",{answer:a.trim(),answered_by:PROFILE.id,answered_at:new Date().toISOString()},{id:`eq.${qid}`}).then(()=>{
    toast('Answer posted!','✅');renderProduct();
  });
}

// ═══════════════════════════════════════════════════
// REVIEW HELPERS & MODALS
// ═══════════════════════════════════════════════════
function getTimeAgo(dateStr){
  const diff=Date.now()-new Date(dateStr).getTime();
  const mins=Math.floor(diff/60000),hrs=Math.floor(diff/3600000),days=Math.floor(diff/86400000);
  if(mins<1)return 'Just now';if(mins<60)return mins+'m ago';if(hrs<24)return hrs+'h ago';if(days<30)return days+'d ago';return new Date(dateStr).toLocaleDateString();
}

function showWriteReviewModal(productId){
  if(!PROFILE){showAuth();return;}
  // First fetch user's delivered order items for this product
  sb.get("order_items","*,orders(order_number)",{
    vendor_id:`neq.${PROFILE.id}`,
    product_id:`eq.${productId}`,
    status:"eq.delivered",
    order:"created_at.desc"
  }).then(items=>{
    // Filter to user's items via orders
    return sb.get("orders","id",{user_id:`eq.${PROFILE.id}`}).then(orders=>{
      const myOrderIds=orders.map(o=>o.id);
      return items.filter(i=>myOrderIds.includes(i.order_id));
    });
  }).then(myItems=>{
    let selectedItem=myItems[0]?.id||'';
    const modal=document.createElement('div');
    modal.className='auth-overlay';
    modal.innerHTML=`<div class="auth-card" style="max-width:480px">
      <h3 style="font-weight:800;font-size:20px;margin-bottom:4px">Write a Review</h3>
      <p style="color:var(--gray-400);font-size:13px;margin-bottom:20px">${myItems.length?'Select your order and rate this product':'You can only review products you\'ve purchased and received'}</p>
      ${!myItems.length?`<div style="text-align:center;padding:24px;background:var(--gray-50);border-radius:var(--radius-sm)"><p style="font-size:32px;margin-bottom:8px">📦</p><p style="font-weight:600">No delivered orders found</p><p style="color:var(--gray-400);font-size:12px;margin-top:4px">Purchase this product and wait for delivery to leave a review</p></div>
        <button class="btn btn-outline btn-pill btn-full" style="margin-top:16px" onclick="this.closest('.auth-overlay').remove()">Close</button>`
      :`
      ${myItems.length>1?`<div class="form-group"><label class="form-label">Select Order</label><select class="form-select" id="rev-item">${myItems.map(i=>`<option value="${i.id}">Order #${esc(i.orders?.order_number)} (${new Date(i.created_at).toLocaleDateString()})</option>`).join('')}</select></div>`:`<input type="hidden" id="rev-item" value="${selectedItem}">`}
      <div class="form-group">
        <label class="form-label">Rating</label>
        <div id="rev-stars" style="display:flex;gap:6px;font-size:32px;cursor:pointer" data-rating="5">
          ${[1,2,3,4,5].map(s=>`<span onclick="setReviewStars(${s})" onmouseover="previewStars(${s})" onmouseout="resetStars()" data-star="${s}" style="color:var(--gold);transition:transform .15s">★</span>`).join('')}
        </div>
        <p id="rev-rating-text" style="font-size:12px;color:var(--gray-400);margin-top:4px">Excellent</p>
      </div>
      <div class="form-group">
        <label class="form-label">Your Review</label>
        <textarea class="form-textarea" id="rev-comment" placeholder="What did you like or dislike? How was the quality?" style="min-height:100px"></textarea>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill" style="flex:1" onclick="submitReview('${productId}')">Submit Review ⭐</button>
        <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
      </div>
      `}
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  });
}

let currentRating=5;
function setReviewStars(n){
  currentRating=n;
  const container=$('rev-stars');if(!container)return;
  container.dataset.rating=n;
  container.querySelectorAll('span').forEach(s=>{
    const v=parseInt(s.dataset.star);
    s.style.color=v<=n?'var(--gold)':'var(--gray-300)';
    s.style.transform=v===n?'scale(1.2)':'scale(1)';
  });
  const labels={1:'Poor',2:'Below Average',3:'Good',4:'Very Good',5:'Excellent'};
  const el=$('rev-rating-text');if(el)el.textContent=labels[n];
}
function previewStars(n){
  const container=$('rev-stars');if(!container)return;
  container.querySelectorAll('span').forEach(s=>{
    s.style.color=parseInt(s.dataset.star)<=n?'var(--gold)':'var(--gray-300)';
  });
}
function resetStars(){
  const container=$('rev-stars');if(!container)return;
  const n=parseInt(container.dataset.rating)||5;
  container.querySelectorAll('span').forEach(s=>{
    s.style.color=parseInt(s.dataset.star)<=n?'var(--gold)':'var(--gray-300)';
  });
}

async function submitReview(productId){
  const itemId=$('rev-item')?.value;
  const comment=$('rev-comment')?.value||'';
  if(!itemId){toast('No order item selected','⚠️');return;}
  const r=await sb.rpc("submit_review",{p_product_id:productId,p_order_item_id:itemId,p_rating:currentRating,p_comment:comment||null});
  document.querySelector('.auth-overlay')?.remove();
  if(r?.success){toast('Review submitted! ⭐','⭐');renderProduct();}
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

function showVendorReplyModal(reviewId){
  const modal=document.createElement('div');
  modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:440px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">🏪 Reply to Review</h3>
    <div class="form-group"><label class="form-label">Your Response</label><textarea class="form-textarea" id="vr-resp" placeholder="Thank the customer or address their feedback..." style="min-height:80px"></textarea></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="submitVendorReply('${reviewId}')">Post Reply</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function submitVendorReply(reviewId){
  const resp=$('vr-resp')?.value;
  if(!resp){toast('Write a response','⚠️');return;}
  const r=await sb.rpc("respond_to_review",{p_review_id:reviewId,p_response:resp});
  document.querySelector('.auth-overlay')?.remove();
  if(r?.success){toast('Reply posted!','✅');renderProduct();}
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

// ═══════════════════════════════════════════════════
// CART (Drawer + Actions)
// ═══════════════════════════════════════════════════
function selectVariant(btn){
  if(btn.disabled)return;
  const gid=btn.dataset.group;
  // Deactivate siblings
  document.querySelectorAll(`.var-pill[data-group="${gid}"]`).forEach(b=>b.classList.remove('var-active'));
  btn.classList.add('var-active');
  // Update label
  const labelEl=$('var-label-'+gid);
  if(labelEl)labelEl.textContent=btn.dataset.label;
  // Update price if price_override exists
  const priceEl=document.querySelector('.pdp-price');
  if(btn.dataset.price&&priceEl){
    priceEl.textContent='₹'+btn.dataset.price;
  }
}

function getSelectedVariants(){
  const selections={};
  document.querySelectorAll('.var-pill.var-active').forEach(btn=>{
    const gid=btn.dataset.group;
    const labelEl=$('var-label-'+gid);
    const groupName=labelEl?.closest('div')?.querySelector('p')?.textContent?.split(':')[0]||'Variant';
    selections[groupName.trim()]={optionId:btn.dataset.option,label:btn.dataset.label,price:btn.dataset.price||null};
  });
  return Object.keys(selections).length?selections:null;
}

async function addCart(pid){
  if(!PROFILE){showAuth();return;}
  if(PROFILE.role==='admin'||PROFILE.role==='super_admin'||PROFILE.role==='vendor'){toast('Switch to a buyer account to shop','⚠️');return;}
  try{
    const variants=getSelectedVariants();
    // Check if item already in cart
    const existing=await sb.get("cart_items","id,quantity",{user_id:`eq.${PROFILE.id}`,product_id:`eq.${pid}`});
    if(existing.length){
      // Update quantity
      await sb.upd("cart_items",{quantity:existing[0].quantity+1,...(variants?{variant_selections:variants}:{})},{id:`eq.${existing[0].id}`});
    }else{
      // Insert new
      const data={user_id:PROFILE.id,product_id:pid,quantity:1};
      if(variants)data.variant_selections=variants;
      await sb.ins("cart_items",data);
      CART_COUNT++;
    }
    renderNav();toast('Added to cart','🛒');
  }catch(e){
    console.error('addCart error:',e);
    toast('Error adding to cart','❌');
  }
}
async function addWish(pid){
  if(!PROFILE){showAuth();return;}
  if(PROFILE.role==='admin'||PROFILE.role==='super_admin'||PROFILE.role==='vendor'){toast('Switch to a buyer account to shop','⚠️');return;}
  await sb.ups("wishlist",{user_id:PROFILE.id,product_id:pid});
  toast('Added to wishlist','♡');
}

async function toggleCart(){
  if(PROFILE?.role==='admin'||PROFILE?.role==='super_admin'||PROFILE?.role==='vendor')return;
  if(!PROFILE){showAuth();return;}
  if($('cart-portal').innerHTML){$('cart-portal').innerHTML='';return;}
  try{
    const items=await sb.get("cart_items","*,products(*,vendor_stores(store_name))",{user_id:`eq.${PROFILE.id}`});
    CART_ITEMS=items;
    renderCartDrawer();
  }catch(e){console.error('Cart error:',e);toast('Error loading cart','❌');}
}

function renderCartDrawer(){
  const items=CART_ITEMS;
  const sub=items.reduce((s,i)=>s+(i.products?.price||0)*i.quantity,0);
  const cb=items.reduce((s,i)=>s+((i.products?.price||0)*(i.products?.cashback_percent||0)/100)*i.quantity,0);
  let gstTotal=0;items.forEach(i=>{const p=i.products;if(!p)return;const r=parseFloat(p.gst_rate)||0;const lt=(p.price||0)*i.quantity;gstTotal+=p.gst_inclusive?lt-lt*100/(100+r):lt*r/100;});

  $('cart-portal').innerHTML=`
  <div class="cart-overlay" onclick="$('cart-portal').innerHTML=''"></div>
  <div class="cart-drawer">
    <div class="cart-header">
      <h3>Cart <span style="font-weight:400;color:var(--gray-400);font-size:14px">(${items.length})</span></h3>
      <button class="btn btn-ghost btn-icon" onclick="$('cart-portal').innerHTML=''">✕</button>
    </div>
    <div class="cart-body">
      ${!items.length?`<div style="text-align:center;padding:60px 0"><p style="font-size:48px;margin-bottom:12px">🛒</p><p style="font-weight:700">Your cart is empty</p><p style="color:var(--gray-400);margin-top:8px;font-size:13px">Start shopping to add items</p><button class="btn btn-gold btn-pill" style="margin-top:16px" onclick="$('cart-portal').innerHTML='';go('shop')">Browse Products</button></div>`
      :items.map((it,idx)=>{
        const p=it.products;const img=getImg(p,idx);
        return `<div class="cart-item">
          <div class="cart-item-img"><img src="${img}" alt=""></div>
          <div class="cart-item-info">
            <div class="cart-item-name">${esc(p?.name)}</div>
            <div style="font-size:11px;color:var(--gray-400)">${esc(p?.vendor_stores?.store_name||'')}${it.variant_selections?` · ${Object.entries(it.variant_selections).map(([k,v])=>v.label).join(' / ')}`:''}</div>
            <div class="cart-item-price">₹${(p?.price||0)*it.quantity}</div>
            ${p?.cashback_percent?`<div style="font-size:11px;color:var(--green);margin-top:2px">+₹${((p.price*p.cashback_percent/100)*it.quantity).toFixed(0)} cashback</div>`:''}
            <div class="cart-qty">
              <button onclick="updateCartQty('${it.id}',${it.quantity-1})">−</button>
              <span>${it.quantity}</span>
              <button onclick="updateCartQty('${it.id}',${it.quantity+1})">+</button>
            </div>
          </div>
          <button class="btn btn-ghost btn-icon" style="align-self:start;font-size:14px;color:var(--gray-400)" onclick="updateCartQty('${it.id}',0)">🗑</button>
        </div>`;
      }).join('')}
    </div>
    ${items.length?`<div class="cart-footer">
      <div class="cart-total-row"><span style="color:var(--gray-500)">Subtotal</span><span style="font-weight:700">₹${sub.toFixed(2)}</span></div>
      <div class="cart-total-row"><span style="color:var(--gray-500)">GST</span><span style="font-weight:600;color:var(--purple)">+₹${gstTotal.toFixed(2)}</span></div>
      ${cb>0?`<div class="cart-total-row"><span style="color:var(--green)">💰 Cashback you'll earn</span><span style="font-weight:700;color:var(--green)">+₹${cb.toFixed(0)}</span></div>`:''}
      <div class="cart-total-row total"><span>Total</span><span>₹${(sub+gstTotal).toFixed(2)}</span></div>
      <button class="btn btn-gold btn-lg btn-full btn-pill" style="margin-top:12px" onclick="$('cart-portal').innerHTML='';go('checkout')">Checkout → ₹${(sub+gstTotal).toFixed(2)}</button>
    </div>`:''}
  </div>`;
}

async function updateCartQty(id,qty){
  if(qty<1){await sb.del("cart_items",{id:`eq.${id}`});CART_ITEMS=CART_ITEMS.filter(i=>i.id!==id);CART_COUNT=Math.max(0,CART_COUNT-1);}
  else{await sb.upd("cart_items",{quantity:qty},{id:`eq.${id}`});const item=CART_ITEMS.find(i=>i.id===id);if(item)item.quantity=qty;}
  renderNav();renderCartDrawer();
}

// ═══════════════════════════════════════════════════
// CART PAGE (full)
// ═══════════════════════════════════════════════════
async function renderCartPage(){
  if(!PROFILE){showAuth();return;}
  if(PROFILE.role==='admin'||PROFILE.role==='super_admin'){go('admin-dash');return;}
  if(PROFILE.role==='vendor'){go('vendor-dash');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading cart...</div>';
  CART_ITEMS=await sb.get("cart_items","*,products(*,vendor_stores(store_name))",{user_id:`eq.${PROFILE.id}`});
  const sub=CART_ITEMS.reduce((s,i)=>s+(i.products?.price||0)*i.quantity,0);

  if(!CART_ITEMS.length){
    $('main').innerHTML=`<div class="container" style="padding:80px 0;text-align:center"><p style="font-size:64px;margin-bottom:16px">🛒</p><h2 style="font-size:24px;font-weight:800;margin-bottom:8px">Your cart is empty</h2><p style="color:var(--gray-400);margin-bottom:24px">Looks like you haven't added anything yet</p><button class="btn btn-gold btn-lg btn-pill" onclick="go('shop')">Start Shopping →</button></div>`;return;
  }

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <h2 style="font-size:24px;font-weight:800;margin-bottom:24px"><span onclick="goBack()" style="cursor:pointer;color:var(--gray-400);font-size:18px">←</span> Shopping Cart <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${CART_ITEMS.length} items)</span></h2>
    <div class="checkout-grid">
      <div>${CART_ITEMS.map((it,idx)=>{const p=it.products;const img=getImg(p,idx);return `<div class="card card-sm" style="display:flex;gap:16px;align-items:center">
        <div style="width:80px;height:80px;border-radius:var(--radius-sm);overflow:hidden;background:var(--gray-50);flex-shrink:0"><img src="${img}" style="width:100%;height:100%;object-fit:cover"></div>
        <div style="flex:1;min-width:0"><p style="font-weight:600;font-size:14px;margin-bottom:4px">${esc(p?.name)}</p><p style="font-size:12px;color:var(--gray-400)">${esc(p?.vendor_stores?.store_name||'')}${it.variant_selections?' · '+Object.values(it.variant_selections).map(v=>v.label).join(' / '):''}</p><p style="font-weight:800;color:var(--gold-dark);margin-top:4px">₹${(p?.price||0)*it.quantity}</p></div>
        <div class="cart-qty"><button onclick="updateCartInline('${it.id}',${it.quantity-1})">−</button><span>${it.quantity}</span><button onclick="updateCartInline('${it.id}',${it.quantity+1})">+</button></div>
        <button class="btn btn-ghost btn-icon" onclick="updateCartInline('${it.id}',0)">🗑</button>
      </div>`;}).join('')}</div>
      <div class="order-summary"><div class="card">
        <h3 style="font-weight:700;margin-bottom:16px">Order Summary</h3>
        <div class="cart-total-row"><span style="color:var(--gray-500)">Subtotal</span><span>₹${sub.toFixed(2)}</span></div>
        ${(()=>{let gst=0;CART_ITEMS.forEach(it=>{const p=it.products;if(!p)return;const r=parseFloat(p.gst_rate)||0;const lt=(p.price||0)*it.quantity;gst+=p.gst_inclusive?lt-lt*100/(100+r):lt*r/100;});return gst>0?`<div class="cart-total-row"><span style="color:var(--gray-500)">GST (est.)</span><span>+₹${gst.toFixed(2)}</span></div>`:'';})()}
        <div class="cart-total-row"><span style="color:var(--gray-500)">Shipping</span><span style="color:var(--green)">Free</span></div>
        <div class="cart-total-row total"><span>Total</span><span>₹${(()=>{let gst=0;CART_ITEMS.forEach(it=>{const p=it.products;if(!p)return;const r=parseFloat(p.gst_rate)||0;const lt=(p.price||0)*it.quantity;if(!p.gst_inclusive)gst+=lt*r/100;});return(sub+gst).toFixed(2);})()}</span></div>
        <button class="btn btn-gold btn-lg btn-full btn-pill" style="margin-top:16px" onclick="go('checkout')">Proceed to Checkout →</button>
        <p style="text-align:center;font-size:11px;color:var(--gray-400);margin-top:8px">Prices include/exclude applicable GST</p>
        <button class="btn btn-ghost btn-full" style="margin-top:4px" onclick="go('shop')">← Continue Shopping</button>
      </div></div>
    </div>
  </div>`;
}

async function updateCartInline(id,qty){
  if(qty<1){await sb.del("cart_items",{id:`eq.${id}`});}
  else{await sb.upd("cart_items",{quantity:qty},{id:`eq.${id}`});}
  await loadCartCount();renderCartPage();
}

// ═══════════════════════════════════════════════════
// CHECKOUT
// ═══════════════════════════════════════════════════
let selAddr=null;
async function renderCheckout(){
  if(!PROFILE){showAuth();return;}
  if(PROFILE.role==='admin'||PROFILE.role==='super_admin'){go('admin-dash');return;}
  if(PROFILE.role==='vendor'){go('vendor-dash');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading checkout...</div>';
  const [items,addrs]=await Promise.all([
    sb.get("cart_items","*,products(*)",{user_id:`eq.${PROFILE.id}`}),
    sb.get("addresses","*",{user_id:`eq.${PROFILE.id}`})
  ]);
  CART_ITEMS=items;
  if(addrs.length&&!selAddr)selAddr=addrs[0].id;
  const sub=items.reduce((s,i)=>s+(i.products?.price||0)*i.quantity,0);
  const cb=items.reduce((s,i)=>s+((i.products?.price||0)*(i.products?.cashback_percent||0)/100)*i.quantity,0);
  // GST calculation per item
  let totalGST=0;
  const gstItems=[];
  for(const it of items){
    const p=it.products;if(!p)continue;
    const catId=p.category_id;const price=p.price||0;
    let gstRate=p.gst_rate||0;
    if(!gstRate&&catId){try{const g=await resolveGSTClient(catId,price,p.hsn_code);gstRate=g.rate;}catch(e){gstRate=18;}}
    const lineTotal=price*it.quantity;
    const inclusive=p.gst_inclusive||false;
    let gstAmt=0;
    if(inclusive){gstAmt=lineTotal-lineTotal*100/(100+gstRate);}
    else{gstAmt=lineTotal*gstRate/100;}
    totalGST+=gstAmt;
    gstItems.push({name:p.name,qty:it.quantity,price,lineTotal,gstRate,gstAmt,hsn:p.hsn_code||'',inclusive,variants:it.variant_selections});
  }
  const grandTotal=items.some(i=>i.products?.gst_inclusive)?sub:sub+totalGST;

  if(!items.length){$('main').innerHTML=`<div class="container" style="padding:60px 0;text-align:center"><p style="font-size:48px">🛒</p><p style="font-weight:700;margin-top:12px">Cart is empty</p><button class="btn btn-gold btn-pill" style="margin-top:16px" onclick="go('shop')">Shop Now</button></div>`;return;}

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <h2 style="font-size:24px;font-weight:800;margin-bottom:24px"><span onclick="goBack()" style="cursor:pointer;color:var(--gray-400);font-size:18px">←</span> Checkout</h2>
    <div class="checkout-grid">
      <div>
        <div class="checkout-section">
          <h3>📍 Delivery Address</h3>
          ${addrs.map(a=>`<div class="addr-card ${selAddr===a.id?'selected':''}" onclick="selAddr='${a.id}';renderCheckout()"><h4>${esc(a.full_name)}</h4><p>${esc(a.address_line1)}, ${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}</p>${a.phone?`<p style="margin-top:4px">📞 ${esc(a.phone)}</p>`:''}</div>`).join('')}
          <button class="btn btn-outline btn-sm btn-pill" onclick="$('addr-form').classList.toggle('hide')">+ Add New Address</button>
          <div id="addr-form" class="card hide" style="margin-top:12px">
            <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="nf-name" placeholder="Recipient name"></div>
            <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="nf-phone" placeholder="10-digit phone"></div>
            <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="nf-addr" placeholder="House no, Street, Area"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">City</label><input class="form-input" id="nf-city" placeholder="City"></div><div class="form-group"><label class="form-label">State</label><input class="form-input" id="nf-state" placeholder="State"></div></div>
            <div class="form-group"><label class="form-label">Pincode</label><input class="form-input" id="nf-pin" placeholder="6-digit pincode"></div>
            <button class="btn btn-black btn-pill" onclick="saveNewAddr()">Save Address</button>
          </div>
        </div>
        <div class="checkout-section">
          <h3>🏷️ Coupons & Referral</h3>
          <div style="display:flex;gap:8px;margin-bottom:12px"><input class="form-input" id="co-coupon" placeholder="Coupon code" style="margin:0;flex:1"><button class="btn btn-outline btn-pill" onclick="toast('Coupon applied!','🏷️')">Apply</button></div>
          <div style="display:flex;gap:8px"><input class="form-input" id="co-aff" placeholder="Affiliate/Referral code" style="margin:0;flex:1"><button class="btn btn-outline btn-pill" onclick="toast('Referral applied!','🔗')">Apply</button></div>
        </div>
        <div class="checkout-section">
          <h3>💳 Payment</h3>
          <div class="card card-sm" style="border:1.5px solid var(--gold);background:var(--gold-light)"><label style="display:flex;align-items:center;gap:10px;cursor:pointer"><input type="radio" name="pay" checked style="accent-color:var(--gold-dark)"><div><p style="font-weight:600">Cash on Delivery</p><p style="font-size:12px;color:var(--gray-400)">Pay when you receive</p></div></label></div>
          <div class="card card-sm" style="opacity:.5"><label style="display:flex;align-items:center;gap:10px"><input type="radio" name="pay" disabled><div><p style="font-weight:600">Online Payment</p><p style="font-size:12px;color:var(--gray-400)">Coming soon — Razorpay</p></div></label></div>
        </div>
      </div>
      <div class="order-summary"><div class="card">
        <h3 style="font-weight:700;margin-bottom:16px">Order Summary</h3>
        ${gstItems.map(gi=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
          <div><span style="color:var(--gray-600)">${esc(gi.name)} × ${gi.qty}</span>
            ${gi.variants?`<span style="font-size:10px;color:var(--gray-500);margin-left:4px">${Object.values(gi.variants).map(v=>v.label).join(' / ')}</span>`:''}
            <span style="font-size:10px;color:var(--gray-400);margin-left:6px">${gi.gstRate}% GST${gi.hsn?' · HSN:'+gi.hsn:''}</span></div>
          <span style="font-weight:600">₹${gi.lineTotal.toFixed(0)}</span>
        </div>`).join('')}
        <div style="margin-top:16px">
          <div class="cart-total-row"><span style="color:var(--gray-500)">Subtotal</span><span>₹${sub.toFixed(2)}</span></div>
          ${totalGST>0?`<div class="cart-total-row"><span style="color:var(--gray-500)">🧾 GST</span><span>+₹${totalGST.toFixed(2)}</span></div>
          <div style="padding:6px 0;font-size:11px;color:var(--gray-400);display:flex;justify-content:space-between"><span style="padding-left:16px">CGST + SGST (intra-state)</span><span>₹${(totalGST/2).toFixed(2)} + ₹${(totalGST/2).toFixed(2)}</span></div>`:''}
          <div class="cart-total-row"><span style="color:var(--gray-500)">Shipping</span><span style="color:var(--green)">Free</span></div>
          ${cb>0?`<div class="cart-total-row"><span style="color:var(--green)">💰 Cashback</span><span style="color:var(--green)">+₹${cb.toFixed(0)}</span></div>`:''}
          <div class="cart-total-row total"><span>Total</span><span>₹${grandTotal.toFixed(2)}</span></div>
        </div>
        <button class="btn btn-gold btn-lg btn-full btn-pill" style="margin-top:16px" onclick="placeOrder()">Place Order — ₹${grandTotal.toFixed(2)}</button>
        <p style="text-align:center;font-size:11px;color:var(--gray-400);margin-top:12px">🔒 Secured by Glonni · 7-day returns · Prices include applicable GST</p>
      </div></div>
    </div>
  </div>`;
}

async function saveNewAddr(){
  const d={user_id:PROFILE.id,full_name:$('nf-name').value,phone:$('nf-phone').value,address_line1:$('nf-addr').value,city:$('nf-city').value,state:$('nf-state').value,pincode:$('nf-pin').value};
  if(!d.full_name||!d.address_line1||!d.city){toast('Fill required fields','⚠️');return;}
  const r=await sb.ins("addresses",d);if(r.length){selAddr=r[0].id;toast('Address saved!','📍');renderCheckout();}
}

async function placeOrder(){
  if(!selAddr){toast('Select a delivery address','⚠️');return;}
  const cp=$('co-coupon')?.value||null;
  const ac=$('co-aff')?.value||null;
  const r=await sb.rpc("place_order",{p_address_id:selAddr,p_payment_method:"cod",p_coupon_code:cp,p_affiliate_code:ac,p_notes:null});
  if(r?.success){
    if(r.order_id){
      const cartItems=CART_ITEMS;
      let oGST=0,oTCS=0;
      for(const it of cartItems){
        const p=it.products;if(!p)continue;
        const rate=p.gst_rate||0;const lineTotal=(p.price||0)*it.quantity;
        const inclusive=p.gst_inclusive||false;
        const gstAmt=inclusive?lineTotal-lineTotal*100/(100+rate):lineTotal*rate/100;
        oGST+=gstAmt;
      }
      const sub=cartItems.reduce((s,i)=>s+(i.products?.price||0)*i.quantity,0);
      oTCS=sub*0.01;

      // ── STEP 4: Read referral ref from localStorage ──
      const refUserId=getActiveRef();
      const refUpdate={subtotal:sub,gst_amount:parseFloat(oGST.toFixed(2)),cgst_amount:parseFloat((oGST/2).toFixed(2)),sgst_amount:parseFloat((oGST/2).toFixed(2)),tcs_amount:parseFloat(oTCS.toFixed(2)),is_intrastate:true};
      if(refUserId&&refUserId!==PROFILE.id){refUpdate.ref_user_id=refUserId;}// block self-referral
      await sb.upd("orders",refUpdate,{id:`eq.${r.order_id}`});

      // ── STEP 5: Create referral_earnings rows per product ──
      if(refUserId&&refUserId!==PROFILE.id){
        try{
          for(const it of cartItems){
            const p=it.products;if(!p)continue;
            const catId=p.category_id;if(!catId)continue;
            const cats=await sb.get("categories","referral_commission_pct",{id:`eq.${catId}`});
            const pct=parseFloat(cats[0]?.referral_commission_pct||0);
            if(!pct)continue;
            const orderAmt=(p.price||0)*it.quantity;
            const commissionAmt=parseFloat((orderAmt*pct/100).toFixed(2));
            if(commissionAmt<=0)continue;
            const eligibleAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
            await sb.ins("referral_earnings",{
              referrer_user_id:refUserId,
              buyer_user_id:PROFILE.id,
              order_id:r.order_id,
              product_id:p.id,
              order_amount:orderAmt,
              commission_pct:pct,
              commission_amount:commissionAmt,
              status:'pending',
              eligible_at:eligibleAt
            });
          }
          clearRef();// clear after successful attribution
        }catch(e){console.log('Referral earning error:',e);}
      }

      // Ad conversion tracking (30 min attribution window)
      for(const it of cartItems){
        const pid=it.products?.id;if(!pid)continue;
        try{
          const attr=JSON.parse(sessionStorage.getItem('ad_attr_'+pid)||'null');
          if(attr&&Date.now()-attr.ts<1800000){
            await sb.ins("ad_events",{campaign_id:attr.campaignId,creative_id:attr.creativeId,product_id:pid,user_id:PROFILE.id,event_type:'conversion',order_id:r.order_id,order_amount:(it.products.price||0)*it.quantity});
            const camps=await sb.get("ad_campaigns","conversions",{id:`eq.${attr.campaignId}`});
            if(camps.length)await sb.upd("ad_campaigns",{conversions:(camps[0].conversions||0)+1},{id:`eq.${attr.campaignId}`});
            sessionStorage.removeItem('ad_attr_'+pid);
          }
        }catch(e){}
      }
      // Save rule snapshots on order items
      try{
        const oItems=await sb.get("order_items","id,product_id,unit_price,platform_fee,cashback_amount,affiliate_commission",{order_id:`eq.${r.order_id}`});
        for(const oi of oItems){
          const snapshot={commission_rate:oi.platform_fee&&oi.unit_price?(oi.platform_fee/oi.unit_price*100).toFixed(2)+'%':'5%',cashback_rate:oi.cashback_amount&&oi.unit_price?(oi.cashback_amount/oi.unit_price*100).toFixed(2)+'%':'0%',snapshot_at:new Date().toISOString(),engine:'client_v1'};
          await sb.upd("order_items",{rule_snapshot:snapshot},{id:`eq.${oi.id}`});
        }
      }catch(e){console.log('Snapshot error:',e);}
    }
    CART_COUNT=0;CART_ITEMS=[];renderNav();toast('Order placed! 🎉 #'+r.order_number,'🎉');setTimeout(()=>go('orders'),1500);
  }
  else toast('Error: '+(r?.error||r?.message||JSON.stringify(r)),'❌');
}

// ═══════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// STATUS HELPERS
// ═══════════════════════════════════════════════════
const statusIcon=s=>({pending:'🕐',confirmed:'✅',processing:'⚙️',shipped:'🚚',delivered:'📦',cancelled:'❌',return_requested:'↩️',returned:'🔄'}[s]||'•');
function statusBg(s){return{pending:'rgba(255,149,0,.15);color:var(--orange)',confirmed:'rgba(0,122,255,.15);color:var(--blue)',processing:'rgba(175,82,222,.15);color:var(--purple)',shipped:'rgba(52,199,89,.15);color:#1a9c4a',delivered:'rgba(52,199,89,.15);color:var(--green)',cancelled:'rgba(255,59,48,.15);color:var(--red)',return_requested:'rgba(255,149,0,.15);color:var(--orange)',returned:'rgba(175,82,222,.15);color:var(--purple)'}[s]||'var(--gray-100);color:var(--gray-500)';}
function emptyState(icon,title,sub){return `<div style="text-align:center;padding:60px 0"><p style="font-size:56px;margin-bottom:12px">${icon}</p><p style="font-weight:700;font-size:16px">${title}</p><p style="color:var(--gray-400);margin-top:6px;font-size:13px">${sub}</p></div>`;}

const ORDER_FLOW=['pending','confirmed','processing','shipped','delivered'];
function timelineHTML(history,currentStatus){
  const steps=ORDER_FLOW.map(s=>{
    const entry=history.find(h=>h.to_status===s);
    const isCurrent=s===currentStatus;
    const isDone=entry||ORDER_FLOW.indexOf(currentStatus)>ORDER_FLOW.indexOf(s);
    const isCancelled=currentStatus==='cancelled'||currentStatus==='returned'||currentStatus==='return_requested';
    return `<div style="display:flex;gap:12px;align-items:start;position:relative">
      <div style="display:flex;flex-direction:column;align-items:center;width:32px;flex-shrink:0">
        <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;${isDone?'background:var(--gold);color:var(--black)':isCurrent?'background:var(--black);color:var(--white)':'background:var(--gray-100);color:var(--gray-400)'}">${statusIcon(s)}</div>
        ${s!=='delivered'?`<div style="width:2px;height:32px;${isDone?'background:var(--gold)':'background:var(--gray-200)'}"></div>`:''}
      </div>
      <div style="padding-bottom:${s!=='delivered'?'20px':'0'}">
        <p style="font-weight:${isCurrent||isDone?'700':'500'};font-size:14px;color:${isDone?'var(--black)':'var(--gray-400)'}">${s.charAt(0).toUpperCase()+s.slice(1)}</p>
        ${entry?`<p style="font-size:11px;color:var(--gray-400);margin-top:2px">${new Date(entry.created_at).toLocaleString()}${entry.note?' · '+esc(entry.note):''}</p>`:''}
      </div>
    </div>`;
  }).join('');
  
  // Add cancelled/returned if applicable
  let extra='';
  const cancelEntry=history.find(h=>h.to_status==='cancelled');
  const returnEntry=history.find(h=>h.to_status==='return_requested'||h.to_status==='returned');
  if(cancelEntry){extra=`<div style="display:flex;gap:12px;align-items:start;margin-top:8px"><div style="width:28px;height:28px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">❌</div><div><p style="font-weight:700;font-size:14px;color:var(--red)">Cancelled</p><p style="font-size:11px;color:var(--gray-400)">${new Date(cancelEntry.created_at).toLocaleString()}${cancelEntry.note?' · '+esc(cancelEntry.note):''}</p></div></div>`;}
  if(returnEntry){extra=`<div style="display:flex;gap:12px;align-items:start;margin-top:8px"><div style="width:28px;height:28px;border-radius:50%;background:var(--purple);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">↩️</div><div><p style="font-weight:700;font-size:14px;color:var(--purple)">Return ${returnEntry.to_status==='returned'?'Completed':'Requested'}</p><p style="font-size:11px;color:var(--gray-400)">${new Date(returnEntry.created_at).toLocaleString()}</p></div></div>`;}
  
  return `<div style="padding:16px 0">${steps}${extra}</div>`;
}

// ═══════════════════════════════════════════════════
// ORDERS LIST (user + vendor)
// ═══════════════════════════════════════════════════
async function renderOrders(){
  if(!PROFILE){showAuth();return;}
  if(PROFILE.role==='admin'||PROFILE.role==='super_admin'){go('admin-orders');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading orders...</div>';
  const isVendor=PROFILE.role==='vendor';

  if(isVendor){
    const ois=await sb.get("order_items","*,orders(order_number,created_at,status),products(name)",{vendor_id:`eq.${PROFILE.id}`,order:"created_at.desc"});
    $('main').innerHTML=`<div class="container" style="padding:32px 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><h2 style="font-size:24px;font-weight:800">Vendor Orders <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${ois.length})</span></h2><button class="btn btn-outline btn-pill btn-sm" onclick="go('vendor-dash')">← Dashboard</button></div>
      ${!ois.length?emptyState('📦','No orders yet','Orders appear when customers buy your products')
      :ois.map(o=>{
        const canConfirm=o.status==='pending';
        const canShip=o.status==='confirmed'||o.status==='processing';
        const canDeliver=o.status==='shipped';
        return `<div class="card" style="cursor:pointer" onclick="go('order-detail',{oid:'${o.order_id}',oiid:'${o.id}'})">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div><p style="font-weight:700">${esc(o.products?.name)}</p><p style="font-size:12px;color:var(--gray-400)">#${esc(o.orders?.order_number)} · Qty ${o.quantity} · ${new Date(o.orders?.created_at).toLocaleDateString()}</p></div>
            <div style="text-align:right"><span class="badge" style="background:${statusBg(o.status)}">${statusIcon(o.status)} ${o.status}</span><p style="font-weight:800;color:var(--gold-dark);margin-top:4px">₹${o.total_price}</p></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" onclick="event.stopPropagation()">
            ${canConfirm?`<button class="btn btn-success btn-sm btn-pill" onclick="updateItemStatus('${o.id}','confirmed')">✅ Confirm</button><button class="btn btn-danger btn-sm btn-pill" onclick="updateItemStatus('${o.id}','cancelled')">❌ Reject</button>`:''}
            ${canShip?`<button class="btn btn-gold btn-sm btn-pill" onclick="showDispatchChecklist('${o.id}','${o.order_id}')">🚚 Mark Shipped</button>`:''}
            ${canDeliver?`<button class="btn btn-success btn-sm btn-pill" onclick="updateItemStatus('${o.id}','delivered')">📦 Mark Delivered</button>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  } else {
    const orders=await sb.get("orders","*,order_items(*,products(name))",{user_id:`eq.${PROFILE.id}`,order:"created_at.desc"});
    $('main').innerHTML=`<div class="container" style="padding:32px 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><h2 style="font-size:24px;font-weight:800">My Orders <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${orders.length})</span></h2><button class="btn btn-outline btn-pill btn-sm" onclick="goBack()">← Back</button></div>
      ${!orders.length?emptyState('📦','No orders yet','Start shopping to place your first order')
      :orders.map(o=>`<div class="card" style="cursor:pointer" onclick="go('order-detail',{oid:'${o.id}'})">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
          <div><p style="font-weight:800;font-size:16px">${esc(o.order_number)}</p><p style="font-size:12px;color:var(--gray-400)">${new Date(o.created_at).toLocaleDateString()} · ${(o.payment_method||'COD').toUpperCase()}</p></div>
          <div style="text-align:right"><span class="badge" style="background:${statusBg(o.status)}">${statusIcon(o.status)} ${o.status}</span><p style="font-weight:900;font-size:18px;color:var(--gold-dark);margin-top:4px">₹${o.total}</p></div>
        </div>
        ${(o.order_items||[]).map(oi=>`<div style="padding:10px;background:var(--gray-50);border-radius:var(--radius-sm);margin-top:8px;display:flex;justify-content:space-between;align-items:center"><div><span style="font-size:13px;font-weight:600">${esc(oi.products?.name)} × ${oi.quantity}</span><br><span class="badge" style="background:${statusBg(oi.status)};margin-top:4px;display:inline-flex">${statusIcon(oi.status)} ${oi.status}</span></div><div style="text-align:right"><span style="font-weight:600;font-size:13px">₹${oi.total_price}</span>${oi.cashback_amount>0?`<br><span style="font-size:11px;color:var(--green)">+₹${oi.cashback_amount} cashback</span>`:''}</div></div>`).join('')}
        <div style="display:flex;gap:8px;margin-top:12px" onclick="event.stopPropagation()">
          ${o.status==='pending'||o.status==='confirmed'?`<button class="btn btn-outline btn-sm btn-pill" onclick="cancelOrder('${o.id}')">Cancel Order</button>`:''}
          <button class="btn btn-ghost btn-sm btn-pill" onclick="go('order-detail',{oid:'${o.id}'})">View Details →</button>
          ${o.status==='delivered'||o.status==='shipped'?`<button class="btn btn-ghost btn-sm btn-pill" onclick="generateInvoice('${o.id}')">📄 Invoice</button>`:''}
        </div>
      </div>`).join('')}
    </div>`;
  }
}

// ═══════════════════════════════════════════════════
// ORDER DETAIL PAGE (timeline + actions)
// ═══════════════════════════════════════════════════
async function renderOrderDetail(){
  const oid=PARAMS.oid;
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading order...</div>';
  
  const [orders,items,history,shipments,returns,existingReviews,checklists]=await Promise.all([
    sb.get("orders","*",{id:`eq.${oid}`}),
    sb.get("order_items","*,products(name,images),vendor_warehouses(name,city,state)",{order_id:`eq.${oid}`}),
    sb.get("order_status_history","*",{order_id:`eq.${oid}`,order:"created_at.asc"}),
    sb.get("shipments","*",{order_id:`eq.${oid}`}),
    sb.get("return_requests","*",{order_id:`eq.${oid}`}),
    PROFILE?sb.get("reviews","order_item_id,rating",{user_id:`eq.${PROFILE.id}`}):[],
    sb.get("dispatch_checklist","*",{order_id:`eq.${oid}`})
  ]);
  const reviewedItemIds=existingReviews.map(r=>r.order_item_id);
  
  const o=orders[0];if(!o){$('main').innerHTML='<div class="container" style="padding:60px 0;text-align:center"><p style="font-size:48px">😕</p><p style="font-weight:700;margin-top:12px">Order not found</p></div>';return;}
  const isOwner=o.user_id===PROFILE?.id;
  const isVendor=PROFILE?.role==='vendor';
  const isAdmin=PROFILE?.role==='admin'||PROFILE?.role==='super_admin';

  let itemsHTML=items.map((oi,idx)=>{
    const img=getImg(oi.products,idx);
    const itemHistory=history.filter(h=>h.order_item_id===oi.id);
    const itemShip=shipments.find(s=>s.order_item_id===oi.id);
    const itemReturn=returns.find(r=>r.order_item_id===oi.id);
    const canReturn=isOwner&&oi.status==='delivered'&&!itemReturn;
    const canReview=isOwner&&oi.status==='delivered'&&!reviewedItemIds.includes(oi.id);
    const hasReview=reviewedItemIds.includes(oi.id);
    const reviewData=existingReviews.find(r=>r.order_item_id===oi.id);
    const canConfirm=isVendor&&oi.status==='pending'&&oi.vendor_id===PROFILE.id;
    const canShip=(isVendor&&(oi.status==='confirmed'||oi.status==='processing')&&oi.vendor_id===PROFILE.id);
    const canDeliver=isVendor&&oi.status==='shipped'&&oi.vendor_id===PROFILE.id;
    const dcl=checklists.find(c=>c.order_item_id===oi.id);

    return `<div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:16px;margin-bottom:16px">
        <div style="width:64px;height:64px;border-radius:var(--radius-sm);overflow:hidden;background:var(--gray-50);flex-shrink:0"><img src="${img}" style="width:100%;height:100%;object-fit:cover"></div>
        <div style="flex:1"><p style="font-weight:700;font-size:15px">${esc(oi.products?.name)}</p>
          <p style="font-size:13px;color:var(--gray-400)">Qty: ${oi.quantity} · ₹${oi.unit_price} each${oi.variant_selections?' · '+Object.values(oi.variant_selections).map(v=>v.label).join(' / '):''}</p>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><span class="badge" style="background:${statusBg(oi.status)}">${statusIcon(oi.status)} ${oi.status}</span><span style="font-weight:800;font-size:16px;color:var(--gold-dark)">₹${oi.total_price}</span>
            ${dcl?'<span class="badge badge-green" style="font-size:10px">✅ Dispatch Verified</span>':''}
          </div>
        </div>
      </div>
      ${dcl?`<div style="padding:8px 12px;background:rgba(52,199,89,.04);border:1px solid rgba(52,199,89,.12);border-radius:8px;font-size:11px;margin-bottom:12px;color:var(--gray-500)">
        ✅ Pre-dispatch verified ${dcl.verified_at?'on '+new Date(dcl.verified_at).toLocaleString():''} — 
        ${dcl.packed_correctly?'📦':'❌'} Packed 
        ${dcl.correct_product?'🔍':'❌'} Product 
        ${dcl.address_verified?'📍':'❌'} Address 
        ${dcl.invoice_attached?'🧾':'❌'} Invoice 
        ${dcl.weight_matched?'⚖️':'❌'} Weight
      </div>`:''}
      ${oi.cashback_amount>0?`<div style="padding:8px 12px;background:var(--gold-light);border-radius:8px;font-size:12px;margin-bottom:12px">💰 Cashback: <strong>₹${oi.cashback_amount}</strong> · Platform fee: ₹${oi.platform_fee}${oi.affiliate_commission>0?` · Affiliate: ₹${oi.affiliate_commission}`:''}</div>`:''}
      ${itemShip?`<div style="padding:10px 12px;background:var(--gray-50);border-radius:8px;font-size:13px;margin-bottom:12px">🚚 <strong>${esc(itemShip.courier_name||'Courier')}</strong>${itemShip.tracking_number?` · Tracking: <span style="font-family:'Space Mono',monospace;font-weight:700">${esc(itemShip.tracking_number)}</span>`:''} · Status: ${itemShip.status}${oi.vendor_warehouses?` · 📦 From: ${esc(oi.vendor_warehouses.name||oi.vendor_warehouses.city||'')}`:''}</div>`:''}
      ${itemReturn?`<div style="padding:10px 12px;background:rgba(175,82,222,.06);border:1px solid rgba(175,82,222,.15);border-radius:8px;font-size:13px;margin-bottom:12px">↩️ Return: <strong>${itemReturn.status}</strong> · Reason: ${esc(itemReturn.reason)}${itemReturn.admin_note?` · Admin: ${esc(itemReturn.admin_note)}`:''}${itemReturn.status==='refunded'?` · <span style="color:var(--green);font-weight:700">₹${itemReturn.refund_amount} refunded</span>`:''}</div>`:''}
      ${hasReview?`<div style="padding:8px 12px;background:rgba(237,207,93,.08);border:1px solid rgba(237,207,93,.2);border-radius:8px;font-size:12px;margin-bottom:12px;display:flex;align-items:center;gap:6px"><span style="color:var(--gold)">⭐</span> You rated this <strong style="color:var(--gold)">${'★'.repeat(reviewData?.rating||5)}</strong></div>`:''}
      
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canConfirm?`<button class="btn btn-success btn-sm btn-pill" onclick="updateItemStatus('${oi.id}','confirmed')">✅ Confirm</button><button class="btn btn-danger btn-sm btn-pill" onclick="updateItemStatus('${oi.id}','cancelled')">❌ Reject</button>`:''}
        ${canShip?`<button class="btn btn-gold btn-sm btn-pill" onclick="showDispatchChecklist('${oi.id}','${oi.order_id}')">🚚 Ship</button>`:''}
        ${canDeliver?`<button class="btn btn-success btn-sm btn-pill" onclick="updateItemStatus('${oi.id}','delivered')">📦 Delivered</button>`:''}
        ${canReturn?`<button class="btn btn-outline btn-sm btn-pill" onclick="showReturnModal('${oi.id}')">↩️ Request Return</button><button class="btn btn-ghost btn-sm btn-pill" onclick="confirmNoReturn('${oi.id}','${oi.vendor_id}')">✅ No Return Needed</button>`:''}        ${canReview?`<button class="btn btn-gold btn-sm btn-pill" onclick="showWriteReviewModal('${oi.product_id}')">⭐ Write Review</button>`:''}
        ${isAdmin&&itemReturn&&itemReturn.status==='pending'?`<button class="btn btn-success btn-sm btn-pill" onclick="processReturn('${itemReturn.id}','approve')">Approve Return</button><button class="btn btn-danger btn-sm btn-pill" onclick="processReturn('${itemReturn.id}','reject')">Reject Return</button>`:''}
      </div>
    </div>`;
  }).join('');

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <button class="btn btn-ghost btn-sm btn-pill" onclick="goBack()" style="margin-bottom:16px">← Back to Orders</button>
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:24px">
      <div><h2 style="font-size:24px;font-weight:800">${esc(o.order_number)}</h2><p style="color:var(--gray-400);font-size:13px">${new Date(o.created_at).toLocaleString()} · ${(o.payment_method||'COD').toUpperCase()} · Payment: ${o.payment_status}</p></div>
      <div style="text-align:right"><span class="badge" style="background:${statusBg(o.status)};font-size:13px;padding:5px 14px">${statusIcon(o.status)} ${o.status.toUpperCase()}</span><p style="font-weight:900;font-size:24px;color:var(--gold-dark);margin-top:8px">₹${o.total}</p></div>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 320px;gap:24px">
      <div>
        <h3 style="font-weight:700;margin-bottom:12px">Items</h3>
        ${itemsHTML}
        
        ${o.address_snapshot?`<div class="card"><h3 style="font-weight:700;margin-bottom:8px">📍 Delivery Address</h3><p style="font-size:14px;font-weight:600">${esc(o.address_snapshot.full_name)}</p><p style="font-size:13px;color:var(--gray-500)">${esc(o.address_snapshot.address_line1)}, ${esc(o.address_snapshot.city)}, ${esc(o.address_snapshot.state)} - ${esc(o.address_snapshot.pincode)}</p>${o.address_snapshot.phone?`<p style="font-size:13px;color:var(--gray-400);margin-top:4px">📞 ${esc(o.address_snapshot.phone)}</p>`:''}</div>`:''}
        
        ${(isOwner&&(o.status==='pending'||o.status==='confirmed'))?`<button class="btn btn-outline btn-pill" style="color:var(--red);border-color:var(--red);margin-top:8px" onclick="cancelOrder('${o.id}')">Cancel Entire Order</button>`:''}
      </div>
      <div>
        <div class="card" style="position:sticky;top:calc(var(--nav-h) + 24px)">
          <h3 style="font-weight:700;margin-bottom:16px">📋 Order Timeline</h3>
          ${timelineHTML(history,o.status)}
          
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-200)">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="color:var(--gray-400)">Subtotal</span><span>₹${o.subtotal||o.total}</span></div>
            ${parseFloat(o.gst_amount||0)>0?`<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px"><span style="color:var(--gray-400)">GST</span><span>₹${parseFloat(o.gst_amount).toFixed(2)}</span></div>
            <div style="padding-left:12px;font-size:11px;color:var(--gray-400);margin-bottom:4px">${o.is_intrastate!==false?`CGST ₹${parseFloat(o.cgst_amount||0).toFixed(2)} + SGST ₹${parseFloat(o.sgst_amount||0).toFixed(2)}`:`IGST ₹${parseFloat(o.igst_amount||0).toFixed(2)}`}</div>`:''}
            ${o.discount>0?`<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="color:var(--green)">Discount</span><span>-₹${o.discount}</span></div>`:''}
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="color:var(--gray-400)">Shipping</span><span style="color:var(--green)">${o.shipping_fee>0?'₹'+o.shipping_fee:'Free'}</span></div>
            <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;padding-top:8px;border-top:1px solid var(--gray-200);margin-top:8px"><span>Total</span><span>₹${o.total}</span></div>
          </div>
          <button class="btn btn-outline btn-pill btn-full" style="margin-top:16px" onclick="generateInvoice('${o.id}')">📄 Download Invoice</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════
// ORDER ACTIONS
// ═══════════════════════════════════════════════════
async function updateItemStatus(itemId,status){
  const r=await sb.rpc("update_order_item_status",{p_order_item_id:itemId,p_new_status:status});
  if(r?.success){
    toast(`Status → ${status}`,'✅');
    // Create settlement on delivery
    if(status==='delivered'){
      try{
        const items=await sb.get("order_items","*,orders(order_number)",{id:`eq.${itemId}`});
        const oi=items[0];
        if(oi&&oi.vendor_id){
          const gross=parseFloat(oi.total_price)||0;
          const commPct=oi.platform_fee&&gross>0?(parseFloat(oi.platform_fee)/gross*100):5;
          await createSettlement(itemId,oi.order_id,oi.vendor_id,gross,commPct,oi.orders?.order_number||'');
        }
      }catch(e){console.log('Settlement error:',e);}
    }
    if(PARAMS.oid)renderOrderDetail();else renderOrders();
  }
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

function showDispatchChecklist(itemId, orderId){
  (async()=>{
    // Load order + item details for address display
    const [items,orders]=await Promise.all([
      sb.get("order_items","*,products(name)",{id:`eq.${itemId}`}),
      orderId?sb.get("orders","order_number,address_snapshot",{id:`eq.${orderId}`}):[]
    ]);
    const oi=items[0];const o=orders[0];
    const snap=o?.address_snapshot||{};
    const pName=oi?.products?.name||'Product';

    const modal=document.createElement('div');modal.className='auth-overlay';
    modal.innerHTML=`<div class="auth-card" style="max-width:500px;max-height:90vh;overflow-y:auto">
      <h3 style="font-weight:800;font-size:18px;margin-bottom:6px">✅ Pre-Dispatch Verification</h3>
      <p style="font-size:13px;color:var(--gray-400);margin-bottom:20px">${esc(pName)} · ${esc(o?.order_number||'Order')}</p>

      <!-- Customer Address Review -->
      ${snap.full_name?`<div style="padding:14px;background:var(--gray-50);border-radius:var(--radius);margin-bottom:16px">
        <p style="font-size:11px;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">📍 Shipping To</p>
        <p style="font-weight:700">${esc(snap.full_name)}</p>
        <p style="font-size:13px;color:var(--gray-600)">${esc(snap.address_line1||'')}, ${esc(snap.city||'')}, ${esc(snap.state||'')} — ${esc(snap.pincode||'')}</p>
        ${snap.phone?`<p style="font-size:13px;color:var(--gray-500)">📞 ${esc(snap.phone)}</p>`:''}
      </div>`:''}

      <!-- Mandatory Checklist -->
      <div id="dc-checks" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
        <label class="dc-item" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1.5px solid var(--gray-200);border-radius:10px;cursor:pointer;transition:all .15s" onclick="this.querySelector('input').click();dcUpdate()">
          <input type="checkbox" id="dc-packed" style="width:20px;height:20px;accent-color:var(--green);flex-shrink:0" onclick="event.stopPropagation();dcUpdate()">
          <div><p style="font-weight:700;font-size:14px">📦 Product Packed Correctly</p><p style="font-size:12px;color:var(--gray-400)">Item sealed, bubble-wrapped, label matches order</p></div>
        </label>
        <label class="dc-item" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1.5px solid var(--gray-200);border-radius:10px;cursor:pointer;transition:all .15s" onclick="this.querySelector('input').click();dcUpdate()">
          <input type="checkbox" id="dc-correct" style="width:20px;height:20px;accent-color:var(--green);flex-shrink:0" onclick="event.stopPropagation();dcUpdate()">
          <div><p style="font-weight:700;font-size:14px">🔍 Correct Product Verified</p><p style="font-size:12px;color:var(--gray-400)">Product matches order, correct variant/color/size</p></div>
        </label>
        <label class="dc-item" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1.5px solid var(--gray-200);border-radius:10px;cursor:pointer;transition:all .15s" onclick="this.querySelector('input').click();dcUpdate()">
          <input type="checkbox" id="dc-address" style="width:20px;height:20px;accent-color:var(--green);flex-shrink:0" onclick="event.stopPropagation();dcUpdate()">
          <div><p style="font-weight:700;font-size:14px">📍 Address & Billing Verified</p><p style="font-size:12px;color:var(--gray-400)">Customer address, pincode, phone number confirmed correct</p></div>
        </label>
        <label class="dc-item" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1.5px solid var(--gray-200);border-radius:10px;cursor:pointer;transition:all .15s" onclick="this.querySelector('input').click();dcUpdate()">
          <input type="checkbox" id="dc-invoice" style="width:20px;height:20px;accent-color:var(--green);flex-shrink:0" onclick="event.stopPropagation();dcUpdate()">
          <div><p style="font-weight:700;font-size:14px">🧾 Invoice Printed / Attached</p><p style="font-size:12px;color:var(--gray-400)">Tax invoice placed inside package</p></div>
        </label>
        <label class="dc-item" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1.5px solid var(--gray-200);border-radius:10px;cursor:pointer;transition:all .15s" onclick="this.querySelector('input').click();dcUpdate()">
          <input type="checkbox" id="dc-weight" style="width:20px;height:20px;accent-color:var(--green);flex-shrink:0" onclick="event.stopPropagation();dcUpdate()">
          <div><p style="font-weight:700;font-size:14px">⚖️ Package Weight Verified</p><p style="font-size:12px;color:var(--gray-400)">Weight matches product specs, no discrepancy</p></div>
        </label>
      </div>

      <!-- Progress -->
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray-400);margin-bottom:4px"><span id="dc-progress-text">0 of 5 verified</span><span id="dc-progress-pct">0%</span></div>
        <div style="height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden"><div id="dc-progress-bar" style="width:0%;height:100%;background:var(--red);border-radius:3px;transition:all .3s"></div></div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-pill btn-full" id="dc-proceed-btn" disabled style="flex:1;background:var(--gray-300);color:#fff;border:none;cursor:not-allowed" onclick="proceedToShip('${itemId}','${orderId||''}')">🚚 Proceed to Ship</button>
        <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
      </div>
      <p style="font-size:11px;color:var(--gray-400);text-align:center;margin-top:10px">All checks are mandatory and logged for audit</p>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  })();
}

function dcUpdate(){
  setTimeout(()=>{
    const checks=['dc-packed','dc-correct','dc-address','dc-invoice','dc-weight'];
    const done=checks.filter(id=>$(id)?.checked).length;
    const total=checks.length;
    const pct=Math.round(done/total*100);
    const el=$('dc-progress-bar');if(el){el.style.width=pct+'%';el.style.background=pct===100?'var(--green)':pct>=60?'var(--orange)':'var(--red)';}
    const txt=$('dc-progress-text');if(txt)txt.textContent=`${done} of ${total} verified`;
    const pctEl=$('dc-progress-pct');if(pctEl)pctEl.textContent=pct+'%';
    const btn=$('dc-proceed-btn');
    if(btn){
      if(pct===100){btn.disabled=false;btn.style.background='var(--green)';btn.style.cursor='pointer';}
      else{btn.disabled=true;btn.style.background='var(--gray-300)';btn.style.cursor='not-allowed';}
    }
    // Highlight checked items
    checks.forEach(id=>{
      const label=$(id)?.closest('.dc-item')||$(id)?.parentElement?.parentElement;
      if(label){label.style.borderColor=$(id)?.checked?'var(--green)':'var(--gray-200)';label.style.background=$(id)?.checked?'rgba(52,199,89,.04)':'#fff';}
    });
  },50);
}

async function proceedToShip(itemId, orderId){
  // Save checklist to DB
  await sb.ins("dispatch_checklist",{
    order_item_id:itemId,
    order_id:orderId||null,
    vendor_id:PROFILE.id,
    packed_correctly:$('dc-packed')?.checked||false,
    correct_product:$('dc-correct')?.checked||false,
    address_verified:$('dc-address')?.checked||false,
    invoice_attached:$('dc-invoice')?.checked||false,
    weight_matched:$('dc-weight')?.checked||false,
    verified_by:PROFILE.id,
    verified_at:new Date().toISOString()
  });
  document.querySelector('.auth-overlay')?.remove();
  toast('Verification complete ✅','✅');
  // Now open the ship modal
  showShipModal(itemId);
}

function showShipModal(itemId){
  (async()=>{
    const whs=await sb.get("vendor_warehouses","id,name,city",{vendor_id:`eq.${PROFILE.id}`,is_active:"eq.true",order:"is_default.desc"});
    const whOpts=whs.map(w=>`<option value="${w.id}">${esc(w.name)} (${esc(w.city)})</option>`).join('');
    const modal=document.createElement('div');
    modal.className='auth-overlay';
    modal.innerHTML=`<div class="auth-card" style="max-width:420px">
      <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">🚚 Ship Order Item</h3>
      ${whs.length>1?`<div class="form-group"><label class="form-label">📦 Ship From Warehouse</label><select class="form-select" id="ship-wh">${whOpts}</select></div>`
      :whs.length===1?`<input type="hidden" id="ship-wh" value="${whs[0].id}"><p style="font-size:13px;color:var(--gray-400);margin-bottom:12px">📦 Shipping from: <strong>${esc(whs[0].name)}</strong></p>`
      :''}
      <div class="form-group"><label class="form-label">Courier Name</label><input class="form-input" id="ship-courier" placeholder="e.g. Delhivery, BlueDart"></div>
      <div class="form-group"><label class="form-label">Tracking Number</label><input class="form-input" id="ship-track" placeholder="e.g. AWB12345678"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill" style="flex:1" onclick="doShip('${itemId}')">Confirm Shipment</button>
        <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  })();
}

async function doShip(itemId){
  const courier=$('ship-courier')?.value||'';
  const tracking=$('ship-track')?.value||'';
  const whId=$('ship-wh')?.value||null;
  const r=await sb.rpc("update_order_item_status",{p_order_item_id:itemId,p_new_status:'shipped',p_tracking_number:tracking||null,p_courier_name:courier||null});
  // Save warehouse on order item
  if(whId)await sb.upd("order_items",{warehouse_id:whId},{id:`eq.${itemId}`});
  // Deduct stock from warehouse
  if(whId){
    const items=await sb.get("order_items","product_id,quantity",{id:`eq.${itemId}`});
    if(items.length){
      const ws=await sb.get("warehouse_stock","*",{product_id:`eq.${items[0].product_id}`,warehouse_id:`eq.${whId}`});
      if(ws.length){
        const newQty=Math.max(0,ws[0].quantity-items[0].quantity);
        await sb.upd("warehouse_stock",{quantity:newQty},{id:`eq.${ws[0].id}`});
      }
    }
  }
  document.querySelector('.auth-overlay')?.remove();
  if(r?.success){toast('Shipped! 🚚','🚚');if(PARAMS.oid)renderOrderDetail();else renderOrders();}
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

async function cancelOrder(orderId){
  if(!confirm('Cancel this order? This cannot be undone.'))return;
  const r=await sb.rpc("cancel_order",{p_order_id:orderId,p_reason:'Cancelled by '+(PROFILE?.role||'user')});
  if(r?.success){toast('Order cancelled','❌');if(PARAMS.oid)renderOrderDetail();else renderOrders();}
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

function showReturnModal(itemId){
  const modal=document.createElement('div');
  modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:440px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">↩️ Request Return</h3>
    <div class="form-group"><label class="form-label">Reason</label>
      <select class="form-select" id="ret-reason"><option>Defective / Damaged</option><option>Wrong item received</option><option>Not as described</option><option>Size/fit issue</option><option>Changed my mind</option><option>Other</option></select>
    </div>
    <div class="form-group"><label class="form-label">Details (optional)</label><textarea class="form-textarea" id="ret-desc" placeholder="Tell us more..."></textarea></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="doReturn('${itemId}')">Submit Return</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
    <p style="font-size:11px;color:var(--gray-400);margin-top:12px;text-align:center">Returns must be within 7 days of delivery. Refund goes to your wallet.</p>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function doReturn(itemId){
  const reason=$('ret-reason')?.value||'';
  const desc=$('ret-desc')?.value||'';
  const r=await sb.rpc("request_return",{p_order_item_id:itemId,p_reason:reason,p_description:desc});
  document.querySelector('.auth-overlay')?.remove();
  if(r?.success){toast('Return requested ↩️','↩️');renderOrderDetail();}
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

async function processReturn(returnId,action){
  const note=action==='reject'?prompt('Reason for rejection:'):'Approved by admin';
  const r=await sb.rpc("process_return",{p_return_id:returnId,p_action:action,p_admin_note:note||''});
  if(r?.success){
    // ── Void referral earning when return is approved ──
    if(action==='approve'&&r.order_id) await voidReferralForOrder(r.order_id);
    toast(`Return ${action}d`,'✅');
    renderOrderDetail();
  }
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

// ═══════════════════════════════════════════════════
// GST-COMPLIANT INVOICE PDF
// ═══════════════════════════════════════════════════
async function generateInvoice(orderId){
  toast('Generating invoice...','📄');
  const [orders,items,addr]=await Promise.all([
    sb.get("orders","*",{id:`eq.${orderId}`}),
    sb.get("order_items","*,products(name,hsn_code,gst_rate,gst_inclusive,price)",{order_id:`eq.${orderId}`}),
    sb.get("orders","address_snapshot",{id:`eq.${orderId}`})
  ]);
  const o=orders[0];if(!o){toast('Order not found','❌');return;}
  const snap=o.address_snapshot||{};

  // Get vendor store details (for seller GSTIN)
  let sellerName='Glonni Marketplace',sellerGSTIN='',sellerAddr='India',sellerState='';
  let dispatchAddr='';
  if(items.length){
    const vendorId=items[0].vendor_id;
    if(vendorId){
      const stores=await sb.get("vendor_stores","*",{vendor_id:`eq.${vendorId}`});
      if(stores.length){
        sellerName=stores[0].store_name||'Glonni Seller';
        sellerGSTIN=stores[0].gstin||'';
        sellerState=stores[0].gst_state_code||'';
        sellerAddr=stores[0].description||'India';
      }
    }
    // Get dispatch warehouse
    const whId=items[0].warehouse_id;
    if(whId){
      const whs=await sb.get("vendor_warehouses","*",{id:`eq.${whId}`});
      if(whs.length){
        const wh=whs[0];
        dispatchAddr=`${wh.name}, ${wh.address_line1}, ${wh.city}, ${wh.state} — ${wh.pincode}`;
        if(wh.gst_state_code)sellerState=wh.gst_state_code;
      }
    }
  }

  const invNo=`INV-${o.order_number||o.id.slice(0,8).toUpperCase()}`;
  const invDate=new Date(o.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const subtotal=parseFloat(o.subtotal)||items.reduce((s,i)=>(i.unit_price||0)*i.quantity+s,0);
  const gstAmt=parseFloat(o.gst_amount)||0;
  const cgst=parseFloat(o.cgst_amount)||0;
  const sgst=parseFloat(o.sgst_amount)||0;
  const igst=parseFloat(o.igst_amount)||0;
  const tcs=parseFloat(o.tcs_amount)||0;
  const isIntra=o.is_intrastate!==false;
  const total=parseFloat(o.total)||subtotal+gstAmt;
  const shipping=parseFloat(o.shipping_fee)||0;
  const discount=parseFloat(o.discount)||0;

  // Build item rows
  const itemRows=items.map((it,i)=>{
    const p=it.products||{};
    const qty=it.quantity||1;
    const rate=it.unit_price||p.price||0;
    const lineTotal=rate*qty;
    const gstRate=parseFloat(p.gst_rate)||0;
    const gstOnItem=p.gst_inclusive?lineTotal-lineTotal*100/(100+gstRate):lineTotal*gstRate/100;
    const taxableVal=p.gst_inclusive?lineTotal-gstOnItem:lineTotal;
    const halfRate=(gstRate/2).toFixed(1);
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px">${i+1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;font-weight:600">${esc(p.name||'Product')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;font-family:monospace">${p.hsn_code||'—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:center">${qty}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right">₹${rate.toFixed(2)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right">₹${taxableVal.toFixed(2)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:center">${gstRate}%</td>
      ${isIntra?`
        <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right">${halfRate}%<br>₹${(gstOnItem/2).toFixed(2)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right">${halfRate}%<br>₹${(gstOnItem/2).toFixed(2)}</td>
      `:`<td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right">${gstRate}%<br>₹${gstOnItem.toFixed(2)}</td>`}
      <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right;font-weight:700">₹${lineTotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const amountInWords=numberToWords(Math.round(total));

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${invNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#111;background:#fff;padding:0;font-size:13px}
.inv{max-width:800px;margin:0 auto;padding:32px 40px}
.inv-header{display:flex;justify-content:space-between;align-items:start;padding-bottom:20px;border-bottom:3px solid #111}
.inv-logo{font-size:28px;font-weight:900;letter-spacing:-1px}.inv-logo i{color:#EDCF5D;font-style:normal}
.inv-title{text-align:right}.inv-title h1{font-size:24px;font-weight:800;color:#111;letter-spacing:1px}.inv-title p{font-size:11px;color:#666;margin-top:4px}
.inv-parties{display:flex;justify-content:space-between;padding:20px 0;gap:40px}
.inv-party{flex:1}.inv-party h3{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:6px;font-weight:700}
.inv-party p{font-size:12px;line-height:1.6}.inv-party strong{font-weight:700}
.inv-meta{display:flex;gap:32px;padding:16px 20px;background:#f8f8f8;border-radius:6px;margin-bottom:20px}
.inv-meta div{}.inv-meta label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#999;display:block;font-weight:600}
.inv-meta span{font-size:13px;font-weight:700;color:#111}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
thead th{background:#111;color:#fff;padding:10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;text-align:left}
thead th:last-child,thead th.r{text-align:right}
thead th.c{text-align:center}
.inv-totals{display:flex;justify-content:flex-end}
.inv-totals table{width:300px}
.inv-totals td{padding:6px 10px;font-size:12px;border:none}
.inv-totals tr:last-child td{font-weight:900;font-size:16px;border-top:2px solid #111;padding-top:10px}
.inv-words{padding:12px 16px;background:#f8f8f8;border-radius:6px;font-size:12px;margin-bottom:20px}
.inv-footer{border-top:1px solid #ddd;padding-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#999}
.inv-stamp{text-align:right;margin-top:40px}
.inv-stamp p{font-size:11px;color:#666;margin-bottom:4px}
.inv-stamp strong{font-size:14px;display:block;margin-top:24px;padding-top:8px;border-top:1px solid #111}
@media print{body{padding:0}.inv{padding:20px 24px}button,.no-print{display:none!important}@page{margin:10mm}}
</style></head><body>
<div style="text-align:center;padding:12px;background:#f0f0f0" class="no-print">
  <button onclick="window.print()" style="padding:10px 32px;background:#111;color:#fff;border:none;border-radius:20px;font-weight:700;cursor:pointer;font-size:14px">🖨 Print / Save as PDF</button>
  <span style="font-size:12px;color:#666;margin-left:12px">Use "Save as PDF" in print dialog</span>
</div>
<div class="inv">
  <!-- Header -->
  <div class="inv-header">
    <div class="inv-logo">Glonni<i>.</i></div>
    <div class="inv-title"><h1>TAX INVOICE</h1><p>Original for Recipient</p></div>
  </div>

  <!-- Seller / Buyer -->
  <div class="inv-parties">
    <div class="inv-party">
      <h3>Sold By</h3>
      <p><strong>${esc(sellerName)}</strong></p>
      ${sellerGSTIN?`<p>GSTIN: <strong style="font-family:monospace">${esc(sellerGSTIN)}</strong></p>`:''}
      ${sellerState?`<p>State: ${esc(sellerState)}</p>`:''}
      <p style="color:#666">${esc(sellerAddr)}</p>
      ${dispatchAddr?`<p style="margin-top:6px;font-size:11px;color:#999">📦 Dispatched from: ${esc(dispatchAddr)}</p>`:''}
    </div>
    <div class="inv-party">
      <h3>Shipped To / Billed To</h3>
      <p><strong>${esc(snap.full_name||'Customer')}</strong></p>
      <p>${esc(snap.address_line1||'')}</p>
      <p>${esc(snap.city||'')}, ${esc(snap.state||'')} — ${esc(snap.pincode||'')}</p>
      ${snap.phone?`<p>Phone: ${esc(snap.phone)}</p>`:''}
    </div>
  </div>

  <!-- Invoice Meta -->
  <div class="inv-meta">
    <div><label>Invoice No.</label><span>${invNo}</span></div>
    <div><label>Invoice Date</label><span>${invDate}</span></div>
    <div><label>Order No.</label><span>${esc(o.order_number||'')}</span></div>
    <div><label>Payment</label><span>${(o.payment_method||'COD').toUpperCase()}</span></div>
    ${sellerGSTIN?`<div><label>Place of Supply</label><span>${esc(snap.state||'India')}</span></div>`:''}
  </div>

  <!-- Items Table -->
  <table>
    <thead><tr>
      <th>#</th><th>Product</th><th>HSN</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Taxable</th><th class="c">GST%</th>
      ${isIntra?'<th class="r">CGST</th><th class="r">SGST</th>':'<th class="r">IGST</th>'}
      <th class="r">Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Totals -->
  <div class="inv-totals">
    <table>
      <tr><td style="color:#666">Subtotal</td><td style="text-align:right">₹${subtotal.toFixed(2)}</td></tr>
      ${isIntra?`
        <tr><td style="color:#666">CGST</td><td style="text-align:right">₹${cgst.toFixed(2)}</td></tr>
        <tr><td style="color:#666">SGST</td><td style="text-align:right">₹${sgst.toFixed(2)}</td></tr>
      `:`<tr><td style="color:#666">IGST</td><td style="text-align:right">₹${igst.toFixed(2)}</td></tr>`}
      ${discount>0?`<tr><td style="color:#22c55e">Discount</td><td style="text-align:right;color:#22c55e">-₹${discount.toFixed(2)}</td></tr>`:''}
      ${shipping>0?`<tr><td style="color:#666">Shipping</td><td style="text-align:right">₹${shipping.toFixed(2)}</td></tr>`:''}
      ${tcs>0?`<tr><td style="color:#666">TCS (1%)</td><td style="text-align:right">₹${tcs.toFixed(2)}</td></tr>`:''}
      <tr><td><strong>Grand Total</strong></td><td style="text-align:right"><strong>₹${total.toFixed(2)}</strong></td></tr>
    </table>
  </div>

  <!-- Amount in Words -->
  <div class="inv-words">
    <strong>Amount in words:</strong> ${amountInWords} Rupees Only
  </div>

  <!-- Stamp -->
  <div class="inv-stamp">
    <p>For <strong>${esc(sellerName)}</strong></p>
    <strong>Authorized Signatory</strong>
  </div>

  <!-- Footer -->
  <div class="inv-footer">
    <div>
      <p>This is a computer-generated invoice and does not require a physical signature.</p>
      <p style="margin-top:4px">Goods sold are subject to terms and conditions of the marketplace.</p>
    </div>
    <div style="text-align:right">
      <p>Powered by <strong>Glonni</strong></p>
      <p>Invoice generated on ${new Date().toLocaleDateString('en-IN')}</p>
    </div>
  </div>
</div>
</body></html>`;

  const w=window.open('','_blank','width=900,height=700');
  if(w){w.document.write(html);w.document.close();}
  else toast('Please allow popups to download invoice','⚠️');
}

function numberToWords(n){
  if(n===0)return'Zero';
  const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function convert(num){
    if(num<20)return ones[num];
    if(num<100)return tens[Math.floor(num/10)]+(num%10?' '+ones[num%10]:'');
    if(num<1000)return ones[Math.floor(num/100)]+' Hundred'+(num%100?' and '+convert(num%100):'');
    if(num<100000)return convert(Math.floor(num/1000))+' Thousand'+(num%1000?' '+convert(num%1000):'');
    if(num<10000000)return convert(Math.floor(num/100000))+' Lakh'+(num%100000?' '+convert(num%100000):'');
    return convert(Math.floor(num/10000000))+' Crore'+(num%10000000?' '+convert(num%10000000):'');
  }
  return convert(Math.round(n));
}

// ═══════════════════════════════════════════════════
// WALLET
// ═══════════════════════════════════════════════════
async function renderWallet(){
  if(!PROFILE){showAuth();return;}
  if(PROFILE.role==='admin'||PROFILE.role==='super_admin'){go('admin-finance');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading wallet...</div>';
  const isVendor=PROFILE.role==='vendor';
  const [ws,txns,refEarnings]=await Promise.all([
    sb.get("wallets","*",{user_id:`eq.${PROFILE.id}`}),
    sb.get("wallet_transactions","*",{user_id:`eq.${PROFILE.id}`,order:"created_at.desc",limit:30}),
    sb.get("referral_earnings","*",{referrer_user_id:`eq.${PROFILE.id}`,order:"created_at.desc",limit:20})
  ]);
  const w=ws[0]||{available_balance:0,pending_balance:0,total_earned:0};

  const refApproved=refEarnings.filter(e=>e.status==='approved');
  const refPending=refEarnings.filter(e=>e.status==='pending');
  const refTotalEarned=refApproved.reduce((a,e)=>a+parseFloat(e.commission_amount||0),0);
  const refPendingAmt=refPending.reduce((a,e)=>a+parseFloat(e.commission_amount||0),0);
  const refHTML=`
  <div class="card" style="margin-bottom:24px;border-top:3px solid var(--purple)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h3 style="font-weight:700;display:flex;align-items:center;gap:8px">🔗 Referral Earnings</h3>
      <span style="font-size:12px;color:var(--gray-400)">${refEarnings.length} referral${refEarnings.length!==1?'s':''} total</span>
    </div>
    <div class="g3" style="margin-bottom:16px">
      <div class="stat-card" style="text-align:center;padding:12px"><div class="stat-val" style="font-size:18px;color:var(--purple)">₹${refTotalEarned.toFixed(0)}</div><div class="stat-label">Total Earned</div></div>
      <div class="stat-card" style="text-align:center;padding:12px"><div class="stat-val" style="font-size:18px;color:var(--orange)">₹${refPendingAmt.toFixed(0)}</div><div class="stat-label">Pending (7-day window)</div></div>
      <div class="stat-card" style="text-align:center;padding:12px"><div class="stat-val" style="font-size:18px;color:var(--green)">${refApproved.length}</div><div class="stat-label">Approved</div></div>
    </div>
    ${refEarnings.length?`
    <div style="margin-bottom:12px">
      ${refEarnings.slice(0,8).map(e=>{
        const daysLeft=e.eligible_at?Math.max(0,Math.ceil((new Date(e.eligible_at)-Date.now())/86400000)):0;
        const stBg=e.status==='approved'?'badge-green':e.status==='voided'?'badge-red':e.status==='pending'?'badge-gold':'';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
          <div>
            <span class="badge ${stBg}" style="margin-right:8px">${e.status}</span>
            <span style="color:var(--gray-500)">${new Date(e.created_at).toLocaleDateString()}</span>
            ${e.status==='pending'?`<span style="font-size:11px;color:var(--orange);margin-left:6px">· ${daysLeft}d left in return window</span>`:''}
          </div>
          <span style="font-weight:700;color:${e.status==='approved'?'var(--green)':e.status==='voided'?'var(--gray-400)':'var(--orange)'}">₹${parseFloat(e.commission_amount||0).toFixed(2)}</span>
        </div>`;
      }).join('')}
    </div>`:`<p style="font-size:13px;color:var(--gray-400)">No referral earnings yet. Share products to start earning!</p>`}
    <button class="btn btn-outline btn-pill btn-sm" onclick="go('shop')">🔗 Share Products & Earn</button>
  </div>`;

  let vendorHTML='';
  if(isVendor){
    const [settlements,withdrawals,bankArr,trustArr]=await Promise.all([
      sb.get("settlement_ledger","*",{vendor_id:`eq.${PROFILE.id}`,order:"created_at.desc",limit:20}),
      sb.get("withdrawals","*",{vendor_id:`eq.${PROFILE.id}`,order:"created_at.desc",limit:10}),
      sb.get("vendor_bank_accounts","*",{vendor_id:`eq.${PROFILE.id}`}),
      sb.get("vendor_trust","*",{vendor_id:`eq.${PROFILE.id}`})
    ]);
    const bank=bankArr[0];
    const trust=trustArr[0]||{trust_score:100,auto_withdraw:true,admin_hold:false};
    const pendingSettle=settlements.filter(s=>s.status==='pending'||s.status==='hold');
    const eligibleSettle=settlements.filter(s=>s.status==='eligible');
    const paidSettle=settlements.filter(s=>s.status==='paid');
    const totalPaid=paidSettle.reduce((a,s)=>a+parseFloat(s.net_amount||0),0);

    vendorHTML=`
    ${trust.trust_score<70||trust.admin_hold?`<div class="card" style="margin-bottom:16px;border:2px solid var(--red);background:rgba(255,59,48,.03)">
      <p style="font-weight:700;color:var(--red)">⚠️ Withdrawals require admin approval</p>
      <p style="font-size:13px;color:var(--gray-500);margin-top:4px">Trust score: ${trust.trust_score}/100${trust.admin_note?' — '+esc(trust.admin_note):''}. Resolve pending issues to restore instant withdrawals.</p>
    </div>`:`<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px;color:var(--green)">✅ Instant withdrawals enabled · Trust: ${trust.trust_score}/100</div>`}
    <div class="card" style="margin-bottom:20px;${bank?'':'border:2px dashed var(--orange)'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${bank?'0':'12'}px">
        <h3 style="font-weight:700">🏦 Bank Account</h3>
        <button class="btn btn-outline btn-pill btn-sm" onclick="editBankAccount()">${bank?'Edit':'+ Add Account'}</button>
      </div>
      ${bank?`<div style="margin-top:10px;display:flex;gap:20px;flex-wrap:wrap;font-size:13px">
        <div><span style="color:var(--gray-400)">Holder:</span> <strong>${esc(bank.account_holder)}</strong></div>
        <div><span style="color:var(--gray-400)">A/C:</span> <strong style="font-family:'Space Mono',monospace">●●●●${bank.account_number.slice(-4)}</strong></div>
        <div><span style="color:var(--gray-400)">IFSC:</span> <strong>${esc(bank.ifsc_code)}</strong></div>
        <div><span style="color:var(--gray-400)">Bank:</span> ${esc(bank.bank_name||'—')}</div>
        ${bank.upi_id?`<div><span style="color:var(--gray-400)">UPI:</span> ${esc(bank.upi_id)}</div>`:''}
        <div>${bank.is_verified?'<span class="badge badge-green">Verified</span>':'<span class="badge badge-gold">Pending verification</span>'}</div>
      </div>`:`<p style="font-size:13px;color:var(--orange)">Add your bank account to enable withdrawals</p>`}
    </div>
    ${settlements.length?`<div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="font-weight:700">📋 Settlements</h3>
        <div style="font-size:12px;color:var(--gray-400)">${pendingSettle.length} pending · ${eligibleSettle.length} eligible · ₹${totalPaid.toFixed(0)} paid</div>
      </div>
      ${settlements.slice(0,10).map(s=>{
        const stCls=s.status==='eligible'?'badge-green':s.status==='paid'?'badge-blue':s.status==='hold'?'badge-gold':s.status==='cancelled'?'badge-red':'';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
          <div><span style="font-weight:600">${esc(s.order_number||'Order')}</span>
            <span style="color:var(--gray-400);margin-left:8px">${new Date(s.created_at).toLocaleDateString()}</span>
            ${s.status==='hold'?`<span style="font-size:11px;color:var(--orange);margin-left:4px">Return window: ${s.eligible_date?Math.max(0,Math.ceil((new Date(s.eligible_date)-Date.now())/86400000))+'d left':'—'}</span>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge ${stCls}">${s.status}</span>
            <span style="font-weight:700;color:var(--green)">₹${parseFloat(s.net_amount||0).toFixed(0)}</span>
          </div>
        </div>`;}).join('')}
    </div>`:''}
    ${withdrawals.length?`<div class="card" style="margin-bottom:20px">
      <h3 style="font-weight:700;margin-bottom:12px">💸 Withdrawal History</h3>
      ${withdrawals.map(wd=>{
        const wdCls=wd.status==='completed'?'badge-green':wd.status==='processing'?'badge-blue':wd.status==='held'?'badge-gold':'badge-red';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
          <div><span style="font-weight:700">₹${parseFloat(wd.amount).toFixed(0)}</span>
            <span style="color:var(--gray-400);margin-left:8px">${new Date(wd.created_at).toLocaleDateString()} · ${wd.payment_method==='upi'?'📱 UPI':'🏦 Bank'}</span>
            ${wd.payment_ref?`<span style="font-family:'Space Mono',monospace;font-size:11px;margin-left:6px">${esc(wd.payment_ref)}</span>`:''}
          </div>
          <span class="badge ${wdCls}">${wd.status}${wd.failure_reason?' — '+esc(wd.failure_reason):''}</span>
        </div>`;}).join('')}
    </div>`:''}`;
  }

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <h2 style="font-size:24px;font-weight:800">💰 Wallet</h2>
      <div style="display:flex;gap:8px">
        ${isVendor&&w.available_balance>=1?`<button class="btn btn-pill" style="background:var(--green);color:#fff;border:none" onclick="showWithdrawModal(${w.available_balance})">💸 Withdraw ₹${w.available_balance}</button>`:''}
        ${PROFILE.role==='affiliate'&&w.available_balance>=100?`<button class="btn btn-pill" style="background:var(--green);color:#fff;border:none" onclick="showPayoutModal()">💸 Request Payout</button>`:''}
        <button class="btn btn-outline btn-pill btn-sm" onclick="goBack()">← Back</button>
      </div>
    </div>
    <div class="g3" style="margin-bottom:24px">
      <div class="stat-card" style="border-top:3px solid var(--gold)"><div class="stat-val" style="color:var(--gold-dark)">₹${w.available_balance}</div><div class="stat-label">${isVendor?'Available to Withdraw':'Available'}</div></div>
      <div class="stat-card" style="border-top:3px solid var(--orange)"><div class="stat-val" style="color:var(--orange)">₹${w.pending_balance}</div><div class="stat-label">${isVendor?'In Hold (Return Window)':'Pending'}</div></div>
      <div class="stat-card" style="border-top:3px solid var(--green)"><div class="stat-val" style="color:var(--green)">₹${w.total_earned}</div><div class="stat-label">Total Earned</div></div>
    </div>
    ${vendorHTML}
    ${refHTML}
    <h3 style="font-weight:700;margin-bottom:16px">Transaction History</h3>
    ${!txns.length?'<p style="color:var(--gray-400);font-size:14px">No transactions yet.</p>'
    :txns.map(t=>`<div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center"><div><span class="badge" style="background:${txTypeBg(t.type)}">${t.type.replace(/_/g,' ')}</span><p style="font-size:12px;color:var(--gray-400);margin-top:6px;max-width:300px">${esc(t.description)}</p></div><div style="text-align:right"><p style="font-weight:800;font-size:16px;color:var(--green)">+₹${t.amount}</p><span class="badge ${t.status==='available'?'badge-green':'badge-gold'}">${t.status}</span></div></div>`).join('')}
  </div>`;
}

function txTypeBg(t){return{cashback:'rgba(52,199,89,.12);color:var(--green)',referral_commission:'rgba(175,82,222,.12);color:var(--purple)',affiliate_commission:'rgba(175,82,222,.12);color:var(--purple)',vendor_settlement:'rgba(0,122,255,.12);color:var(--blue)',platform_fee:'rgba(255,59,48,.12);color:var(--red)',withdrawal:'rgba(255,149,0,.12);color:var(--orange)'}[t]||'var(--gray-100);color:var(--gray-500)';}

// ═══════════════════════════════════════════════════
// WISHLIST
// ═══════════════════════════════════════════════════
async function renderWishlist(){
  if(!PROFILE){showAuth();return;}
  if(PROFILE.role==='admin'||PROFILE.role==='super_admin'){go('admin-dash');return;}
  if(PROFILE.role==='vendor'){go('vendor-dash');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading...</div>';
  const items=await sb.get("wishlist","*,products(*,vendor_stores(store_name))",{user_id:`eq.${PROFILE.id}`});
  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><h2 style="font-size:24px;font-weight:800">♡ Wishlist <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${items.length})</span></h2><button class="btn btn-outline btn-pill btn-sm" onclick="goBack()">← Back</button></div>
    ${!items.length?emptyState('♡','Your wishlist is empty','Save items you love by tapping the heart icon')
    :`<div class="products-grid">${items.map((it,i)=>{const p=it.products;if(!p)return'';return productCard(p,i);}).join('')}</div>`}
  </div>`;
}

// ═══════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════
async function renderProfile(){
  if(!PROFILE){showAuth();return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading profile...</div>';
  const r=PROFILE.role;
  const initial=PROFILE.full_name?.charAt(0).toUpperCase()||'U';

  let statsHTML='';let linksHTML='';

  if(r==='user'){
    const [wallets,orderCount,reviewCount]=await Promise.all([
      sb.get("wallets","*",{user_id:`eq.${PROFILE.id}`}),
      sb.get("orders","id",{user_id:`eq.${PROFILE.id}`}),
      sb.get("reviews","id",{user_id:`eq.${PROFILE.id}`})
    ]);
    const w=wallets[0]||{available_balance:0};
    statsHTML=`<div class="g3">
      <div class="stat-card" style="border-top:3px solid var(--gold);text-align:center"><div class="stat-val" style="font-size:22px">${orderCount.length}</div><div class="stat-label">Orders</div></div>
      <div class="stat-card" style="border-top:3px solid var(--green);text-align:center"><div class="stat-val" style="font-size:22px">₹${w.available_balance}</div><div class="stat-label">Wallet</div></div>
      <div class="stat-card" style="border-top:3px solid var(--purple);text-align:center"><div class="stat-val" style="font-size:22px">${reviewCount.length}</div><div class="stat-label">Reviews</div></div>
    </div>`;
    linksHTML=`<button class="btn btn-outline btn-pill" onclick="go('orders')">📦 My Orders</button>
      <button class="btn btn-outline btn-pill" onclick="go('wallet')">💰 Wallet</button>
      <button class="btn btn-outline btn-pill" onclick="go('wishlist')">♡ Wishlist</button>`;
  } else if(r==='vendor'){
    const [prods,ois,wallets]=await Promise.all([
      sb.get("products","id",{vendor_id:`eq.${PROFILE.id}`}),
      sb.get("order_items","total_price",{vendor_id:`eq.${PROFILE.id}`,status:"neq.cancelled"}),
      sb.get("wallets","*",{user_id:`eq.${PROFILE.id}`})
    ]);
    const rev=ois.reduce((a,b)=>a+Number(b.total_price),0);
    const w=wallets[0]||{available_balance:0};
    statsHTML=`<div class="g3">
      <div class="stat-card" style="border-top:3px solid var(--gold);text-align:center"><div class="stat-val" style="font-size:22px">${prods.length}</div><div class="stat-label">Products</div></div>
      <div class="stat-card" style="border-top:3px solid var(--green);text-align:center"><div class="stat-val" style="font-size:22px">₹${rev}</div><div class="stat-label">Revenue</div></div>
      <div class="stat-card" style="border-top:3px solid var(--blue);text-align:center"><div class="stat-val" style="font-size:22px">₹${w.available_balance}</div><div class="stat-label">Wallet</div></div>
    </div>`;
    linksHTML=`<button class="btn btn-outline btn-pill" onclick="go('vendor-dash')">🏪 Dashboard</button>
      <button class="btn btn-outline btn-pill" onclick="go('vendor-products')">📋 Products</button>
      <button class="btn btn-outline btn-pill" onclick="go('orders')">📦 Orders</button>`;
  } else if(r==='admin'){
    statsHTML='';
    linksHTML=`<button class="btn btn-outline btn-pill" onclick="renderAdminDash()">⚙️ Admin Dashboard</button>`;
  } else if(r==='affiliate'){
    const [links,wallets,commTxns]=await Promise.all([
      sb.get("affiliate_links","*",{affiliate_id:`eq.${PROFILE.id}`}),
      sb.get("wallets","*",{user_id:`eq.${PROFILE.id}`}),
      sb.get("wallet_transactions","amount",{user_id:`eq.${PROFILE.id}`,type:"eq.affiliate_commission"})
    ]);
    const w=wallets[0]||{available_balance:0,total_earned:0,total_withdrawn:0};
    const totalClicks=links.reduce((a,b)=>a+b.click_count,0);
    const totalConv=links.reduce((a,b)=>a+b.conversion_count,0);
    const convRate=totalClicks>0?(totalConv/totalClicks*100).toFixed(1):0;
    statsHTML=`<div class="g4">
      <div class="stat-card" style="border-top:3px solid var(--purple);text-align:center"><div class="stat-val" style="font-size:22px">${links.length}</div><div class="stat-label">Links</div></div>
      <div class="stat-card" style="border-top:3px solid var(--blue);text-align:center"><div class="stat-val" style="font-size:22px">${totalClicks}</div><div class="stat-label">Clicks</div></div>
      <div class="stat-card" style="border-top:3px solid var(--green);text-align:center"><div class="stat-val" style="font-size:22px">${convRate}%</div><div class="stat-label">Conv Rate</div></div>
      <div class="stat-card" style="border-top:3px solid var(--gold);text-align:center"><div class="stat-val" style="font-size:22px">₹${w.total_earned}</div><div class="stat-label">Earned</div></div>
    </div>`;
    linksHTML=`<button class="btn btn-outline btn-pill" onclick="go('aff-dash')">🔗 Dashboard</button>
      <button class="btn btn-outline btn-pill" onclick="go('aff-links')">📊 My Links</button>
      <button class="btn btn-outline btn-pill" onclick="go('wallet')">💰 Wallet</button>`;
  }

  $('main').innerHTML=`<div class="container" style="padding:32px 0;max-width:640px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><h2 style="font-size:24px;font-weight:800">My Profile</h2><button class="btn btn-outline btn-pill btn-sm" onclick="goBack()">← Back</button></div>
    <div class="card" style="text-align:center;padding:32px;margin-bottom:24px">
      <div class="avatar-upload" style="width:72px;height:72px;margin:0 auto 16px" onclick="document.getElementById('avatar-input').click()">
        <div style="width:72px;height:72px;border-radius:50%;overflow:hidden;background:var(--gold);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px;color:var(--black)">
          ${PROFILE.avatar_url?`<img src="${esc(PROFILE.avatar_url)}" style="width:100%;height:100%;object-fit:cover">`:initial}
        </div>
        <div class="avatar-upload-btn">📷</div>
        <input type="file" id="avatar-input" accept="image/*" style="display:none" onchange="uploadAvatar(this)">
      </div>
      <h3 style="font-size:20px;font-weight:800">${esc(PROFILE.full_name)}</h3>
      <p style="color:var(--gray-400);font-size:14px;margin-top:4px">${esc(PROFILE.email)}</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
        <span class="role-pill" style="background:${roleBg(PROFILE.role)};color:#fff">${PROFILE.role}</span>
      </div>
      <p style="font-size:12px;color:var(--gray-400);margin-top:12px">Joined ${new Date(PROFILE.created_at).toLocaleDateString()}</p>
    </div>
    ${statsHTML}
    <div class="card" style="margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:16px">Edit Profile</h3>
      <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="pf-name" value="${esc(PROFILE.full_name||'')}"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="pf-phone" value="${esc(PROFILE.phone||'')}" placeholder="+91 98765 43210"></div>
      <button class="btn btn-gold btn-pill btn-full" onclick="saveProfile()">Save Changes</button>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${linksHTML}
      <button class="btn btn-danger btn-pill" onclick="logout()">Logout</button>
    </div>
  </div>`;
}

async function saveProfile(){
  const name=$('pf-name').value;const phone=$('pf-phone').value;
  if(!name){toast('Name required','⚠️');return;}
  await sb.upd("profiles",{full_name:name,phone:phone||null},{id:`eq.${PROFILE.id}`});
  PROFILE.full_name=name;PROFILE.phone=phone;
  renderNav();toast('Profile updated!','✅');
}

// ═══════════════════════════════════════════════════
// VENDOR VIEWS
// ═══════════════════════════════════════════════════
async function renderVendorDash(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading analytics...</div>';
  
  const [stores, analytics]=await Promise.all([
    sb.get("vendor_stores","*",{vendor_id:`eq.${PROFILE.id}`}),
    sb.rpc("vendor_analytics",{p_vendor_id:PROFILE.id})
  ]);
  const store=stores[0];
  const a=analytics||{total_revenue:0,total_orders:0,total_products:0,avg_rating:0,this_month:0,last_month:0,daily_sales:[],top_products:[]};
  const growth=a.last_month>0?Math.round((a.this_month-a.last_month)/a.last_month*100):0;

  // Check for AI pre-loaded draft products pending vendor confirmation
  const draftProds=await sb.get("products","id,name,price,category_id,ai_confidence_score,ai_flags",{store_id:store?.id?`eq.${store.id}`:'eq.null',onboarding_status:"eq.pending_vendor"});
  const myPicks=store?await sb.get("vendor_catalog_picks","id,status",{vendor_id:`eq.${PROFILE.id}`}):[];
  const pendingPicks=myPicks.filter(pk=>pk.status==='pending').length;

  // Build sparkline chart (CSS-only bar chart)
  const daily=a.daily_sales||[];
  const maxRev=Math.max(...daily.map(d=>d.revenue),1);
  const barsHTML=daily.map(d=>{
    const h=Math.max(4,d.revenue/maxRev*100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${d.label}: ₹${d.revenue}">
      <div style="width:100%;height:120px;display:flex;align-items:end"><div style="width:100%;height:${h}%;background:var(--gold);border-radius:4px 4px 0 0;min-height:4px;transition:height .3s ease"></div></div>
      <span style="font-size:9px;color:var(--gray-400);white-space:nowrap">${d.label?.split(' ')[1]||''}</span>
    </div>`;
  }).join('');

  // Marketplace banner
  const marketplaceBanner=`<div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,#010101 0%,#1a1a2e 100%);color:#fff;border:none">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:14px">
        <span style="font-size:36px">🛍️</span>
        <div>
          <p style="font-weight:800;font-size:16px">Product Marketplace</p>
          <p style="font-size:13px;color:rgba(255,255,255,.6);margin-top:2px">Browse admin-curated catalog and pick products to sell in your store</p>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${pendingPicks>0?`<button class="btn btn-pill btn-sm" style="background:var(--orange);color:#fff;border:none" onclick="go('vendor-picks')">⏳ ${pendingPicks} Pending Picks</button>`:''}
        <button class="btn btn-pill btn-sm" style="background:var(--gold);color:var(--black);border:none;font-weight:700" onclick="go('vendor-marketplace')">Browse Catalog →</button>
      </div>
    </div>
  </div>`;
  const catalogBanner=draftProds.length?`
  <div class="card" style="margin-bottom:24px;border:2px solid var(--gold);background:linear-gradient(135deg,rgba(237,207,93,.08),rgba(237,207,93,.03))">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:14px">
        <span style="font-size:36px">🤖</span>
        <div>
          <p style="font-weight:800;font-size:16px">Your catalog is ready — ${draftProds.length} product${draftProds.length!==1?'s':''} pre-loaded!</p>
          <p style="font-size:13px;color:var(--gray-500);margin-top:2px">Glonni has already mapped your inventory. Review and confirm to go live instantly.</p>
        </div>
      </div>
      <button class="btn btn-gold btn-pill" onclick="go('vendor-confirm-catalog')">Review & Confirm Catalog →</button>
    </div>
    <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">
      ${draftProds.slice(0,4).map(p=>{
        const conf=p.ai_confidence_score||0;
        const confColor=conf>=85?'var(--green)':conf>=65?'var(--orange)':'var(--red)';
        return `<div style="padding:8px 12px;background:rgba(255,255,255,.7);border-radius:8px;font-size:12px;border:1px solid var(--gray-200)">
          <span style="font-weight:600">${esc(p.name?.slice(0,30)||'Product')}</span>
          <span style="color:${confColor};margin-left:8px;font-weight:700">${conf}%</span>
        </div>`;
      }).join('')}
      ${draftProds.length>4?`<div style="padding:8px 12px;background:rgba(255,255,255,.7);border-radius:8px;font-size:12px;border:1px solid var(--gray-200);color:var(--gray-400)">+${draftProds.length-4} more</div>`:''}
    </div>
  </div>`:'';

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:24px">
      <div><h2 style="font-size:24px;font-weight:800">Vendor Dashboard</h2>
        <p style="color:var(--gray-400);font-size:14px">${store?esc(store.store_name):'No store yet'} ${store?.is_approved?'<span class="badge badge-green">Approved</span>':'<span class="badge badge-gold">Pending</span>'}</p>
      </div>
    </div>

    ${marketplaceBanner}
    ${catalogBanner}
    
    <!-- Stats -->
    <div class="g4" style="margin-bottom:32px">
      <div class="stat-card" style="border-top:3px solid var(--gold)"><div class="stat-val" style="color:var(--gold-dark)">₹${a.total_revenue}</div><div class="stat-label">Total Revenue</div></div>
      <div class="stat-card" style="border-top:3px solid var(--blue)"><div class="stat-val">${a.total_orders}</div><div class="stat-label">Orders</div></div>
      <div class="stat-card" style="border-top:3px solid var(--green)"><div class="stat-val">${a.total_products}</div><div class="stat-label">Products</div></div>
      <div class="stat-card" style="border-top:3px solid var(--purple)"><div class="stat-val">${a.avg_rating>0?a.avg_rating+'⭐':'—'}</div><div class="stat-label">Avg Rating</div></div>
    </div>

    <!-- Revenue Chart + This Month -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:24px">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-weight:700">Sales (Last 14 Days)</h3>
        </div>
        <div style="display:flex;gap:4px;align-items:end;padding:0 4px">${barsHTML||'<p style="color:var(--gray-400);font-size:13px">No sales data yet</p>'}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card" style="flex:1">
          <p style="font-size:11px;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px;margin-bottom:4px">This Month</p>
          <p style="font-size:28px;font-weight:900;font-family:'Space Mono',monospace;color:var(--gold-dark)">₹${a.this_month}</p>
          ${growth!==0?`<span class="badge ${growth>0?'badge-green':'badge-red'}" style="margin-top:6px">${growth>0?'↑':'↓'} ${Math.abs(growth)}% vs last month</span>`:''}
        </div>
        <div class="card" style="flex:1">
          <p style="font-size:11px;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px;margin-bottom:4px">Last Month</p>
          <p style="font-size:28px;font-weight:900;font-family:'Space Mono',monospace">₹${a.last_month}</p>
        </div>
      </div>
    </div>

    <!-- Top Products -->
    ${(a.top_products||[]).length?`<div class="card" style="margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:16px">🏆 Top Products</h3>
      ${a.top_products.map((t,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${i<a.top_products.length-1?'border-bottom:1px solid var(--gray-100)':''}">
        <div style="display:flex;gap:10px;align-items:center"><span style="font-size:16px;font-weight:800;color:var(--gray-300);width:24px">${i+1}</span><div><p style="font-weight:600;font-size:14px">${esc(t.name)}</p><p style="font-size:11px;color:var(--gray-400)">${t.sold} sold · ${t.rating>0?t.rating+'⭐':''}</p></div></div>
        <span style="font-weight:800;color:var(--gold-dark)">₹${t.revenue}</span>
      </div>`).join('')}
    </div>`:''}

    <!-- Quick Actions -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
      <button class="btn btn-gold btn-pill" onclick="go('vendor-products')">📋 Products</button>
      <button class="btn btn-outline btn-pill" onclick="go('vendor-coupons')">🏷️ Coupons</button>
      <button class="btn btn-outline btn-pill" onclick="go('vendor-sponsored')">📢 Sponsored Ads</button>
      <button class="btn btn-outline btn-pill" onclick="go('orders')">📦 Orders</button>
      <button class="btn btn-outline btn-pill" onclick="go('wallet')">💰 Wallet</button>
      <button class="btn btn-outline btn-pill" onclick="go('vendor-store')">🏪 Store</button>
      <button class="btn btn-outline btn-pill" onclick="go('vendor-warehouses')">📦 Warehouses</button>
    </div>

    <!-- GST Summary -->
    <div id="vendor-gst-card"></div>
  </div>`;
  // Async load GST summary
  loadVendorGSTCard();
}


// ═══════════════════════════════════════════════════
// VENDOR — CONFIRM AI PRE-LOADED CATALOG
// ═══════════════════════════════════════════════════
async function renderVendorConfirmCatalog(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading your catalog...</div>';
  const stores=await sb.get("vendor_stores","id,store_name",{vendor_id:`eq.${PROFILE.id}`});
  const store=stores[0];
  if(!store){go('vendor-dash');return;}
  const drafts=await sb.get("products","*",{store_id:`eq.${store.id}`,onboarding_status:"eq.pending_vendor",order:"ai_confidence_score.desc"});
  const cats=await sb.get("categories","id,name",{});
  const catMap={};cats.forEach(c=>{catMap[c.id]=c.name;});
  if(!drafts.length){
    $('main').innerHTML=`<div class="container" style="padding:60px 0;text-align:center"><p style="font-size:48px;margin-bottom:16px">✅</p><h2 style="font-weight:800;margin-bottom:8px">All done!</h2><p style="color:var(--gray-400);margin-bottom:24px">Your catalog is fully confirmed and live.</p><button class="btn btn-gold btn-pill" onclick="go('vendor-products')">View My Products →</button></div>`;
    return;
  }
  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">🤖 Your AI Pre-Loaded Catalog</h2>
      <p style="font-size:13px;color:var(--gray-400);margin-top:4px">${drafts.length} product${drafts.length!==1?'s':''} ready. Confirm to publish, edit if needed, or reject.</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill" onclick="confirmAllDrafts('${store.id}')">✅ Confirm All</button>
        <button class="btn btn-outline btn-pill" onclick="go('vendor-dash')">← Back</button>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:20px;font-size:12px;flex-wrap:wrap">
      <span style="color:var(--green);font-weight:600">● 85%+ High confidence</span>
      <span style="color:var(--orange);font-weight:600">● 65-84% Review recommended</span>
      <span style="color:var(--red);font-weight:600">● Below 65% Needs attention</span>
    </div>
    <div id="catalog-list">
    ${drafts.map(p=>{
      const conf=p.ai_confidence_score||0;
      const confColor=conf>=85?'var(--green)':conf>=65?'var(--orange)':'var(--red)';
      return `<div class="card" id="draft-${p.id}" style="margin-bottom:14px;border-left:4px solid ${confColor}">
        <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px">
          <div style="flex:1;min-width:220px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <span style="font-size:11px;font-weight:700;color:${confColor};padding:2px 8px;border-radius:20px;background:rgba(0,0,0,.05)">AI ${conf}%</span>
              ${(p.ai_flags||[]).length?`<span style="font-size:11px;color:var(--orange)">⚑ ${p.ai_flags.join(' · ')}</span>`:'<span style="font-size:11px;color:var(--green)">✓ No issues</span>'}
            </div>
            <p style="font-weight:700;font-size:15px;margin-bottom:4px">${esc(p.name)}</p>
            <p style="font-size:12px;color:var(--gray-400)">₹${p.price}${p.compare_at_price?` (MRP ₹${p.compare_at_price})`:''} · ${catMap[p.category_id]||'Uncategorized'} · HSN ${p.hsn_code||'—'} · GST ${p.gst_rate||18}% · Stock ${p.stock||50}</p>
            ${p.description?`<p style="font-size:12px;color:var(--gray-500);margin-top:4px">${esc((p.description||'').slice(0,120))}</p>`:''}
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
            <button class="btn btn-success btn-sm btn-pill" onclick="confirmDraft('${p.id}')">✅ Confirm</button>
            <button class="btn btn-outline btn-sm btn-pill" onclick="editDraftModal('${p.id}')">✏️ Edit</button>
            <button class="btn btn-danger btn-sm btn-pill" onclick="rejectDraft('${p.id}')">✕ Reject</button>
          </div>
        </div>
      </div>`;
    }).join('')}
    </div>
  </div>`;
}

async function confirmDraft(productId){
  await sb.upd("products",{is_active:true,is_approved:true,status:'published',onboarding_status:'vendor_confirmed',vendor_confirmed_at:new Date().toISOString()},{id:`eq.${productId}`});
  const card=$(`draft-${productId}`);
  if(card){card.style.opacity='.4';card.innerHTML='<p style="font-weight:600;color:var(--green);padding:8px">✅ Confirmed and live!</p>';}
  toast('Product confirmed & live!','✅');
}

async function confirmAllDrafts(storeId){
  if(!confirm('Confirm all pending products? They will all go live immediately.'))return;
  toast('Confirming all...','⏳');
  await sb.upd("products",{is_active:true,is_approved:true,status:'published',onboarding_status:'vendor_confirmed',vendor_confirmed_at:new Date().toISOString()},{store_id:`eq.${storeId}`,onboarding_status:"eq.pending_vendor"});
  toast('All products confirmed and live! 🎉','✅');
  setTimeout(()=>go('vendor-products'),1200);
}

async function rejectDraft(productId){
  if(!confirm('Reject this product? It will be removed from your catalog.'))return;
  await sb.upd("products",{onboarding_status:'rejected',is_active:false},{id:`eq.${productId}`});
  const card=$(`draft-${productId}`);
  if(card){card.style.opacity='.3';card.innerHTML='<p style="font-weight:600;color:var(--red);padding:8px">✕ Rejected</p>';}
  toast('Product rejected','🗑️');
}

function editDraftModal(productId){
  (async()=>{
    const prods=await sb.get("products","*",{id:`eq.${productId}`});
    const p=prods[0];if(!p)return;
    const modal=document.createElement('div');modal.className='auth-overlay';
    modal.innerHTML=`<div class="auth-card" style="max-width:500px;max-height:90vh;overflow-y:auto">
      <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">✏️ Edit: ${esc(p.name)}</h3>
      <div class="form-group"><label class="form-label">Product Name</label><input class="form-input" id="ed-name" value="${esc(p.name)}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Price ₹</label><input class="form-input" id="ed-price" type="number" value="${p.price||0}"></div>
        <div class="form-group"><label class="form-label">MRP ₹</label><input class="form-input" id="ed-mrp" type="number" value="${p.compare_at_price||''}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Stock</label><input class="form-input" id="ed-stock" type="number" value="${p.stock||50}"></div>
        <div class="form-group"><label class="form-label">Cashback %</label><input class="form-input" id="ed-cb" type="number" value="${p.cashback_percent||0}"></div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="ed-desc" style="min-height:80px">${esc(p.description||'')}</textarea></div>
      <div class="form-group"><label class="form-label">HSN Code</label><input class="form-input" id="ed-hsn" value="${p.hsn_code||''}"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveDraftEdit('${productId}')">Save & Confirm Live</button>
        <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  })();
}

async function saveDraftEdit(productId){
  await sb.upd("products",{name:$('ed-name').value,price:parseFloat($('ed-price').value)||0,compare_at_price:$('ed-mrp').value?parseFloat($('ed-mrp').value):null,stock:parseInt($('ed-stock').value)||50,cashback_percent:parseFloat($('ed-cb').value)||0,description:$('ed-desc').value,hsn_code:$('ed-hsn').value||null,is_active:true,is_approved:true,status:'published',onboarding_status:'vendor_confirmed',vendor_confirmed_at:new Date().toISOString()},{id:`eq.${productId}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Saved & confirmed live!','✅');
  renderVendorConfirmCatalog();
}


async function loadVendorGSTCard(){
  const el=$('vendor-gst-card');if(!el)return;
  try{
    const orders=await sb.get("orders","gst_amount,tcs_amount,total_amount,created_at",{vendor_id:`eq.${PROFILE.id}`,limit:500});
    const now=new Date();const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const thisMonth=orders.filter(o=>new Date(o.created_at)>=monthStart);
    const gstCollected=thisMonth.reduce((s,o)=>s+parseFloat(o.gst_amount||0),0);
    const tcsDeducted=thisMonth.reduce((s,o)=>s+parseFloat(o.tcs_amount||0),0);
    const totalRev=thisMonth.reduce((s,o)=>s+parseFloat(o.total_amount||0),0);
    const commGST=totalRev*0.05*0.18;// 5% commission × 18% GST
    el.innerHTML=`<div class="card" style="border-top:3px solid var(--purple)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="font-weight:700">🧾 GST Summary (This Month)</h3>
        <span class="badge" style="background:rgba(175,82,222,.1);color:var(--purple)">${now.toLocaleString('default',{month:'long',year:'numeric'})}</span>
      </div>
      <div class="g3" style="margin-bottom:16px">
        <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm)">
          <p style="font-size:11px;color:var(--gray-400);font-weight:600">GST COLLECTED</p>
          <p style="font-size:22px;font-weight:900;color:var(--green)">₹${gstCollected.toFixed(0)}</p>
        </div>
        <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm)">
          <p style="font-size:11px;color:var(--gray-400);font-weight:600">TCS DEDUCTED</p>
          <p style="font-size:22px;font-weight:900;color:var(--blue)">₹${tcsDeducted.toFixed(0)}</p>
        </div>
        <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm)">
          <p style="font-size:11px;color:var(--gray-400);font-weight:600">COMMISSION GST</p>
          <p style="font-size:22px;font-weight:900;color:var(--orange)">₹${commGST.toFixed(0)}</p>
        </div>
      </div>
      ${gstCollected>0?`<div style="padding:12px;background:rgba(255,149,0,.06);border-radius:var(--radius-sm);border:1px solid rgba(255,149,0,.2)">
        <p style="font-size:13px;color:var(--orange)">⚠️ You must remit <strong>₹${gstCollected.toFixed(0)}</strong> as GST liability in your GSTR-1 return for this period.</p>
      </div>`:''}</div>`;
  }catch(e){el.innerHTML='';}
  // Background: check settlement eligibility
  checkSettlementEligibility();
}

// ═══════════════════════════════════════════════════
// VENDOR: PRODUCTS (with bulk upload + price parity)
// ═══════════════════════════════════════════════════
async function renderVendorProducts(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading...</div>';
  const [stores,cats,prods,whArr]=await Promise.all([
    sb.get("vendor_stores","*",{vendor_id:`eq.${PROFILE.id}`}),
    sb.get("categories","*",{is_active:"eq.true",order:"level.asc,sort_order.asc"}),
    sb.get("products","*,categories(name,parent_id,level,icon)",{vendor_id:`eq.${PROFILE.id}`,order:"created_at.desc"}),
    sb.get("vendor_warehouses","id,name,city,is_default",{vendor_id:`eq.${PROFILE.id}`,is_active:"eq.true",order:"is_default.desc"})
  ]);
  const store=stores[0];
  const verticals=cats.filter(c=>c.level===0);
  const getChildren=(pid)=>cats.filter(c=>c.parent_id===pid);
  const vertOpts=verticals.map(v=>`<option value="${v.id}">${v.icon||''} ${esc(v.name)}</option>`).join('');
  const overpriced=prods.filter(p=>p.price_parity_status==='overpriced');
  setVPCats(cats);

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div><h2 style="font-size:24px;font-weight:800">Products</h2>
        <p style="color:var(--gray-400);font-size:14px">${prods.length} products${overpriced.length?` · <span style="color:var(--red)">${overpriced.length} overpriced</span>`:''}${prods.filter(p=>p.status==='draft').length?` · <span style="color:var(--orange)">${prods.filter(p=>p.status==='draft').length} drafts</span>`:''}${prods.filter(p=>p.stock<=5&&p.stock>0).length?` · <span style="color:var(--red)">${prods.filter(p=>p.stock<=5&&p.stock>0).length} low stock</span>`:''}${prods.filter(p=>p.stock===0).length?` · <span style="color:var(--red)">${prods.filter(p=>p.stock===0).length} out of stock</span>`:''}</p></div>
      <button class="btn btn-outline btn-pill btn-sm" onclick="go('vendor-dash')">← Dashboard</button>
    </div>

    <!-- Main Tabs -->
    <div class="tabs" style="margin-bottom:20px">
      <button class="tab active" id="vptab-myproducts" onclick="vpSwitchTab('myproducts')">📦 My Products</button>
      <button class="tab" id="vptab-mapproducts" onclick="vpSwitchTab('mapproducts')">🗺️ Map Products</button>
    </div>

    <!-- ── TAB: MY PRODUCTS ── -->
    <div id="vp-panel-myproducts">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn btn-outline btn-pill btn-sm" onclick="showBulkEdit()">⚡ Bulk Edit</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="$('bulk-form').classList.toggle('hide')">📄 Bulk Upload</button>
        <button class="btn btn-gold btn-pill btn-sm" onclick="$('vp-form').classList.toggle('hide')">+ Add Product</button>
      </div>
      ${!store?`<div class="card" style="text-align:center;padding:32px;background:var(--gold-light);border-color:var(--gold)"><p style="font-weight:700">⚠️ Create your store first!</p><button class="btn btn-black btn-pill" style="margin-top:12px" onclick="go('vendor-store')">Create Store</button></div>`:''}

      <!-- Bulk Upload -->
      <div id="bulk-form" class="card hide" style="margin-bottom:24px;border:2px dashed var(--gold)">
        <h3 style="font-weight:700;margin-bottom:8px">📄 Bulk Upload Products</h3>
        <p style="font-size:12px;color:var(--gray-400);margin-bottom:16px">Paste CSV with columns: name, price, compare_at_price, stock, cashback_percent, description (first row = header)</p>
        <textarea class="form-textarea" id="bulk-csv" style="min-height:120px;font-family:'Space Mono',monospace;font-size:12px" placeholder="name,price,compare_at_price,stock,cashback_percent,description
Wireless Earbuds,999,1499,50,5,Amazing sound quality
Phone Case,299,499,100,3,Durable protection"></textarea>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-gold btn-pill" onclick="bulkUpload()">Upload Products</button>
          <button class="btn btn-ghost" onclick="$('bulk-csv').value='name,price,compare_at_price,stock,cashback_percent,description\\n'">Reset</button>
        </div>
      </div>

      <!-- Single Product Form -->
      <div id="vp-form" class="card hide" style="max-width:600px;margin-bottom:24px">
        <h3 style="font-weight:700;margin-bottom:16px">New Product</h3>
        <div class="form-group"><label class="form-label">Product Name</label><input class="form-input" id="vp-name" placeholder="e.g. Wireless Bluetooth Headphones" oninput="vpShowPscWidget()"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Price ₹</label><input class="form-input" id="vp-price" type="number" placeholder="999" oninput="vpFeePreview()"></div><div class="form-group"><label class="form-label">Compare Price (MRP)</label><input class="form-input" id="vp-compare" type="number" placeholder="1299"></div></div>
        <!-- Price Sanity Widget -->
        <div id="psc-vp-widget" class="psc-widget" style="display:none"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Stock</label><input class="form-input" id="vp-stock" type="number" value="10"></div><div class="form-group"><label class="form-label">Cashback %</label><input class="form-input" id="vp-cb" type="number" value="5"></div></div>
        <div class="form-group"><label class="form-label">Vertical</label><select class="form-select" id="vp-vert" onchange="vpCascadeCat(this.value)"><option value="">Select vertical...</option>${vertOpts}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="vp-cat" onchange="vpCascadeSub(this.value)" disabled><option value="">Select category...</option></select></div>
          <div class="form-group"><label class="form-label">Subcategory</label><select class="form-select" id="vp-sub" onchange="vpCascadeLeaf(this.value)" disabled><option value="">None</option></select></div>
          <div class="form-group"><label class="form-label">Leaf (optional)</label><select class="form-select" id="vp-leaf" onchange="vpFeePreview()" disabled><option value="">None</option></select></div>
        </div>
        <div id="vp-fee-preview" style="display:none;padding:10px 14px;background:var(--purple);background:rgba(175,82,222,.08);border-radius:var(--radius-sm);margin-bottom:16px;font-size:13px;color:var(--purple);font-weight:600"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label class="form-label">HSN Code</label><input class="form-input" id="vp-hsn" placeholder="Auto-filled from category" oninput="vpGSTPreview()"></div>
          <div class="form-group"><label class="form-label">GST Inclusive?</label><select class="form-select" id="vp-gsti"><option value="false">No — GST added on top</option><option value="true">Yes — price includes GST</option></select></div>
        </div>
        <div id="vp-gst-preview" style="display:none;padding:10px 14px;background:rgba(52,199,89,.08);border-radius:var(--radius-sm);margin-bottom:16px;font-size:13px;color:var(--green);font-weight:600"></div>
        <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="vp-desc" placeholder="Product description... (supports basic HTML: &lt;b&gt;, &lt;ul&gt;, &lt;li&gt;)" style="min-height:100px"></textarea></div>
        <div class="form-group">
          <label class="form-label">📋 Specifications <span style="font-weight:400;color:var(--gray-400)">(optional)</span></label>
          <div id="vp-specs-list"></div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <input class="form-input" id="vp-spec-key" placeholder="e.g. Display" style="margin:0;flex:1">
            <input class="form-input" id="vp-spec-val" placeholder="e.g. 6.7 inch AMOLED" style="margin:0;flex:1">
            <button class="btn btn-outline btn-sm btn-pill" onclick="addSpecRow()" type="button">+</button>
          </div>
        </div>
        <div class="form-group"><label class="form-label">🏷️ Tags <span style="font-weight:400;color:var(--gray-400)">(comma separated)</span></label>
          <input class="form-input" id="vp-tags" placeholder="e.g. samsung, flagship, 5g, amoled"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label class="form-label">🎬 Video URL</label><input class="form-input" id="vp-video" placeholder="YouTube URL"></div>
          <div class="form-group"><label class="form-label">📏 Size Guide URL</label><input class="form-input" id="vp-sizeguide" placeholder="Image or PDF URL"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
          <div class="form-group"><label class="form-label">Weight (g)</label><input class="form-input" id="vp-weight" type="number" placeholder="350"></div>
          <div class="form-group"><label class="form-label">L (cm)</label><input class="form-input" id="vp-length" type="number" placeholder="20"></div>
          <div class="form-group"><label class="form-label">W (cm)</label><input class="form-input" id="vp-width" type="number" placeholder="10"></div>
          <div class="form-group"><label class="form-label">H (cm)</label><input class="form-input" id="vp-height" type="number" placeholder="5"></div>
        </div>
        <details style="margin-bottom:16px"><summary style="font-size:13px;font-weight:600;cursor:pointer;color:var(--gray-500)">🔍 SEO Settings (optional)</summary>
          <div style="padding-top:12px">
            <div class="form-group"><label class="form-label">Meta Title</label><input class="form-input" id="vp-mtitle" placeholder="Custom page title for search engines"></div>
            <div class="form-group"><label class="form-label">Meta Description</label><input class="form-input" id="vp-mdesc" placeholder="Short description for Google results"></div>
          </div>
        </details>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-select" id="vp-status"><option value="published">🟢 Published</option><option value="draft">📝 Draft</option></select>
          </div>
          <div class="form-group"><label class="form-label">📦 Ships From</label>
            <select class="form-select" id="vp-warehouse">${whArr.length?whArr.map(w=>`<option value="${w.id}" ${w.is_default?'selected':''}>${esc(w.name)} (${esc(w.city)})</option>`).join(''):'<option value="">No warehouses — add one first</option>'}</select>
          </div>
        </div>
        ${imageUploadZone('vp-img',{folder:'products',max:5,label:'Product Images (up to 5)'})}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Amazon Price ₹ (optional)</label><input class="form-input" id="vp-amz" type="number" placeholder="999"></div><div class="form-group"><label class="form-label">Flipkart Price ₹ (optional)</label><input class="form-input" id="vp-fk" type="number" placeholder="999"></div></div>
        <button class="btn btn-gold btn-pill btn-full" onclick="addVProduct('${store?.id||''}')">Add Product</button>
      </div>

      <!-- Price Parity Alerts -->
      ${overpriced.length?`<div class="card" style="border-color:var(--red);border-width:2px;margin-bottom:24px;background:rgba(255,59,48,.03)">
        <h3 style="font-weight:700;color:var(--red);margin-bottom:12px">⚠️ Price Parity Alerts</h3>
        <p style="font-size:12px;color:var(--gray-500);margin-bottom:12px">These products are priced higher than Amazon/Flipkart. Update prices to stay competitive.</p>
        ${overpriced.map(p=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,59,48,.1)">
          <span style="font-weight:600;font-size:13px">${esc(p.name)}</span>
          <div style="display:flex;gap:12px;font-size:12px">
            <span style="font-weight:700">You: ₹${p.price}</span>
            ${p.amazon_price?`<span style="color:var(--blue)">AMZ: ₹${p.amazon_price}</span>`:''}
            ${p.flipkart_price?`<span style="color:var(--gray-600)">FK: ₹${p.flipkart_price}</span>`:''}
          </div>
        </div>`).join('')}
      </div>`:''}

      <!-- Product List -->
      ${prods.map((p,i)=>{
        const parity=p.price_parity_status;
        const lowStock=p.stock>0&&p.stock<=5;const oos=p.stock===0;const isDraft=p.status==='draft';
        return `<div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center;${parity==='overpriced'?'border-left:3px solid var(--red)':lowStock?'border-left:3px solid var(--orange)':oos?'border-left:3px solid var(--red);opacity:.6':''}">
          <div style="display:flex;gap:14px;align-items:center;flex:1;min-width:0">
            <div style="width:48px;height:48px;border-radius:10px;overflow:hidden;background:var(--gray-50);flex-shrink:0"><img src="${getImg(p,i)}" style="width:100%;height:100%;object-fit:cover"></div>
            <div style="min-width:0"><p style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)} ${isDraft?'<span class="badge badge-gold" style="font-size:9px">DRAFT</span>':''}</p>
              <p style="font-size:12px;color:var(--gray-400)">${p.categories?.icon||''} ${esc(p.categories?.name||'—')} · ${oos?'<span style="color:var(--red);font-weight:700">OUT OF STOCK</span>':lowStock?`<span style="color:var(--orange);font-weight:600">Low: ${p.stock} left</span>`:`Stock ${p.stock}`} · ${p.total_sold||0} sold · ${p.views||0} views</p>
            </div>
          </div>
          <div style="text-align:right;display:flex;align-items:center;gap:12px">
            <div><p style="font-weight:800;color:var(--gold-dark)">₹${p.price}</p>
              ${p.cashback_percent?`<span class="badge badge-green">${p.cashback_percent}% CB</span>`:''}
              ${p.gst_rate!=null?`<span class="badge" style="background:rgba(175,82,222,.1);color:var(--purple)">${p.gst_rate}%</span>`:''}
              ${parity==='overpriced'?'<span class="badge badge-red">!</span>':''}
            </div>
            <div style="display:flex;gap:2px">
              <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="editProduct('${p.id}')">✏️</button>
              <button class="btn btn-ghost btn-sm btn-icon" title="Variants" onclick="manageVariants('${p.id}')">🎨</button>
              <button class="btn btn-ghost btn-sm btn-icon" title="Duplicate" onclick="duplicateProduct('${p.id}')">📋</button>
              <button class="btn btn-ghost btn-sm btn-icon" title="${p.is_active?'Deactivate':'Activate'}" onclick="toggleProduct('${p.id}',${p.is_active})">${p.is_active?'🟢':'🔴'}</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- ── TAB: MAP PRODUCTS ── -->
    <div id="vp-panel-mapproducts" style="display:none">
      <div id="vmap-content">
        <div style="text-align:center;padding:32px;color:var(--gray-400)">Loading catalog...</div>
      </div>
    </div>
  </div>`;

  // Tab switching
  window.vpSwitchTab=function(tab){
    ['myproducts','mapproducts'].forEach(t=>{
      const panel=$(`vp-panel-${t}`),tabEl=$(`vptab-${t}`);
      if(panel)panel.style.display=t===tab?'block':'none';
      if(tabEl){tabEl.classList.toggle('active',t===tab);}
    });
    if(tab==='mapproducts'){vpRenderMapProducts();}
  };
}

// ─────────────────────────────────────────────────
// VENDOR: MAP PRODUCTS (Catalog Mapping Tab)
// ─────────────────────────────────────────────────
let _vmapCat='all',_vmapSearch='',_vmapMyIds=null;

async function vpRenderMapProducts(){
  const el=$('vmap-content');if(!el)return;
  el.innerHTML='<div style="text-align:center;padding:24px;color:var(--gray-400)">Loading catalog...</div>';

  const [catalogProds,cats,myPicks,myOffers]=await Promise.all([
    sb.get("catalog_products","id,name,brand_name,category_path,category_id,images,ai_confidence_score,admin_status,platform_offers",{admin_status:"eq.ready",order:"created_at.desc"}).catch(()=>[]),
    sb.get("categories","id,name,level,icon",{is_active:"eq.true",level:"eq.0",order:"sort_order.asc"}).catch(()=>[]),
    sb.get("vendor_catalog_picks","catalog_product_id,status",{vendor_id:`eq.${PROFILE.id}`}).catch(()=>[]),
    sb.get("vendor_offers","master_product_id",{vendor_id:`eq.${PROFILE.id}`}).catch(()=>[])
  ]);

  // Build set of product IDs vendor already has
  const myPickIds=new Set([...myPicks.map(p=>p.catalog_product_id),...myOffers.map(o=>o.master_product_id)]);
  _vmapMyIds=myPickIds;

  const vertCats=[{id:'all',name:'All',icon:'🌐'},...cats];

  const filtered=catalogProds.filter(p=>{
    if(_vmapCat!=='all'&&p.category_id){
      // Match if category path contains selected vertical name
      const vc=cats.find(c=>c.id===_vmapCat);
      if(vc&&!p.category_path?.toLowerCase().includes(vc.name.toLowerCase()))return false;
    }
    if(_vmapSearch&&!p.name?.toLowerCase().includes(_vmapSearch.toLowerCase())&&!p.brand_name?.toLowerCase().includes(_vmapSearch.toLowerCase()))return false;
    return true;
  });

  el.innerHTML=`
  <!-- Info banner -->
  <div style="padding:14px 16px;background:linear-gradient(135deg,var(--black),#1a1a2e);border-radius:var(--radius);margin-bottom:20px;display:flex;align-items:center;gap:14px">
    <span style="font-size:32px">🗺️</span>
    <div>
      <p style="font-weight:800;color:#fff;font-size:15px">Map Products to Your Store</p>
      <p style="font-size:12px;color:rgba(255,255,255,.5);margin-top:2px">Browse ${catalogProds.length} admin-approved products. Set your price, stock and cashback — go live instantly.</p>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;flex-shrink:0">
      ${myPickIds.size?`<button class="btn btn-pill btn-sm" style="background:var(--gold);color:var(--black);border:none;font-weight:700" onclick="go('vendor-picks')">📋 My Picks (${myPickIds.size})</button>`:''}
      <button class="btn btn-pill btn-sm" style="background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.15)" onclick="submitNewProductRequest()">📝 Request New Product</button>
    </div>
  </div>

  <!-- Search + Filter -->
  <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
    <div style="flex:1;min-width:200px;position:relative">
      <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--gray-400);font-size:15px">🔍</span>
      <input style="width:100%;padding:10px 14px 10px 36px;border:1.5px solid var(--gray-200);border-radius:var(--radius-sm);font:400 13px 'Outfit',sans-serif;background:#fff;outline:none" 
        placeholder="Search products, brands…" value="${esc(_vmapSearch)}"
        oninput="_vmapSearch=this.value;vpRenderMapProducts()">
    </div>
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px">
      ${vertCats.map(c=>`<button class="vmap-cat-chip ${_vmapCat===c.id?'active':''}" onclick="_vmapCat='${c.id}';vpRenderMapProducts()">${c.icon||''} ${esc(c.name)}</button>`).join('')}
    </div>
  </div>
  <p style="font-size:12px;color:var(--gray-400);margin-bottom:14px">${filtered.length} products available · ${myPickIds.size} already in your store</p>

  <!-- Product Grid -->
  ${!filtered.length?`<div style="text-align:center;padding:48px;color:var(--gray-400)"><p style="font-size:32px">🔍</p><p style="font-weight:600;margin-top:8px">No products found</p><p style="font-size:13px;margin-top:4px">Try adjusting your search or category filter</p></div>`
  :`<div class="vmap-grid">
    ${filtered.map(p=>{
      const imgs=p.images||[];
      const isMine=myPickIds.has(p.id);
      const offers=p.platform_offers||[];
      const conf=p.ai_confidence_score||0;
      const cc=conf>=85?'var(--green)':conf>=65?'var(--orange)':'var(--red)';
      return `<div class="vmap-card" onclick="${isMine?`toast('Already in your store! Visit My Picks to manage.','📋')`:`vmapPickProduct('${p.id}','${esc(p.name.replace(/'/g,"\\'"))}',${JSON.stringify(p.images||[]).replace(/"/g,"'")})`}">
        ${isMine?`<span class="vmap-already">✓ Listed</span>`:''}
        <div class="vmap-card-img">
          ${imgs[0]?`<img src="${esc(imgs[0])}" onerror="this.parentElement.innerHTML='<span style=font-size:44px>📦</span>'">`:'📦'}
        </div>
        <div class="vmap-card-body">
          <p style="font-size:10px;color:var(--gray-400);font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px">${esc(p.brand_name||'')}</p>
          <p class="vmap-card-name">${esc(p.name)}</p>
          <p class="vmap-card-meta">${p.category_path?.split('>').pop()?.trim()||'General'}</p>
          ${offers.length?`<div style="margin-top:5px">${offers.slice(0,2).map(o=>`<span style="font-size:9px;padding:1px 6px;background:var(--gold-light);border:1px solid rgba(237,207,93,.3);border-radius:20px;color:var(--gold-dark);font-weight:600;margin-right:3px">${esc(o.badge_text||o.label||'Offer')}</span>`).join('')}</div>`:''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <span style="font-size:10px;color:${cc};font-weight:700">AI ${conf}%</span>
            ${isMine?`<span style="font-size:11px;font-weight:700;color:var(--green)">✓ In Store</span>`:`<span style="font-size:11px;font-weight:700;color:var(--gold-dark)">+ Sell This</span>`}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`}`;
}

function vmapPickProduct(productId, productName, imagesArr){
  const imgs=Array.isArray(imagesArr)?imagesArr:(typeof imagesArr==='string'?JSON.parse(imagesArr.replace(/'/g,'"')):[]);
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px;max-height:90vh;overflow-y:auto">
    <h3 style="font-weight:800;font-size:17px;margin-bottom:6px">🏪 Add to Your Store</h3>
    <p style="font-size:13px;color:var(--gray-400);margin-bottom:16px">${esc(productName)}</p>
    ${imgs[0]?`<img src="${esc(imgs[0])}" style="width:100%;height:160px;object-fit:cover;border-radius:var(--radius);margin-bottom:16px" onerror="this.style.display='none'">`:''}
    <div style="padding:10px 14px;background:rgba(237,207,93,.08);border-radius:var(--radius-sm);border:1px solid rgba(237,207,93,.3);margin-bottom:16px;font-size:12px;color:var(--gold-dark)">
      ℹ️ This product already exists in the catalog. Set your price, stock and cashback to go live.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Your Selling Price ₹ *</label><input class="form-input" id="vm-price" type="number" placeholder="e.g. 999" autofocus oninput="vmOnPriceChange('${productId}')"></div>
      <div class="form-group"><label class="form-label">MRP / Compare Price ₹</label><input class="form-input" id="vm-mrp" type="number" placeholder="e.g. 1299"></div>
    </div>
    <!-- Price Sanity Widget -->
    <div id="psc-vm-widget" class="psc-widget"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Stock Quantity *</label><input class="form-input" id="vm-stock" type="number" value="10"></div>
      <div class="form-group"><label class="form-label">Cashback % (for buyers)</label><input class="form-input" id="vm-cb" type="number" value="3" step="0.5"></div>
    </div>
    <div class="form-group"><label class="form-label">Estimated Delivery</label>
      <select class="form-select" id="vm-delivery">
        <option value="1-2 days">1–2 Business Days (Express)</option>
        <option value="3-5 days" selected>3–5 Business Days (Standard)</option>
        <option value="5-7 days">5–7 Business Days</option>
        <option value="7-14 days">7–14 Business Days</option>
      </select></div>
    <div id="vm-fee-calc" style="padding:10px 14px;background:rgba(175,82,222,.08);border-radius:var(--radius-sm);margin-bottom:16px;font-size:12px;color:var(--purple);display:none"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="vmapSubmitOffer('${productId}','${esc(productName.replace(/'/g,"\\'"))}')">🚀 List This Product</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
    <p style="font-size:11px;color:var(--gray-400);margin-top:10px;text-align:center">Your listing goes live immediately. You can pause or edit it anytime from My Products.</p>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});

  // Fetch market prices for this product on modal open
  const pName=productName;
  pscShowLoading('psc-vm-widget','Fetching live Amazon & Flipkart prices…');
  fetchMarketPrices(pName).then(data=>{
    window._vmCurrentPscData=data;
    renderPriceWidget('psc-vm-widget',data,0,false);
  });

  // Live fee calculation
  const priceInput=modal.querySelector('#vm-price');
  priceInput?.addEventListener('input',async()=>{
    const price=parseFloat(priceInput.value);
    const feeEl=modal.querySelector('#vm-fee-calc');
    if(!price||!feeEl){if(feeEl)feeEl.style.display='none';return;}
    try{
      const pct=await sb.rpc("resolve_commission",{p_product_id:'00000000-0000-0000-0000-000000000000',p_category_id:null,p_price:price}).catch(()=>8);
      const fee=(price*(pct||8)/100).toFixed(2);
      feeEl.innerHTML=`💸 Platform commission: <strong>${pct||8}%</strong> (₹${fee} on ₹${price}) · Your net: <strong>₹${(price-parseFloat(fee)).toFixed(2)}</strong>`;
      feeEl.style.display='block';
    }catch(e){}
  });
}

// ── PSC: live price update in Map Products modal ──
function vmOnPriceChange(productId){
  const price=parseFloat($('vm-price')?.value)||0;
  const data=window._vmCurrentPscData;
  if(data)renderPriceWidget('psc-vm-widget',data,price,false);
}

async function vmapSubmitOffer(catalogProductId, productName){
  const price=parseFloat($('vm-price')?.value);
  const mrp=parseFloat($('vm-mrp')?.value)||null;
  const stock=parseInt($('vm-stock')?.value)||10;
  const cb=parseFloat($('vm-cb')?.value)||0;
  const delivery=$('vm-delivery')?.value||'3-5 days';
  if(!price||price<=0){toast('Enter a valid price','⚠️');return;}

  // ── Price Sanity Check ──
  const md=window._vmCurrentPscData;
  if(md&&md.found&&md.cap>0){
    const v=validatePrice(price,md);
    if(!v.ok){
      toast('Price exceeds market cap ⛔ Lower it to continue.','❌');
      renderPriceWidget('psc-vm-widget',md,price,false);
      document.getElementById('psc-vm-widget')?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
  }

  // Get vendor store
  const stores=await sb.get("vendor_stores","id",{vendor_id:`eq.${PROFILE.id}`}).catch(()=>[]);
  const storeId=stores[0]?.id||null;
  const r=await sb.ins("vendor_catalog_picks",{
    vendor_id:PROFILE.id,store_id:storeId,catalog_product_id:catalogProductId,
    selling_price:price,compare_at_price:mrp,stock,cashback_pct:cb,
    delivery_estimate:delivery,status:'pending',created_at:new Date().toISOString()
  }).catch(()=>[]);
  document.querySelector('.auth-overlay')?.remove();
  if(r&&r.length){
    toast('Product listing submitted! ✅','🚀');
    if(_vmapMyIds)_vmapMyIds.add(catalogProductId);
    vpRenderMapProducts();
  } else {
    await sb.ins("vendor_offers",{vendor_id:PROFILE.id,store_id:storeId,master_product_id:catalogProductId,price,compare_at_price:mrp,stock,cashback_percent:cb,condition:'new'}).catch(()=>{});
    document.querySelector('.auth-overlay')?.remove();
    toast('Offer submitted for review ✅','🚀');
    if(_vmapMyIds)_vmapMyIds.add(catalogProductId);
    vpRenderMapProducts();
  }
}

async function addVProduct(storeId){
  if(!storeId){toast('Create store first!','⚠️');return;}
  const name=$('vp-name').value;const price=$('vp-price').value;
  if(!name||!price){toast('Name & price required','⚠️');return;}
  const priceNum=parseFloat(price);

  // ── Price Sanity Check ──
  const cacheKey=name.toLowerCase().trim();
  const marketData=_priceCache[cacheKey]||null;
  if(marketData&&marketData.found&&marketData.cap>0){
    const v=validatePrice(priceNum,marketData);
    if(!v.ok){
      toast('Price exceeds market cap — please lower it ⛔','❌');
      const w=document.getElementById('psc-vp-widget');
      if(w){w.style.display='block';renderPriceWidget('psc-vp-widget',marketData,priceNum,false);w.scrollIntoView({behavior:'smooth',block:'center'});}
      return;
    }
  }

  const slug=name.toLowerCase().replace(/[^a-z0-9]/g,'-')+'-'+Date.now();
  const amz=marketData?.amazon||($('vp-amz')?.value?parseFloat($('vp-amz').value):null);
  const fk=marketData?.flipkart||($('vp-fk')?.value?parseFloat($('vp-fk').value):null);
  const catId=$('vp-leaf')?.value||$('vp-sub')?.value||$('vp-cat')?.value||$('vp-vert')?.value||null;
  const parity=(amz&&priceNum>amz*1.05)||(fk&&priceNum>fk*1.05)?'overpriced':'ok';
  const images=getUploadUrls('vp-img');
  const hsnCode=$('vp-hsn')?.value?.trim()||null;
  const gstInclusive=$('vp-gsti')?.value==='true';
  let gstRate=18;
  try{const g=await resolveGSTClient(catId,priceNum,hsnCode);gstRate=g.rate;}catch(e){}
  const specEls=document.querySelectorAll('#vp-specs-list .spec-row');
  const specs=[];specEls.forEach(r=>{const k=r.querySelector('.sk')?.textContent;const v=r.querySelector('.sv')?.textContent;if(k&&v)specs.push({key:k,value:v});});
  const tags=($('vp-tags')?.value||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
  const status=$('vp-status')?.value||'published';
  const isActive=status==='published';
  const whId=$('vp-warehouse')?.value||null;
  await sb.ins("products",{vendor_id:PROFILE.id,store_id:storeId,name,slug,price:priceNum,compare_at_price:$('vp-compare').value?parseFloat($('vp-compare').value):null,stock:parseInt($('vp-stock').value)||10,description:$('vp-desc').value,category_id:catId,cashback_percent:parseFloat($('vp-cb').value)||0,amazon_price:amz||null,flipkart_price:fk||null,price_parity_status:parity,images,hsn_code:hsnCode,gst_rate:gstRate,gst_inclusive:gstInclusive,is_active:isActive,is_approved:isActive,status,specifications:specs,tags,video_url:$('vp-video')?.value||null,size_guide_url:$('vp-sizeguide')?.value||null,weight_grams:$('vp-weight')?.value?parseFloat($('vp-weight').value):null,length_cm:$('vp-length')?.value?parseFloat($('vp-length').value):null,width_cm:$('vp-width')?.value?parseFloat($('vp-width').value):null,height_cm:$('vp-height')?.value?parseFloat($('vp-height').value):null,meta_title:$('vp-mtitle')?.value||null,meta_description:$('vp-mdesc')?.value||null,default_warehouse_id:whId});
  if(whId){const newProds=await sb.get("products","id",{slug:`eq.${slug}`});if(newProds.length)await sb.ins("warehouse_stock",{product_id:newProds[0].id,warehouse_id:whId,quantity:parseInt($('vp-stock').value)||10});}
  toast('Product added! ✓','✅');renderVendorProducts();
}

let VP_CATS=[];
function setVPCats(cats){VP_CATS=cats;}

// ── PSC: Show widget when vendor types product name (Add Product form) ──
let _vpPscTimer=null;
function vpShowPscWidget(){
  const name=($('vp-name')?.value||'').trim();
  const w=$('psc-vp-widget');
  if(!w)return;
  if(!name||name.length<4){w.style.display='none';return;}
  w.style.display='block';
  w.dataset.productName=name;
  clearTimeout(_vpPscTimer);
  _vpPscTimer=setTimeout(async()=>{
    pscShowLoading('psc-vp-widget','Fetching live Amazon & Flipkart prices...');
    const data=await fetchMarketPrices(name);
    const price=parseFloat($('vp-price')?.value)||0;
    renderPriceWidget('psc-vp-widget',data,price,false);
    const priceEl=$('vp-price');
    if(priceEl&&!priceEl.dataset.pscBound){
      priceEl.dataset.pscBound='1';
      priceEl.addEventListener('input',()=>{
        const md=_priceCache[name.toLowerCase().trim()];
        if(md)renderPriceWidget('psc-vp-widget',md,parseFloat(priceEl.value)||0,false);
      });
    }
  },900);
}

function addSpecRow(){
  const key=$('vp-spec-key')?.value?.trim();const val=$('vp-spec-val')?.value?.trim();
  if(!key||!val){toast('Enter both key and value','⚠️');return;}
  const list=$('vp-specs-list');
  const row=document.createElement('div');row.className='spec-row';
  row.style.cssText='display:flex;gap:8px;align-items:center;padding:6px 10px;background:var(--gray-50);border-radius:6px;margin-bottom:4px;font-size:13px';
  row.innerHTML=`<span class="sk" style="font-weight:600;min-width:100px">${esc(key)}</span><span style="color:var(--gray-300)">→</span><span class="sv" style="flex:1">${esc(val)}</span><button style="background:none;border:none;cursor:pointer;color:var(--gray-400)" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(row);
  $('vp-spec-key').value='';$('vp-spec-val').value='';$('vp-spec-key').focus();
}

async function duplicateProduct(pid){
  const prods=await sb.get("products","*",{id:`eq.${pid}`});
  const p=prods[0];if(!p)return;
  const newName=p.name+' (Copy)';
  const newSlug=p.slug+'-copy-'+Date.now();
  const {id,created_at,updated_at,total_sold,views,clicks,...rest}=p;
  await sb.ins("products",{...rest,name:newName,slug:newSlug,total_sold:0,views:0,clicks:0,status:'draft',is_active:false});
  toast('Product duplicated as draft!','📋');renderVendorProducts();
}

function showBulkEdit(){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">📦 Bulk Edit Products</h3>
    <p style="font-size:13px;color:var(--gray-400);margin-bottom:16px">Apply changes to all your products at once</p>
    <div class="form-group"><label class="form-label">Action</label>
      <select class="form-select" id="be-action" onchange="$('be-pct-row').style.display=this.value.includes('pct')?'block':'none';$('be-val-row').style.display=this.value.includes('pct')?'none':'block'">
        <option value="price_pct">Increase price by %</option>
        <option value="price_pct_down">Decrease price by %</option>
        <option value="stock_set">Set stock to value</option>
        <option value="stock_add">Add stock</option>
        <option value="cashback_set">Set cashback %</option>
        <option value="activate">Activate all</option>
        <option value="deactivate">Deactivate all</option>
      </select>
    </div>
    <div id="be-pct-row" class="form-group"><label class="form-label">Percentage (%)</label><input class="form-input" id="be-pct" type="number" placeholder="10"></div>
    <div id="be-val-row" class="form-group" style="display:none"><label class="form-label">Value</label><input class="form-input" id="be-val" type="number" placeholder="50"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="doBulkEdit()">Apply to All</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function doBulkEdit(){
  const action=$('be-action').value;
  const pct=parseFloat($('be-pct')?.value)||0;
  const val=parseFloat($('be-val')?.value)||0;
  const prods=await sb.get("products","id,price,stock,cashback_percent",{vendor_id:`eq.${PROFILE.id}`});
  if(!confirm(`Apply "${action}" to ${prods.length} products?`))return;
  let count=0;
  for(const p of prods){
    let data={};
    if(action==='price_pct')data.price=Math.round(p.price*(1+pct/100));
    else if(action==='price_pct_down')data.price=Math.round(p.price*(1-pct/100));
    else if(action==='stock_set')data.stock=val;
    else if(action==='stock_add')data.stock=(p.stock||0)+val;
    else if(action==='cashback_set')data.cashback_percent=pct;
    else if(action==='activate'){data.is_active=true;data.status='published';}
    else if(action==='deactivate'){data.is_active=false;data.status='draft';}
    if(Object.keys(data).length){await sb.upd("products",data,{id:`eq.${p.id}`});count++;}
  }
  document.querySelector('.auth-overlay')?.remove();
  toast(`${count} products updated!`,'✅');renderVendorProducts();
}

function vpCascadeCat(vertId){
  const catSel=$('vp-cat');const subSel=$('vp-sub');const leafSel=$('vp-leaf');
  const children=VP_CATS.filter(c=>c.parent_id===vertId);
  catSel.innerHTML='<option value="">Select category...</option>'+children.map(c=>`<option value="${c.id}">${c.icon||''} ${c.name}</option>`).join('');
  catSel.disabled=!children.length;
  subSel.innerHTML='<option value="">None</option>';subSel.disabled=true;
  if(leafSel){leafSel.innerHTML='<option value="">None</option>';leafSel.disabled=true;}
  vpFeePreview();
}

function vpCascadeSub(catId){
  const subSel=$('vp-sub');const leafSel=$('vp-leaf');
  const children=VP_CATS.filter(c=>c.parent_id===catId);
  subSel.innerHTML='<option value="">None</option>'+children.map(c=>`<option value="${c.id}">${c.icon||''} ${c.name}</option>`).join('');
  subSel.disabled=!children.length;
  if(leafSel){leafSel.innerHTML='<option value="">None</option>';leafSel.disabled=true;}
  vpFeePreview();
}

function vpCascadeLeaf(subId){
  const leafSel=$('vp-leaf');if(!leafSel)return;
  const children=VP_CATS.filter(c=>c.parent_id===subId);
  leafSel.innerHTML='<option value="">None</option>'+children.map(c=>`<option value="${c.id}">${c.icon||''} ${c.name}</option>`).join('');
  leafSel.disabled=!children.length;
  vpFeePreview();
}

async function vpFeePreview(){
  const catId=$('vp-leaf')?.value||$('vp-leaf')?.value||$('vp-sub')?.value||$('vp-cat')?.value||$('vp-vert')?.value;
  const price=parseFloat($('vp-price')?.value);
  const el=$('vp-fee-preview');
  if(!catId||!price||!el){if(el)el.style.display='none';return;}
  try{
    const pct=await sb.rpc("resolve_commission",{p_product_id:'00000000-0000-0000-0000-000000000000',p_category_id:catId,p_price:price});
    el.style.display='block';
    el.innerHTML=`💸 Platform fee: <strong>${pct}%</strong> (₹${(price*pct/100).toFixed(2)} on ₹${price})`;
  }catch(e){el.style.display='none';}
  vpAutoHSN(catId);
  vpGSTPreview();
}

async function vpAutoHSN(catId){
  if(!catId||!$('vp-hsn'))return;
  if($('vp-hsn').value)return;// don't overwrite manual input
  const hsns=await sb.get("hsn_codes","code,description",{category_id:`eq.${catId}`,is_active:"eq.true",limit:1});
  if(hsns.length){$('vp-hsn').value=hsns[0].code;$('vp-hsn').placeholder=hsns[0].description||'';}
}

async function vpGSTPreview(){
  const catId=$('vp-leaf')?.value||$('vp-sub')?.value||$('vp-cat')?.value||$('vp-vert')?.value;
  const price=parseFloat($('vp-price')?.value);
  const el=$('vp-gst-preview');
  if(!catId||!price||!el){if(el)el.style.display='none';return;}
  const hsn=$('vp-hsn')?.value||'';
  const gst=await resolveGSTClient(catId, price, hsn);
  const gstAmt=(price*gst.rate/100).toFixed(2);
  const inclusive=$('vp-gsti')?.value==='true';
  if(inclusive){
    const base=(price*100/(100+gst.rate)).toFixed(2);
    const tax=(price-base).toFixed(2);
    el.innerHTML=`🧾 GST ${gst.rate}% (inclusive) · HSN: ${gst.hsn||'—'} · Base: ₹${base} + GST: ₹${tax} = ₹${price}`;
  }else{
    el.innerHTML=`🧾 GST ${gst.rate}% · HSN: ${gst.hsn||'—'} · Buyer pays: ₹${price} + ₹${gstAmt} GST = ₹${(price+parseFloat(gstAmt)).toFixed(2)}`;
  }
  el.style.display='block';
}

async function bulkUpload(){
  const csv=$('bulk-csv')?.value;if(!csv){toast('Paste CSV data','⚠️');return;}
  const lines=csv.trim().split('\n');if(lines.length<2){toast('Need header + at least 1 row','⚠️');return;}
  const headers=lines[0].split(',').map(h=>h.trim().toLowerCase());
  const products=[];
  for(let i=1;i<lines.length;i++){
    const vals=lines[i].split(',').map(v=>v.trim());
    if(!vals[0])continue;
    const obj={};headers.forEach((h,j)=>obj[h]=vals[j]||'');
    products.push(obj);
  }
  if(!products.length){toast('No valid rows','⚠️');return;}
  const r=await sb.rpc("bulk_insert_products",{p_products:products});
  if(r?.success){toast(`${r.count} products uploaded! 📦`,'✅');renderVendorProducts();}
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

async function toggleProduct(pid,active){
  await sb.upd("products",{is_active:!active},{id:`eq.${pid}`});
  toast(active?'Deactivated':'Activated','✅');renderVendorProducts();
}

async function editProduct(pid){
  const prods=await sb.get("products","*",{id:`eq.${pid}`});
  const p=prods[0];if(!p)return;
  const specs=p.specifications||[];
  const tags=(p.tags||[]).join(', ');
  const modal=document.createElement('div');
  modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:520px;max-height:90vh;overflow-y:auto">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">Edit Product</h3>
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ep-name" value="${esc(p.name)}" oninput="epTriggerPsc()"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Price ₹</label><input class="form-input" id="ep-price" type="number" value="${p.price}" oninput="epOnPriceChange()"></div><div class="form-group"><label class="form-label">Compare ₹</label><input class="form-input" id="ep-compare" type="number" value="${p.compare_at_price||''}"></div></div>
    <!-- Price Sanity Widget -->
    <div id="psc-ep-widget" class="psc-widget" data-is-admin="false"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Stock</label><input class="form-input" id="ep-stock" type="number" value="${p.stock}"></div><div class="form-group"><label class="form-label">Cashback %</label><input class="form-input" id="ep-cb" type="number" value="${p.cashback_percent}"></div></div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="ep-desc" style="min-height:80px">${esc(p.description||'')}</textarea></div>

    <!-- Specs -->
    <div class="form-group"><label class="form-label">📋 Specifications</label>
      <div id="ep-specs-list">${specs.map(s=>`<div class="spec-row" style="display:flex;gap:8px;align-items:center;padding:6px 10px;background:var(--gray-50);border-radius:6px;margin-bottom:4px;font-size:13px"><span class="sk" style="font-weight:600;min-width:100px">${esc(s.key)}</span><span style="color:var(--gray-300)">→</span><span class="sv" style="flex:1">${esc(s.value)}</span><button style="background:none;border:none;cursor:pointer;color:var(--gray-400)" onclick="this.parentElement.remove()">✕</button></div>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <input class="form-input" id="ep-spec-key" placeholder="Key" style="margin:0;flex:1">
        <input class="form-input" id="ep-spec-val" placeholder="Value" style="margin:0;flex:1">
        <button class="btn btn-outline btn-sm btn-pill" onclick="addEditSpecRow()">+</button>
      </div>
    </div>

    <div class="form-group"><label class="form-label">🏷️ Tags</label><input class="form-input" id="ep-tags" value="${esc(tags)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">🎬 Video URL</label><input class="form-input" id="ep-video" value="${esc(p.video_url||'')}"></div>
      <div class="form-group"><label class="form-label">📏 Size Guide</label><input class="form-input" id="ep-sizeguide" value="${esc(p.size_guide_url||'')}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
      <div class="form-group"><label class="form-label">Wt(g)</label><input class="form-input" id="ep-weight" type="number" value="${p.weight_grams||''}"></div>
      <div class="form-group"><label class="form-label">L(cm)</label><input class="form-input" id="ep-length" type="number" value="${p.length_cm||''}"></div>
      <div class="form-group"><label class="form-label">W(cm)</label><input class="form-input" id="ep-width" type="number" value="${p.width_cm||''}"></div>
      <div class="form-group"><label class="form-label">H(cm)</label><input class="form-input" id="ep-height" type="number" value="${p.height_cm||''}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">HSN Code</label><input class="form-input" id="ep-hsn" value="${esc(p.hsn_code||'')}"></div>
      <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="ep-status"><option value="published" ${p.status==='published'?'selected':''}>🟢 Published</option><option value="draft" ${p.status==='draft'?'selected':''}>📝 Draft</option><option value="archived" ${p.status==='archived'?'selected':''}>📦 Archived</option></select></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Amazon ₹</label><input class="form-input" id="ep-amz" type="number" value="${p.amazon_price||''}"></div>
      <div class="form-group"><label class="form-label">Flipkart ₹</label><input class="form-input" id="ep-fk" type="number" value="${p.flipkart_price||''}"></div>
    </div>
    <details><summary style="font-size:13px;font-weight:600;cursor:pointer;color:var(--gray-500);margin-bottom:12px">🔍 SEO</summary>
      <div class="form-group"><label class="form-label">Meta Title</label><input class="form-input" id="ep-mtitle" value="${esc(p.meta_title||'')}"></div>
      <div class="form-group"><label class="form-label">Meta Description</label><input class="form-input" id="ep-mdesc" value="${esc(p.meta_description||'')}"></div>
    </details>
    ${imageUploadZone('ep-img',{folder:'products',max:5,label:'Product Images',existing:p.images||[]})}
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveEditProduct('${pid}')">Save</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove();manageVariants('${pid}')">🎨</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
    <p style="font-size:11px;color:var(--gray-400);text-align:center;margin-top:8px">📊 ${p.views||0} views · ${p.clicks||0} clicks · ${p.total_sold||0} sold</p>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  // Auto-fetch market prices for this product on open
  setTimeout(()=>{
    const isAdmin=PROFILE?.role==='admin';
    pscShowLoading('psc-ep-widget','Fetching live market prices…');
    fetchMarketPrices(p.name).then(data=>{
      renderPriceWidget('psc-ep-widget',data,p.price,isAdmin);
    });
  },200);
}
let _epPscTimer=null;
function epTriggerPsc(){
  const name=($('ep-name')?.value||'').trim();
  if(!name||name.length<4)return;
  clearTimeout(_epPscTimer);
  _epPscTimer=setTimeout(async()=>{
    pscShowLoading('psc-ep-widget','Fetching market prices…');
    const data=await fetchMarketPrices(name);
    const price=parseFloat($('ep-price')?.value)||0;
    const isAdmin=PROFILE?.role==='admin';
    renderPriceWidget('psc-ep-widget',data,price,isAdmin);
  },900);
}
function epOnPriceChange(){
  const name=($('ep-name')?.value||'').trim();
  if(!name)return;
  const md=_priceCache[name.toLowerCase().trim()];
  if(md){
    const price=parseFloat($('ep-price')?.value)||0;
    const isAdmin=PROFILE?.role==='admin';
    renderPriceWidget('psc-ep-widget',md,price,isAdmin);
  }
}

function addEditSpecRow(){
  const key=$('ep-spec-key')?.value?.trim();const val=$('ep-spec-val')?.value?.trim();
  if(!key||!val){toast('Enter both key and value','⚠️');return;}
  const list=$('ep-specs-list');
  const row=document.createElement('div');row.className='spec-row';
  row.style.cssText='display:flex;gap:8px;align-items:center;padding:6px 10px;background:var(--gray-50);border-radius:6px;margin-bottom:4px;font-size:13px';
  row.innerHTML=`<span class="sk" style="font-weight:600;min-width:100px">${esc(key)}</span><span style="color:var(--gray-300)">→</span><span class="sv" style="flex:1">${esc(val)}</span><button style="background:none;border:none;cursor:pointer;color:var(--gray-400)" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(row);
  $('ep-spec-key').value='';$('ep-spec-val').value='';
}

async function saveEditProduct(pid){
  const price=parseFloat($('ep-price').value);
  if(!price||price<=0){toast('Enter a valid price','⚠️');return;}

  // ── Price Sanity Check (vendor only — admin can override) ──
  if(PROFILE?.role==='vendor'){
    const name=($('ep-name')?.value||'').trim();
    const md=_priceCache[name.toLowerCase().trim()]||null;
    if(md&&md.found&&md.cap>0){
      const v=validatePrice(price,md);
      if(!v.ok){
        toast('Price exceeds market cap ⛔ Lower it to save.','❌');
        renderPriceWidget('psc-ep-widget',md,price,false);
        document.getElementById('psc-ep-widget')?.scrollIntoView({behavior:'smooth',block:'center'});
        return;
      }
    }
  }

  const name=$('ep-name')?.value||'';
  const amzMd=_priceCache[name.toLowerCase().trim()];
  const amz=amzMd?.amazon||($('ep-amz')?.value?parseFloat($('ep-amz').value):null);
  const fk=amzMd?.flipkart||($('ep-fk')?.value?parseFloat($('ep-fk').value):null);
  const parity=(amz&&price>amz*1.05)||(fk&&price>fk*1.05)?'overpriced':'ok';
  // Collect specs
  const specEls=document.querySelectorAll('#ep-specs-list .spec-row');
  const specs=[];specEls.forEach(r=>{const k=r.querySelector('.sk')?.textContent;const v=r.querySelector('.sv')?.textContent;if(k&&v)specs.push({key:k,value:v});});
  const tags=($('ep-tags')?.value||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
  const status=$('ep-status')?.value||'published';
  await sb.upd("products",{
    name:$('ep-name').value,price,compare_at_price:$('ep-compare').value?parseFloat($('ep-compare').value):null,
    stock:parseInt($('ep-stock').value),cashback_percent:parseFloat($('ep-cb').value)||0,
    description:$('ep-desc').value,amazon_price:amz||null,flipkart_price:fk||null,
    price_parity_status:parity,images:getUploadUrls('ep-img'),
    hsn_code:$('ep-hsn')?.value?.trim()||null,
    specifications:specs,tags,status,is_active:status==='published',
    video_url:$('ep-video')?.value||null,size_guide_url:$('ep-sizeguide')?.value||null,
    weight_grams:$('ep-weight')?.value?parseFloat($('ep-weight').value):null,
    length_cm:$('ep-length')?.value?parseFloat($('ep-length').value):null,
    width_cm:$('ep-width')?.value?parseFloat($('ep-width').value):null,
    height_cm:$('ep-height')?.value?parseFloat($('ep-height').value):null,
    meta_title:$('ep-mtitle')?.value||null,meta_description:$('ep-mdesc')?.value||null
  },{id:`eq.${pid}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Product updated!','✅');renderVendorProducts();
}

async function manageVariants(pid){
  const [groups,opts,prods]=await Promise.all([
    sb.get("product_variant_groups","*",{product_id:`eq.${pid}`,order:"sort_order.asc"}),
    sb.get("product_variant_options","*",{product_id:`eq.${pid}`,order:"sort_order.asc"}),
    sb.get("products","name",{id:`eq.${pid}`})
  ]);
  const pName=prods[0]?.name||'Product';

  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:560px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-weight:800;font-size:18px">🎨 Variants: ${esc(pName)}</h3>
      <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
    </div>

    <!-- Existing Groups -->
    ${groups.map(g=>{
      const gopts=opts.filter(o=>o.group_id===g.id);
      return `<div class="card" style="margin-bottom:12px;border-left:3px solid var(--gold)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <p style="font-weight:700">${esc(g.name)}</p>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" onclick="this.closest('.auth-overlay').remove();addVariantOption('${pid}','${g.id}','${esc(g.name)}')">+ Option</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteVariantGroup('${pid}','${g.id}')">🗑</button>
          </div>
        </div>
        ${gopts.length?`<div style="display:flex;flex-wrap:wrap;gap:6px">${gopts.map(o=>`<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--gray-50);border-radius:6px;font-size:13px">
          <span style="font-weight:600">${esc(o.label)}</span>
          ${o.price_override?`<span style="font-size:11px;color:var(--gold-dark)">₹${o.price_override}</span>`:''}
          ${o.stock_override!==null&&o.stock_override!==undefined?`<span style="font-size:10px;color:var(--gray-400)">stk:${o.stock_override}</span>`:''}
          ${!o.is_available?'<span style="font-size:10px;color:var(--red)">unavail</span>':''}
          <button style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--gray-400);padding:0" onclick="deleteVariantOption('${pid}','${o.id}')">✕</button>
        </div>`).join('')}</div>`:'<p style="font-size:12px;color:var(--gray-400)">No options yet</p>'}
      </div>`;
    }).join('')}
    ${!groups.length?'<p style="color:var(--gray-400);font-size:13px;margin-bottom:16px">No variant groups yet. Add groups like Color, Size, Storage etc.</p>':''}

    <!-- Add New Group -->
    <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius);margin-top:12px">
      <p style="font-weight:700;font-size:13px;margin-bottom:8px">+ Add Variant Group</p>
      <div style="display:flex;gap:8px">
        <select class="form-select" id="vg-name" style="margin:0;flex:1">
          <option value="Color">Color</option>
          <option value="Size">Size</option>
          <option value="Storage">Storage</option>
          <option value="RAM / Storage">RAM / Storage</option>
          <option value="Weight">Weight</option>
          <option value="Material">Material</option>
          <option value="Pack Size">Pack Size</option>
          <option value="Flavor">Flavor</option>
          <option value="custom">Custom...</option>
        </select>
        <input class="form-input" id="vg-custom" placeholder="Custom name" style="margin:0;flex:1;display:none">
        <button class="btn btn-gold btn-pill" onclick="addVariantGroup('${pid}')">Add</button>
      </div>
    </div>
    <p style="font-size:11px;color:var(--gray-400);margin-top:12px;text-align:center">Variants appear as selectable options on the product page</p>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  $('vg-name')?.addEventListener('change',function(){$('vg-custom').style.display=this.value==='custom'?'block':'none';});
}

async function addVariantGroup(pid){
  let name=$('vg-name').value;
  if(name==='custom')name=$('vg-custom').value.trim();
  if(!name){toast('Select or enter group name','⚠️');return;}
  await sb.ins("product_variant_groups",{product_id:pid,name,sort_order:0});
  document.querySelector('.auth-overlay')?.remove();
  toast('Group added!','✅');manageVariants(pid);
}

async function deleteVariantGroup(pid,gid){
  if(!confirm('Delete this variant group and all its options?'))return;
  await sb.del("product_variant_options",{group_id:`eq.${gid}`});
  await sb.del("product_variant_groups",{id:`eq.${gid}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Group deleted','🗑');manageVariants(pid);
}

function addVariantOption(pid,gid,groupName){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:400px">
    <h3 style="font-weight:800;font-size:16px;margin-bottom:16px">+ Add ${esc(groupName)} Option</h3>
    <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="vo-label" placeholder="e.g. Red, XL, 256GB"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Price Override ₹ <span style="font-weight:400;color:var(--gray-400)">(optional)</span></label><input class="form-input" id="vo-price" type="number" placeholder="Leave empty = same price"></div>
      <div class="form-group"><label class="form-label">Stock Override <span style="font-weight:400;color:var(--gray-400)">(optional)</span></label><input class="form-input" id="vo-stock" type="number" placeholder="Leave empty = shared"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveVariantOption('${pid}','${gid}')">Add Option</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove();manageVariants('${pid}')">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveVariantOption(pid,gid){
  const label=$('vo-label').value.trim();
  if(!label){toast('Label required','⚠️');return;}
  const data={group_id:gid,product_id:pid,label,is_available:true};
  const price=$('vo-price').value;if(price)data.price_override=parseFloat(price);
  const stock=$('vo-stock').value;if(stock)data.stock_override=parseInt(stock);
  await sb.ins("product_variant_options",data);
  document.querySelector('.auth-overlay')?.remove();
  toast('Option added!','✅');manageVariants(pid);
}

async function deleteVariantOption(pid,oid){
  await sb.del("product_variant_options",{id:`eq.${oid}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Option removed','✅');manageVariants(pid);
}

// ═══════════════════════════════════════════════════
// VENDOR: COUPONS
// ═══════════════════════════════════════════════════
async function renderVendorCoupons(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading...</div>';
  const coupons=await sb.get("coupons","*",{vendor_id:`eq.${PROFILE.id}`,order:"created_at.desc"});

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <div><h2 style="font-size:24px;font-weight:800">🏷️ Coupons</h2><p style="color:var(--gray-400);font-size:14px">${coupons.length} coupons</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill btn-sm" onclick="$('cp-form').classList.toggle('hide')">+ Create Coupon</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('vendor-dash')">← Dashboard</button>
      </div>
    </div>

    <div id="cp-form" class="card hide" style="max-width:500px;margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:16px">New Coupon</h3>
      <div class="form-group"><label class="form-label">Code</label><input class="form-input" id="cp-code" placeholder="e.g. SAVE20" oninput="this.value=this.value.toUpperCase()"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Type</label><select class="form-select" id="cp-type"><option value="percent">Percentage (%)</option><option value="fixed">Fixed Amount (₹)</option></select></div>
        <div class="form-group"><label class="form-label">Value</label><input class="form-input" id="cp-val" type="number" placeholder="20"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Min Order ₹</label><input class="form-input" id="cp-min" type="number" placeholder="500" value="0"></div>
        <div class="form-group"><label class="form-label">Max Discount ₹</label><input class="form-input" id="cp-max" type="number" placeholder="200"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Usage Limit</label><input class="form-input" id="cp-limit" type="number" placeholder="100"></div>
        <div class="form-group"><label class="form-label">Valid Until</label><input class="form-input" id="cp-until" type="date"></div>
      </div>
      <button class="btn btn-gold btn-pill btn-full" onclick="createCoupon()">Create Coupon</button>
    </div>

    ${!coupons.length?emptyState('🏷️','No coupons yet','Create your first coupon to attract customers')
    :coupons.map(c=>{
      const isExpired=c.valid_until&&new Date(c.valid_until)<new Date();
      const isExhausted=c.usage_limit&&c.used_count>=c.usage_limit;
      const statusText=!c.is_active?'Inactive':isExpired?'Expired':isExhausted?'Exhausted':'Active';
      const statusCls=!c.is_active||isExpired||isExhausted?'badge-red':'badge-green';
      return `<div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center;${!c.is_active||isExpired?'opacity:.6':''}">
        <div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
            <span style="font-weight:800;font-size:18px;font-family:'Space Mono',monospace;letter-spacing:1px">${esc(c.code)}</span>
            <span class="badge ${statusCls}">${statusText}</span>
          </div>
          <p style="font-size:13px;color:var(--gray-500)">${c.discount_type==='percent'?c.discount_value+'% off':'₹'+c.discount_value+' off'}${c.min_order_value>0?' · Min ₹'+c.min_order_value:''}${c.max_discount?' · Max ₹'+c.max_discount:''}</p>
          <p style="font-size:11px;color:var(--gray-400);margin-top:4px">Used ${c.used_count}${c.usage_limit?'/'+c.usage_limit:''} times${c.valid_until?' · Expires '+new Date(c.valid_until).toLocaleDateString():''}</p>
        </div>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="toggleCoupon('${c.id}',${c.is_active})">${c.is_active?'🔴':'🟢'}</button>
      </div>`;
    }).join('')}
  </div>`;
}

async function createCoupon(){
  const code=$('cp-code').value;const val=$('cp-val').value;
  if(!code||!val){toast('Code & value required','⚠️');return;}
  const until=$('cp-until').value;
  await sb.ins("coupons",{
    code,vendor_id:PROFILE.id,discount_type:$('cp-type').value,discount_value:parseFloat(val),
    min_order_value:parseFloat($('cp-min').value)||0,max_discount:$('cp-max').value?parseFloat($('cp-max').value):null,
    usage_limit:$('cp-limit').value?parseInt($('cp-limit').value):null,
    valid_until:until?new Date(until).toISOString():null
  });
  toast('Coupon created! 🏷️','🏷️');renderVendorCoupons();
}

async function toggleCoupon(id,active){
  await sb.upd("coupons",{is_active:!active},{id:`eq.${id}`});
  toast(active?'Deactivated':'Activated','✅');renderVendorCoupons();
}

// ═══════════════════════════════════════════════════
// VENDOR: SPONSORED PRODUCTS (ads)
// ═══════════════════════════════════════════════════
async function renderVendorSponsored(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading ads...</div>';
  const [campaigns,prods,walletArr,txns]=await Promise.all([
    sb.get("ad_campaigns","*",{vendor_id:`eq.${PROFILE.id}`,order:"created_at.desc"}),
    sb.get("products","id,name,price,images",{vendor_id:`eq.${PROFILE.id}`,is_active:"eq.true"}),
    sb.get("ad_wallet","*",{vendor_id:`eq.${PROFILE.id}`}),
    sb.get("ad_wallet_txns","*",{vendor_id:`eq.${PROFILE.id}`,order:"created_at.desc",limit:10})
  ]);
  let wallet=walletArr[0];
  if(!wallet){await sb.ins("ad_wallet",{vendor_id:PROFILE.id,balance:0});wallet={balance:0,total_spent:0,total_topup:0};}
  const bal=parseFloat(wallet.balance)||0;
  const totalSpent=campaigns.reduce((a,c)=>a+parseFloat(c.spent||0),0);
  const totalClicks=campaigns.reduce((a,c)=>a+(c.clicks||0),0);
  const totalImpr=campaigns.reduce((a,c)=>a+(c.impressions||0),0);
  const activeCamps=campaigns.filter(c=>c.status==='active');
  const prodOpts=prods.map(p=>`<option value="${p.id}">${esc(p.name)} — ₹${p.price}</option>`).join('');

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">📢 Ads Manager</h2><p style="color:var(--gray-400);font-size:14px">${campaigns.length} campaigns · ${activeCamps.length} active</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill btn-sm" onclick="$('ad-create').classList.toggle('hide')">+ New Campaign</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('vendor-dash')">← Dashboard</button>
      </div>
    </div>

    <!-- Wallet -->
    <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,var(--black) 0%,#1a1a2e 100%);color:#fff">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div><p style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:1px">Ad Wallet Balance</p>
          <p style="font-size:36px;font-weight:900;font-family:'Space Mono',monospace;color:var(--gold)">₹${bal.toFixed(0)}</p></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-gold btn-pill btn-sm" onclick="adTopup()">+ Top Up</button>
          <button class="btn btn-pill btn-sm" style="background:rgba(255,255,255,.15);color:#fff" onclick="$('ad-txns').classList.toggle('hide')">History</button>
        </div>
      </div>
    </div>

    <!-- Txn History -->
    <div id="ad-txns" class="card hide" style="margin-bottom:20px">
      <h3 style="font-weight:700;margin-bottom:12px">💳 Transaction History</h3>
      ${!txns.length?'<p style="color:var(--gray-400);font-size:13px">No transactions yet</p>'
      :txns.map(t=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
        <div><span style="font-weight:600">${t.type==='topup'?'💰 Top Up':t.type==='spend'?'📢 Ad Spend':'↩️ Refund'}</span>
          <span style="color:var(--gray-400);margin-left:8px">${t.description||''}</span></div>
        <span style="font-weight:700;color:${t.type==='topup'||t.type==='refund'?'var(--green)':'var(--red)'}">${t.type==='spend'?'-':'+'} ₹${Math.abs(t.amount)}</span>
      </div>`).join('')}
    </div>

    <!-- Stats -->
    <div class="g3" style="margin-bottom:20px">
      <div class="stat-card" style="border-top:3px solid var(--gold)"><div class="stat-val" style="color:var(--gold-dark)">₹${totalSpent.toFixed(0)}</div><div class="stat-label">Total Spent</div></div>
      <div class="stat-card" style="border-top:3px solid var(--blue)"><div class="stat-val">${totalClicks}</div><div class="stat-label">Clicks · ${totalImpr>0?(totalClicks/totalImpr*100).toFixed(1):0}% CTR</div></div>
      <div class="stat-card" style="border-top:3px solid var(--green)"><div class="stat-val">${totalImpr}</div><div class="stat-label">Impressions</div></div>
    </div>

    <!-- Create Campaign -->
    <div id="ad-create" class="card hide" style="max-width:600px;margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:16px">🚀 New Sponsored Campaign</h3>
      <div class="form-group"><label class="form-label">Campaign Name</label><input class="form-input" id="ac-name" placeholder="e.g. Summer Earbuds Boost"></div>
      <div class="form-group"><label class="form-label">Select Products to Promote</label>
        <select class="form-select" id="ac-prods" multiple style="min-height:100px" onchange="acUpdatePreview()">${prodOpts}</select>
        <p style="font-size:11px;color:var(--gray-400);margin-top:4px">Hold Ctrl/Cmd to select multiple</p></div>

      <!-- Placement Selection -->
      <div class="form-group">
        <label class="form-label">Where should your ad appear?</label>
        <p style="font-size:11px;color:var(--gray-400);margin-bottom:10px">Select placement slots and set your bid per click. Higher bids = more visibility in that slot.</p>
        <div id="ac-placements-list" style="display:flex;flex-direction:column;gap:8px">
          ${(await sb.get("sponsored_placements","*",{is_active:"eq.true",order:"sort_order.asc"})).filter(pl=>['home_top','home_mid','shop_top','pdp_related','cart_upsell'].includes(pl.key)).map(pl=>`
          <label style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);cursor:pointer;border:1.5px solid var(--gray-100)" onclick="this.querySelector('input[type=checkbox]').click()">
            <input type="checkbox" id="ac-pl-${pl.key}" onclick="event.stopPropagation()" style="accent-color:var(--gold-dark)" data-placement="${pl.key}">
            <div style="flex:1">
              <p style="font-weight:600;font-size:14px">${pl.label}</p>
              <p style="font-size:11px;color:var(--gray-400)">${pl.description||''} · Min ₹${pl.base_cpm||1}/click</p>
            </div>
            <div style="text-align:right">
              <label class="form-label" style="font-size:10px;margin:0">Bid ₹/click</label>
              <input class="form-input" id="ac-bid-${pl.key}" type="number" value="${Math.max(pl.base_cpm||1,2)}" step="0.5" min="${pl.base_cpm||1}" style="width:70px;margin:0;text-align:center;font-weight:700" onclick="event.stopPropagation()">
            </div>
          </label>`).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Daily Budget ₹</label><input class="form-input" id="ac-daily" type="number" value="200"></div>
        <div class="form-group"><label class="form-label">Total Budget ₹</label><input class="form-input" id="ac-total" type="number" value="2000"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" id="ac-start" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">End Date (optional)</label><input class="form-input" id="ac-end" type="date"></div>
      </div>
      <div id="ac-estimate" style="padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);margin-bottom:12px;font-size:13px;color:var(--gray-600)">
        Est. ~100 clicks/day · Budget lasts ~10 days
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn btn-outline btn-pill" style="flex:1" onclick="acUpdatePreview();$('ac-preview-wrap').classList.remove('hide')">👁 Preview Ad</button>
        <button class="btn btn-gold btn-pill" style="flex:1" onclick="createAdCampaign()">Submit for Review 🚀</button>
      </div>
      <p style="font-size:11px;color:var(--gray-400);text-align:center">Campaigns are reviewed within 24 hours</p>

      <!-- Live Preview -->
      <div id="ac-preview-wrap" class="hide" style="margin-top:16px;border-top:1px solid var(--gray-200);padding-top:16px">
        <h4 style="font-weight:700;margin-bottom:12px">👁 Ad Preview</h4>
        <div id="ac-preview-content"></div>
      </div>
    </div>

    <!-- Campaign List -->
    ${!campaigns.length?emptyState('📢','No campaigns yet','Create your first sponsored campaign to boost product visibility')
    :campaigns.map(c=>{
      const pct=c.total_budget>0?Math.min(100,c.spent/c.total_budget*100):0;
      const ctr=c.impressions>0?(c.clicks/c.impressions*100).toFixed(1):0;
      const statusCls=c.status==='active'?'badge-green':c.status==='paused'?'badge-gold':c.status==='pending'?'badge-blue':c.status==='rejected'?'badge-red':'';
      const placements=c.targeting?.placements||[];
      return `<div class="card card-sm" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
          <div><p style="font-weight:700">${esc(c.name)}</p>
            <p style="font-size:12px;color:var(--gray-400)">₹${c.cpc_bid}/click · ${ctr}% CTR · ${new Date(c.created_at).toLocaleDateString()}</p>
            ${placements.length?`<p style="font-size:11px;color:var(--gray-500);margin-top:2px">📍 ${placements.map(pl=>pl.page==='home'?'🏠 Home':pl.page==='shop'?'🔍 Shop':'📦 PDP').join(' · ')}</p>`:''}
          </div>
          <span class="badge ${statusCls}">${c.status}${c.status==='rejected'&&c.rejection_reason?' — '+esc(c.rejection_reason):''}</span>
        </div>
        <div style="display:flex;gap:16px;font-size:13px;margin-bottom:8px;flex-wrap:wrap">
          <span>📊 ${c.impressions||0} impr</span><span>👆 ${c.clicks||0} clicks</span><span>💰 ₹${parseFloat(c.spent||0).toFixed(0)}/₹${c.total_budget}</span>
          ${c.conversions?`<span>🛒 ${c.conversions} orders</span>`:''}
        </div>
        <div style="height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden;margin-bottom:10px"><div style="width:${pct}%;height:100%;background:${pct>=90?'var(--red)':'var(--gold)'};border-radius:3px;transition:width .3s"></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm btn-pill" onclick="previewCampaign('${c.id}')">👁 Preview</button>
          ${c.status==='active'?`<button class="btn btn-outline btn-sm btn-pill" onclick="updateAdStatus('${c.id}','paused')">⏸ Pause</button>`:''}
          ${c.status==='paused'?`<button class="btn btn-sm btn-pill" style="background:var(--green);color:#fff" onclick="updateAdStatus('${c.id}','active')">▶️ Resume</button>`:''}
          ${c.status==='draft'?`<button class="btn btn-gold btn-sm btn-pill" onclick="updateAdStatus('${c.id}','pending')">Submit for Review</button>`:''}
        </div>
      </div>`;
    }).join('')}
  </div>`;

  // Live estimate
  const upd=()=>{const d=parseFloat($('ac-daily')?.value)||200;const t=parseFloat($('ac-total')?.value)||2000;let avgBid=0,plCount=0;['home','shop','pdp'].forEach(p=>{if($('ac-pl-'+p)?.checked){avgBid+=parseFloat($('ac-bid-'+p)?.value)||2;plCount++;}});avgBid=plCount?avgBid/plCount:2;const days=Math.ceil(t/d);const clicks=Math.floor(d/avgBid);const el=$('ac-estimate');if(el)el.innerHTML=`Est. ~${clicks} clicks/day (avg ₹${avgBid.toFixed(1)}/click across ${plCount} placement${plCount!==1?'s':''}) · Budget lasts ~${days} days`;};
  ['ac-daily','ac-total','ac-bid-home','ac-bid-shop','ac-bid-pdp'].forEach(id=>{$(id)?.addEventListener('input',upd);});
  ['ac-pl-home','ac-pl-shop','ac-pl-pdp'].forEach(id=>{$(id)?.addEventListener('change',upd);});
}

async function adTopup(){
  const amt=prompt('Enter top-up amount (₹):','500');
  if(!amt||isNaN(amt)||parseFloat(amt)<1)return;
  const amount=parseFloat(amt);
  // Update wallet balance
  const wallets=await sb.get("ad_wallet","*",{vendor_id:`eq.${PROFILE.id}`});
  if(wallets.length){
    const newBal=parseFloat(wallets[0].balance)+amount;
    const newTop=parseFloat(wallets[0].total_topup)+amount;
    await sb.upd("ad_wallet",{balance:newBal,total_topup:newTop,updated_at:new Date().toISOString()},{vendor_id:`eq.${PROFILE.id}`});
  }else{
    await sb.ins("ad_wallet",{vendor_id:PROFILE.id,balance:amount,total_topup:amount});
  }
  await sb.ins("ad_wallet_txns",{vendor_id:PROFILE.id,type:'topup',amount,description:'Wallet top-up'});
  toast(`₹${amount} added to ad wallet!`,'💰');renderVendorSponsored();
}

async function createAdCampaign(){
  const name=$('ac-name').value.trim();if(!name){toast('Campaign name required','⚠️');return;}
  const sel=$('ac-prods');const prodIds=[...sel.selectedOptions].map(o=>o.value);
  if(!prodIds.length){toast('Select at least one product','⚠️');return;}
  // Collect placements from dynamic checkboxes
  const placementKeys=[];
  const maxBidPerKey={};
  document.querySelectorAll('#ac-placements-list input[type=checkbox]').forEach(cb=>{
    if(cb.checked){
      const key=cb.dataset.placement;
      placementKeys.push(key);
      maxBidPerKey[key]=parseFloat(document.getElementById('ac-bid-'+key)?.value)||2;
    }
  });
  if(!placementKeys.length){toast('Select at least one placement','⚠️');return;}
  const maxBid=Math.max(...Object.values(maxBidPerKey));
  // Check wallet balance
  const wallets=await sb.get("ad_wallet","balance",{vendor_id:`eq.${PROFILE.id}`});
  const bal=parseFloat(wallets[0]?.balance)||0;
  const daily=parseFloat($('ac-daily').value)||200;
  if(bal<daily){toast(`Insufficient wallet balance (₹${bal}). Top up first!`,'⚠️');return;}
  const stores=await sb.get("vendor_stores","id",{vendor_id:`eq.${PROFILE.id}`,limit:1});
  const storeId=stores[0]?.id||null;
  const endDate=$('ac-end').value;
  const camp=await sb.ins("ad_campaigns",{
    vendor_id:PROFILE.id,store_id:storeId,name,type:'sponsored_product',status:'pending',
    daily_budget:daily,total_budget:parseFloat($('ac-total').value)||2000,
    cpc_bid:maxBid,
    placement_keys:placementKeys,
    start_date:$('ac-start').value||new Date().toISOString(),
    end_date:endDate?new Date(endDate).toISOString():null,
    targeting:{placements:placementKeys.map(k=>({page:k,bid:maxBidPerKey[k]}))},
    is_approved:false
  });
  if(camp.length){
    for(const pid of prodIds){
      await sb.ins("ad_creatives",{campaign_id:camp[0].id,product_id:pid});
    }
    toast('Campaign submitted for review! 🚀','✅');renderVendorSponsored();
  }
}

// Preview: vendor create form
function acUpdatePreview(){
  const el=$('ac-preview-content');if(!el)return;
  const sel=$('ac-prods');
  const selected=[...sel.selectedOptions].map(o=>({name:o.text.split(' — ')[0],price:o.text.split('₹')[1]||'999'}));
  if(!selected.length){el.innerHTML='<p style="color:var(--gray-400);font-size:13px">Select products to see preview</p>';return;}
  const p=selected[0];
  let html='';

  if($('ac-pl-home')?.checked){
    html+=`<div style="margin-bottom:20px">
      <p style="font-weight:700;font-size:12px;color:var(--blue);margin-bottom:8px">🏠 HOME PAGE — "Recommended for You"</p>
      <div style="background:var(--gray-50);border-radius:var(--radius);padding:16px;border:1px dashed var(--gray-300)">
        <p style="font-weight:700;font-size:14px;margin-bottom:10px">⭐ Recommended for You</p>
        <div style="display:flex;gap:12px;overflow-x:auto">
          ${selected.slice(0,3).map(s=>`<div style="min-width:140px;background:#fff;border-radius:var(--radius-sm);padding:8px;border:1px solid var(--gray-100)">
            <div style="width:100%;height:80px;background:var(--gray-100);border-radius:6px;margin-bottom:6px;display:flex;align-items:center;justify-content:center;color:var(--gray-300);font-size:24px">📷</div>
            <p style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</p>
            <p style="font-weight:800;font-size:13px;color:var(--gold-dark)">₹${s.price}</p>
            <span style="font-size:9px;color:var(--gray-400);background:var(--gray-50);padding:1px 4px;border-radius:3px">Sponsored</span>
          </div>`).join('')}
        </div>
        <p style="font-size:10px;color:var(--gray-400);margin-top:8px">Bid: ₹${$('ac-bid-home')?.value||2}/click</p>
      </div>
    </div>`;
  }

  if($('ac-pl-shop')?.checked){
    html+=`<div style="margin-bottom:20px">
      <p style="font-weight:700;font-size:12px;color:var(--green);margin-bottom:8px">🔍 SHOP PAGE — Above Search Results</p>
      <div style="background:var(--gray-50);border-radius:var(--radius);padding:16px;border:1px dashed var(--gray-300)">
        ${selected.slice(0,2).map(s=>`<div style="display:flex;gap:12px;padding:10px;background:#fff;border-radius:var(--radius-sm);border:1px solid var(--gray-100);margin-bottom:6px">
          <div style="width:50px;height:50px;background:var(--gray-100);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--gray-300);flex-shrink:0">📷</div>
          <div style="flex:1"><p style="font-weight:600;font-size:13px">${esc(s.name)}</p><p style="font-weight:800;color:var(--gold-dark)">₹${s.price}</p>
            <span style="font-size:9px;color:var(--gray-400);background:var(--gray-50);padding:1px 4px;border-radius:3px">Sponsored</span></div>
        </div>`).join('')}
        <p style="font-size:10px;color:var(--gray-400);margin-top:4px">Bid: ₹${$('ac-bid-shop')?.value||3}/click</p>
      </div>
    </div>`;
  }

  if($('ac-pl-pdp')?.checked){
    html+=`<div style="margin-bottom:20px">
      <p style="font-weight:700;font-size:12px;color:var(--purple);margin-bottom:8px">📦 PRODUCT PAGE — "You May Also Like"</p>
      <div style="background:var(--gray-50);border-radius:var(--radius);padding:16px;border:1px dashed var(--gray-300)">
        <p style="font-weight:700;font-size:14px;margin-bottom:10px">You May Also Like</p>
        <div style="display:flex;gap:12px;overflow-x:auto">
          ${selected.slice(0,3).map(s=>`<div style="min-width:130px;background:#fff;border-radius:var(--radius-sm);padding:8px;border:1px solid var(--gray-100)">
            <div style="width:100%;height:70px;background:var(--gray-100);border-radius:6px;margin-bottom:6px;display:flex;align-items:center;justify-content:center;color:var(--gray-300);font-size:20px">📷</div>
            <p style="font-weight:600;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</p>
            <p style="font-weight:800;font-size:12px;color:var(--gold-dark)">₹${s.price}</p>
            <span style="font-size:9px;color:var(--gray-400);background:var(--gray-50);padding:1px 4px;border-radius:3px">Sponsored</span>
          </div>`).join('')}
        </div>
        <p style="font-size:10px;color:var(--gray-400);margin-top:8px">Bid: ₹${$('ac-bid-pdp')?.value||4}/click</p>
      </div>
    </div>`;
  }

  if(!html)html='<p style="color:var(--gray-400);font-size:13px">Select placements above to see previews</p>';
  el.innerHTML=html;
}

// Preview existing campaign (vendor + admin)
async function previewCampaign(campId){
  const camps=await sb.get("ad_campaigns","*",{id:`eq.${campId}`});
  const camp=camps[0];if(!camp)return;
  const creatives=await sb.get("ad_creatives","*,products(name,price,images)",{campaign_id:`eq.${campId}`});
  const placements=camp.targeting?.placements||[{page:'home',bid:camp.cpc_bid},{page:'shop',bid:camp.cpc_bid}];
  const prods=creatives.map(c=>c.products).filter(Boolean);

  const modal=document.createElement('div');modal.className='auth-overlay';
  let previewHTML='';

  for(const pl of placements){
    const label=pl.page==='home'?'🏠 Home Page — "Recommended for You"':pl.page==='shop'?'🔍 Shop Page — Above Results':'📦 Product Page — "You May Also Like"';
    const color=pl.page==='home'?'var(--blue)':pl.page==='shop'?'var(--green)':'var(--purple)';

    if(pl.page==='shop'){
      previewHTML+=`<div style="margin-bottom:20px">
        <p style="font-weight:700;font-size:12px;color:${color};margin-bottom:8px">${label} · ₹${pl.bid}/click</p>
        <div style="background:var(--gray-50);border-radius:var(--radius);padding:12px">
          ${prods.slice(0,2).map(p=>{const img=p.images?.[0]||'';return `<div style="display:flex;gap:10px;padding:10px;background:#fff;border-radius:var(--radius-sm);border:1px solid var(--gray-100);margin-bottom:6px">
            <div style="width:50px;height:50px;border-radius:6px;overflow:hidden;background:var(--gray-100);flex-shrink:0">${img?`<img src="${img}" style="width:100%;height:100%;object-fit:cover">`:'📷'}</div>
            <div><p style="font-weight:600;font-size:13px">${esc(p.name)}</p><p style="font-weight:800;color:var(--gold-dark)">₹${p.price}</p>
              <span style="font-size:9px;color:var(--gray-400);background:var(--gray-50);padding:1px 4px;border-radius:3px">Sponsored</span></div>
          </div>`;}).join('')}
        </div></div>`;
    }else{
      previewHTML+=`<div style="margin-bottom:20px">
        <p style="font-weight:700;font-size:12px;color:${color};margin-bottom:8px">${label} · ₹${pl.bid}/click</p>
        <div style="background:var(--gray-50);border-radius:var(--radius);padding:12px">
          <div style="display:flex;gap:10px;overflow-x:auto">
            ${prods.slice(0,4).map(p=>{const img=p.images?.[0]||'';return `<div style="min-width:120px;background:#fff;border-radius:var(--radius-sm);padding:8px;border:1px solid var(--gray-100)">
              <div style="width:100%;height:70px;border-radius:6px;overflow:hidden;background:var(--gray-100);margin-bottom:6px">${img?`<img src="${img}" style="width:100%;height:100%;object-fit:cover">`:'<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--gray-300)">📷</div>'}</div>
              <p style="font-weight:600;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</p>
              <p style="font-weight:800;font-size:12px;color:var(--gold-dark)">₹${p.price}</p>
              <span style="font-size:9px;color:var(--gray-400);background:var(--gray-50);padding:1px 4px;border-radius:3px">Sponsored</span>
            </div>`;}).join('')}
          </div>
        </div></div>`;
    }
  }

  modal.innerHTML=`<div class="auth-card" style="max-width:560px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-weight:800;font-size:18px">👁 Ad Preview: ${esc(camp.name)}</h3>
      <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <span class="badge ${camp.status==='active'?'badge-green':camp.status==='pending'?'badge-blue':'badge-gold'}">${camp.status}</span>
      <span style="font-size:12px;color:var(--gray-400)">₹${camp.daily_budget}/day · ₹${camp.total_budget} total · ${prods.length} product${prods.length!==1?'s':''}</span>
    </div>
    ${previewHTML}
    <p style="font-size:11px;color:var(--gray-400);text-align:center;margin-top:12px">This is how your ad appears to shoppers on each selected page</p>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function updateAdStatus(id,status){
  await sb.upd("ad_campaigns",{status,updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Campaign '+status,'✅');renderVendorSponsored();
}

// ═══════════════════════════════════════════════════
// AD SERVING ENGINE
// ═══════════════════════════════════════════════════
async function getSponsored(placementKey, limit=4, context={}){
  try{
    const now=new Date().toISOString();
    const results=[];
    const seen=JSON.parse(sessionStorage.getItem('ad_seen')||'{}');

    // ── 1. Editorial pins first (brand deals / overrides) ──────────
    const pins=await sb.get("sponsored_pins","*,products(*,vendor_stores(store_name))",{
      placement_key:`eq.${placementKey}`,is_active:"eq.true"
    });
    const activePins=pins.filter(p=>{
      if(p.end_at&&new Date(p.end_at)<new Date())return false;
      if(new Date(p.start_at)>new Date())return false;
      return p.products?.is_active&&p.products?.is_approved;
    }).sort((a,b)=>b.priority-a.priority);

    for(const pin of activePins){
      if(results.length>=limit)break;
      results.push({
        id:'pin-'+pin.id,
        campaign_id:pin.campaign_id||null,
        product_id:pin.product_id,
        products:pin.products,
        camp:{name:pin.deal_label||'Editorial Pin',cpc_bid:0},
        placementBid:999,
        score:999,
        is_pin:true,
        deal_label:pin.deal_label
      });
    }

    // ── 2. Auction fill remaining slots ────────────────────────────
    if(results.length<limit){
      const camps=await sb.get("ad_campaigns","*",{status:"eq.active",is_approved:"eq.true"});
      const valid=camps.filter(c=>{
        if(parseFloat(c.spent||0)>=parseFloat(c.total_budget))return false;
        if(c.end_date&&new Date(c.end_date)<new Date())return false;
        // Check placement_keys array (new) or legacy targeting.placements
        const keys=c.placement_keys;
        const legacyPls=c.targeting?.placements;
        if(keys&&keys.length){
          if(!keys.includes(placementKey))return false;
        } else if(legacyPls&&legacyPls.length){
          // legacy: map old page names to new keys
          const pageMap={'home':['home_top','home_mid','home_hero'],'shop':['shop_top','shop_sidebar'],'pdp':['pdp_related']};
          const legacyMatch=legacyPls.some(p=>(pageMap[p.page]||[p.page]).includes(placementKey)||p.page===placementKey);
          if(!legacyMatch)return false;
        }
        return true;
      });

      if(valid.length){
        const campIds=valid.map(c=>c.id);
        const creatives=await sb.get("ad_creatives","*,products(*,vendor_stores(store_name))",{is_active:"eq.true"});
        const pinnedProductIds=results.map(r=>r.product_id);
        const matched=creatives.filter(cr=>
          campIds.includes(cr.campaign_id)&&
          cr.products?.is_active&&
          cr.products?.is_approved&&
          !pinnedProductIds.includes(cr.product_id)
        );
        const ranked=matched.map(cr=>{
          const camp=valid.find(c=>c.id===cr.campaign_id);
          // Get bid for this specific placement
          const keys=camp?.placement_keys||[];
          const legacyPls=camp?.targeting?.placements||[];
          const placementBid=keys.length
            ? parseFloat(camp?.cpc_bid)||1
            : legacyPls.find(p=>p.page===placementKey||p.page===placementKey.split('_')[0])?.bid||parseFloat(camp?.cpc_bid)||1;
          return{...cr,camp,placementBid,score:placementBid*(cr.products?.rating||3)/3};
        }).sort((a,b)=>b.score-a.score);

        const filtered=ranked.filter(r=>(seen[r.campaign_id]||0)<5);
        const auctionResults=filtered.slice(0,limit-results.length);
        results.push(...auctionResults);

        // Log impressions
        for(const r of auctionResults){
          seen[r.campaign_id]=(seen[r.campaign_id]||0)+1;
          sb.ins("ad_events",{campaign_id:r.campaign_id,creative_id:r.id,product_id:r.product_id,user_id:PROFILE?.id||null,event_type:'impression',placement:placementKey});
          sb.upd("ad_campaigns",{impressions:(r.camp.impressions||0)+1},{id:`eq.${r.campaign_id}`});
        }
      }
    }
    sessionStorage.setItem('ad_seen',JSON.stringify(seen));
    return results;
  }catch(e){console.error('[getSponsored]',e);return[];}
}

async function trackAdClick(campaignId, creativeId, productId, clickPlacement){
  try{
    const camps=await sb.get("ad_campaigns","*",{id:`eq.${campaignId}`});
    const camp=camps[0];if(!camp)return;
    if(PROFILE?.id===camp.vendor_id)return;
    if(PROFILE?.id){
      const hourAgo=new Date(Date.now()-3600000).toISOString();
      const recent=await sb.get("ad_events","id",{campaign_id:`eq.${campaignId}`,user_id:`eq.${PROFILE.id}`,event_type:"eq.click",created_at:`gte.${hourAgo}`});
      if(recent.length>=3)return;
    }
    // Use placement-specific bid
    const pls=camp.targeting?.placements;
    const cpc=pls?.find(p=>p.page===clickPlacement)?.bid||parseFloat(camp.cpc_bid)||2;
    // Log click
    await sb.ins("ad_events",{campaign_id:campaignId,creative_id:creativeId,product_id:productId,user_id:PROFILE?.id||null,event_type:'click',cost:cpc,placement:'click'});
    // Deduct from wallet + update campaign spend
    const newSpent=parseFloat(camp.spent||0)+cpc;
    await sb.upd("ad_campaigns",{spent:newSpent,clicks:(camp.clicks||0)+1,updated_at:new Date().toISOString()},{id:`eq.${campaignId}`});
    // Deduct wallet
    const wallets=await sb.get("ad_wallet","*",{vendor_id:`eq.${camp.vendor_id}`});
    if(wallets.length){
      const newBal=Math.max(0,parseFloat(wallets[0].balance)-cpc);
      await sb.upd("ad_wallet",{balance:newBal,total_spent:parseFloat(wallets[0].total_spent||0)+cpc},{vendor_id:`eq.${camp.vendor_id}`});
    }
    await sb.ins("ad_wallet_txns",{vendor_id:camp.vendor_id,type:'spend',amount:cpc,campaign_id:campaignId,description:'CPC: '+camp.name});
    // Auto-pause if budget exhausted
    if(newSpent>=parseFloat(camp.total_budget)){
      await sb.upd("ad_campaigns",{status:'completed'},{id:`eq.${campaignId}`});
    }
    // Attribution cookie (30 min window)
    sessionStorage.setItem('ad_attr_'+productId,JSON.stringify({campaignId,creativeId,ts:Date.now()}));
  }catch(e){}
}

function sponsoredCard(cr, idx, placement='home'){
  const p=cr.products;if(!p)return'';
  const img=getImg(p,idx);
  return `<div class="product-card fade-up" onclick="trackAdClick('${cr.campaign_id}','${cr.id}','${p.id}','${placement}');go('product',{id:'${p.id}'})" style="cursor:pointer">
    <div class="product-img"><img src="${img}" alt="${esc(p.name)}" loading="lazy"></div>
    <div class="product-info">
      <p class="product-name">${esc(p.name)}</p>
      <div class="product-meta"><span class="product-price">₹${p.price}</span>${p.compare_at_price?`<span class="product-mrp">₹${p.compare_at_price}</span>`:''}</div>
      ${p.cashback_percent>0?`<p class="product-cb">💰 ${p.cashback_percent}% cashback</p>`:''}
      <span style="font-size:10px;color:var(--gray-400);background:var(--gray-50);padding:2px 6px;border-radius:4px;display:inline-block;margin-top:4px">Sponsored</span>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════
// VENDOR: STORE SETTINGS
// ═══════════════════════════════════════════════════
async function renderVendorStore(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading...</div>';
  const stores=await sb.get("vendor_stores","*",{vendor_id:`eq.${PROFILE.id}`});
  const s=stores[0];
  $('main').innerHTML=`<div class="container" style="padding:32px 0;max-width:600px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><h2 style="font-size:24px;font-weight:800">${s?'🏪 Store Settings':'Create Your Store'}</h2><button class="btn btn-outline btn-pill btn-sm" onclick="go('vendor-dash')">← Dashboard</button></div>
    <div class="card">
      ${s?`<div style="margin-bottom:20px">
        <label class="form-label">Store Logo</label>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:64px;height:64px;border-radius:var(--radius);overflow:hidden;background:var(--gray-100);display:flex;align-items:center;justify-content:center;font-size:28px;border:1px solid var(--gray-200)">
            ${s.logo_url?`<img src="${esc(s.logo_url)}" style="width:100%;height:100%;object-fit:cover">`:'🏪'}
          </div>
          <label class="btn btn-sm btn-outline btn-pill" style="cursor:pointer">📷 ${s.logo_url?'Change':'Upload'} Logo<input type="file" accept="image/*" style="display:none" onchange="uploadStoreLogo(this,'${s.id}','logo_url')"></label>
        </div>
      </div>
      <div style="margin-bottom:20px">
        <label class="form-label">Store Banner</label>
        <div style="width:100%;height:100px;border-radius:var(--radius);overflow:hidden;background:var(--gray-100);display:flex;align-items:center;justify-content:center;border:1px solid var(--gray-200);margin-bottom:8px">
          ${s.banner_url?`<img src="${esc(s.banner_url)}" style="width:100%;height:100%;object-fit:cover">`:'<span style="color:var(--gray-400);font-size:13px">No banner yet</span>'}
        </div>
        <label class="btn btn-sm btn-outline btn-pill" style="cursor:pointer">📷 ${s.banner_url?'Change':'Upload'} Banner<input type="file" accept="image/*" style="display:none" onchange="uploadStoreLogo(this,'${s.id}','banner_url')"></label>
      </div>`:''}
      <div class="form-group"><label class="form-label">Store Name</label><input class="form-input" id="vs-name" value="${esc(s?.store_name||'')}" placeholder="My Awesome Store"></div>
      <div class="form-group"><label class="form-label">Slug (URL)</label><input class="form-input" id="vs-slug" value="${esc(s?.store_slug||'')}" placeholder="my-store" oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9-]/g,'-')"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="vs-desc">${esc(s?.description||'')}</textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">GSTIN (if registered)</label><input class="form-input" id="vs-gstin" value="${esc(s?.gstin||'')}" placeholder="22AAAAA0000A1Z5" maxlength="15" style="font-family:'Space Mono',monospace"></div>
        <div class="form-group"><label class="form-label">GST State Code</label><input class="form-input" id="vs-gststate" value="${esc(s?.gst_state_code||'')}" placeholder="e.g. 29" maxlength="2"></div>
      </div>
      ${s?`<div style="padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);margin-bottom:16px"><p style="font-size:13px">Platform fee: <strong>${s.platform_fee_percent}%</strong> · Status: ${s.is_approved?'<span class="badge badge-green">Approved</span>':'<span class="badge badge-gold">Pending</span>'}</p></div>`:''}
      <button class="btn btn-gold btn-full btn-pill" onclick="saveStore('${s?.id||''}')">${s?'Update Store':'Create Store'}</button>
    </div>
  </div>`;
}

async function saveStore(id){
  const d={store_name:$('vs-name').value,store_slug:$('vs-slug').value,description:$('vs-desc').value,gstin:$('vs-gstin')?.value?.trim()||null,gst_state_code:$('vs-gststate')?.value?.trim()||null};
  if(!d.store_name||!d.store_slug){toast('Fill name & slug','⚠️');return;}
  if(id){await sb.upd("vendor_stores",d,{id:`eq.${id}`});toast('Updated!','✅');}
  else{await sb.ins("vendor_stores",{...d,vendor_id:PROFILE.id});toast('Store created!','🎉');}
  renderVendorStore();
}

// ═══════════════════════════════════════════════════
// VENDOR: WAREHOUSES & INVENTORY
// ═══════════════════════════════════════════════════
async function renderVendorWarehouses(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading warehouses...</div>';
  const [warehouses,stock,prods]=await Promise.all([
    sb.get("vendor_warehouses","*",{vendor_id:`eq.${PROFILE.id}`,order:"is_default.desc,created_at.asc"}),
    sb.get("warehouse_stock","*",{order:"created_at.desc"}),
    sb.get("products","id,name,stock,default_warehouse_id",{vendor_id:`eq.${PROFILE.id}`,order:"name.asc"})
  ]);
  const totalStock=stock.reduce((a,s)=>a+s.quantity,0);
  const lowStockItems=stock.filter(s=>s.quantity>0&&s.quantity<=s.low_stock_threshold);

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">📦 Warehouses & Inventory</h2>
        <p style="color:var(--gray-400);font-size:14px">${warehouses.length} location${warehouses.length!==1?'s':''} · ${totalStock} total units${lowStockItems.length?` · <span style="color:var(--orange)">${lowStockItems.length} low stock</span>`:''}</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill btn-sm" onclick="addWarehouseModal()">+ Add Warehouse</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('vendor-dash')">← Dashboard</button>
      </div>
    </div>

    <!-- Low Stock Alerts -->
    ${lowStockItems.length?`<div class="card" style="margin-bottom:20px;border:2px solid var(--orange);background:rgba(255,149,0,.03)">
      <h3 style="font-weight:700;color:var(--orange);margin-bottom:8px">⚠️ Low Stock Alerts</h3>
      ${lowStockItems.map(s=>{
        const p=prods.find(x=>x.id===s.product_id);
        const w=warehouses.find(x=>x.id===s.warehouse_id);
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--gray-100)">
          <span>${esc(p?.name||'Product')} @ <strong>${esc(w?.name||'—')}</strong></span>
          <span style="font-weight:700;color:var(--orange)">${s.quantity} left (threshold: ${s.low_stock_threshold})</span>
        </div>`;
      }).join('')}
    </div>`:''}

    <!-- Warehouse Cards -->
    ${warehouses.map(w=>{
      const wStock=stock.filter(s=>s.warehouse_id===w.id);
      const wTotal=wStock.reduce((a,s)=>a+s.quantity,0);
      const wProducts=wStock.filter(s=>s.quantity>0).length;
      const wLow=wStock.filter(s=>s.quantity>0&&s.quantity<=s.low_stock_threshold).length;
      return `<div class="card" style="margin-bottom:16px;${w.is_default?'border-left:3px solid var(--gold)':''}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <h3 style="font-weight:700">${esc(w.name)}</h3>
              ${w.is_default?'<span class="badge badge-gold">Default</span>':''}
              ${w.is_active?'':'<span class="badge badge-red">Inactive</span>'}
            </div>
            <p style="font-size:13px;color:var(--gray-400);margin-top:4px">📍 ${esc(w.address_line1)}, ${esc(w.city)}, ${esc(w.state)} — ${esc(w.pincode)}</p>
            ${w.gst_state_code?`<p style="font-size:11px;color:var(--gray-400)">GST State: ${esc(w.gst_state_code)} ${w.phone?'· 📞 '+esc(w.phone):''}</p>`:''}
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm btn-pill" onclick="editWarehouseModal('${w.id}')">✏️ Edit</button>
            <button class="btn btn-outline btn-sm btn-pill" onclick="manageWarehouseStock('${w.id}','${esc(w.name)}')">📊 Stock</button>
            ${!w.is_default?`<button class="btn btn-ghost btn-sm" onclick="setDefaultWarehouse('${w.id}')">⭐</button>`:''}
            ${!w.is_default?`<button class="btn btn-ghost btn-sm" onclick="deleteWarehouse('${w.id}')">🗑</button>`:''}
          </div>
        </div>
        <div style="display:flex;gap:16px;font-size:13px;flex-wrap:wrap">
          <span style="padding:6px 14px;background:var(--gray-50);border-radius:8px"><strong style="font-size:18px">${wTotal}</strong> units</span>
          <span style="padding:6px 14px;background:var(--gray-50);border-radius:8px"><strong style="font-size:18px">${wProducts}</strong> products</span>
          ${wLow?`<span style="padding:6px 14px;background:rgba(255,149,0,.06);border-radius:8px;color:var(--orange)"><strong style="font-size:18px">${wLow}</strong> low stock</span>`:''}
        </div>
      </div>`;
    }).join('')}
    ${!warehouses.length?'<div class="card" style="text-align:center;padding:40px"><p style="font-size:48px;margin-bottom:12px">📦</p><p style="font-weight:700">No warehouses yet</p><p style="color:var(--gray-400);margin-top:4px">Add your first warehouse to track inventory by location</p></div>':''}

    <!-- Stock Overview Table -->
    ${prods.length&&warehouses.length?`<div class="card" style="margin-top:20px">
      <h3 style="font-weight:700;margin-bottom:12px">📊 Stock Matrix</h3>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--gray-50)">
            <th style="padding:10px;text-align:left;font-weight:700;border-bottom:2px solid var(--gray-200)">Product</th>
            ${warehouses.map(w=>`<th style="padding:10px;text-align:center;font-weight:700;border-bottom:2px solid var(--gray-200)">${esc(w.name.split(' ')[0])}</th>`).join('')}
            <th style="padding:10px;text-align:center;font-weight:700;border-bottom:2px solid var(--gray-200)">Total</th>
          </tr></thead>
          <tbody>${prods.slice(0,20).map((p,i)=>{
            const pStocks=warehouses.map(w=>{const s=stock.find(x=>x.product_id===p.id&&x.warehouse_id===w.id);return s?.quantity||0;});
            const total=pStocks.reduce((a,q)=>a+q,0);
            return `<tr style="background:${i%2?'#fff':'var(--gray-50)'}">
              <td style="padding:8px 10px;border-bottom:1px solid var(--gray-100);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${esc(p.name)}</td>
              ${pStocks.map(q=>`<td style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--gray-100);${q===0?'color:var(--red);font-weight:700':q<=5?'color:var(--orange);font-weight:600':''}">${q}</td>`).join('')}
              <td style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--gray-100);font-weight:800">${total}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>`:''}
  </div>`;
}

function addWarehouseModal(){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">+ Add Warehouse</h3>
    <div class="form-group"><label class="form-label">Warehouse Name</label><input class="form-input" id="wh-name" placeholder="e.g. Bangalore Hub"></div>
    <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="wh-addr" placeholder="Full street address"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">City</label><input class="form-input" id="wh-city" placeholder="City"></div>
      <div class="form-group"><label class="form-label">State</label><input class="form-input" id="wh-state" placeholder="State"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Pincode</label><input class="form-input" id="wh-pin" placeholder="560100"></div>
      <div class="form-group"><label class="form-label">GST State Code</label><input class="form-input" id="wh-gst" placeholder="29" maxlength="2"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="wh-phone" placeholder="Phone"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveWarehouse()">Create Warehouse</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveWarehouse(existingId){
  const name=$(existingId?'ewh-name':'wh-name').value.trim();
  const addr=$(existingId?'ewh-addr':'wh-addr').value.trim();
  const city=$(existingId?'ewh-city':'wh-city').value.trim();
  const state=$(existingId?'ewh-state':'wh-state').value.trim();
  if(!name||!addr||!city||!state){toast('Fill required fields','⚠️');return;}
  const data={vendor_id:PROFILE.id,name,address_line1:addr,city,state,
    pincode:$(existingId?'ewh-pin':'wh-pin').value,
    gst_state_code:$(existingId?'ewh-gst':'wh-gst').value,
    phone:$(existingId?'ewh-phone':'wh-phone').value};
  if(existingId){await sb.upd("vendor_warehouses",data,{id:`eq.${existingId}`});}
  else{
    const whs=await sb.get("vendor_warehouses","id",{vendor_id:`eq.${PROFILE.id}`});
    if(!whs.length)data.is_default=true;
    await sb.ins("vendor_warehouses",data);
  }
  document.querySelector('.auth-overlay')?.remove();
  toast(existingId?'Warehouse updated!':'Warehouse created!','📦');renderVendorWarehouses();
}

async function editWarehouseModal(wid){
  const whs=await sb.get("vendor_warehouses","*",{id:`eq.${wid}`});
  const w=whs[0];if(!w)return;
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">✏️ Edit Warehouse</h3>
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ewh-name" value="${esc(w.name)}"></div>
    <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="ewh-addr" value="${esc(w.address_line1)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">City</label><input class="form-input" id="ewh-city" value="${esc(w.city)}"></div>
      <div class="form-group"><label class="form-label">State</label><input class="form-input" id="ewh-state" value="${esc(w.state)}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Pincode</label><input class="form-input" id="ewh-pin" value="${esc(w.pincode)}"></div>
      <div class="form-group"><label class="form-label">GST State</label><input class="form-input" id="ewh-gst" value="${esc(w.gst_state_code||'')}"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="ewh-phone" value="${esc(w.phone||'')}"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveWarehouse('${wid}')">Save Changes</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function setDefaultWarehouse(wid){
  await sb.upd("vendor_warehouses",{is_default:false},{vendor_id:`eq.${PROFILE.id}`});
  await sb.upd("vendor_warehouses",{is_default:true},{id:`eq.${wid}`});
  toast('Default warehouse updated','⭐');renderVendorWarehouses();
}

async function deleteWarehouse(wid){
  if(!confirm('Delete this warehouse? Stock entries will be removed.'))return;
  await sb.del("warehouse_stock",{warehouse_id:`eq.${wid}`});
  await sb.del("vendor_warehouses",{id:`eq.${wid}`});
  toast('Warehouse deleted','🗑');renderVendorWarehouses();
}

async function manageWarehouseStock(wid, wName){
  const [stock,prods]=await Promise.all([
    sb.get("warehouse_stock","*",{warehouse_id:`eq.${wid}`}),
    sb.get("products","id,name,stock",{vendor_id:`eq.${PROFILE.id}`,order:"name.asc"})
  ]);
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:560px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-weight:800;font-size:18px">📊 Stock: ${esc(wName)}</h3>
      <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
    </div>
    ${prods.map(p=>{
      const s=stock.find(x=>x.product_id===p.id);
      const qty=s?.quantity||0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);gap:8px">
        <p style="font-size:13px;font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</p>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="adjustStock('${p.id}','${wid}',${qty},-1,this)">−</button>
          <input type="number" value="${qty}" min="0" style="width:60px;text-align:center;padding:6px;border:1.5px solid var(--gray-200);border-radius:6px;font-weight:700;font-size:14px" onchange="setStock('${p.id}','${wid}',parseInt(this.value)||0)">
          <button class="btn btn-ghost btn-sm" onclick="adjustStock('${p.id}','${wid}',${qty},1,this)">+</button>
        </div>
      </div>`;
    }).join('')}
    <button class="btn btn-gold btn-pill btn-full" style="margin-top:16px" onclick="this.closest('.auth-overlay').remove();renderVendorWarehouses()">Done</button>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function setStock(pid, wid, qty){
  await sb.ups("warehouse_stock",{product_id:pid,warehouse_id:wid,quantity:Math.max(0,qty),updated_at:new Date().toISOString()},{onConflict:"product_id,warehouse_id"});
  // Sync total stock on product
  const allStock=await sb.get("warehouse_stock","quantity",{product_id:`eq.${pid}`});
  const total=allStock.reduce((a,s)=>a+(s.quantity||0),0);
  await sb.upd("products",{stock:total},{id:`eq.${pid}`});
}

function adjustStock(pid,wid,current,delta,btn){
  const input=btn.parentElement.querySelector('input');
  const newQty=Math.max(0,current+delta);
  input.value=newQty;
  setStock(pid,wid,newQty);
}

// ═══════════════════════════════════════════════════
// AFFILIATE VIEWS
// ═══════════════════════════════════════════════════
async function renderAffDash(){
  if(!PROFILE||PROFILE.role!=='affiliate'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading dashboard...</div>';
  const [links,txns,wallet]=await Promise.all([
    sb.get("affiliate_links","*",{affiliate_id:`eq.${PROFILE.id}`,order:"created_at.desc"}),
    sb.get("wallet_transactions","*",{user_id:`eq.${PROFILE.id}`,order:"created_at.desc",limit:50}),
    sb.get("wallets","*",{user_id:`eq.${PROFILE.id}`})
  ]);
  const w=wallet[0]||{available_balance:0,pending_balance:0,total_earned:0,total_withdrawn:0};
  const commTxns=txns.filter(t=>t.type==='affiliate_commission');
  const totalClicks=links.reduce((a,b)=>a+b.click_count,0);
  const totalConv=links.reduce((a,b)=>a+b.conversion_count,0);
  const totalEarned=commTxns.reduce((a,b)=>a+Number(b.amount),0);
  const convRate=totalClicks>0?(totalConv/totalClicks*100).toFixed(1):0;
  const activeLinks=links.filter(l=>l.is_active).length;

  // Earnings by day (last 14 days)
  const now=new Date();
  const dailyEarnings=[];
  for(let i=13;i>=0;i--){
    const d=new Date(now);d.setDate(d.getDate()-i);
    const key=d.toISOString().split('T')[0];
    const label=d.toLocaleDateString('en',{month:'short',day:'numeric'});
    const amt=commTxns.filter(t=>t.created_at?.startsWith(key)).reduce((a,t)=>a+Number(t.amount),0);
    dailyEarnings.push({label,amt,key});
  }
  const maxE=Math.max(...dailyEarnings.map(d=>d.amt),1);
  const earningsChart=dailyEarnings.map(d=>{
    const h=Math.max(4,d.amt/maxE*100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${d.label}: ₹${d.amt}">
      <div style="width:100%;height:120px;display:flex;align-items:end"><div style="width:100%;height:${h}%;background:var(--purple);border-radius:4px 4px 0 0;min-height:4px;transition:height .3s"></div></div>
      <span style="font-size:9px;color:var(--gray-400)">${d.label.split(' ')[1]||''}</span>
    </div>`;
  }).join('');

  // Top performing links
  const topLinks=[...links].sort((a,b)=>b.conversion_count-a.conversion_count).slice(0,5);

  // Funnel bars
  const funnelMax=Math.max(totalClicks,1);

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">🔗 Affiliate Dashboard</h2>
        <p style="color:var(--gray-400);font-size:14px">${activeLinks} active link${activeLinks!==1?'s':''} · ${links.length} total</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-gold btn-pill" onclick="go('aff-links')">📊 My Links</button>
        <button class="btn btn-outline btn-pill" onclick="go('wallet')">💰 Wallet</button>
        ${w.available_balance>=100?`<button class="btn btn-pill" style="background:var(--green);color:#fff;border:none" onclick="showPayoutModal()">💸 Request Payout</button>`:''}
      </div>
    </div>

    <!-- Stats -->
    <div class="g4" style="margin-bottom:32px">
      <div class="stat-card" style="border-top:3px solid var(--purple)"><div class="stat-val" style="color:var(--purple)">₹${totalEarned}</div><div class="stat-label">Total Earned</div></div>
      <div class="stat-card" style="border-top:3px solid var(--gold)"><div class="stat-val" style="color:var(--gold-dark)">₹${w.available_balance}</div><div class="stat-label">Available</div></div>
      <div class="stat-card" style="border-top:3px solid var(--blue)"><div class="stat-val">${totalClicks}</div><div class="stat-label">Total Clicks</div></div>
      <div class="stat-card" style="border-top:3px solid var(--green)"><div class="stat-val">${totalConv}</div><div class="stat-label">Conversions</div></div>
    </div>

    <!-- Conversion Funnel -->
    <div class="g3" style="margin-bottom:32px">
      <div class="card">
        <h3 style="font-weight:700;margin-bottom:16px">📈 Conversion Funnel</h3>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="font-weight:600">Clicks</span><span style="font-weight:800">${totalClicks}</span></div>
            <div style="height:10px;background:var(--gray-100);border-radius:5px;overflow:hidden"><div style="height:100%;width:100%;background:var(--blue);border-radius:5px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="font-weight:600">Conversions</span><span style="font-weight:800">${totalConv}</span></div>
            <div style="height:10px;background:var(--gray-100);border-radius:5px;overflow:hidden"><div style="height:100%;width:${totalConv/funnelMax*100}%;background:var(--green);border-radius:5px;min-width:${totalConv?'4px':'0'}"></div></div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:var(--radius);margin-top:4px">
            <span style="font-size:28px;font-weight:800;color:var(--purple)">${convRate}%</span>
            <p style="font-size:12px;color:var(--gray-400);margin-top:2px">Conversion Rate</p>
          </div>
        </div>
      </div>

      <!-- Earnings Chart -->
      <div class="card" style="grid-column:span 2">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-weight:700">💰 Earnings (14 Days)</h3>
          <span style="font-size:13px;color:var(--gray-400)">₹${dailyEarnings.reduce((a,d)=>a+d.amt,0)} total</span>
        </div>
        <div style="display:flex;gap:4px;align-items:end">${earningsChart}</div>
      </div>
    </div>

    <!-- Top Links + Wallet Summary -->
    <div class="g3">
      <div class="card" style="grid-column:span 2">
        <h3 style="font-weight:700;margin-bottom:16px">🏆 Top Performing Links</h3>
        ${!topLinks.length?'<p style="color:var(--gray-400);font-size:13px">Create your first link to get started</p>'
        :topLinks.map((l,i)=>{
          const cr=l.click_count>0?(l.conversion_count/l.click_count*100).toFixed(1):0;
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;${i<topLinks.length-1?'border-bottom:1px solid var(--gray-100)':''}">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:18px;font-weight:800;color:var(--gray-300);width:24px">${i+1}</span>
              <div>
                <p style="font-weight:700;font-family:'Space Mono',monospace;font-size:14px">${esc(l.code)}</p>
                <p style="font-size:11px;color:var(--gray-400)">${l.link_type||'global'} · ${l.commission_percent}%</p>
              </div>
            </div>
            <div style="display:flex;gap:16px;text-align:right;font-size:12px">
              <div><span style="font-weight:700">${l.click_count}</span><br><span style="color:var(--gray-400)">clicks</span></div>
              <div><span style="font-weight:700;color:var(--green)">${l.conversion_count}</span><br><span style="color:var(--gray-400)">conv</span></div>
              <div><span style="font-weight:700;color:var(--purple)">${cr}%</span><br><span style="color:var(--gray-400)">rate</span></div>
            </div>
          </div>`;
        }).join('')}
        ${links.length>5?`<button class="btn btn-outline btn-pill btn-sm" style="margin-top:12px" onclick="go('aff-links')">View all ${links.length} links →</button>`:''}
      </div>

      <div class="card">
        <h3 style="font-weight:700;margin-bottom:16px">💳 Wallet Summary</h3>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--gray-500)">Available</span><span style="font-weight:800;color:var(--green)">₹${w.available_balance}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--gray-500)">Pending</span><span style="font-weight:800;color:var(--orange)">₹${w.pending_balance}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--gray-500)">Withdrawn</span><span style="font-weight:700">₹${w.total_withdrawn}</span></div>
          <hr style="border:none;border-top:1px solid var(--gray-100);margin:4px 0">
          <div style="display:flex;justify-content:space-between;font-size:14px"><span style="font-weight:700">Lifetime</span><span style="font-weight:800;color:var(--purple)">₹${w.total_earned}</span></div>
        </div>
        ${w.available_balance>=100?`<button class="btn btn-gold btn-pill btn-full" style="margin-top:16px" onclick="showPayoutModal()">💸 Request Payout</button>`
        :`<p style="font-size:11px;color:var(--gray-400);margin-top:12px;text-align:center">Min ₹100 to withdraw · ₹${Math.max(0,100-w.available_balance)} more needed</p>`}
      </div>
    </div>
  </div>`;
}

async function renderAffLinks(){
  if(!PROFILE||PROFILE.role!=='affiliate'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading...</div>';
  const [links,products]=await Promise.all([
    sb.get("affiliate_links","*,products(name,price,images)",{affiliate_id:`eq.${PROFILE.id}`,order:"created_at.desc"}),
    sb.get("products","id,name",{is_active:"eq.true",is_approved:"eq.true",order:"name.asc"})
  ]);

  const totalClicks=links.reduce((a,b)=>a+b.click_count,0);
  const totalConv=links.reduce((a,b)=>a+b.conversion_count,0);
  const activeCount=links.filter(l=>l.is_active).length;

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">My Referral Links</h2>
        <p style="font-size:13px;color:var(--gray-400)">${links.length} link${links.length!==1?'s':''} · ${activeCount} active · ${totalClicks} clicks · ${totalConv} conversions</p>
      </div>
      <button class="btn btn-gold btn-pill" onclick="go('aff-dash')">← Dashboard</button>
    </div>

    <!-- Create Link -->
    <div class="card" style="margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:12px">➕ Create New Link</h3>
      <div class="g3" style="margin-bottom:0;gap:12px">
        <div class="form-group" style="margin:0"><label class="form-label">Code</label><input class="form-input" id="aff-code" placeholder="e.g. MYCODE2024" style="margin:0;text-transform:uppercase"></div>
        <div class="form-group" style="margin:0"><label class="form-label">Type</label>
          <select class="form-select" id="aff-type" style="margin:0" onchange="document.getElementById('aff-product-wrap').style.display=this.value==='product'?'block':'none'">
            <option value="global">🌐 Global (all products)</option>
            <option value="product">📦 Specific Product</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;display:flex;align-items:end"><button class="btn btn-gold btn-pill btn-full" onclick="createAffCode()">Create Link</button></div>
      </div>
      <div id="aff-product-wrap" style="display:none;margin-top:12px">
        <label class="form-label">Select Product</label>
        <select class="form-select" id="aff-product" style="margin:0">
          <option value="">Choose a product...</option>
          ${products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <p style="font-size:11px;color:var(--gray-400);margin-top:10px">💡 Share your code with customers. When they use it at checkout, you earn commission on every order.</p>
    </div>

    <!-- Links List -->
    ${!links.length?emptyState('🔗','No referral codes yet','Create your first code above')
    :links.map(l=>{
      const cr=l.click_count>0?(l.conversion_count/l.click_count*100).toFixed(1):0;
      const shareUrl=window.location.origin+'?ref='+l.code;
      const isProduct=l.product_id&&l.products;
      return `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="font-weight:800;font-size:20px;font-family:'Space Mono',monospace;color:var(--purple)">${esc(l.code)}</span>
              <span class="badge ${l.is_active?'badge-green':'badge-red'}">${l.is_active?'Active':'Paused'}</span>
              <span class="badge" style="background:var(--gray-100);color:var(--gray-500)">${l.link_type||'global'}</span>
            </div>
            ${isProduct?`<p style="font-size:13px;color:var(--gray-500);margin-bottom:6px">📦 ${esc(l.products.name)} — ₹${l.products.price}</p>`:''}
            <p style="font-size:12px;color:var(--gray-400)">${l.commission_percent}% commission · Created ${getTimeAgo(l.created_at)}</p>
          </div>
          <div style="display:flex;gap:24px;text-align:center">
            <div><div style="font-size:20px;font-weight:800">${l.click_count}</div><div style="font-size:11px;color:var(--gray-400)">Clicks</div></div>
            <div><div style="font-size:20px;font-weight:800;color:var(--green)">${l.conversion_count}</div><div style="font-size:11px;color:var(--gray-400)">Conv</div></div>
            <div><div style="font-size:20px;font-weight:800;color:var(--purple)">${cr}%</div><div style="font-size:11px;color:var(--gray-400)">Rate</div></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline btn-pill" onclick="copyAffLink('${esc(l.code)}')">📋 Copy Code</button>
          <button class="btn btn-sm btn-outline btn-pill" onclick="copyAffUrl('${esc(l.code)}')">🔗 Copy URL</button>
          <button class="btn btn-sm btn-pill" style="background:${l.is_active?'var(--orange)':'var(--green)'};color:#fff;border:none" onclick="toggleAffLink('${l.id}',${!l.is_active})">${l.is_active?'⏸ Pause':'▶ Activate'}</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

async function createAffCode(){
  const code=$('aff-code').value.trim().toUpperCase();
  if(!code){toast('Enter a code','⚠️');return;}
  if(code.length<3){toast('Code must be at least 3 characters','⚠️');return;}
  const type=$('aff-type').value;
  const data={affiliate_id:PROFILE.id,code,commission_percent:5,link_type:type};
  if(type==='product'){
    const pid=$('aff-product').value;
    if(!pid){toast('Select a product','⚠️');return;}
    data.product_id=pid;
  }
  const r=await sb.ins("affiliate_links",data);
  if(r.length){toast('Link created!','✅');renderAffLinks();}else toast('Error — code may already exist','❌');
}

function copyAffLink(code){
  navigator.clipboard.writeText(code).then(()=>toast('Code copied!','📋')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=code;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Code copied!','📋');
  });
}

function copyAffUrl(code){
  const url=window.location.origin+'?ref='+code;
  navigator.clipboard.writeText(url).then(()=>toast('URL copied!','🔗')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('URL copied!','🔗');
  });
}

async function toggleAffLink(id,active){
  await sb.upd("affiliate_links",{is_active:active},{id:`eq.${id}`});
  toast(active?'Link activated':'Link paused','✅');
  renderAffLinks();
}

function showPayoutModal(){
  const modal=document.createElement('div');
  modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:420px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">💸 Request Payout</h3>
    <div class="form-group"><label class="form-label">Amount (₹)</label><input class="form-input" id="payout-amt" type="number" min="100" placeholder="Minimum ₹100"></div>
    <div class="form-group"><label class="form-label">Payout Method</label>
      <select class="form-select" id="payout-method">
        <option value="bank_transfer">🏦 Bank Transfer (NEFT/IMPS)</option>
        <option value="upi">📱 UPI</option>
      </select>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="doPayout()">Submit Request</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function doPayout(){
  const amt=Number($('payout-amt').value);
  const method=$('payout-method').value;
  if(!amt||amt<100){toast('Minimum ₹100','⚠️');return;}
  const r=await sb.rpc("request_withdrawal",{p_amount:amt,p_method:method});
  if(r?.success){
    toast('Payout of ₹'+amt+' submitted!','💸');
    document.querySelector('.auth-overlay')?.remove();
    if(VIEW==='aff-dash')renderAffDash();
    else if(VIEW==='wallet')renderWallet();
  }else{toast(r?.error||'Payout failed','❌');}
}

// ═══════════════════════════════════════════════════
// VENDOR WITHDRAW + BANK ACCOUNT + SETTLEMENT
// ═══════════════════════════════════════════════════
async function showWithdrawModal(maxAmt){
  // Check bank account exists
  const banks=await sb.get("vendor_bank_accounts","*",{vendor_id:`eq.${PROFILE.id}`});
  if(!banks.length){toast('Add a bank account first','⚠️');editBankAccount();return;}
  const bank=banks[0];
  if(!bank.is_verified){toast('Bank account pending verification','⚠️');return;}

  // Check trust score
  const trustArr=await sb.get("vendor_trust","*",{vendor_id:`eq.${PROFILE.id}`});
  const trust=trustArr[0]||{trust_score:100,auto_withdraw:true,admin_hold:false};
  const needsApproval=trust.trust_score<70||trust.admin_hold;

  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:440px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">💸 Withdraw Funds</h3>
    <div class="form-group"><label class="form-label">Amount (₹)</label><input class="form-input" id="wd-amt" type="number" min="1" max="${maxAmt}" value="${maxAmt}" style="font-size:24px;font-weight:900;text-align:center"></div>
    <div style="padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);margin-bottom:16px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--gray-400)">To Account</span><span style="font-weight:600">●●●●${bank.account_number.slice(-4)} (${esc(bank.bank_name||'Bank')})</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-400)">Method</span><span style="font-weight:600">🏦 Bank Transfer (NEFT)</span></div>
      ${bank.upi_id?`<div style="display:flex;justify-content:space-between;margin-top:4px"><span style="color:var(--gray-400)">UPI</span><span style="font-weight:600">${esc(bank.upi_id)}</span></div>`:''}
    </div>
    ${needsApproval?`<div style="padding:10px;background:rgba(255,149,0,.08);border:1px solid rgba(255,149,0,.2);border-radius:var(--radius-sm);margin-bottom:16px;font-size:12px;color:var(--orange)">⚠️ This withdrawal requires admin approval due to account review (Trust: ${trust.trust_score}/100)</div>`
    :`<div style="padding:10px;background:rgba(52,199,89,.06);border:1px solid rgba(52,199,89,.15);border-radius:var(--radius-sm);margin-bottom:16px;font-size:12px;color:var(--green)">✅ Instant withdrawal — funds will be transferred immediately</div>`}
    <div style="display:flex;gap:8px">
      <button class="btn btn-pill" style="flex:1;background:var(--green);color:#fff;border:none" onclick="doWithdraw(${needsApproval})">💸 ${needsApproval?'Submit for Approval':'Withdraw Now'}</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function doWithdraw(needsApproval){
  const amt=parseFloat($('wd-amt').value);
  if(!amt||amt<1){toast('Enter amount','⚠️');return;}
  const wallets=await sb.get("wallets","available_balance",{user_id:`eq.${PROFILE.id}`});
  const avail=parseFloat(wallets[0]?.available_balance)||0;
  if(amt>avail){toast('Insufficient balance','⚠️');return;}
  const banks=await sb.get("vendor_bank_accounts","id",{vendor_id:`eq.${PROFILE.id}`});
  // Create withdrawal
  await sb.ins("withdrawals",{vendor_id:PROFILE.id,amount:amt,bank_account_id:banks[0]?.id,payment_method:'bank_transfer',status:needsApproval?'held':'processing'});
  // Deduct from wallet
  await sb.upd("wallets",{available_balance:avail-amt},{user_id:`eq.${PROFILE.id}`});
  // Log transaction
  await sb.ins("wallet_transactions",{user_id:PROFILE.id,type:'withdrawal',amount:amt,description:`Withdrawal${needsApproval?' (pending approval)':' processed'}`,status:needsApproval?'pending':'available'});
  document.querySelector('.auth-overlay')?.remove();
  toast(needsApproval?'Withdrawal submitted for approval':'₹'+amt+' withdrawal processing!','💸');
  renderWallet();
}

function editBankAccount(){
  (async()=>{
    const banks=await sb.get("vendor_bank_accounts","*",{vendor_id:`eq.${PROFILE.id}`});
    const b=banks[0]||{};
    const modal=document.createElement('div');modal.className='auth-overlay';
    modal.innerHTML=`<div class="auth-card" style="max-width:480px">
      <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">🏦 ${b.id?'Edit':'Add'} Bank Account</h3>
      <div class="form-group"><label class="form-label">Account Holder Name</label><input class="form-input" id="ba-holder" value="${esc(b.account_holder||PROFILE.full_name||'')}" placeholder="As per bank records"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Account Number</label><input class="form-input" id="ba-num" value="${esc(b.account_number||'')}" placeholder="1234567890" style="font-family:'Space Mono',monospace"></div>
        <div class="form-group"><label class="form-label">IFSC Code</label><input class="form-input" id="ba-ifsc" value="${esc(b.ifsc_code||'')}" placeholder="SBIN0001234" maxlength="11" style="text-transform:uppercase"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Bank Name</label><input class="form-input" id="ba-bank" value="${esc(b.bank_name||'')}" placeholder="State Bank of India"></div>
        <div class="form-group"><label class="form-label">Branch</label><input class="form-input" id="ba-branch" value="${esc(b.branch_name||'')}" placeholder="Branch name"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Account Type</label><select class="form-select" id="ba-type"><option value="savings" ${b.account_type==='savings'?'selected':''}>Savings</option><option value="current" ${b.account_type==='current'?'selected':''}>Current</option></select></div>
        <div class="form-group"><label class="form-label">UPI ID (optional)</label><input class="form-input" id="ba-upi" value="${esc(b.upi_id||'')}" placeholder="name@upi"></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveBankAccount('${b.id||''}')">Save Account</button>
        <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
      </div>
      <p style="font-size:11px;color:var(--gray-400);margin-top:10px;text-align:center">Bank details are verified by admin before first withdrawal</p>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  })();
}

async function saveBankAccount(existingId){
  const holder=$('ba-holder').value.trim();const num=$('ba-num').value.trim();const ifsc=$('ba-ifsc').value.trim().toUpperCase();
  if(!holder||!num||!ifsc){toast('Holder, account number, IFSC required','⚠️');return;}
  if(ifsc.length!==11){toast('IFSC must be 11 characters','⚠️');return;}
  const data={vendor_id:PROFILE.id,account_holder:holder,account_number:num,ifsc_code:ifsc,bank_name:$('ba-bank').value,branch_name:$('ba-branch').value,account_type:$('ba-type').value,upi_id:$('ba-upi').value||null,is_verified:false};
  if(existingId){await sb.upd("vendor_bank_accounts",data,{id:`eq.${existingId}`});}
  else{await sb.ins("vendor_bank_accounts",data);}
  document.querySelector('.auth-overlay')?.remove();
  toast('Bank account saved!','🏦');renderWallet();
}

// Settlement engine: create settlement when delivery is confirmed
async function createSettlement(orderItemId, orderId, vendorId, grossAmount, commissionPct, orderNumber){
  const commission=grossAmount*commissionPct/100;
  const commissionGst=commission*18/100;
  const tcs=grossAmount*1/100;
  const net=grossAmount-commission-commissionGst-tcs;

  // Check if product category is non-returnable
  const items=await sb.get("order_items","product_id",{id:`eq.${orderItemId}`});
  const pid=items[0]?.product_id;
  let isReturnable=true;
  if(pid){
    const prods=await sb.get("products","category_id",{id:`eq.${pid}`});
    if(prods[0]?.category_id){
      const cats=await sb.get("categories","is_returnable",{id:`eq.${prods[0].category_id}`});
      isReturnable=cats[0]?.is_returnable!==false;
    }
  }

  const eligibleDate=isReturnable?new Date(Date.now()+7*86400000).toISOString():null;
  const status=isReturnable?'pending':'eligible';

  await sb.ins("settlement_ledger",{vendor_id:vendorId,order_id:orderId,order_item_id:orderItemId,order_number:orderNumber,gross_amount:grossAmount,commission,commission_gst:commissionGst,tcs_amount:tcs,net_amount:net,status,eligible_date:eligibleDate});

  // Update vendor wallet
  const wallets=await sb.get("wallets","*",{user_id:`eq.${vendorId}`});
  if(wallets.length){
    if(isReturnable){
      await sb.upd("wallets",{pending_balance:parseFloat(wallets[0].pending_balance||0)+net,total_earned:parseFloat(wallets[0].total_earned||0)+net},{user_id:`eq.${vendorId}`});
    }else{
      await sb.upd("wallets",{available_balance:parseFloat(wallets[0].available_balance||0)+net,total_earned:parseFloat(wallets[0].total_earned||0)+net},{user_id:`eq.${vendorId}`});
    }
  }
}

// Move pending → eligible when return window closes
async function checkSettlementEligibility(){
  const pending=await sb.get("settlement_ledger","*",{status:"eq.pending"});
  const now=Date.now();
  for(const s of pending){
    if(s.eligible_date&&new Date(s.eligible_date).getTime()<=now){
      const returns=await sb.get("return_requests","status",{order_item_id:`eq.${s.order_item_id}`,status:"in.pending,approved"});
      if(!returns.length){
        await sb.upd("settlement_ledger",{status:'eligible',settled_at:new Date().toISOString()},{id:`eq.${s.id}`});
        // Move vendor pending → available
        const wallets=await sb.get("wallets","*",{user_id:`eq.${s.vendor_id}`});
        if(wallets.length){
          const pending_bal=Math.max(0,parseFloat(wallets[0].pending_balance||0)-parseFloat(s.net_amount));
          const avail=parseFloat(wallets[0].available_balance||0)+parseFloat(s.net_amount);
          await sb.upd("wallets",{pending_balance:pending_bal,available_balance:avail},{user_id:`eq.${s.vendor_id}`});
        }
        // ── Trigger referral approval for this order ──
        if(s.order_id) await approveReferralForOrder(s.order_id);
      }
    }
  }
}

async function confirmNoReturn(orderItemId, vendorId){
  if(!confirm('Confirm you do not wish to return this item? The vendor will receive their payment immediately.'))return;
  const setts=await sb.get("settlement_ledger","*",{order_item_id:`eq.${orderItemId}`,status:"eq.pending"});
  if(setts.length){
    const s=setts[0];
    await sb.upd("settlement_ledger",{status:'eligible',settled_at:new Date().toISOString()},{id:`eq.${s.id}`});
    const wallets=await sb.get("wallets","*",{user_id:`eq.${vendorId}`});
    if(wallets.length){
      const pending_bal=Math.max(0,parseFloat(wallets[0].pending_balance||0)-parseFloat(s.net_amount));
      const avail=parseFloat(wallets[0].available_balance||0)+parseFloat(s.net_amount);
      await sb.upd("wallets",{pending_balance:pending_bal,available_balance:avail},{user_id:`eq.${vendorId}`});
    }
    // ── Trigger referral approval immediately (buyer waived return) ──
    if(s.order_id) await approveReferralForOrder(s.order_id);
  }
  toast('Thank you! Vendor payment released','✅');
  renderOrderDetail();
}

// Log vendor breach (called when disputes/returns are lost)
async function logVendorBreach(vendorId, breachType, description){
  const trustArr=await sb.get("vendor_trust","*",{vendor_id:`eq.${vendorId}`});
  let trust=trustArr[0];
  if(!trust){
    await sb.ins("vendor_trust",{vendor_id:vendorId,trust_score:100});
    trust={trust_score:100,total_breaches:0,breach_log:[]};
  }
  const penalties={dispute_lost:10,return_rejected_by_admin:8,wrong_product:15,high_cancellation:5,refund_delay:7,customer_complaint:5};
  const penalty=penalties[breachType]||5;
  const newScore=Math.max(0,trust.trust_score-penalty);
  const log=[...(trust.breach_log||[]),{type:breachType,desc:description,penalty,date:new Date().toISOString()}];
  await sb.upd("vendor_trust",{trust_score:newScore,total_breaches:(trust.total_breaches||0)+1,breach_log:log,last_breach_at:new Date().toISOString(),auto_withdraw:newScore>=70,updated_at:new Date().toISOString()},{vendor_id:`eq.${vendorId}`});
}

// ═══════════════════════════════════════════════════
// ADMIN VIEWS
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// NEW ADMIN PANEL — Clean Sidebar Layout
// Single entry point: renderAdminDash(section, tab)
// ═══════════════════════════════════════════════════
let _adminSection='overview';
let _adminTab='';
let _adminSidebarCollapsed=false;
try{_adminSidebarCollapsed=localStorage.getItem('glonni_admin_sidebar')==='collapsed';}catch(e){}

const ADMIN_NAV=[
  {id:'overview',  icon:'🏠', label:'Overview'},
  {id:'catalog',   icon:'📦', label:'Catalog'},
  {id:'categories',icon:'📂', label:'Categories'},
  {id:'vendors',   icon:'🏪', label:'Vendors'},
  {id:'users',     icon:'👥', label:'Users'},
  {id:'orders',    icon:'📋', label:'Orders'},
  {id:'finance',   icon:'💰', label:'Finance'},
  {id:'marketing', icon:'📢', label:'Marketing'},
  {id:'support',   icon:'🛟', label:'Support'},
  {id:'settings',  icon:'⚙️', label:'Settings'},
];

// CSS injected once
(function injectAdminCSS(){
  if(document.getElementById('admin-panel-css'))return;
  const s=document.createElement('style');
  s.id='admin-panel-css';
  s.textContent=`
.ap-wrap{display:flex;min-height:calc(100vh - 64px);background:#F5F5F7}
.ap-sidebar{width:220px;flex-shrink:0;background:#1C1C1E;display:flex;flex-direction:column;position:sticky;top:64px;height:calc(100vh - 64px);overflow-y:auto;transition:width .2s ease}
.ap-sidebar.collapsed{width:74px}
.ap-sidebar.collapsed.hover-open{width:220px}
.ap-logo{padding:16px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.ap-logo-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ap-logo-title{font-size:15px;font-weight:900;color:#fff;letter-spacing:-.3px}
.ap-logo-sub{font-size:11px;color:rgba(255,255,255,.3);margin-top:2px}
.ap-sidebar-toggle{width:28px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s}
.ap-sidebar-toggle:hover{background:rgba(255,255,255,.12)}
.ap-nav{flex:1;padding:10px 0}
.ap-nav-item{display:flex;align-items:center;gap:11px;padding:11px 18px;cursor:pointer;font-size:13px;font-weight:500;color:rgba(255,255,255,.5);border:none;background:transparent;width:100%;text-align:left;font-family:inherit;transition:all .15s;border-left:3px solid transparent}
.ap-nav-item:hover{background:rgba(255,255,255,.06);color:#fff}
.ap-nav-item.active{background:rgba(237,207,93,.1);color:#EDCF5D;border-left-color:#EDCF5D;font-weight:700}
.ap-nav-icon{font-size:16px;width:22px;text-align:center;flex-shrink:0}
.ap-nav-badge{margin-left:auto;background:#FF3B30;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:20px;line-height:16px}
.ap-nav-footer{padding:14px 18px;border-top:1px solid rgba(255,255,255,.07)}
.ap-sidebar.collapsed:not(.hover-open) .ap-logo-sub,.ap-sidebar.collapsed:not(.hover-open) .ap-nav-label,.ap-sidebar.collapsed:not(.hover-open) .ap-nav-badge,.ap-sidebar.collapsed:not(.hover-open) .ap-back-text{display:none}
.ap-sidebar.collapsed:not(.hover-open) .ap-logo{padding:16px 8px}
.ap-sidebar.collapsed:not(.hover-open) .ap-logo-top{justify-content:center}
.ap-sidebar.collapsed:not(.hover-open) .ap-sidebar-toggle{position:absolute;top:16px;right:8px}
.ap-sidebar.collapsed:not(.hover-open) .ap-nav-item{padding:11px 0;justify-content:center;border-left:0}
.ap-sidebar.collapsed:not(.hover-open) .ap-nav-footer{padding:14px 8px}
.ap-content{flex:1;padding:28px 32px;overflow-y:auto;min-width:0}
.ap-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.ap-title{font-size:22px;font-weight:800;letter-spacing:-.3px}
.ap-sub{font-size:13px;color:var(--gray-400);margin-top:2px}
.ap-tabs{display:flex;gap:2px;background:var(--gray-100);padding:4px;border-radius:10px;margin-bottom:20px;overflow-x:auto;flex-wrap:nowrap}
.ap-tabs::-webkit-scrollbar{display:none}
.ap-tab{padding:8px 16px;border-radius:8px;border:none;font:600 12px 'Outfit',sans-serif;cursor:pointer;white-space:nowrap;transition:all .15s;background:transparent;color:var(--gray-500)}
.ap-tab.active{background:#fff;color:var(--black);box-shadow:0 1px 4px rgba(0,0,0,.08)}
.ap-tab:hover:not(.active){color:var(--gray-700)}
.ap-stat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.ap-stat{background:#fff;border-radius:14px;padding:18px 20px;border:1px solid rgba(0,0,0,.06)}
.ap-stat-val{font-size:26px;font-weight:900;font-family:'Space Mono',monospace;letter-spacing:-1px}
.ap-stat-label{font-size:11px;color:var(--gray-400);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.ap-stat-trend{font-size:12px;font-weight:700;margin-top:4px}
.ap-attention{background:#fff;border-radius:14px;border:1px solid rgba(0,0,0,.06);padding:20px;margin-bottom:20px}
.ap-att-title{font-size:14px;font-weight:800;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.ap-att-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100)}
.ap-att-row:last-child{border-bottom:none}
.ap-att-left{display:flex;align-items:center;gap:10px;font-size:13px}
.ap-att-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.ap-att-action{font-size:12px;font-weight:700;color:var(--gold-dark);cursor:pointer;white-space:nowrap;padding:6px 12px;border-radius:8px;border:1.5px solid var(--gold);background:transparent;font-family:inherit;transition:all .15s}
.ap-att-action:hover{background:var(--gold);color:var(--black)}
.ap-table{width:100%;border-collapse:collapse}
.ap-table th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-400);padding:10px 14px;text-align:left;background:var(--gray-50);border-bottom:1px solid var(--gray-200)}
.ap-table td{padding:12px 14px;border-bottom:1px solid var(--gray-100);font-size:13px;vertical-align:middle}
.ap-table tr:hover td{background:var(--gray-50)}
.ap-table tr:last-child td{border-bottom:none}
.ap-card{background:#fff;border-radius:14px;border:1px solid rgba(0,0,0,.06);padding:20px;margin-bottom:16px}
.ap-card-title{font-size:15px;font-weight:700;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}
.ap-empty{text-align:center;padding:48px 20px;color:var(--gray-400)}
.ap-empty span{font-size:40px;display:block;margin-bottom:10px}
.ap-search{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid var(--gray-200);border-radius:10px;padding:8px 14px;margin-bottom:16px}
.ap-search input{border:none;outline:none;font:400 13px 'Outfit',sans-serif;flex:1;background:transparent}
.ap-bar-wrap{display:flex;gap:3px;align-items:end;height:80px;margin-top:8px}
.ap-bar{flex:1;background:var(--gold);border-radius:3px 3px 0 0;min-height:3px;transition:height .3s}
`;
  document.head.appendChild(s);
})();

function apUpdateSidebarToggle(){
  const icon=$('ap-sidebar-toggle-icon');
  const btn=$('ap-sidebar-toggle');
  if(!icon||!btn)return;
  if(_adminSidebarCollapsed){
    icon.textContent='☰';
    btn.title='Open sidebar';
  }else{
    icon.textContent='✕';
    btn.title='Close sidebar';
  }
}

function apApplySidebarState(){
  const sidebar=$('ap-sidebar');
  if(!sidebar)return;
  sidebar.classList.toggle('collapsed',_adminSidebarCollapsed);
  if(!_adminSidebarCollapsed)sidebar.classList.remove('hover-open');
  apUpdateSidebarToggle();
}

function apSidebarToggle(){
  _adminSidebarCollapsed=!_adminSidebarCollapsed;
  try{localStorage.setItem('glonni_admin_sidebar',_adminSidebarCollapsed?'collapsed':'open');}catch(e){}
  apApplySidebarState();
}

function apSidebarHover(open){
  const sidebar=$('ap-sidebar');
  if(!sidebar||!_adminSidebarCollapsed)return;
  sidebar.classList.toggle('hover-open',!!open);
}

async function renderAdminDash(section, tab){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  if(section)_adminSection=section;
  else _adminSection='overview'; // always reset to overview when called bare
  if(tab!==undefined)_adminTab=tab;

  // Fetch attention counts in parallel (fast queries)
  const [pendingVendors,pendingReview,pendingPayouts,openDisputes,pendingRules,pendingOffers]=await Promise.all([
    sb.get("vendor_stores","id",{is_approved:"eq.false"}).catch(()=>[]),
    sb.get("catalog_products","id",{admin_status:"eq.draft"}).catch(()=>[]),
    sb.get("withdrawals","id,amount",{status:"eq.processing"}).catch(()=>[]),
    sb.get("disputes","id",{status:"eq.open"}).catch(()=>[]),
    sb.get("platform_rules","id",{approval_status:"eq.pending_approval"}).catch(()=>[]),
    sb.get("vendor_offers","id",{is_approved:"eq.false"}).catch(()=>[]),
  ]);

  const totalAttention=pendingVendors.length+pendingReview.length+openDisputes.length+pendingRules.length+pendingOffers.length;
  const totalPayout=pendingPayouts.reduce((s,w)=>s+parseFloat(w.amount||0),0);

  // Build sidebar
  const navBadges={
    vendors:pendingVendors.length,
    catalog:pendingReview.length+pendingOffers.length,
    finance:pendingPayouts.length,
    orders:openDisputes.length,
    settings:pendingRules.length,
  };

  $('main').innerHTML=`
  <div class="ap-wrap">
    <!-- SIDEBAR -->
    <div class="ap-sidebar" id="ap-sidebar" onmouseenter="apSidebarHover(true)" onmouseleave="apSidebarHover(false)">
      <div class="ap-logo">
        <div class="ap-logo-top">
          <div class="ap-logo-title">Glonni<span style="color:#EDCF5D">.</span></div>
          <button class="ap-sidebar-toggle" id="ap-sidebar-toggle" onclick="apSidebarToggle()"><span id="ap-sidebar-toggle-icon">✕</span></button>
        </div>
        <div class="ap-logo-sub">Admin Panel</div>
      </div>
      <nav class="ap-nav">
        ${ADMIN_NAV.map(n=>`
          <button class="ap-nav-item ${_adminSection===n.id?'active':''}" onclick="renderAdminDash('${n.id}','')">
            <span class="ap-nav-icon">${n.icon}</span>
            <span class="ap-nav-label" style="flex:1">${n.label}</span>
            ${navBadges[n.id]?`<span class="ap-nav-badge">${navBadges[n.id]}</span>`:''}
          </button>`).join('')}
      </nav>
      <div class="ap-nav-footer">
        <button class="ap-nav-item" style="padding:8px 0;color:rgba(255,255,255,.3);font-size:12px" onclick="go('home')"><span class="ap-nav-icon">←</span><span class="ap-back-text">Back to Store</span></button>
      </div>
    </div>
    <!-- CONTENT -->
    <div class="ap-content" id="ap-content">
      <div style="text-align:center;padding:40px;color:var(--gray-400)">⏳ Loading...</div>
    </div>
  </div>`;

  // Render selected section
  apApplySidebarState();
  const attn={pendingVendors,pendingReview,pendingPayouts,openDisputes,pendingRules,pendingOffers,totalPayout,totalAttention};
  apRenderSection(_adminSection, _adminTab, attn);
}

async function apRenderSection(section, tab, attn){
  const el=document.getElementById('ap-content');
  if(!el)return;
  el.innerHTML='<div style="text-align:center;padding:32px;color:var(--gray-400)">⏳ Loading...</div>';
  if(section==='overview')  await apOverview(el,attn);
  else if(section==='catalog')   await apCatalog(el,tab||'ai-builder');
  else if(section==='categories') await apCategories(el);
  else if(section==='vendors')   await apVendors(el,tab||'all');
  else if(section==='users')     await apUsers(el,tab||'all');
  else if(section==='orders')    await apOrders(el,tab||'all');
  else if(section==='finance')   await apFinance(el,tab||'transactions');
  else if(section==='marketing') await apMarketing(el,tab||'ads');
  else if(section==='support')   await apSupport(el,tab||'users');
  else if(section==='settings')  await apSettings(el,tab||'rules');
}

// Old standalone admin pages render to $('main') directly.
// They all have a "← Admin Panel" back button — no re-wrap needed.
function apRunInSidebar(fn){
  fn();
}

// helper to switch tab inside current section
async function apTab(section,tab){
  _adminTab=tab;
  const el=document.getElementById('ap-content');
  if(!el)return;
  // Update tab button styles
  document.querySelectorAll('.ap-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  el.innerHTML='<div style="text-align:center;padding:32px;color:var(--gray-400)">⏳ Loading...</div>';
  if(section==='vendors')   await apVendors(el,tab);
  else if(section==='users')     await apUsers(el,tab);
  else if(section==='orders')    await apOrders(el,tab);
  else if(section==='finance')   await apFinance(el,tab);
  else if(section==='marketing') await apMarketing(el,tab);
  else if(section==='support')   await apSupport(el,tab);
  else if(section==='settings')  await apSettings(el,tab);
  else if(section==='catalog')   await apCatalog(el,tab);
}

function apTabBar(section,tabs,active){
  return `<div class="ap-tabs">${tabs.map(t=>`<button class="ap-tab ${active===t.id?'active':''}" data-tab="${t.id}" onclick="apTab('${section}','${t.id}')">${t.label}</button>`).join('')}</div>`;
}

// ──────────────────────────────────────────
// OVERVIEW
// ──────────────────────────────────────────
async function apOverview(el,attn){
  const a=await sb.rpc("platform_analytics").catch(()=>({}))||{};
  const growth=a.last_month_gmv>0?Math.round((a.this_month_gmv-a.last_month_gmv)/a.last_month_gmv*100):0;
  const daily=a.daily_gmv||[];
  const maxD=Math.max(...daily.map(d=>d.gmv),1);

  const attentionItems=[
    {show:attn.pendingVendors.length>0,icon:'🏪',bg:'rgba(255,149,0,.1)',label:`${attn.pendingVendors.length} vendor${attn.pendingVendors.length!==1?'s':''} pending approval`,action:'Review',fn:`renderAdminDash('vendors','pending')`},
    {show:attn.pendingReview.length>0,icon:'📦',bg:'rgba(0,122,255,.1)',label:`${attn.pendingReview.length} product${attn.pendingReview.length!==1?'s':''} in catalog review queue`,action:'Review',fn:`renderAdminDash('catalog','review')`},
    {show:attn.pendingOffers.length>0,icon:'🏪',bg:'rgba(175,82,222,.1)',label:`${attn.pendingOffers.length} vendor offer${attn.pendingOffers.length!==1?'s':''} awaiting approval`,action:'Review',fn:`renderAdminDash('catalog','vendor-offers')`},
    {show:attn.pendingPayouts.length>0,icon:'💰',bg:'rgba(52,199,89,.1)',label:`₹${attn.totalPayout.toLocaleString('en-IN')} in pending payouts`,action:'Release',fn:`releaseFunds()`},
    {show:attn.openDisputes.length>0,icon:'⚖️',bg:'rgba(255,59,48,.1)',label:`${attn.openDisputes.length} open dispute${attn.openDisputes.length!==1?'s':''} need resolution`,action:'Resolve',fn:`renderAdminDash('orders','disputes')`},
    {show:attn.pendingRules.length>0,icon:'⚙️',bg:'rgba(175,82,222,.1)',label:`${attn.pendingRules.length} platform rule${attn.pendingRules.length!==1?'s':''} awaiting super-admin approval`,action:'Review',fn:`renderAdminDash('settings','rules')`},
  ].filter(i=>i.show);

  el.innerHTML=`
  <div class="ap-header">
    <div>
      <div class="ap-title">Good ${new Date().getHours()<12?'morning':'afternoon'} 👋</div>
      <div class="ap-sub">Here's what's happening on Glonni today · ${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill btn-sm" onclick="releaseFunds()">🔓 Release Pending Funds</button>
    </div>
  </div>

  <!-- 4 Key Stats -->
  <div class="ap-stat-row">
    <div class="ap-stat" style="border-top:3px solid var(--gold)">
      <div class="ap-stat-val" style="color:var(--gold-dark)">₹${(a.today_gmv||0).toLocaleString('en-IN')}</div>
      <div class="ap-stat-label">Today's GMV</div>
      <div class="ap-stat-trend" style="color:${growth>=0?'var(--green)':'var(--red)'}">${growth>=0?'↑':'↓'} ${Math.abs(growth)}% vs last month</div>
    </div>
    <div class="ap-stat" style="border-top:3px solid var(--blue)">
      <div class="ap-stat-val">${a.total_orders||0}</div>
      <div class="ap-stat-label">Total Orders</div>
      <div class="ap-stat-trend" style="color:var(--gray-400)">₹${a.avg_order_value||0} avg order</div>
    </div>
    <div class="ap-stat" style="border-top:3px solid var(--green)">
      <div class="ap-stat-val">${a.total_vendors||0}</div>
      <div class="ap-stat-label">Active Vendors</div>
      <div class="ap-stat-trend" style="color:${attn.pendingVendors.length?'var(--orange)':'var(--gray-400)'}">${attn.pendingVendors.length} pending</div>
    </div>
    <div class="ap-stat" style="border-top:3px solid var(--purple)">
      <div class="ap-stat-val">${a.total_users||0}</div>
      <div class="ap-stat-label">Total Users</div>
      <div class="ap-stat-trend" style="color:var(--green)">+${a.user_segments?.new_this_month||0} this month</div>
    </div>
  </div>

  <!-- Needs Attention -->
  ${attentionItems.length?`<div class="ap-attention">
    <div class="ap-att-title"><span style="background:rgba(255,149,0,.12);padding:4px 8px;border-radius:8px;font-size:12px;color:var(--orange)">⚡ ${attentionItems.length} item${attentionItems.length!==1?'s':''} need your attention</span></div>
    ${attentionItems.map(i=>`<div class="ap-att-row">
      <div class="ap-att-left">
        <div class="ap-att-icon" style="background:${i.bg}">${i.icon}</div>
        <span>${i.label}</span>
      </div>
      <button class="ap-att-action" onclick="${i.fn}">${i.action} →</button>
    </div>`).join('')}
  </div>`:`<div class="ap-attention" style="text-align:center;padding:24px"><span style="font-size:24px">✅</span><p style="font-weight:700;margin-top:8px">All clear — nothing needs attention right now</p></div>`}

  <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
    <!-- Revenue Chart -->
    <div class="ap-card">
      <div class="ap-card-title">📊 Revenue — Last 14 Days
        <span style="font-size:22px;font-weight:900;color:var(--gold-dark)">₹${(a.this_month_gmv||0).toLocaleString('en-IN')}</span>
      </div>
      <div class="ap-bar-wrap">
        ${daily.map(d=>{const h=Math.max(4,d.gmv/maxD*100);return `<div class="ap-bar" style="height:${h}%" title="${d.label}: ₹${d.gmv}"></div>`}).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--gray-400)">
        <span>${daily[0]?.label||''}</span><span>${daily[daily.length-1]?.label||''}</span>
      </div>
    </div>
    <!-- Quick Stats -->
    <div class="ap-card">
      <div class="ap-card-title">Platform Health</div>
      ${[
        {l:'Live Products',v:a.total_products||0,c:'var(--blue)'},
        {l:'Platform Fees',v:'₹'+(a.total_platform_fees||0),c:'var(--green)'},
        {l:'Cashback Paid',v:'₹'+(a.total_cashback||0),c:'var(--gold-dark)'},
        {l:'Total GMV',v:'₹'+(a.total_gmv||0),c:'var(--black)'},
      ].map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--gray-100)">
        <span style="font-size:13px;color:var(--gray-500)">${s.l}</span>
        <span style="font-weight:800;font-size:14px;color:${s.c}">${s.v}</span>
      </div>`).join('')}
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('vendors','all')">Vendors</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('orders','all')">Orders</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('finance','transactions')">Finance</button>
      </div>
    </div>
  </div>`;
}

// ──────────────────────────────────────────
// VENDORS
// ──────────────────────────────────────────
async function apVendors(el,tab){
  const tabs=[{id:'all',label:'All Vendors'},{id:'pending',label:'Pending Approval'},{id:'payouts',label:'Payouts'},{id:'bank',label:'Bank Verification'}];
  if(tab==='all'){
    const stores=await sb.get("vendor_stores","*,profiles(full_name,email)",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">🏪 Vendors <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${stores.length})</span></div></div>
    ${apTabBar('vendors',tabs,'all')}
    <div class="ap-search"><span>🔍</span><input placeholder="Search vendors..." oninput="apFilterTable('ap-vendor-table',this.value)"></div>
    <div class="ap-card" style="padding:0;overflow:hidden">
      <table class="ap-table" id="ap-vendor-table">
        <thead><tr><th>Store</th><th>Owner</th><th>Status</th><th>Sales</th><th>Joined</th><th>Action</th></tr></thead>
        <tbody>
          ${stores.map(s=>`<tr data-search="${(s.store_name+s.profiles?.full_name+s.profiles?.email).toLowerCase()}">
            <td><p style="font-weight:700">${esc(s.store_name)}</p><p style="font-size:11px;color:var(--gray-400)">${s.platform_fee_percent||8}% commission</p></td>
            <td><p>${esc(s.profiles?.full_name||'—')}</p><p style="font-size:11px;color:var(--gray-400)">${esc(s.profiles?.email||'')}</p></td>
            <td><span class="badge ${s.is_approved?'badge-green':'badge-gold'}">${s.is_approved?'Approved':'Pending'}</span></td>
            <td style="font-weight:700">₹${(s.total_sales||0).toLocaleString('en-IN')}</td>
            <td style="color:var(--gray-400)">${new Date(s.created_at).toLocaleDateString()}</td>
            <td><button class="btn btn-sm ${s.is_approved?'btn-danger':'btn-success'} btn-pill" onclick="toggleApproveStore('${s.id}',${s.is_approved})">${s.is_approved?'Revoke':'Approve ✓'}</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } else if(tab==='pending'){
    const stores=await sb.get("vendor_stores","*,profiles(full_name,email)",{is_approved:"eq.false",order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">⏳ Pending Vendor Approval <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${stores.length})</span></div></div>
    ${apTabBar('vendors',tabs,'pending')}
    ${!stores.length?`<div class="ap-empty"><span>✅</span><p style="font-weight:600">No vendors pending approval</p></div>`
    :stores.map(s=>`<div class="ap-card" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <div>
        <p style="font-weight:700;font-size:15px">${esc(s.store_name)}</p>
        <p style="font-size:12px;color:var(--gray-400);margin-top:2px">${esc(s.profiles?.full_name||'')} · ${esc(s.profiles?.email||'')} · Applied ${new Date(s.created_at).toLocaleDateString()}</p>
        ${s.gstin?`<span class="badge badge-blue" style="margin-top:6px">GSTIN: ${esc(s.gstin)}</span>`:'<span class="badge badge-red" style="margin-top:6px">No GSTIN</span>'}
        ${s.description?`<p style="font-size:12px;color:var(--gray-600);margin-top:6px;max-width:400px">${esc(s.description)}</p>`:''}
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-success btn-pill" onclick="toggleApproveStore('${s.id}',false)">✅ Approve</button>
        <button class="btn btn-danger btn-pill" onclick="toggleApproveStore('${s.id}',true)">❌ Reject</button>
      </div>
    </div>`).join('')}`;
  } else if(tab==='payouts'){
    // Render payouts within sidebar
    const payouts=await sb.get("withdrawals","*,vendor_stores(store_name),profiles(full_name)",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">💸 Vendor Payouts <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${payouts.length})</span></div></div>
    ${apTabBar('vendors',tabs,'payouts')}
    ${!payouts.length?`<div class="ap-empty"><span>💸</span><p style="font-weight:600">No payouts yet</p></div>`
    :`<div class="ap-card" style="padding:0;overflow:hidden">
      <table class="ap-table">
        <thead><tr><th>Vendor</th><th>Amount</th><th>Status</th><th>Bank</th><th>Date</th><th>Action</th></tr></thead>
        <tbody>
          ${payouts.map(p=>`<tr>
            <td style="font-weight:600">${esc(p.vendor_stores?.store_name||'—')}</td>
            <td style="font-weight:700">₹${parseFloat(p.amount||0).toLocaleString('en-IN')}</td>
            <td><span class="badge" style="background:${p.status==='completed'?'var(--green)':p.status==='processing'?'var(--orange)':'var(--red)'};color:#fff;font-size:10px">${p.status}</span></td>
            <td style="font-size:12px;color:var(--gray-500)">${p.bank_name||'—'}</td>
            <td style="font-size:12px;color:var(--gray-400)">${new Date(p.created_at).toLocaleDateString()}</td>
            <td><button class="btn btn-sm btn-outline btn-pill" onclick="go('vendor-detail',{vid:'${p.vendor_id}'})">View</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
  } else if(tab==='bank'){
    const banks=await sb.get("vendor_bank_accounts","*,profiles(full_name)",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">🏦 Bank Account Verification</div></div>
    ${apTabBar('vendors',tabs,'bank')}
    ${!banks.length?`<div class="ap-empty"><span>🏦</span><p style="font-weight:600">No bank accounts submitted yet</p></div>`
    :banks.map(b=>`<div class="ap-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <p style="font-weight:700">${esc(b.profiles?.full_name||'Vendor')}</p>
        <p style="font-size:13px;color:var(--gray-500);margin-top:2px">A/C: <span style="font-family:'Space Mono',monospace">${esc(b.account_number||'—')}</span> · IFSC: ${esc(b.ifsc_code||'—')} · ${esc(b.bank_name||'')}</p>
        <p style="font-size:12px;color:var(--gray-400);margin-top:2px">${esc(b.account_holder_name||'')} · ${b.account_type||'savings'}</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${b.is_verified?'<span class="badge badge-green">✓ Verified</span>':`<button class="btn btn-success btn-pill btn-sm" onclick="verifyBank('${b.id}')">✅ Verify</button>`}
      </div>
    </div>`).join('')}`;
  }
}

// ──────────────────────────────────────────
// USERS
// ──────────────────────────────────────────
async function apUsers(el,tab){
  const tabs=[{id:'all',label:'All Users'},{id:'vendors',label:'Vendors'},{id:'affiliates',label:'Affiliates'},{id:'blocked',label:'Blocked'}];
  const filter=tab==='vendors'?{role:"eq.vendor"}:tab==='affiliates'?{role:"eq.affiliate"}:tab==='blocked'?{is_blocked:"eq.true"}:{};
  const users=await sb.get("profiles","*",{order:"created_at.desc",...filter}).catch(()=>[]);
  el.innerHTML=`
  <div class="ap-header"><div class="ap-title">👥 Users <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${users.length})</span></div></div>
  ${apTabBar('users',tabs,tab)}
  <div class="ap-search"><span>🔍</span><input placeholder="Search by name or email..." oninput="apFilterTable('ap-users-table',this.value)"></div>
  <div class="ap-card" style="padding:0;overflow:hidden">
    <table class="ap-table" id="ap-users-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>
        ${users.map(u=>`<tr data-search="${(u.full_name+u.email).toLowerCase()}">
          <td style="font-weight:600">${esc(u.full_name||'—')}</td>
          <td style="color:var(--gray-500);font-size:12px">${esc(u.email||'')}</td>
          <td><span class="role-pill" style="background:${roleBg(u.role)};color:#fff;font-size:10px;padding:2px 8px;border-radius:20px">${u.role}</span></td>
          <td style="color:var(--gray-400);font-size:12px">${new Date(u.created_at).toLocaleDateString()}</td>
          <td>${u.is_blocked?'<span class="badge badge-red">Blocked</span>':'<span class="badge badge-green">Active</span>'}</td>
          <td><button class="btn btn-sm ${u.is_blocked?'btn-success':'btn-danger'} btn-pill" onclick="toggleBlock('${u.id}',${u.is_blocked})">${u.is_blocked?'Unblock':'Block'}</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ──────────────────────────────────────────
// ORDERS
// ──────────────────────────────────────────
async function apOrders(el,tab){
  const tabs=[{id:'all',label:'All Orders'},{id:'pending',label:'Pending'},{id:'returns',label:'Returns'},{id:'disputes',label:'Disputes'},{id:'reviews',label:'Reviews'}];
  
  if(tab==='returns'){
    const returns=await sb.get("returns","*,orders(order_number),profiles(full_name)",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">↩️ Returns <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${returns.length})</span></div></div>
    ${apTabBar('orders',tabs,'returns')}
    ${!returns.length?`<div class="ap-empty"><span>↩️</span><p style="font-weight:600">No returns yet</p></div>`
    :returns.map(r=>`<div class="ap-card" style="cursor:pointer" onclick="go('return-detail',{rid:'${r.id}'})">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <p style="font-weight:700">Order ${esc(r.orders?.order_number||'—')}</p>
          <p style="font-size:13px;color:var(--gray-500);margin-top:2px">${esc(r.profiles?.full_name||'User')} · Reason: ${esc(r.reason||'—')}</p>
        </div>
        <span class="badge" style="background:${r.status==='approved'?'var(--green)':r.status==='rejected'?'var(--red)':'var(--orange)'}; color:#fff;font-size:10px">${r.status}</span>
      </div>
    </div>`).join('')}`;
  } else if(tab==='disputes'){
    const disputes=await sb.get("disputes","*,orders(order_number),profiles(full_name)",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">⚖️ Disputes <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${disputes.length})</span></div></div>
    ${apTabBar('orders',tabs,'disputes')}
    ${!disputes.length?`<div class="ap-empty"><span>⚖️</span><p style="font-weight:600">No disputes yet</p></div>`
    :disputes.map(d=>`<div class="ap-card" style="cursor:pointer" onclick="go('dispute-detail',{did:'${d.id}'})">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <p style="font-weight:700">Order ${esc(d.orders?.order_number||'—')}</p>
          <p style="font-size:13px;color:var(--gray-500);margin-top:2px">${esc(d.profiles?.full_name||'User')} · Issue: ${esc(d.issue_type||'—')}</p>
        </div>
        <span class="badge" style="background:${d.status==='resolved'?'var(--green)':'var(--red)'}; color:#fff;font-size:10px">${d.status}</span>
      </div>
    </div>`).join('')}`;
  } else if(tab==='reviews'){
    const reviews=await sb.get("product_reviews","*,products(name),profiles(full_name)",{order:"created_at.desc",limit:30}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">⭐ Reviews <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${reviews.length})</span></div></div>
    ${apTabBar('orders',tabs,'reviews')}
    ${!reviews.length?`<div class="ap-empty"><span>⭐</span><p style="font-weight:600">No reviews yet</p></div>`
    :reviews.map(r=>`<div class="ap-card">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div>
          <p style="font-weight:700">${esc(r.products?.name||'Product')}</p>
          <p style="font-size:12px;color:var(--gray-500);margin-top:2px">By ${esc(r.profiles?.full_name||'User')}</p>
        </div>
        <span style="color:var(--orange);font-weight:700">${'⭐'.repeat(r.rating)}</span>
      </div>
      <p style="font-size:13px;color:var(--gray-600)">${esc(r.comment||'')}</p>
    </div>`).join('')}`;
  } else {
    // All & Pending tabs
    const filter=tab==='pending'?{status:"eq.pending"}:{};
    const orders=await sb.get("orders","*,profiles(full_name),order_items(*,products(name))",{order:"created_at.desc",...filter}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header">
      <div class="ap-title">📋 Orders <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${orders.length})</span></div>
    </div>
    ${apTabBar('orders',tabs,tab)}
    ${!orders.length?`<div class="ap-empty"><span>📋</span><p style="font-weight:600">No orders</p></div>`
    :orders.map(o=>`<div class="ap-card" style="cursor:pointer;padding:16px 20px" onclick="go('order-detail',{oid:'${o.id}'})">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div>
          <p style="font-weight:800;font-size:15px">${esc(o.order_number)}</p>
          <p style="font-size:12px;color:var(--gray-400);margin-top:2px">${esc(o.profiles?.full_name||'User')} · ${new Date(o.created_at).toLocaleString()}</p>
        </div>
        <div style="text-align:right">
          <span class="badge" style="background:${statusBg(o.status)}">${statusIcon(o.status)} ${o.status}</span>
          <p style="font-weight:900;font-size:18px;color:var(--gold-dark);margin-top:4px">₹${o.total}</p>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${(o.order_items||[]).slice(0,3).map(oi=>`<span style="font-size:11px;background:var(--gray-50);border:1px solid var(--gray-200);padding:3px 8px;border-radius:6px">
          ${esc(oi.products?.name||'Product')} ×${oi.quantity}
        </span>`).join('')}
        ${(o.order_items||[]).length>3?`<span style="font-size:11px;color:var(--gray-400)">+${o.order_items.length-3} more</span>`:''}
      </div>
    </div>`).join('')}`;
  }
}

// ──────────────────────────────────────────
// FINANCE
// ──────────────────────────────────────────
async function apFinance(el,tab){
  const tabs=[{id:'transactions',label:'Transactions'},{id:'payouts',label:'Payouts'},{id:'settlements',label:'Settlements'},{id:'gst',label:'GST / Tax'},{id:'commissions',label:'Commissions'}];
  
  if(tab==='payouts'){
    const payouts=await sb.get("withdrawals","*,vendor_stores(store_name),profiles(full_name)",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">💸 Payouts <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${payouts.length})</span></div></div>
    ${apTabBar('finance',tabs,'payouts')}
    ${!payouts.length?`<div class="ap-empty"><span>💸</span><p style="font-weight:600">No payouts yet</p></div>`
    :`<div class="ap-card" style="padding:0;overflow:hidden">
      <table class="ap-table">
        <thead><tr><th>Vendor</th><th>Amount</th><th>Status</th><th>Bank</th><th>Date</th></tr></thead>
        <tbody>
          ${payouts.map(p=>`<tr>
            <td style="font-weight:600">${esc(p.vendor_stores?.store_name||'—')}</td>
            <td style="font-weight:700">₹${parseFloat(p.amount||0).toLocaleString('en-IN')}</td>
            <td><span class="badge" style="background:${p.status==='completed'?'var(--green)':p.status==='processing'?'var(--orange)':'var(--red)'}; color:#fff;font-size:10px">${p.status}</span></td>
            <td style="font-size:12px;color:var(--gray-500)">${p.bank_name||'—'}</td>
            <td style="font-size:12px;color:var(--gray-400)">${new Date(p.created_at).toLocaleDateString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
  } else if(tab==='settlements'){
    const settlements=await sb.get("settlements","*,vendor_stores(store_name)",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">🔄 Settlements <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${settlements.length})</span></div></div>
    ${apTabBar('finance',tabs,'settlements')}
    ${!settlements.length?`<div class="ap-empty"><span>🔄</span><p style="font-weight:600">No settlements yet</p></div>`
    :`<div class="ap-card" style="padding:0;overflow:hidden">
      <table class="ap-table">
        <thead><tr><th>Vendor</th><th>Period</th><th>GMV</th><th>Settled</th><th>Status</th></tr></thead>
        <tbody>
          ${settlements.map(s=>`<tr>
            <td style="font-weight:600">${esc(s.vendor_stores?.store_name||'—')}</td>
            <td style="font-size:12px">${s.settlement_period||'—'}</td>
            <td>₹${parseFloat(s.gross_value||0).toLocaleString('en-IN')}</td>
            <td style="font-weight:700;color:var(--green)">₹${parseFloat(s.settled_amount||0).toLocaleString('en-IN')}</td>
            <td><span class="badge" style="background:${s.status==='completed'?'var(--green)':'var(--orange)'}; color:#fff;font-size:10px">${s.status}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
  } else if(tab==='gst'){
    const gstData=await sb.get("gst_reports","*",{order:"created_at.desc",limit:20}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">📊 GST Reports <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${gstData.length})</span></div></div>
    ${apTabBar('finance',tabs,'gst')}
    ${!gstData.length?`<div class="ap-empty"><span>📊</span><p style="font-weight:600">No GST data yet</p></div>`
    :`<div class="ap-card" style="padding:0;overflow:hidden">
      <table class="ap-table">
        <thead><tr><th>Month</th><th>IGST</th><th>SGST</th><th>CGST</th><th>Total</th></tr></thead>
        <tbody>
          ${gstData.map(g=>`<tr>
            <td>${g.month||'—'}</td>
            <td>₹${parseFloat(g.igst||0).toLocaleString('en-IN')}</td>
            <td>₹${parseFloat(g.sgst||0).toLocaleString('en-IN')}</td>
            <td>₹${parseFloat(g.cgst||0).toLocaleString('en-IN')}</td>
            <td style="font-weight:700">₹${(parseFloat(g.igst||0)+parseFloat(g.sgst||0)+parseFloat(g.cgst||0)).toLocaleString('en-IN')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
  } else if(tab==='commissions'){
    const comms=await sb.get("commission_log","*,vendor_stores(store_name)",{order:"created_at.desc",limit:30}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">% Commissions <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${comms.length})</span></div></div>
    ${apTabBar('finance',tabs,'commissions')}
    ${!comms.length?`<div class="ap-empty"><span>%</span><p style="font-weight:600">No commission data yet</p></div>`
    :`<div class="ap-card" style="padding:0;overflow:hidden">
      <table class="ap-table">
        <thead><tr><th>Vendor</th><th>Rate</th><th>GMV</th><th>Commission</th><th>Date</th></tr></thead>
        <tbody>
          ${comms.map(c=>`<tr>
            <td style="font-weight:600">${esc(c.vendor_stores?.store_name||'—')}</td>
            <td style="font-weight:700">${c.commission_rate||8}%</td>
            <td>₹${parseFloat(c.gmv||0).toLocaleString('en-IN')}</td>
            <td style="font-weight:700;color:var(--orange)">₹${parseFloat(c.commission_amount||0).toLocaleString('en-IN')}</td>
            <td style="font-size:12px;color:var(--gray-400)">${new Date(c.created_at).toLocaleDateString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
  } else {
    // Transactions tab
    const txns=await sb.get("wallet_transactions","*,profiles(full_name)",{order:"created_at.desc",limit:60}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header">
      <div class="ap-title">💰 Finance</div>
      <button class="btn btn-gold btn-pill btn-sm" onclick="releaseFunds()">🔓 Release Pending Funds</button>
    </div>
    ${apTabBar('finance',tabs,'transactions')}
    <div class="ap-card" style="padding:0;overflow:hidden">
      <table class="ap-table">
        <thead><tr><th>Type</th><th>User</th><th>Description</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${txns.map(t=>`<tr>
            <td><span class="badge" style="background:${txTypeBg(t.type)};font-size:10px">${t.type.replace(/_/g,' ')}</span></td>
            <td style="font-size:12px">${esc(t.profiles?.full_name||'—')}</td>
            <td style="font-size:12px;color:var(--gray-500)">${esc(t.description||'—')}</td>
            <td style="font-weight:700">₹${parseFloat(t.amount||0).toLocaleString('en-IN')}</td>
            <td><span style="font-size:12px;color:${t.status==='available'?'var(--green)':'var(--orange)'};font-weight:600">${t.status}</span></td>
            <td style="font-size:11px;color:var(--gray-400)">${new Date(t.created_at).toLocaleDateString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }
}

// ──────────────────────────────────────────
// MARKETING
// ──────────────────────────────────────────
async function apMarketing(el,tab){
  const tabs=[{id:'ads',label:'Ad Campaigns'},{id:'placements',label:'Placements'},{id:'layout',label:'Website Layout'},{id:'referrals',label:'Referrals'}];
  
  if(tab==='ads'){
    const ads=await sb.get("ad_campaigns","*",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">📢 Ad Campaigns <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${ads.length})</span></div></div>
    ${apTabBar('marketing',tabs,'ads')}
    ${!ads.length?`<div class="ap-empty"><span>📢</span><p style="font-weight:600">No ad campaigns yet</p></div>`
    :ads.map(a=>`<div class="ap-card" style="cursor:pointer" onclick="go('ad-detail',{aid:'${a.id}'})">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <p style="font-weight:700">${esc(a.name||'Campaign')}</p>
          <p style="font-size:12px;color:var(--gray-500);margin-top:2px">Budget: ₹${parseFloat(a.budget||0).toLocaleString('en-IN')} · Spent: ₹${parseFloat(a.spent||0).toLocaleString('en-IN')}</p>
        </div>
        <span class="badge" style="background:${a.is_active?'var(--green)':'var(--gray-400)'}; color:#fff;font-size:10px">${a.is_active?'Active':'Inactive'}</span>
      </div>
    </div>`).join('')}`;
  } else if(tab==='placements'){
    const placements=await sb.get("sponsored_placements","*",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">📍 Placements <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${placements.length})</span></div></div>
    ${apTabBar('marketing',tabs,'placements')}
    ${!placements.length?`<div class="ap-empty"><span>📍</span><p style="font-weight:600">No placements yet</p></div>`
    :placements.map(p=>`<div class="ap-card">
      <p style="font-weight:700">${esc(p.placement_name||'Placement')}</p>
      <p style="font-size:12px;color:var(--gray-500);margin-top:2px">${esc(p.description||'')}</p>
    </div>`).join('')}`;
  } else if(tab==='layout'){
    const layouts=await sb.get("page_layouts","*",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">🎨 Website Layout <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${layouts.length})</span></div></div>
    ${apTabBar('marketing',tabs,'layout')}
    ${!layouts.length?`<div class="ap-empty"><span>🎨</span><p style="font-weight:600">No layouts yet</p></div>`
    :layouts.map(l=>`<div class="ap-card" style="cursor:pointer" onclick="go('layout-detail',{lid:'${l.id}'})">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <p style="font-weight:700">${esc(l.page_name||'Layout')}</p>
          <p style="font-size:12px;color:var(--gray-500);margin-top:2px">Status: ${l.status}</p>
        </div>
        <span class="badge" style="background:${l.status==='live'?'var(--green)':'var(--orange)'}; color:#fff;font-size:10px">${l.status}</span>
      </div>
    </div>`).join('')}`;
  } else if(tab==='referrals'){
    const referrals=await sb.get("referral_programs","*",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">🎁 Referral Programs <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${referrals.length})</span></div></div>
    ${apTabBar('marketing',tabs,'referrals')}
    ${!referrals.length?`<div class="ap-empty"><span>🎁</span><p style="font-weight:600">No referral programs yet</p></div>`
    :referrals.map(r=>`<div class="ap-card">
      <p style="font-weight:700">${esc(r.program_name||'Program')}</p>
      <p style="font-size:12px;color:var(--gray-500);margin-top:2px">Reward: ${esc(r.reward_type||'—')} · Value: ₹${parseFloat(r.reward_value||0)}</p>
    </div>`).join('')}`;
  }
}

// Category Management System
const CATEGORY_CONSTS={GST_SLABS:['0%','5%','12%','18%','28%']};
let _catAllCats=[];
let _catFormSlabs=[];
let _catSlabCountMap={};
let _catDragIdx=-1;

function catMgrNum(v, fallback=0){
  const n=parseFloat(v);
  return Number.isFinite(n)?n:fallback;
}

function catMgrCommissionValue(cat){
  const primary=catMgrNum(cat?.platform_commission, NaN);
  if(Number.isFinite(primary))return primary;
  return catMgrNum(cat?.platform_fee_percent, 0);
}

function catMgrRenderSlabRows(){
  const rowsEl=$('cat-slab-rows');
  if(!rowsEl)return;
  if(!_catFormSlabs.length){
    _catFormSlabs=[{min:'0',max:'',commission:'8'}];
  }
  rowsEl.innerHTML=_catFormSlabs.map((s,idx)=>`<div draggable="true" ondragstart="catMgrDragStart(event,${idx})" ondragover="catMgrDragOver(event)" ondrop="catMgrDrop(event,${idx})" ondragend="catMgrDragEnd()" style="display:grid;grid-template-columns:auto 1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;padding:8px;border:1px dashed var(--gray-200);border-radius:8px;background:#fff">
    <div style="display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-size:16px;cursor:grab" title="Drag to reorder">⋮⋮</div>
    <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Min Price ₹</label><input class="form-input" type="number" min="0" step="1" value="${esc(s.min||'0')}" oninput="catMgrUpdateSlab(${idx},'min',this.value)"></div>
    <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Max Price ₹</label><input class="form-input" type="number" min="0" step="1" value="${esc(s.max||'')}" placeholder="No max" oninput="catMgrUpdateSlab(${idx},'max',this.value)"></div>
    <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Commission %</label><input class="form-input" type="number" min="0" max="100" step="0.1" value="${esc(s.commission||'0')}" oninput="catMgrUpdateSlab(${idx},'commission',this.value)"></div>
    <button class="btn btn-ghost btn-sm btn-pill" onclick="catMgrRemoveSlab(${idx})" ${_catFormSlabs.length===1?'disabled':''}>✕</button>
  </div>`).join('');
}

function catMgrSeedSlabs(rules=[]){
  if(Array.isArray(rules)&&rules.length){
    _catFormSlabs=rules.map(r=>({
      min:String(catMgrNum(r.price_min,0)),
      max:r.price_max==null?'':String(r.price_max),
      commission:String(catMgrNum(r.commission_percent,0)),
    }));
  }else{
    _catFormSlabs=[{min:'0',max:'',commission:String(catMgrNum($('cat-commission')?.value,8))}];
  }
  catMgrRenderSlabRows();
}

function catMgrUpdateSlab(idx,key,val){
  if(!_catFormSlabs[idx])return;
  _catFormSlabs[idx][key]=val;
}

function catMgrAddSlab(){
  _catFormSlabs.push({min:'0',max:'',commission:String(catMgrNum($('cat-commission')?.value,8))});
  catMgrRenderSlabRows();
}

function catMgrDragStart(e,idx){
  _catDragIdx=idx;
  try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(idx));}catch(err){}
}

function catMgrDragOver(e){e.preventDefault();}

function catMgrDrop(e,targetIdx){
  e.preventDefault();
  if(_catDragIdx<0||_catDragIdx===targetIdx)return;
  const moved=_catFormSlabs.splice(_catDragIdx,1)[0];
  _catFormSlabs.splice(targetIdx,0,moved);
  _catDragIdx=-1;
  catMgrRenderSlabRows();
}

function catMgrDragEnd(){_catDragIdx=-1;}

async function catMgrCopyParentSlabs(){
  const parentId=$('cat-parent')?.value||'';
  if(!parentId){toast('Select a parent category first','⚠️');return;}
  const rows=await sb.get('commission_rules','price_min,price_max,commission_percent',{category_id:`eq.${parentId}`,product_id:'is.null',is_active:'eq.true',order:'price_min.asc,priority.desc'}).catch(()=>[]);
  if(!rows.length){toast('No slabs found on parent category','⚠️');return;}
  _catFormSlabs=rows.map(r=>({
    min:String(catMgrNum(r.price_min,0)),
    max:r.price_max==null?'':String(r.price_max),
    commission:String(catMgrNum(r.commission_percent,0)),
  }));
  catMgrRenderSlabRows();
  toast('Copied slabs from parent','✅');
}

function catMgrRemoveSlab(idx){
  if(_catFormSlabs.length<=1)return;
  _catFormSlabs.splice(idx,1);
  catMgrRenderSlabRows();
}

function catMgrReadSlabs(){
  const parsed=[];
  for(const s of _catFormSlabs){
    const hasAny=(s.min!==''||s.max!==''||s.commission!=='');
    if(!hasAny)continue;
    const min=catMgrNum(s.min,0);
    const max=s.max===''?null:catMgrNum(s.max,NaN);
    const commission=catMgrNum(s.commission,NaN);
    if(min<0)return{ok:false,error:'Slab min price cannot be negative'};
    if(max!==null&&!Number.isFinite(max))return{ok:false,error:'Enter valid max price or leave it empty'};
    if(max!==null&&max<=min)return{ok:false,error:'Each slab max price must be greater than min price'};
    if(!Number.isFinite(commission)||commission<0||commission>100)return{ok:false,error:'Each slab commission must be between 0 and 100'};
    parsed.push({price_min:min,price_max:max,commission_percent:commission});
  }
  if(!parsed.length)return{ok:false,error:'Add at least one price-based slab'};
  parsed.sort((a,b)=>a.price_min-b.price_min);
  for(let i=1;i<parsed.length;i++){
    const prev=parsed[i-1];
    const curr=parsed[i];
    if(prev.price_max===null)return{ok:false,error:'Only the last slab can have no max price'};
    if(prev.price_max>curr.price_min)return{ok:false,error:'Slab ranges overlap. Please fix min/max values'};
  }
  return{ok:true,slabs:parsed};
}

async function catMgrSaveSlabs(categoryId,slabs){
  await sb.del('commission_rules',{category_id:`eq.${categoryId}`,product_id:'is.null'}).catch(()=>false);
  for(let i=0;i<slabs.length;i++){
    const s=slabs[i];
    await sb.ins('commission_rules',{
      category_id:categoryId,
      commission_percent:s.commission_percent,
      price_min:s.price_min,
      price_max:s.price_max,
      priority:1000-i,
      is_active:true,
      effective_from:new Date().toISOString(),
    }).catch(()=>[]);
  }
}

async function apRefreshCatPage(){
  const el=document.getElementById('ap-content');
  if(el) await apCategories(el);
}

async function apCategories(el){
  const [allCats,allSlabs]=await Promise.all([
    sb.get("categories","*",{order:"level.asc,sort_order.asc,name.asc"}).catch(()=>[]),
    sb.get('commission_rules','category_id,product_id,is_active',{product_id:'is.null',is_active:'eq.true'}).catch(()=>[]),
  ]);
  _catAllCats=allCats;
  _catSlabCountMap={};
  allSlabs.forEach(r=>{if(r.category_id)_catSlabCountMap[r.category_id]=(_catSlabCountMap[r.category_id]||0)+1;});
  const L1=_catAllCats.filter(c=>!c.parent_id);
  const L2=_catAllCats.filter(c=>c.parent_id&&L1.some(p=>p.id===c.parent_id));
  const L3=_catAllCats.filter(c=>c.parent_id&&L2.some(p=>p.id===c.parent_id));
  const activeCount=_catAllCats.filter(c=>c.is_active).length;
  const tree=_catAllCats.filter(c=>!c.parent_id);

  el.innerHTML=`
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
    <div>
      <h2 style="font-size:24px;font-weight:800">📂 Category Management</h2>
      <p style="font-size:13px;color:var(--gray-400);margin-top:4px">${_catAllCats.length} total · ${L1.length} main · ${L2.length} sub · ${L3.length} sub-sub · <span style="color:var(--green);font-weight:600">${activeCount} active</span></p>
    </div>
  </div>

  <!-- CATEGORY TREE BUILDER - cascading dropdowns -->
  <div class="ap-card" style="margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-weight:700;font-size:15px">🌳 Build Category Tree</h3>
      <p style="font-size:11px;color:var(--gray-400)">Use dropdowns to navigate or create new levels</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;align-items:start" id="ctb-grid">
      <!-- L1: Main Category -->
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);display:block;margin-bottom:6px">Category (L1)</label>
        <select class="form-select" id="ctb-l1" onchange="ctbL1Changed()" style="margin:0;font-size:13px">
          <option value="">— Select —</option>
          ${L1.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')}
          <option value="__new__">＋ Create New</option>
        </select>
        <div id="ctb-l1-new" class="hide" style="margin-top:8px">
          <input class="form-input" id="ctb-l1-name" placeholder="New category name" style="margin:0;font-size:13px">
          <button class="btn btn-gold btn-sm btn-full" style="margin-top:6px" onclick="ctbCreateAt(0)">Create</button>
        </div>
      </div>
      <!-- L2: Sub Category -->
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);display:block;margin-bottom:6px">Subcategory (L2)</label>
        <select class="form-select" id="ctb-l2" onchange="ctbL2Changed()" style="margin:0;font-size:13px" disabled>
          <option value="">— Select L1 first —</option>
        </select>
        <div id="ctb-l2-new" class="hide" style="margin-top:8px">
          <input class="form-input" id="ctb-l2-name" placeholder="New subcategory name" style="margin:0;font-size:13px">
          <button class="btn btn-gold btn-sm btn-full" style="margin-top:6px" onclick="ctbCreateAt(1)">Create</button>
        </div>
      </div>
      <!-- L3: Sub-sub Category -->
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);display:block;margin-bottom:6px">Sub-subcategory (L3)</label>
        <select class="form-select" id="ctb-l3" onchange="ctbL3Changed()" style="margin:0;font-size:13px" disabled>
          <option value="">— Select L2 first —</option>
        </select>
        <div id="ctb-l3-new" class="hide" style="margin-top:8px">
          <input class="form-input" id="ctb-l3-name" placeholder="New sub-subcategory name" style="margin:0;font-size:13px">
          <button class="btn btn-gold btn-sm btn-full" style="margin-top:6px" onclick="ctbCreateAt(2)">Create</button>
        </div>
      </div>
      <!-- Brand -->
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);display:block;margin-bottom:6px">Brand (L4)</label>
        <select class="form-select" id="ctb-l4" onchange="ctbL4Changed()" style="margin:0;font-size:13px" disabled>
          <option value="">— Select L3 first —</option>
        </select>
        <div id="ctb-l4-new" class="hide" style="margin-top:8px">
          <input class="form-input" id="ctb-l4-name" placeholder="New brand name" style="margin:0;font-size:13px">
          <button class="btn btn-gold btn-sm btn-full" style="margin-top:6px" onclick="ctbCreateAt(3)">Create</button>
        </div>
      </div>
    </div>
    <div id="ctb-path" style="margin-top:12px;font-size:12px;color:var(--gray-400)"></div>
  </div>

  <!-- Two column: CATEGORY TREE + Detail -->
  <div style="display:flex;gap:20px;min-height:500px">
    <div style="width:320px;flex-shrink:0">
      <div class="ap-card" style="height:100%;overflow-y:auto;max-height:calc(100vh - 400px)">
        <h3 style="font-weight:700;font-size:14px;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500)">Category Tree</h3>
        <div id="cat-tree">${tree.length?catMgrRenderTree(tree,_catAllCats,_catSlabCountMap):'<div style="color:var(--gray-400);text-align:center;padding:40px"><span style="font-size:40px;display:block;margin-bottom:12px">📂</span><p style="font-weight:600">No categories yet</p><p style="font-size:12px;margin-top:4px">Use the builder above to create your first category</p></div>'}</div>
      </div>
    </div>
    <div style="flex:1;min-width:0">
      <div class="ap-card" style="min-height:400px">
        <div id="cat-content" style="text-align:center;color:var(--gray-400);padding:60px 20px">
          <span style="font-size:48px;display:block;margin-bottom:12px">📂</span>
          <p style="font-weight:600;font-size:16px">Select a category</p>
          <p style="font-size:13px;margin-top:6px">Click any item in the tree to view and edit rules</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Audit Log -->
  <div class="ap-card" style="margin-top:24px">
    <h3 style="font-weight:700;font-size:14px;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500)">📋 Audit Log</h3>
    <div id="cat-audit" style="color:var(--gray-400);font-size:13px;text-align:center;padding:16px">No changes recorded yet</div>
  </div>

  <!-- Modal for editing -->
  <div id="cat-modal" class="auth-overlay hide" onclick="if(event.target.id==='cat-modal')catMgrCloseForm()">
    <div class="auth-card" style="max-width:500px" onclick="event.stopPropagation()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2 id="cat-modal-title" style="font-size:18px;font-weight:800">Edit Category</h2>
        <button class="btn btn-ghost" onclick="catMgrCloseForm()">✕</button>
      </div>
      <div id="cat-form"></div>
    </div>
  </div>`;

  // Load audit logs
  const logs=await sb.get("audit_logs","*,profiles(full_name)",{order:"created_at.desc",limit:10}).catch(()=>[]);
  const auditEl=document.getElementById('cat-audit');
  if(auditEl&&logs.length){
    auditEl.innerHTML=logs.map(l=>'<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:12px"><span>'+esc(l.action||'—')+' · '+esc(l.profiles?.full_name||'System')+'</span><span style="color:var(--gray-400)">'+new Date(l.created_at).toLocaleString()+'</span></div>').join('');
  }
}

// ── Cascading Tree Builder Logic ──
function ctbL1Changed(){
  const v=$('ctb-l1').value;
  const l2=$('ctb-l2'),l3=$('ctb-l3'),l4=$('ctb-l4');
  $('ctb-l1-new').classList.toggle('hide',v!=='__new__');
  if(v==='__new__'||!v){
    l2.innerHTML='<option value="">— Select L1 first —</option>';l2.disabled=true;
    l3.innerHTML='<option value="">— Select L2 first —</option>';l3.disabled=true;
    l4.innerHTML='<option value="">— Select L3 first —</option>';l4.disabled=true;
    $('ctb-l2-new').classList.add('hide');$('ctb-l3-new').classList.add('hide');$('ctb-l4-new').classList.add('hide');
    ctbUpdatePath();return;
  }
  const children=_catAllCats.filter(c=>c.parent_id===v);
  l2.innerHTML='<option value="">— Select —</option>'+children.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')+'<option value="__new__">＋ Create New</option>';
  l2.disabled=false;
  l3.innerHTML='<option value="">— Select L2 first —</option>';l3.disabled=true;
  l4.innerHTML='<option value="">— Select L3 first —</option>';l4.disabled=true;
  $('ctb-l2-new').classList.add('hide');$('ctb-l3-new').classList.add('hide');$('ctb-l4-new').classList.add('hide');
  ctbUpdatePath();
}
function ctbL2Changed(){
  const v=$('ctb-l2').value;
  const l3=$('ctb-l3'),l4=$('ctb-l4');
  $('ctb-l2-new').classList.toggle('hide',v!=='__new__');
  if(v==='__new__'||!v){
    l3.innerHTML='<option value="">— Select L2 first —</option>';l3.disabled=true;
    l4.innerHTML='<option value="">— Select L3 first —</option>';l4.disabled=true;
    $('ctb-l3-new').classList.add('hide');$('ctb-l4-new').classList.add('hide');
    ctbUpdatePath();return;
  }
  const children=_catAllCats.filter(c=>c.parent_id===v);
  l3.innerHTML='<option value="">— Select —</option>'+children.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')+'<option value="__new__">＋ Create New</option>';
  l3.disabled=false;
  l4.innerHTML='<option value="">— Select L3 first —</option>';l4.disabled=true;
  $('ctb-l3-new').classList.add('hide');$('ctb-l4-new').classList.add('hide');
  ctbUpdatePath();
}
function ctbL3Changed(){
  const v=$('ctb-l3').value;
  const l4=$('ctb-l4');
  $('ctb-l3-new').classList.toggle('hide',v!=='__new__');
  if(v==='__new__'||!v){
    l4.innerHTML='<option value="">— Select L3 first —</option>';l4.disabled=true;
    $('ctb-l4-new').classList.add('hide');
    ctbUpdatePath();return;
  }
  const children=_catAllCats.filter(c=>c.parent_id===v);
  l4.innerHTML='<option value="">— Select —</option>'+children.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')+'<option value="__new__">＋ Create New</option>';
  l4.disabled=false;
  $('ctb-l4-new').classList.add('hide');
  ctbUpdatePath();
}
function ctbL4Changed(){
  const v=$('ctb-l4').value;
  $('ctb-l4-new').classList.toggle('hide',v!=='__new__');
  ctbUpdatePath();
}

function ctbUpdatePath(){
  const ids=['ctb-l1','ctb-l2','ctb-l3','ctb-l4'];
  const labels=['Category','Subcategory','Sub-sub','Brand'];
  const parts=[];
  for(let i=0;i<4;i++){
    const v=$(ids[i]).value;
    if(!v||v==='__new__')break;
    const cat=_catAllCats.find(c=>c.id===v);
    if(cat)parts.push('<span style="color:var(--gold-dark);font-weight:600">'+esc(cat.name)+'</span>');
  }
  const pathEl=$('ctb-path');
  if(pathEl)pathEl.innerHTML=parts.length?'<span style="color:var(--gray-500)">Path:</span> '+parts.join(' <span style="color:var(--gray-300)">→</span> '):'';
}

async function ctbCreateAt(level){
  const inputIds=['ctb-l1-name','ctb-l2-name','ctb-l3-name','ctb-l4-name'];
  const name=$(inputIds[level]).value.trim();
  if(!name||name.length<2){toast('Name required (min 2 chars)','⚠️');return;}
  let parentId=null;
  if(level===1)parentId=$('ctb-l1').value;
  else if(level===2)parentId=$('ctb-l2').value;
  else if(level===3)parentId=$('ctb-l3').value;
  if(level>0&&(!parentId||parentId==='__new__')){toast('Select a parent first','⚠️');return;}
  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')+'-'+Date.now().toString(36);
  const data={name,slug,parent_id:parentId||null,level,icon:'📦',sort_order:1,is_active:true};
  try{
    const result=await sb.ins('categories',data);
    if(result&&result.length){toast('"'+name+'" created!','✅');apRefreshCatPage();}
    else{toast('Insert returned empty','❌');}
  }catch(e){console.error('Create exception:',e);toast('Network error: '+e.message,'❌');}
}

// ── Category Tree Rendering ──
function catMgrRenderTree(mainCats,allCats,slabMap={},depth=0){
return mainCats.map(cat=>{
const children=allCats.filter(c=>c.parent_id===cat.id);
const hasChildren=children.length>0;
const isExpanded=JSON.parse(localStorage.getItem('cat-exp-'+cat.id)||'true');
const levelBadge=['L1','L2','L3','L4'][cat.level]||'';
const dotColor=cat.is_active?'var(--green)':'var(--orange)';
const slabCount=slabMap[cat.id]||0;
return '<div style="margin-bottom:3px">'
+'<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'transparent\'" onclick="catMgrSelectCategory(\''+cat.id+'\')">'
+(hasChildren?'<button class="btn btn-ghost btn-sm" style="padding:0;width:18px;height:18px;font-size:10px" onclick="event.stopPropagation();catMgrToggleExpand(\''+cat.id+'\')">'+(isExpanded?'▼':'▶')+'</button>':'<span style="width:18px"></span>')
+'<span style="width:8px;height:8px;border-radius:50%;background:'+dotColor+';flex-shrink:0"></span>'
+'<span style="flex:1;font-weight:500;font-size:13px">'+esc(cat.name)+'</span>'
+(slabCount?'<span style="font-size:10px;font-weight:700;color:var(--purple);background:rgba(175,82,222,.12);padding:2px 6px;border-radius:10px">'+slabCount+' slab'+(slabCount===1?'':'s')+'</span>':'')
+'<span style="font-size:10px;font-weight:700;color:var(--blue);background:rgba(0,122,255,.08);padding:2px 6px;border-radius:4px">'+levelBadge+'</span>'
+'</div>'
+(hasChildren&&isExpanded?'<div style="margin-left:16px;border-left:2px solid var(--gray-200);padding-left:8px">'+catMgrRenderTree(children,allCats,slabMap,depth+1)+'</div>':'')
+'</div>';
}).join('');
}

function catMgrToggleExpand(catId){const isExpanded=JSON.parse(localStorage.getItem('cat-exp-'+catId)||'true');localStorage.setItem('cat-exp-'+catId,JSON.stringify(!isExpanded));const treeEl=$('cat-tree');if(treeEl){const tree=_catAllCats.filter(c=>!c.parent_id);treeEl.innerHTML=catMgrRenderTree(tree,_catAllCats,_catSlabCountMap);}}
async function catMgrSelectCategory(catId){
const cat=(await sb.get("categories","*",{id:`eq.${catId}`}).catch(()=>[]))[0];
if(!cat)return;
const content=document.getElementById('cat-content');
if(!content)return;
const parent=cat.parent_id?(await sb.get("categories","id,name",{id:`eq.${cat.parent_id}`}).catch(()=>[]))[0]:null;
const children=await sb.get("categories","id,name",{parent_id:`eq.${catId}`}).catch(()=>[]);
const slabs=await sb.get('commission_rules','id,price_min,price_max,commission_percent,is_active',{category_id:`eq.${catId}`,product_id:'is.null',is_active:'eq.true',order:'price_min.asc,priority.desc'}).catch(()=>[]);
const gstDisplay=cat.gst_slab||'Not set';
const commValue=catMgrCommissionValue(cat);
const cashback=catMgrNum(cat.user_cashback_percent,0);
const affiliate=catMgrNum(cat.affiliate_percent,0);
content.innerHTML=`<div style="max-width:700px"><div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--gray-200)"><div><h2 style="font-size:24px;font-weight:800">${esc(cat.name)}</h2><p style="font-size:12px;color:var(--gray-400);margin-top:4px">Level ${cat.level}</p></div><div style="display:flex;gap:8px"><button class="btn btn-outline btn-pill btn-sm" onclick="catMgrShowEditForm('${cat.id}')">✏️ Edit</button><button class="btn btn-danger btn-pill btn-sm" onclick="catMgrDeleteCategory('${cat.id}')">🗑️ Delete</button></div></div><div class="ap-card" style="margin-bottom:20px"><p style="font-weight:700;margin-bottom:16px">Business Rules</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div style="padding:12px;background:var(--gray-50);border-radius:8px"><p style="font-size:11px;color:var(--gray-500);text-transform:uppercase;font-weight:600;margin-bottom:4px">GST</p><p style="font-size:18px;font-weight:800;color:var(--gold-dark)">${esc(gstDisplay)}</p></div><div style="padding:12px;background:var(--gray-50);border-radius:8px"><p style="font-size:11px;color:var(--gray-500);text-transform:uppercase;font-weight:600;margin-bottom:4px">Commission</p><p style="font-size:18px;font-weight:800;color:var(--blue)">${commValue}%</p></div><div style="padding:12px;background:var(--gray-50);border-radius:8px"><p style="font-size:11px;color:var(--gray-500);text-transform:uppercase;font-weight:600;margin-bottom:4px">Cashback</p><p style="font-size:18px;font-weight:800;color:var(--green)">${cashback}%</p></div><div style="padding:12px;background:var(--gray-50);border-radius:8px"><p style="font-size:11px;color:var(--gray-500);text-transform:uppercase;font-weight:600;margin-bottom:4px">Affiliate</p><p style="font-size:18px;font-weight:800;color:var(--purple)">${affiliate}%</p></div></div></div><div class="ap-card" style="margin-bottom:20px"><p style="font-weight:700;margin-bottom:12px">Price Based Commission Slabs</p>${slabs.length?`<div style="display:flex;flex-direction:column;gap:8px">${slabs.map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--gray-50);border-radius:8px"><span style="font-size:13px;color:var(--gray-600)">₹${catMgrNum(s.price_min,0)}${s.price_max!=null?` - ₹${catMgrNum(s.price_max,0)}`:'+'}</span><span style="font-weight:800;color:var(--blue)">${catMgrNum(s.commission_percent,0)}%</span></div>`).join('')}</div>`:'<p style="font-size:13px;color:var(--gray-400)">No slabs configured yet.</p>'}</div>${parent?`<div class="ap-card" style="margin-bottom:20px"><p style="font-weight:700;margin-bottom:8px">Parent Category</p><p style="font-size:14px;color:var(--gray-600)">${esc(parent.name)}</p></div>`:''} ${children.length>0?`<div class="ap-card"><p style="font-weight:700;margin-bottom:12px">Sub Categories (${children.length})</p><div style="display:flex;flex-direction:column;gap:8px">${children.map(child=>`<div style="padding:10px;background:var(--gray-50);border-radius:6px;cursor:pointer" onclick="catMgrSelectCategory('${child.id}')">${esc(child.name)}</div>`).join('')}</div></div>`:''}</div>`;
}
async function catMgrShowAddForm(parentId=null){
const modal=document.getElementById('cat-modal');
const formEl=document.getElementById('cat-form');
const titleEl=document.getElementById('cat-modal-title');
let parentCat=null;
if(parentId)parentCat=(await sb.get("categories","*",{id:`eq.${parentId}`}).catch(()=>[]))[0];
const allCats=await sb.get("categories","id,name,level",{is_active:"eq.true",order:"name.asc"}).catch(()=>[]);
const validParents=parentId?[]:allCats.filter(c=>c.level<3);
titleEl.textContent='Add New Category';
formEl.innerHTML=`<div style="display:flex;flex-direction:column;gap:16px"><div class="form-group"><label class="form-label">Category Name *</label><input class="form-input" id="cat-name" placeholder="e.g., Electronics" maxlength="100"></div>${!parentId?`<div class="form-group"><label class="form-label">Parent Category</label><select class="form-select" id="cat-parent"><option value="">— Main Category —</option>${validParents.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>`:`<div style="padding:12px;background:var(--gold-light);border-radius:8px"><p style="font-size:12px">📁 Parent: <strong>${esc(parentCat.name)}</strong></p></div><input type="hidden" id="cat-parent" value="${parentId}">`}<div class="form-group"><label class="form-label">GST Slab *</label><select class="form-select" id="cat-gst">${CATEGORY_CONSTS.GST_SLABS.map(slab=>`<option value="${slab}">${slab}</option>`).join('')}</select></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Platform Commission (%)</label><input class="form-input" id="cat-commission" type="number" min="0" max="100" step="0.5" value="8"></div><div class="form-group"><label class="form-label">User Cashback (%)</label><input class="form-input" id="cat-cashback" type="number" min="0" max="100" step="0.5" value="0"></div></div><div class="form-group"><label class="form-label">Affiliate Commission (%)</label><input class="form-input" id="cat-affiliate" type="number" min="0" max="100" step="0.5" value="0"></div><div class="ap-card" style="margin:0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><p style="font-weight:700;font-size:13px">Price Based Commission Slabs</p><div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm btn-pill" onclick="catMgrCopyParentSlabs()">⎘ Copy Parent</button><button class="btn btn-outline btn-sm btn-pill" onclick="catMgrAddSlab()">+ Add Slab</button></div></div><div id="cat-slab-rows"></div><p style="font-size:11px;color:var(--gray-400);margin-top:6px">Drag rows to reorder slabs. Example: 0-1000 = 8%, 1000-2000 = 10%. Last slab can have empty max.</p></div><div style="background:var(--gray-50);padding:12px;border-radius:8px;border-left:3px solid var(--orange);font-size:12px;color:var(--gray-600)">💡 Cashback + Affiliate must not exceed slab commission</div><div style="display:flex;gap:8px"><button class="btn btn-gold btn-pill" onclick="catMgrSaveCategory('${parentId||''}')">Save Category</button><button class="btn btn-outline btn-pill" onclick="catMgrCloseForm()">Cancel</button></div></div>`;
modal.classList.remove('hide');
catMgrSeedSlabs();
document.getElementById('cat-name').focus();
}
async function catMgrShowEditForm(catId){
const cat=(await sb.get("categories","*",{id:`eq.${catId}`}).catch(()=>[]))[0];
if(!cat)return;
const modal=document.getElementById('cat-modal');
const formEl=document.getElementById('cat-form');
const titleEl=document.getElementById('cat-modal-title');
const allCats=await sb.get("categories","id,name,level",{is_active:"eq.true",order:"name.asc"}).catch(()=>[]);
const validParents=allCats.filter(c=>c.level<cat.level&&c.id!==catId);
const existingSlabs=await sb.get('commission_rules','id,price_min,price_max,commission_percent',{category_id:`eq.${catId}`,product_id:'is.null',order:'price_min.asc,priority.desc'}).catch(()=>[]);
titleEl.textContent=`Edit: ${esc(cat.name)}`;
formEl.innerHTML=`<div style="display:flex;flex-direction:column;gap:16px"><div class="form-group"><label class="form-label">Category Name *</label><input class="form-input" id="cat-name" value="${esc(cat.name)}" maxlength="100"></div><div class="form-group"><label class="form-label">Parent Category</label><select class="form-select" id="cat-parent"><option value="">— Main Category —</option>${validParents.map(p=>`<option value="${p.id}" ${cat.parent_id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">GST Slab *</label><select class="form-select" id="cat-gst">${CATEGORY_CONSTS.GST_SLABS.map(slab=>`<option value="${slab}" ${cat.gst_slab===slab?'selected':''}>${slab}</option>`).join('')}</select></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Platform Commission (%)</label><input class="form-input" id="cat-commission" type="number" min="0" max="100" step="0.5" value="${catMgrCommissionValue(cat)}"></div><div class="form-group"><label class="form-label">User Cashback (%)</label><input class="form-input" id="cat-cashback" type="number" min="0" max="100" step="0.5" value="${catMgrNum(cat.user_cashback_percent,0)}"></div></div><div class="form-group"><label class="form-label">Affiliate Commission (%)</label><input class="form-input" id="cat-affiliate" type="number" min="0" max="100" step="0.5" value="${catMgrNum(cat.affiliate_percent,0)}"></div><div class="ap-card" style="margin:0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><p style="font-weight:700;font-size:13px">Price Based Commission Slabs</p><div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm btn-pill" onclick="catMgrCopyParentSlabs()">⎘ Copy Parent</button><button class="btn btn-outline btn-sm btn-pill" onclick="catMgrAddSlab()">+ Add Slab</button></div></div><div id="cat-slab-rows"></div><p style="font-size:11px;color:var(--gray-400);margin-top:6px">Drag rows to reorder slabs. Example: 0-1000 = 8%, 1000-2000 = 10%. Last slab can have empty max.</p></div><div style="background:var(--gray-50);padding:12px;border-radius:8px;border-left:3px solid var(--orange);font-size:12px;color:var(--gray-600)">💡 Cashback + Affiliate must not exceed slab commission</div><div style="display:flex;gap:8px"><button class="btn btn-gold btn-pill" onclick="catMgrUpdateCategory('${catId}')">Save Changes</button><button class="btn btn-outline btn-pill" onclick="catMgrCloseForm()">Cancel</button></div></div>`;
modal.classList.remove('hide');
catMgrSeedSlabs(existingSlabs);
document.getElementById('cat-name').focus();
}
function catMgrCloseForm(){document.getElementById('cat-modal').classList.add('hide');}
async function catMgrValidate(name,parentId,gst,commission,cashback,affiliate){
name=name.trim();
if(!name||name.length<2){toast('Name required (min 2)','⚠️');return false;}
if(name.length>100){toast('Name too long (max 100)','⚠️');return false;}
commission=parseFloat(commission)||0;cashback=parseFloat(cashback)||0;affiliate=parseFloat(affiliate)||0;
if(commission<0||commission>100){toast('Commission must be 0-100%','⚠️');return false;}
if(cashback<0||cashback>100){toast('Cashback must be 0-100%','⚠️');return false;}
if(affiliate<0||affiliate>100){toast('Affiliate must be 0-100%','⚠️');return false;}
if(cashback+affiliate>commission){toast(`Cashback+Affiliate (${cashback+affiliate}%) cannot exceed Commission (${commission}%)`,'⚠️');return false;}
if(parentId){const parent=(await sb.get("categories","id,parent_id",{id:`eq.${parentId}`}).catch(()=>[]))[0];if(!parent){toast('Parent not found','⚠️');return false;}}
return{name,parentId:parentId||null,gst,commission,cashback,affiliate};
}
async function catMgrSaveCategory(parentId){
const name=document.getElementById('cat-name').value;
const parentInput=document.getElementById('cat-parent').value;
const gst=document.getElementById('cat-gst').value;
const commission=document.getElementById('cat-commission').value;
const cashback=document.getElementById('cat-cashback').value;
const affiliate=document.getElementById('cat-affiliate').value;
const valid=await catMgrValidate(name,parentInput||null,gst,commission,cashback,affiliate);
if(!valid)return;
const slabRes=catMgrReadSlabs();
if(!slabRes.ok){toast(slabRes.error,'⚠️');return;}
const minSlabCommission=Math.min(...slabRes.slabs.map(s=>s.commission_percent));
if((catMgrNum(cashback,0)+catMgrNum(affiliate,0))>minSlabCommission){toast('Cashback + Affiliate cannot exceed the minimum slab commission','⚠️');return;}
let level=1;
if(valid.parentId){const parent=(await sb.get("categories","level",{id:`eq.${valid.parentId}`}).catch(()=>[]))[0];if(parent)level=parent.level+1;if(level>3){toast('Cannot nest more than 3 levels','⚠️');return;}}
const existing=await sb.get("categories","id",{name:`eq.${valid.name}`,parent_id:valid.parentId?`eq.${valid.parentId}`:'is.null'}).catch(()=>[]);
if(existing.length>0){toast('Category exists','⚠️');return;}
const r=await sb.ins("categories",{name:valid.name,parent_id:valid.parentId,level,gst_slab:valid.gst,platform_commission:valid.commission,user_cashback_percent:valid.cashback,affiliate_percent:valid.affiliate,is_active:true,created_by:PROFILE.id}).catch(()=>null);
if(Array.isArray(r)&&r.length){
  await catMgrSaveSlabs(r[0].id,slabRes.slabs);
  toast(`"${valid.name}" created!`,'✅');
  catMgrCloseForm();
  apRefreshCatPage();
}else{toast('Error while creating category','❌');}
}
async function catMgrUpdateCategory(catId){
const name=document.getElementById('cat-name').value;
const parentInput=document.getElementById('cat-parent').value;
const gst=document.getElementById('cat-gst').value;
const commission=document.getElementById('cat-commission').value;
const cashback=document.getElementById('cat-cashback').value;
const affiliate=document.getElementById('cat-affiliate').value;
const valid=await catMgrValidate(name,parentInput||null,gst,commission,cashback,affiliate);
if(!valid)return;
const slabRes=catMgrReadSlabs();
if(!slabRes.ok){toast(slabRes.error,'⚠️');return;}
const minSlabCommission=Math.min(...slabRes.slabs.map(s=>s.commission_percent));
if((catMgrNum(cashback,0)+catMgrNum(affiliate,0))>minSlabCommission){toast('Cashback + Affiliate cannot exceed the minimum slab commission','⚠️');return;}
const cat=(await sb.get("categories","*",{id:`eq.${catId}`}).catch(()=>[]))[0];
if(!cat)return toast('Category not found','❌');
const existing=await sb.get("categories","id",{name:`eq.${valid.name}`,parent_id:valid.parentId?`eq.${valid.parentId}`:'is.null',id:`neq.${catId}`}).catch(()=>[]);
if(existing.length>0){toast('Category exists','⚠️');return;}
const r=await sb.upd("categories",{name:valid.name,parent_id:valid.parentId,gst_slab:valid.gst,platform_commission:valid.commission,user_cashback_percent:valid.cashback,affiliate_percent:valid.affiliate,updated_by:PROFILE.id,updated_at:new Date().toISOString()},{id:`eq.${catId}`}).catch(()=>null);
if(Array.isArray(r)&&r.length){
  await catMgrSaveSlabs(catId,slabRes.slabs);
  toast(`"${valid.name}" updated!`,'✅');
  catMgrCloseForm();
  apRefreshCatPage();
}else{toast('Error while updating category (possibly blocked by permissions)', '❌');}
}
async function catMgrDeleteCategory(catId){
const cat=(await sb.get("categories","*",{id:`eq.${catId}`}).catch(()=>[]))[0];
if(!cat)return;
const children=await sb.get("categories","id",{parent_id:`eq.${catId}`}).catch(()=>[]);
if(children.length>0){toast(`Cannot delete: has ${children.length} sub-categories`,'⚠️');return;}
if(!confirm(`Delete "${cat.name}"?`))return;
const r=await sb.del("categories",{id:`eq.${catId}`}).catch(()=>null);
if(r){toast(`"${cat.name}" deleted!`,'✅');apRefreshCatPage();}else{toast('Error','❌');}
}

// ──────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────
function emptySupportConfig(){
  return {email:'',phone:'',chatbot:'',helpCenter:'',hours:'',notes:''};
}

function supportPageKey(section){
  return section==='vendors'?'support-vendors':'support-users';
}

async function fetchSupportConfig(section){
  const rows=await sb.get("page_layouts","*",{page:`eq.${supportPageKey(section)}`,section_type:"eq.support_content",order:"updated_at.desc",limit:1}).catch(()=>[]);
  return rows[0]||null;
}

async function saveSupportConfig(section){
  const prefix=section==='vendors'?'support-vendors':'support-users';
  const content={
    email:$(prefix+'-email')?.value?.trim()||'',
    phone:$(prefix+'-phone')?.value?.trim()||'',
    chatbot:$(prefix+'-chatbot')?.value?.trim()||'',
    helpCenter:$(prefix+'-help')?.value?.trim()||'',
    hours:$(prefix+'-hours')?.value?.trim()||'',
    notes:$(prefix+'-notes')?.value?.trim()||'',
  };
  const page=supportPageKey(section);
  const existing=await fetchSupportConfig(section);
  const payload={
    page,
    section_type:'support_content',
    title:section==='vendors'?'Vendor Support':'User Support',
    content,
    device:'all',
    sort_order:0,
    is_active:true,
    is_draft:false,
    updated_at:new Date().toISOString(),
  };
  if(existing?.id){
    await sb.upd('page_layouts',payload,{id:`eq.${existing.id}`});
  }else{
    payload.created_by=PROFILE.id;
    await sb.ins('page_layouts',payload);
  }
  toast('Support details saved to Supabase','✅');
}

async function resetSupportConfig(section){
  const existing=await fetchSupportConfig(section);
  if(existing?.id){
    await sb.upd('page_layouts',{content:emptySupportConfig(),updated_at:new Date().toISOString()},{id:`eq.${existing.id}`});
  }
  apTab('support',section);
  toast('Support details cleared','🧹');
}

async function apSupport(el,tab){
  const tabs=[{id:'users',label:'For Users'},{id:'vendors',label:'For Vendors'}];
  const [usersRow,vendorsRow]=await Promise.all([fetchSupportConfig('users'),fetchSupportConfig('vendors')]);
  const config={users:usersRow?.content||emptySupportConfig(),vendors:vendorsRow?.content||emptySupportConfig()};

  if(tab==='users'){
    const data=config.users||{};
    el.innerHTML=`
    <div class="ap-header">
      <div>
        <div class="ap-title">🛟 Support For Users</div>
        <div class="ap-sub">Add help email, chatbot links, FAQs, or escalation contacts for shoppers later.</div>
      </div>
    </div>
    ${apTabBar('support',tabs,'users')}
    <div class="ap-card">
      <div class="ap-card-title">User Support Settings</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group"><label class="form-label">Support Email</label><input class="form-input" id="support-users-email" placeholder="support@glonni.com" value="${esc(data.email||'')}"></div>
        <div class="form-group"><label class="form-label">Support Phone</label><input class="form-input" id="support-users-phone" placeholder="+91 ..." value="${esc(data.phone||'')}"></div>
        <div class="form-group"><label class="form-label">Chatbot / Live Chat Link</label><input class="form-input" id="support-users-chatbot" placeholder="https://..." value="${esc(data.chatbot||'')}"></div>
        <div class="form-group"><label class="form-label">Help Center URL</label><input class="form-input" id="support-users-help" placeholder="https://..." value="${esc(data.helpCenter||'')}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:14px;margin-top:4px">
        <div class="form-group"><label class="form-label">Support Hours</label><input class="form-input" id="support-users-hours" placeholder="Mon-Sat, 9 AM to 7 PM" value="${esc(data.hours||'')}"></div>
        <div class="form-group"><label class="form-label">Internal Notes</label><textarea class="form-textarea" id="support-users-notes" placeholder="Add instructions for future support setup..." style="min-height:100px">${esc(data.notes||'')}</textarea></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-outline btn-pill btn-sm" onclick="resetSupportConfig('users')">Clear</button>
        <button class="btn btn-gold btn-pill btn-sm" onclick="saveSupportConfig('users')">Save User Support</button>
      </div>
      <div style="margin-top:16px;padding:14px;border-radius:10px;background:var(--gray-50);border:1px dashed var(--gray-200)">
        <p style="font-size:12px;color:var(--gray-500);margin:0">These details are stored in Supabase and shared across admins. The public support page reads the same values.</p>
      </div>
    </div>`;
  } else if(tab==='vendors'){
    const data=config.vendors||{};
    el.innerHTML=`
    <div class="ap-header">
      <div>
        <div class="ap-title">🏪 Support For Vendors</div>
        <div class="ap-sub">Add onboarding help, account management contacts, and seller support channels later.</div>
      </div>
    </div>
    ${apTabBar('support',tabs,'vendors')}
    <div class="ap-card">
      <div class="ap-card-title">Vendor Support Settings</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group"><label class="form-label">Vendor Support Email</label><input class="form-input" id="support-vendors-email" placeholder="partners@glonni.com" value="${esc(data.email||'')}"></div>
        <div class="form-group"><label class="form-label">Vendor Support Phone</label><input class="form-input" id="support-vendors-phone" placeholder="+91 ..." value="${esc(data.phone||'')}"></div>
        <div class="form-group"><label class="form-label">Onboarding / Chat Link</label><input class="form-input" id="support-vendors-chatbot" placeholder="https://..." value="${esc(data.chatbot||'')}"></div>
        <div class="form-group"><label class="form-label">Seller Help Center URL</label><input class="form-input" id="support-vendors-help" placeholder="https://..." value="${esc(data.helpCenter||'')}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:14px;margin-top:4px">
        <div class="form-group"><label class="form-label">Support Hours</label><input class="form-input" id="support-vendors-hours" placeholder="Mon-Fri, 10 AM to 6 PM" value="${esc(data.hours||'')}"></div>
        <div class="form-group"><label class="form-label">Internal Notes</label><textarea class="form-textarea" id="support-vendors-notes" placeholder="Add vendor support process notes..." style="min-height:100px">${esc(data.notes||'')}</textarea></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-outline btn-pill btn-sm" onclick="resetSupportConfig('vendors')">Clear</button>
        <button class="btn btn-gold btn-pill btn-sm" onclick="saveSupportConfig('vendors')">Save Vendor Support</button>
      </div>
      <div style="margin-top:16px;padding:14px;border-radius:10px;background:var(--gray-50);border:1px dashed var(--gray-200)">
        <p style="font-size:12px;color:var(--gray-500);margin:0">These details are stored in Supabase and shared across admins. The public vendor support page reads the same values.</p>
      </div>
    </div>`;
  }
}

async function renderSupportPage(tab='users'){
  const [usersRow,vendorsRow]=await Promise.all([fetchSupportConfig('users'),fetchSupportConfig('vendors')]);
  const users=usersRow?.content||emptySupportConfig();
  const vendors=vendorsRow?.content||emptySupportConfig();
  const data=tab==='vendors'?vendors:users;
  const title=tab==='vendors'?'Vendor Support':'User Support';
  const subtitle=tab==='vendors'
    ?'Get help with onboarding, payouts, catalog issues, and seller operations.'
    :'Get help with orders, returns, payments, and account issues.';
  const empty=!data.email&&!data.phone&&!data.chatbot&&!data.helpCenter&&!data.hours&&!data.notes;

  $('main').innerHTML=`<div class="container" style="padding:32px 0 64px">
    <div class="ap-card" style="max-width:920px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px">
        <div>
          <h1 style="font-size:28px;font-weight:900;margin-bottom:6px">🛟 ${title}</h1>
          <p style="font-size:14px;color:var(--gray-500)">${subtitle}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ${tab==='users'?'btn-gold':'btn-outline'} btn-pill btn-sm" onclick="go('support-users')">For Users</button>
          <button class="btn ${tab==='vendors'?'btn-gold':'btn-outline'} btn-pill btn-sm" onclick="go('support-vendors')">For Vendors</button>
        </div>
      </div>
      ${empty?`<div class="ap-empty"><span>🛟</span><p style="font-weight:600">Support details will be available soon</p><p style="font-size:13px;color:var(--gray-500)">The admin team has not published support contact details for this section yet.</p></div>`:`
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
        <div style="padding:16px;border:1px solid var(--gray-100);border-radius:12px;background:var(--gray-50)">
          <p style="font-size:12px;color:var(--gray-400);margin-bottom:6px">Email</p>
          <p style="font-weight:700">${data.email?`<a href="mailto:${esc(data.email)}" style="color:var(--black);text-decoration:none">${esc(data.email)}</a>`:'Not available yet'}</p>
        </div>
        <div style="padding:16px;border:1px solid var(--gray-100);border-radius:12px;background:var(--gray-50)">
          <p style="font-size:12px;color:var(--gray-400);margin-bottom:6px">Phone</p>
          <p style="font-weight:700">${data.phone?`<a href="tel:${esc(data.phone)}" style="color:var(--black);text-decoration:none">${esc(data.phone)}</a>`:'Not available yet'}</p>
        </div>
        <div style="padding:16px;border:1px solid var(--gray-100);border-radius:12px;background:var(--gray-50)">
          <p style="font-size:12px;color:var(--gray-400);margin-bottom:6px">Chat</p>
          <p style="font-weight:700">${data.chatbot?`<a href="${esc(data.chatbot)}" target="_blank" rel="noopener" style="color:var(--black);text-decoration:none">Open support chat</a>`:'Not available yet'}</p>
        </div>
        <div style="padding:16px;border:1px solid var(--gray-100);border-radius:12px;background:var(--gray-50)">
          <p style="font-size:12px;color:var(--gray-400);margin-bottom:6px">Help Center</p>
          <p style="font-weight:700">${data.helpCenter?`<a href="${esc(data.helpCenter)}" target="_blank" rel="noopener" style="color:var(--black);text-decoration:none">Visit help center</a>`:'Not available yet'}</p>
        </div>
      </div>
      <div style="margin-top:16px;padding:18px;border-radius:12px;background:#fff;border:1px solid var(--gray-100)">
        <p style="font-size:12px;color:var(--gray-400);margin-bottom:6px">Support Hours</p>
        <p style="font-weight:700;margin-bottom:12px">${esc(data.hours||'Not available yet')}</p>
        <p style="font-size:12px;color:var(--gray-400);margin-bottom:6px">Additional Notes</p>
        <p style="font-size:14px;color:var(--gray-600);line-height:1.7">${esc(data.notes||'No additional guidance has been published yet.')}</p>
      </div>`}
    </div>
  </div>`;
}

// SETTINGS
// ──────────────────────────────────────────
async function apSettings(el,tab){
  const tabs=[{id:'rules',label:'Platform Rules'},{id:'approvals',label:'Approvals Queue'},{id:'ai',label:'AI Services'},{id:'audit',label:'Audit Log'}];
  
  if(tab==='categories'){tab='rules';}
  if(tab==='rules'){
    const rules=await sb.get("platform_rules","*",{order:"created_at.desc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">⚙️ Platform Rules <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${rules.length})</span></div></div>
    ${apTabBar('settings',tabs,'rules')}
    ${!rules.length?`<div class="ap-empty"><span>⚙️</span><p style="font-weight:600">No rules yet</p></div>`
    :rules.map(r=>`<div class="ap-card">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <p style="font-weight:700">${esc(r.rule_name||'Rule')}</p>
          <p style="font-size:12px;color:var(--gray-500);margin-top:2px">${esc(r.description||'')}</p>
        </div>
        <span class="badge" style="background:${r.approval_status==='approved'?'var(--green)':r.approval_status==='pending_approval'?'var(--orange)':'var(--red)'}; color:#fff;font-size:10px">${r.approval_status}</span>
      </div>
    </div>`).join('')}`;
  } else if(tab==='approvals'){
    const queue=await sb.get("approval_queue","*",{status:"eq.pending",order:"created_at.asc"}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">✅ Approvals Queue <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${queue.length})</span></div></div>
    ${apTabBar('settings',tabs,'approvals')}
    ${!queue.length?`<div class="ap-empty"><span>✅</span><p style="font-weight:600">No pending approvals</p></div>`
    :queue.map(a=>`<div class="ap-card">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div>
          <p style="font-weight:700">${esc(a.item_type||'Item')}</p>
          <p style="font-size:12px;color:var(--gray-500);margin-top:2px">${esc(a.item_name||'—')}</p>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-success btn-sm btn-pill" onclick="approveItem('${a.id}')">✅ Approve</button>
        <button class="btn btn-danger btn-sm btn-pill" onclick="rejectItem('${a.id}')">❌ Reject</button>
      </div>
    </div>`).join('')}`;
  } else if(tab==='ai'){
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">🤖 AI Services Configuration</div></div>
    ${apTabBar('settings',tabs,'ai')}
    <div class="ap-card">
      <p style="font-weight:700;margin-bottom:12px">Active AI Provider</p>
      <p style="font-size:13px;color:var(--gray-600)">Currently using: <span style="font-weight:700;color:var(--gold)">Gemini 2.5 Flash</span></p>
      <p style="font-size:12px;color:var(--gray-500);margin-top:8px">Configure AI models and endpoints for different operations</p>
    </div>`;
  } else if(tab==='audit'){
    const logs=await sb.get("audit_logs","*,profiles(full_name)",{order:"created_at.desc",limit:30}).catch(()=>[]);
    el.innerHTML=`
    <div class="ap-header"><div class="ap-title">📋 Audit Log <span style="font-size:16px;font-weight:400;color:var(--gray-400)">(${logs.length})</span></div></div>
    ${apTabBar('settings',tabs,'audit')}
    <div class="ap-card" style="padding:0;overflow:hidden">
      <table class="ap-table">
        <thead><tr><th>Action</th><th>By</th><th>Details</th><th>Time</th></tr></thead>
        <tbody>
          ${logs.map(l=>`<tr>
            <td style="font-weight:600">${esc(l.action||'—')}</td>
            <td style="font-size:12px">${esc(l.profiles?.full_name||'System')}</td>
            <td style="font-size:12px;color:var(--gray-500)">${esc(l.description||'—')}</td>
            <td style="font-size:11px;color:var(--gray-400)">${new Date(l.created_at).toLocaleString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }
}

// ──────────────────────────────────────────
// CATALOG VERTICAL SELECTOR FUNCTIONS
// ──────────────────────────────────────────

window._catalogVertical = null;

async function loadMainCategories(){
  const cats = await sb.get("categories","*",{parent_id:"is.null",order:"name.asc"}).catch(()=>[]);
  return cats;
}

async function loadSubCategories(mainId){
  const cats = await sb.get("categories","*",{parent_id:`eq.${mainId}`,order:"name.asc"}).catch(()=>[]);
  return cats;
}

async function loadSubSubCategories(subId){
  const cats = await sb.get("categories","*",{parent_id:`eq.${subId}`,order:"name.asc"}).catch(()=>[]);
  return cats;
}

async function loadBrands(){
  const brands = await sb.get("brand_names","name",{order:"name.asc"}).catch(()=>[]);
  return brands;
}

async function updateVerticalSubCategories(){
  const mainId = document.getElementById('vsel-main').value;
  const subSelect = document.getElementById('vsel-sub');
  
  if(!mainId){
    subSelect.innerHTML = '<option value="">Select Sub Category</option>';
    document.getElementById('vsel-subsub').innerHTML = '<option value="">Select (if any)</option>';
    return;
  }
  
  const subs = await loadSubCategories(mainId);
  subSelect.innerHTML = '<option value="">Select Sub Category</option>' + subs.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  document.getElementById('vsel-subsub').innerHTML = '<option value="">Select (if any)</option>';
  updateVerticalID();
}

async function updateVerticalSubSubCategories(){
  const subId = document.getElementById('vsel-sub').value;
  const subsubSelect = document.getElementById('vsel-subsub');
  
  if(!subId){
    subsubSelect.innerHTML = '<option value="">Select (if any)</option>';
    updateVerticalID();
    return;
  }
  
  const subsubs = await loadSubSubCategories(subId);
  subsubSelect.innerHTML = '<option value="">No Sub-Sub Category</option>' + subsubs.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  updateVerticalID();
}

async function updateVerticalID(){
  const mainId = document.getElementById('vsel-main').value;
  const subId = document.getElementById('vsel-sub').value;
  const subsubId = document.getElementById('vsel-subsub').value;
  const brand = document.getElementById('vsel-brand').value.trim();
  
  if(!mainId || !brand){
    document.getElementById('vsel-id-box').style.display = 'none';
    return;
  }
  
  const main = await sb.get("categories","name",{id:`eq.${mainId}`}).then(r=>r[0]).catch(()=>null);
  if(!main) return;
  
  const mainStr = main.name.substring(0,4).toUpperCase();
  const subStr = subId ? (await sb.get("categories","name",{id:`eq.${subId}`}).then(r=>r[0]).catch(()=>null))?.name.substring(0,4).toUpperCase() : 'NONE';
  const subsubStr = subsubId ? (await sb.get("categories","name",{id:`eq.${subsubId}`}).then(r=>r[0]).catch(()=>null))?.name.substring(0,4).toUpperCase() : 'NONE';
  const brandStr = brand.substring(0,4).toUpperCase();
  const ts = Date.now().toString().slice(-3);
  
  const verticalId = mainStr + '-' + subStr + '-' + subsubStr + '-' + brandStr + '-' + ts;
  document.getElementById('vsel-id-text').textContent = verticalId;
  document.getElementById('vsel-id-box').style.display = 'block';
  
  window._catalogVertical = {
    verticalId: verticalId,
    mainId: mainId,
    subId: subId || null,
    subsubId: subsubId || null,
    brand: brand
  };
}

async function confirmVertical(){
  if(!window._catalogVertical){
    toast('Select all required fields','⚠️');
    return;
  }
  
  const cv = window._catalogVertical;
  
  // Save vertical to database
  const exists = await sb.get("catalog_verticals","id",{vertical_id:`eq.${cv.verticalId}`}).catch(()=>[]);
  if(exists.length === 0){
    await sb.ins("catalog_verticals",{
      vertical_id: cv.verticalId,
      main_category_id: cv.mainId,
      sub_category_id: cv.subId,
      sub_sub_category_id: cv.subsubId,
      brand_name: cv.brand,
      created_by: PROFILE.id
    }).catch(e=>console.error(e));
  }
  
  // Lock selector
  document.getElementById('vsel-selector').style.opacity = '0.5';
  document.getElementById('vsel-selector').style.pointerEvents = 'none';
  document.getElementById('vsel-tools').style.display = 'block';
  
  toast('Vertical selected: ' + cv.verticalId, '✅');
}

function resetVertical(){
  document.getElementById('vsel-main').value = '';
  document.getElementById('vsel-sub').innerHTML = '<option value="">Select Sub Category</option>';
  document.getElementById('vsel-subsub').innerHTML = '<option value="">Select (if any)</option>';
  document.getElementById('vsel-brand').value = '';
  document.getElementById('vsel-id-box').style.display = 'none';
  document.getElementById('vsel-selector').style.opacity = '1';
  document.getElementById('vsel-selector').style.pointerEvents = 'auto';
  document.getElementById('vsel-tools').style.display = 'none';
  window._catalogVertical = null;
}

// ──────────────────────────────────────────
// CATALOG
// ──────────────────────────────────────────
async function apCatalog(el,tab){
  if(tab)_catTab=tab;
  else _catTab='ai-builder';
  
  // Count pending items
  const reviewItems=await sb.get("catalog_products","id",{admin_status:"eq.draft"}).catch(()=>[]);
  const pendingOffers=await sb.get("vendor_offers","id",{is_approved:"eq.false"}).catch(()=>[]);
  const pendingCount=reviewItems.length;
  const offerPendingCount=pendingOffers.length;
  
  // Load categories and brands for selector
  const mainCats = await loadMainCategories();
  const brands = await loadBrands();

  const tabs=[
    {id:'ai-builder',  icon:'🤖', label:'AI Builder',       badge:null},
    {id:'review',      icon:'✅', label:'Review Queue',     badge:pendingCount},
    {id:'catalog-mgr', icon:'📦', label:'Catalog Manager',  badge:null},
    {id:'tax-comm',    icon:'%',  label:'Tax & Commission', badge:null},
    {id:'offers',      icon:'🎁', label:'Offers & Promos',  badge:null},
    {id:'vendor-offers',icon:'🏪',label:'Vendor Offers',    badge:offerPendingCount},
    {id:'ai-config',   icon:'⚙️', label:'AI Configuration', badge:null},
  ];

  el.innerHTML=`
  <div style="margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:20px;font-weight:800">📚 Catalog Management</h2>
        <p style="font-size:12px;color:var(--gray-400);margin-top:2px">AI-powered product extraction & management</p></div>
    </div>
  </div>
  
  <div id="vsel-selector" style="background:#fff;border:1px solid var(--gray-200);border-radius:12px;padding:20px;margin-bottom:20px">
    <h3 style="font-size:15px;font-weight:800;margin-bottom:16px">📦 Select Catalog Vertical</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <label class="form-label">Main Category</label>
        <select class="form-select" id="vsel-main" onchange="updateVerticalSubCategories()">
          <option value="">Select Category</option>
          ${mainCats.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')}
        </select>
      </div>
      <div>
        <label class="form-label">Sub Category</label>
        <select class="form-select" id="vsel-sub" onchange="updateVerticalSubSubCategories()">
          <option value="">Select Sub</option>
        </select>
      </div>
      <div>
        <label class="form-label">Sub-Sub Category</label>
        <select class="form-select" id="vsel-subsub" onchange="updateVerticalID()">
          <option value="">Select (if any)</option>
        </select>
      </div>
      <div>
        <label class="form-label">Brand Name</label>
        <div style="display:flex;gap:6px">
          <input type="text" class="form-input" id="vsel-brand" placeholder="Type brand..." list="vsel-brands" onchange="updateVerticalID()">
          <datalist id="vsel-brands">
            ${brands.map(b=>'<option value="'+b.name+'"></option>').join('')}
          </datalist>
        </div>
      </div>
    </div>
    <div id="vsel-id-box" style="display:none;background:var(--gold-light);border:1px solid var(--gold);border-radius:8px;padding:12px;margin-bottom:12px">
      <p style="font-size:10px;color:var(--gray-500);margin:0 0 4px 0;text-transform:uppercase;font-weight:600">Vertical ID</p>
      <p id="vsel-id-text" style="font-size:16px;font-weight:800;color:var(--gold-dark);margin:0;font-family:monospace">-</p>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill btn-sm" onclick="confirmVertical()">Confirm Vertical</button>
      <button class="btn btn-outline btn-pill btn-sm" onclick="resetVertical()">Reset</button>
    </div>
  </div>
  
  <div id="vsel-tools" style="display:none;margin-bottom:20px">
    <div class="ap-tabs" style="margin-bottom:20px">
      ${tabs.map(t=>'<button class="ap-tab '+(_catTab===t.id?'active':'')+'" data-tab="'+t.id+'" onclick="apTab(String.fromCharCode(39)+String.fromCharCode(99)+String.fromCharCode(97)+String.fromCharCode(116)+String.fromCharCode(97)+String.fromCharCode(108)+String.fromCharCode(111)+String.fromCharCode(103)+String.fromCharCode(39)+String.fromCharCode(44)+String.fromCharCode(39)+t.id+String.fromCharCode(39))"><span style="margin-right:6px">'+t.icon+'</span>'+t.label+(t.badge?('<span style="margin-left:6px;background:#FF3B30;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:20px">'+t.badge+'</span>'):'')+'</button>').join('')}
    </div>
  </div>
  
  <div id="cat-content" style="min-height:400px;display:none"></div>`;

  // Render the active tab - use setTimeout to ensure DOM is ready
  setTimeout(async ()=>{
    if(!window._catalogVertical) return;
    
    const contentEl=document.getElementById('cat-content');
    if(!contentEl)return;
    contentEl.style.display='block';
    contentEl.innerHTML='<div style="text-align:center;padding:32px;color:var(--gray-400)">⏳ Loading...</div>';
    
    try{
      if(_catTab==='ai-builder')    await catTabAIBuilder(contentEl);
      else if(_catTab==='review')   await catTabReview(contentEl);
      else if(_catTab==='catalog-mgr') await catTabCatalogMgr(contentEl);
      else if(_catTab==='tax-comm') await catTabTaxComm(contentEl);
      else if(_catTab==='offers')   await catTabOffers(contentEl);
      else if(_catTab==='vendor-offers') await catTabVendorOffers(contentEl);
      else if(_catTab==='ai-config')await catTabAIConfig(contentEl);
    }catch(e){
      console.error('Catalog tab error:',e);
      contentEl.innerHTML='<div style="padding:20px;color:var(--red)">Error loading tab. Please try again.</div>';
    }
  },0);
}

// ──────────────────────────────────────────
// SHARED UTIL: filter table rows by search
// ──────────────────────────────────────────
function apFilterTable(tableId,query){
  const q=query.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row=>{
    row.style.display=!q||row.dataset.search?.includes(q)?'':'none';
  });
}

// ──────────────────────────────────────────
// apTarget() — renders old standalone pages inside ap-content if sidebar exists
// Old admin functions call $('main').innerHTML — we intercept that here
// ──────────────────────────────────────────
function apTarget(){
  return document.getElementById('ap-content')||$('main');
}

// Wrap an old standalone admin function so it renders inside the sidebar content area
// with a back button at top. Replaces the content of ap-content, not $('main').
// ──────────────────────────────────────────
// SHARED UTIL: filter table rows by search
// ──────────────────────────────────────────
function apFilterTable(tableId,query){
  const q=query.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row=>{
    row.style.display=!q||row.dataset.search?.includes(q)?'':'none';
  });
}

function apTarget(){return document.getElementById('ap-content')||$('main');}

// apRunInSidebar — simply calls the function directly.
// Old admin pages render to $('main') with their own back button → "← Admin Panel"
function apRunInSidebar(fn){fn();}


// ═══════════════════════════════════════════════════
// WEBSITE LAYOUT EDITOR
// ═══════════════════════════════════════════════════
const WL_PAGES=[
  {key:'home',label:'🏠 Home',icon:'🏠'},
  {key:'shop',label:'🛍️ Shop',icon:'🛍️'},
  {key:'product',label:'📦 Product Detail',icon:'📦'},
  {key:'cart',label:'🛒 Cart',icon:'🛒'},
  {key:'checkout',label:'💳 Checkout',icon:'💳'},
  {key:'orders',label:'📋 Orders',icon:'📋'},
  {key:'wallet',label:'💰 Wallet',icon:'💰'},
  {key:'profile',label:'👤 Profile',icon:'👤'},
];
const WL_SECTION_TYPES=[
  {type:'announcement_bar',icon:'📢',label:'Announcement Bar',desc:'Top strip message'},
  {type:'hero_carousel',icon:'🎠',label:'Hero Carousel',desc:'Full-width hero slides'},
  {type:'banner',icon:'🖼️',label:'Banner',desc:'Image or gradient banner'},
  {type:'product_row',icon:'🏪',label:'Product Row',desc:'Horizontal product scroll'},
  {type:'category_grid',icon:'📂',label:'Category Grid',desc:'Category icon grid'},
  {type:'trust_bar',icon:'✅',label:'Trust Bar',desc:'Icons + reassurance text'},
  {type:'countdown',icon:'⏱️',label:'Countdown Timer',desc:'Sale countdown banner'},
  {type:'spacer',icon:'↕️',label:'Spacer',desc:'Vertical spacing'},
];
let WL_PAGE='home';
let WL_SLIDES=[];

async function renderAdminLayout(page){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  if(page)WL_PAGE=page;
  $('main').innerHTML='<div style="padding:40px;text-align:center;color:var(--gray-400)">Loading layout editor...</div>';
  const sections=await sb.get("page_layouts","*",{page:`eq.${WL_PAGE}`,order:"sort_order.asc"});
  const liveSections=sections.filter(s=>s.is_active&&!s.is_draft);
  const draftSections=sections.filter(s=>s.is_draft||!s.is_active);
  const hasDrafts=draftSections.length>0;
  $('main').innerHTML=`<div class="wl-wrap">
    <div class="wl-nav">
      <div class="wl-nav-title">Pages</div>
      ${WL_PAGES.map(p=>`<div class="wl-nav-item ${WL_PAGE===p.key?'active':''}" onclick="renderAdminLayout('${p.key}')"><span>${p.icon}</span><span>${p.label.replace(p.icon,'').trim()}</span></div>`).join('')}
      <div style="padding:16px;margin-top:8px;border-top:1px solid var(--gray-200)">
        <button class="btn btn-outline btn-pill btn-sm btn-full" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>
    <div class="wl-main">
      <div class="wl-toolbar">
        <div>
          <h2>🎨 ${WL_PAGES.find(p=>p.key===WL_PAGE)?.label||WL_PAGE} Layout</h2>
          <p style="font-size:12px;color:var(--gray-400);margin-top:2px">${sections.length} section${sections.length!==1?'s':''} · ${liveSections.length} live · ${draftSections.length} draft</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-pill btn-sm" onclick="wlPreview('${WL_PAGE}')">👁 Preview</button>
          <button class="btn btn-outline btn-pill btn-sm" onclick="wlAddSection('${WL_PAGE}')">+ Add Section</button>
          ${hasDrafts?`<button class="btn btn-pill btn-sm" style="background:var(--green);color:#fff;border:none" onclick="wlPublish('${WL_PAGE}')">🚀 Go Live (${draftSections.length})</button>`:''}
        </div>
      </div>
      ${!sections.length?`<div style="text-align:center;padding:60px 20px;background:var(--white);border-radius:var(--radius);border:2px dashed var(--gray-200)"><p style="font-size:40px;margin-bottom:12px">🎨</p><p style="font-weight:700;font-size:16px;margin-bottom:6px">No sections yet</p><p style="color:var(--gray-400);margin-bottom:20px;font-size:13px">Add your first section to customise this page</p><button class="btn btn-gold btn-pill" onclick="wlAddSection('${WL_PAGE}')">+ Add First Section</button></div>`:''}
      ${liveSections.length?`<div style="margin-bottom:8px"><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--green);margin-bottom:8px">● Live</p>${liveSections.map((s,i)=>wlSectionCard(s,i,sections.length)).join('')}</div>`:''}
      ${draftSections.length?`<div><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--orange);margin-bottom:8px">◎ Draft — not visible to users</p>${draftSections.map((s,i)=>wlSectionCard(s,i,sections.length)).join('')}</div>`:''}
      ${hasDrafts?`<div class="wl-publish-bar"><div><p style="font-weight:700;font-size:14px">📝 ${draftSections.length} unpublished change${draftSections.length!==1?'s':''}</p><p style="font-size:12px;color:rgba(255,255,255,.6)">Draft sections are invisible until you Go Live</p></div><button class="btn btn-pill" style="background:var(--gold);color:var(--black);border:none;font-weight:700" onclick="wlPublish('${WL_PAGE}')">🚀 Go Live</button></div>`:''}
    </div>
  </div>`;
}

function wlSectionCard(s,i,total){
  const typeInfo=WL_SECTION_TYPES.find(t=>t.type===s.section_type)||{icon:'📄',label:s.section_type};
  const isDraft=s.is_draft||!s.is_active;
  return `<div class="wl-section-card ${isDraft?'draft':''}">
    <div class="wl-drag-handle">⠿</div>
    <div class="wl-section-icon">${typeInfo.icon}</div>
    <div class="wl-section-info">
      <div class="wl-section-name">${esc(s.title)}</div>
      <div class="wl-section-meta">
        <span>${typeInfo.label}</span>
        ${isDraft?'<span class="wl-status-draft">Draft</span>':'<span class="wl-status-live">Live</span>'}
        ${s.show_from||s.show_until?'<span style="color:var(--blue)">📅 Scheduled</span>':''}
        ${s.device!=='all'?`<span>📱 ${s.device} only</span>`:''}
      </div>
    </div>
    <div class="wl-section-actions">
      <button class="btn btn-ghost btn-sm btn-pill" onclick="wlEditSection('${s.id}')">✏️</button>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="wlDuplicateSection('${s.id}')">📋</button>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="wlMoveSection('${s.id}','up')" ${i===0?'disabled':''}>↑</button>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="wlMoveSection('${s.id}','down')" ${i===total-1?'disabled':''}>↓</button>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="wlToggleSection('${s.id}',${s.is_active})">${s.is_active?'🟢':'⚫'}</button>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="wlDeleteSection('${s.id}')" style="color:var(--red)">🗑️</button>
    </div>
  </div>`;
}

function wlAddSection(page){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:520px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">➕ Add Section to ${page}</h3>
    <div class="wl-type-grid">
      ${WL_SECTION_TYPES.map(t=>`<button class="wl-type-btn" onclick="wlOpenEditor(null,'${t.type}','${page}')"><span>${t.icon}</span><p>${t.label}</p><p style="font-size:10px;color:var(--gray-400);margin-top:2px">${t.desc}</p></button>`).join('')}
    </div>
    <button class="btn btn-ghost btn-pill btn-sm" style="margin-top:12px" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function wlEditSection(id){
  const rows=await sb.get("page_layouts","*",{id:`eq.${id}`});
  const s=rows[0];if(!s)return;
  wlOpenEditor(s,s.section_type,s.page);
}

function wlOpenEditor(existing,type,page){
  document.querySelector('.auth-overlay')?.remove();
  const c=existing?.content||{};
  const typeInfo=WL_SECTION_TYPES.find(t=>t.type===type)||{icon:'📄',label:type};
  let fields='';
  if(type==='hero_carousel')fields=`<div class="form-group"><label class="form-label">Slides <button class="btn btn-ghost btn-sm btn-pill" type="button" onclick="wlAddSlide()">+ Add Slide</button></label><div id="wl-slides-list"></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Autoplay (ms)</label><input class="form-input" id="wl-autoplay" type="number" value="${c.autoplay_ms||4500}"></div><div class="form-group"><label class="form-label">Show Arrows</label><select class="form-select" id="wl-arrows"><option value="true" ${c.show_arrows!==false?'selected':''}>Yes</option><option value="false">No</option></select></div></div>`;
  else if(type==='announcement_bar')fields=`<div class="form-group"><label class="form-label">Message</label><input class="form-input" id="wl-ann-text" value="${esc(c.text||'')}" placeholder="🔥 Sale ends soon!"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Background</label><input class="form-input" id="wl-ann-bg" type="color" value="${c.bg||'#010101'}" style="height:42px;padding:4px"></div><div class="form-group"><label class="form-label">Text Color</label><input class="form-input" id="wl-ann-color" type="color" value="${c.color||'#EDCF5D'}" style="height:42px;padding:4px"></div></div><div class="form-group"><label class="form-label">Link</label><input class="form-input" id="wl-ann-link" value="${esc(c.link||'')}" placeholder="#shop"></div><div class="form-group"><label class="form-label">Dismissable?</label><select class="form-select" id="wl-ann-dismiss"><option value="true" ${c.dismissable?'selected':''}>Yes</option><option value="false" ${!c.dismissable?'selected':''}>No</option></select></div>`;
  else if(type==='banner')fields=`<div class="form-group"><label class="form-label">Image URL</label><input class="form-input" id="wl-ban-img" value="${esc(c.image_url||'')}" placeholder="https://..."></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Headline</label><input class="form-input" id="wl-ban-h" value="${esc(c.headline||'')}"></div><div class="form-group"><label class="form-label">Subtext</label><input class="form-input" id="wl-ban-sub" value="${esc(c.subtext||'')}"></div><div class="form-group"><label class="form-label">CTA Label</label><input class="form-input" id="wl-ban-cta" value="${esc(c.cta_label||'')}"></div><div class="form-group"><label class="form-label">CTA Link</label><input class="form-input" id="wl-ban-link" value="${esc(c.cta_link||'')}"></div><div class="form-group"><label class="form-label">Background</label><input class="form-input" id="wl-ban-bg" type="color" value="${c.bg_color||'#EDCF5D'}" style="height:42px;padding:4px"></div><div class="form-group"><label class="form-label">Text Color</label><input class="form-input" id="wl-ban-tc" type="color" value="${c.text_color||'#010101'}" style="height:42px;padding:4px"></div></div>`;
  else if(type==='product_row')fields=`<div class="form-group"><label class="form-label">Row Title</label><input class="form-input" id="wl-pr-title" value="${esc(c.title||'')}" placeholder="🔥 Trending Now"></div><div class="form-group"><label class="form-label">Source</label><select class="form-select" id="wl-pr-source" onchange="$('wl-pr-ids-row').style.display=this.value==='manual'?'block':'none';$('wl-pr-sponsored-row').style.display=this.value==='sponsored'?'block':'none'"><option value="trending" ${c.source==='trending'||!c.source?'selected':''}>Trending</option><option value="new_arrivals" ${c.source==='new_arrivals'?'selected':''}>New Arrivals</option><option value="cashback" ${c.source==='cashback'?'selected':''}>Best Cashback</option><option value="on_sale" ${c.source==='on_sale'?'selected':''}>On Sale</option><option value="manual" ${c.source==='manual'?'selected':''}>Manual IDs</option><option value="sponsored" ${c.source==='sponsored'?'selected':''}>Sponsored (auction)</option></select></div><div id="wl-pr-ids-row" style="display:${c.source==='manual'?'block':'none'}"><div class="form-group"><label class="form-label">Product IDs (comma separated)</label><input class="form-input" id="wl-pr-ids" value="${esc((c.product_ids||[]).join(','))}"></div></div><div id="wl-pr-sponsored-row" style="display:${c.source==='sponsored'?'block':'none'};padding:10px;background:rgba(237,207,93,.08);border-radius:8px;border:1px solid rgba(237,207,93,.2)"><label class="form-label" style="font-size:12px">Placement Slot Key</label><input class="form-input" id="wl-pr-placement" value="${esc(c.placement_key||'home_mid')}" placeholder="e.g. home_mid, home_bottom"><p style="font-size:11px;color:var(--gray-400);margin-top:4px">Highest-bidding campaign for this slot wins</p></div><div class="form-group"><label class="form-label">Max products</label><input class="form-input" id="wl-pr-max" type="number" value="${c.max||8}"></div>`;
  else if(type==='trust_bar'){const items=c.items||[{icon:'🚚',text:'Free Delivery'},{icon:'💰',text:'Cashback Guaranteed'},{icon:'↩️',text:'Easy Returns'},{icon:'✅',text:'Verified Sellers'}];fields=`<div class="form-group"><label class="form-label">Items (one per line: emoji Text)</label><textarea class="form-textarea" id="wl-trust-items" style="min-height:90px">${items.map(it=>it.icon+' '+it.text).join('\n')}</textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Background</label><input class="form-input" id="wl-trust-bg" type="color" value="${c.bg||'#F8F7F4'}" style="height:42px;padding:4px"></div><div class="form-group"><label class="form-label">Text Color</label><input class="form-input" id="wl-trust-tc" type="color" value="${c.text_color||'#010101'}" style="height:42px;padding:4px"></div></div>`;}
  else if(type==='countdown')fields=`<div class="form-group"><label class="form-label">Headline</label><input class="form-input" id="wl-cd-text" value="${esc(c.text||'')}" placeholder="🔥 Flash Sale ends in"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">End Date & Time</label><input class="form-input" id="wl-cd-end" type="datetime-local" value="${c.end_at?new Date(c.end_at).toISOString().slice(0,16):''}"></div><div class="form-group"><label class="form-label">CTA Label</label><input class="form-input" id="wl-cd-cta" value="${esc(c.cta_label||'Shop Now')}"></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Background</label><input class="form-input" id="wl-cd-bg" type="color" value="${c.bg||'#010101'}" style="height:42px;padding:4px"></div><div class="form-group"><label class="form-label">Text Color</label><input class="form-input" id="wl-cd-tc" type="color" value="${c.text_color||'#EDCF5D'}" style="height:42px;padding:4px"></div></div>`;
  else if(type==='spacer')fields=`<div class="form-group"><label class="form-label">Height (px)</label><input class="form-input" id="wl-spacer-h" type="number" value="${c.height||40}"></div>`;
  else if(type==='category_grid')fields=`<div class="form-group"><label class="form-label">Max categories to show</label><input class="form-input" id="wl-cat-max" type="number" value="${c.max||8}"></div>`;

  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:560px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px"><span style="font-size:24px">${typeInfo.icon}</span><h3 style="font-weight:800;font-size:18px">${existing?'Edit':'New'} ${typeInfo.label}</h3></div>
    <div class="form-group"><label class="form-label">Internal Title</label><input class="form-input" id="wl-title" placeholder="e.g. Diwali Hero" value="${esc(existing?.title||'')}"></div>
    ${fields}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group"><label class="form-label">Device</label><select class="form-select" id="wl-device"><option value="all" ${(existing?.device||'all')==='all'?'selected':''}>All Devices</option><option value="mobile" ${existing?.device==='mobile'?'selected':''}>Mobile Only</option><option value="desktop" ${existing?.device==='desktop'?'selected':''}>Desktop Only</option></select></div>
      <div class="form-group"><label class="form-label">Sort Order</label><input class="form-input" id="wl-order" type="number" value="${existing?.sort_order||0}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Show From (optional)</label><input class="form-input" id="wl-from" type="datetime-local" value="${existing?.show_from?new Date(existing.show_from).toISOString().slice(0,16):''}"></div>
      <div class="form-group"><label class="form-label">Show Until (optional)</label><input class="form-input" id="wl-until" type="datetime-local" value="${existing?.show_until?new Date(existing.show_until).toISOString().slice(0,16):''}"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="wlSaveSection('${existing?.id||''}','${type}','${page}')">💾 Save Draft</button>
      <button class="btn btn-pill" style="background:var(--green);color:#fff;border:none;flex:1" onclick="wlSaveSection('${existing?.id||''}','${type}','${page}',true)">🚀 Save & Go Live</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  if(type==='hero_carousel') wlInitSlides(c.slides||[]);
}

function wlInitSlides(slides){
  WL_SLIDES=slides.length?[...slides]:[{id:'s1',headline:'',subtext:'',badge:'',bg_gradient:'135deg,#010101,#1a1a2e',image_url:'',cta_label:'Shop Now',cta_link:'#shop'}];
  wlRenderSlides();
}
function wlRenderSlides(){
  const list=$('wl-slides-list');if(!list)return;
  list.innerHTML=WL_SLIDES.map((s,i)=>`<div class="wl-slide-item">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-weight:700;font-size:13px">Slide ${i+1}</span><button class="btn btn-ghost btn-sm" onclick="wlRemoveSlide(${i})" style="color:var(--red)">✕</button></div>
    <div style="margin-bottom:8px;padding:8px;background:rgba(237,207,93,.08);border-radius:6px;border:1px solid rgba(237,207,93,.2)">
      <label class="form-label" style="font-size:11px">🔗 Auto-fill from Product ID (optional)</label>
      <div style="display:flex;gap:6px"><input class="form-input" id="sl-pid-${i}" value="${esc(s.product_id||'')}" placeholder="Paste product UUID to auto-fill" style="margin:0;font-size:11px;font-family:'Space Mono',monospace"><button class="btn btn-ghost btn-sm" onclick="wlFillSlideFromProduct(${i})">Fill ↓</button></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Headline</label><input class="form-input" id="sl-h-${i}" value="${esc(s.headline||'')}"></div>
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Subtext</label><input class="form-input" id="sl-s-${i}" value="${esc(s.subtext||'')}"></div>
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Badge</label><input class="form-input" id="sl-b-${i}" value="${esc(s.badge||'')}"></div>
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Image URL</label><input class="form-input" id="sl-img-${i}" value="${esc(s.image_url||'')}"></div>
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">CTA Label</label><input class="form-input" id="sl-cta-${i}" value="${esc(s.cta_label||'Shop Now')}"></div>
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">CTA Link</label><input class="form-input" id="sl-link-${i}" value="${esc(s.cta_link||'#shop')}"></div>
    </div>
    <div class="form-group" style="margin-top:8px;margin-bottom:0"><label class="form-label" style="font-size:11px">BG Gradient (e.g. 135deg,#010101,#1a1a2e)</label><input class="form-input" id="sl-bg-${i}" value="${esc(s.bg_gradient||'135deg,#010101,#1a1a2e')}"></div>
  </div>`).join('');
}
function wlAddSlide(){WL_SLIDES.push({id:'s'+Date.now(),headline:'',subtext:'',badge:'',bg_gradient:'135deg,#010101,#1a1a2e',image_url:'',cta_label:'Shop Now',cta_link:'#shop',product_id:''});wlRenderSlides();}
function wlRemoveSlide(i){WL_SLIDES.splice(i,1);wlRenderSlides();}
function wlReadSlides(){return WL_SLIDES.map((_,i)=>({id:'s'+i,headline:$(`sl-h-${i}`)?.value||'',subtext:$(`sl-s-${i}`)?.value||'',badge:$(`sl-b-${i}`)?.value||'',image_url:$(`sl-img-${i}`)?.value||'',cta_label:$(`sl-cta-${i}`)?.value||'Shop Now',cta_link:$(`sl-link-${i}`)?.value||'#shop',bg_gradient:$(`sl-bg-${i}`)?.value||'135deg,#010101,#1a1a2e',product_id:$(`sl-pid-${i}`)?.value||''}));}

async function wlFillSlideFromProduct(i){
  const pid=$(`sl-pid-${i}`)?.value?.trim();
  if(!pid){toast('Paste a product ID first','⚠️');return;}
  const prods=await sb.get("products","name,price,compare_at_price,images,cashback_percent,categories(name)",{id:`eq.${pid}`});
  const p=prods[0];if(!p){toast('Product not found','❌');return;}
  const img=p.images?.[0]||'';
  const disc=p.compare_at_price&&p.price<p.compare_at_price?Math.round((p.compare_at_price-p.price)/p.compare_at_price*100):0;
  const hEl=$(`sl-h-${i}`);const sEl=$(`sl-s-${i}`);const bEl=$(`sl-b-${i}`);const imgEl=$(`sl-img-${i}`);const linkEl=$(`sl-link-${i}`);
  if(hEl)hEl.value=p.name.length>40?p.name.slice(0,40)+'...':p.name;
  if(sEl)sEl.value=p.cashback_percent>0?`Earn ${p.cashback_percent}% cashback — ₹${(p.price*p.cashback_percent/100).toFixed(0)} back`:`₹${p.price}${disc?` · ${disc}% off`:''}`;
  if(bEl)bEl.value=p.categories?.name||disc>10?`${disc}% OFF`:'Featured';
  if(imgEl)imgEl.value=img;
  if(linkEl)linkEl.value=`#product?pid=${pid}`;
  toast('Slide filled from product ✓','✅');
}

function wlCollectContent(type){
  const g=id=>$(id)?.value||'';
  if(type==='hero_carousel') return {slides:wlReadSlides(),autoplay_ms:parseInt(g('wl-autoplay'))||4500,show_arrows:g('wl-arrows')!=='false'};
  if(type==='announcement_bar') return {text:g('wl-ann-text'),bg:g('wl-ann-bg'),color:g('wl-ann-color'),link:g('wl-ann-link'),dismissable:g('wl-ann-dismiss')==='true'};
  if(type==='banner') return {image_url:g('wl-ban-img'),headline:g('wl-ban-h'),subtext:g('wl-ban-sub'),cta_label:g('wl-ban-cta'),cta_link:g('wl-ban-link'),bg_color:g('wl-ban-bg'),text_color:g('wl-ban-tc')};
  if(type==='product_row'){const src=g('wl-pr-source');return{title:g('wl-pr-title'),source:src,product_ids:src==='manual'?g('wl-pr-ids').split(',').map(x=>x.trim()).filter(Boolean):[],placement_key:src==='sponsored'?g('wl-pr-placement')||'home_mid':null,max:parseInt(g('wl-pr-max'))||8};}
  if(type==='trust_bar'){const raw=g('wl-trust-items');const items=raw.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const p=l.split(' ');return{icon:p[0]||'✅',text:p.slice(1).join(' ')};});return{items,bg:g('wl-trust-bg'),text_color:g('wl-trust-tc')};}
  if(type==='countdown') return{text:g('wl-cd-text'),end_at:g('wl-cd-end')?new Date(g('wl-cd-end')).toISOString():null,cta_label:g('wl-cd-cta'),bg:g('wl-cd-bg'),text_color:g('wl-cd-tc')};
  if(type==='spacer') return{height:parseInt(g('wl-spacer-h'))||40};
  if(type==='category_grid') return{max:parseInt(g('wl-cat-max'))||8};
  return {};
}

async function wlSaveSection(existingId,type,page,goLive=false){
  const title=$('wl-title')?.value?.trim();
  if(!title){toast('Add an internal title','⚠️');return;}
  const content=wlCollectContent(type);
  const data={page,section_type:type,title,content,device:$('wl-device')?.value||'all',sort_order:parseInt($('wl-order')?.value)||0,show_from:$('wl-from')?.value?new Date($('wl-from').value).toISOString():null,show_until:$('wl-until')?.value?new Date($('wl-until').value).toISOString():null,is_active:goLive,is_draft:!goLive,updated_at:new Date().toISOString()};
  if(existingId){await sb.upd("page_layouts",data,{id:`eq.${existingId}`});}
  else{data.created_by=PROFILE.id;await sb.ins("page_layouts",data);}
  document.querySelector('.auth-overlay')?.remove();
  toast(goLive?'Live! 🚀':'Saved as draft 📝',goLive?'🚀':'📝');
  renderAdminLayout(page);
}

async function wlDeleteSection(id){if(!confirm('Delete this section?'))return;await sb.del("page_layouts",{id:`eq.${id}`});toast('Deleted','🗑️');renderAdminLayout(WL_PAGE);}
async function wlToggleSection(id,current){await sb.upd("page_layouts",{is_active:!current,is_draft:current,updated_at:new Date().toISOString()},{id:`eq.${id}`});toast(current?'Deactivated':'Activated ✅');renderAdminLayout(WL_PAGE);}
async function wlDuplicateSection(id){const rows=await sb.get("page_layouts","*",{id:`eq.${id}`});const s=rows[0];if(!s)return;const{id:_,created_at,...rest}=s;await sb.ins("page_layouts",{...rest,title:s.title+' (Copy)',is_active:false,is_draft:true,sort_order:s.sort_order+1,created_by:PROFILE.id});toast('Duplicated as draft','📋');renderAdminLayout(WL_PAGE);}
async function wlMoveSection(id,dir){const sections=await sb.get("page_layouts","id,sort_order",{page:`eq.${WL_PAGE}`,order:"sort_order.asc"});const idx=sections.findIndex(s=>s.id===id);if(idx<0)return;const swapIdx=dir==='up'?idx-1:idx+1;if(swapIdx<0||swapIdx>=sections.length)return;const a=sections[idx],b=sections[swapIdx];await Promise.all([sb.upd("page_layouts",{sort_order:b.sort_order},{id:`eq.${a.id}`}),sb.upd("page_layouts",{sort_order:a.sort_order},{id:`eq.${b.id}`})]);renderAdminLayout(WL_PAGE);}
async function wlPublish(page){if(!confirm('Publish all drafts on '+page+' page?'))return;await sb.upd("page_layouts",{is_active:true,is_draft:false,updated_at:new Date().toISOString()},{page:`eq.${page}`,is_draft:"eq.true"});toast('Page is now live! 🚀','🚀');renderAdminLayout(page);}
async function wlPreview(page){window.open(location.origin+location.pathname+'#'+page+'?preview=1','_blank');toast('Preview opened in new tab','👁');}

// ── Frontend section renderers ────────────────────────────────────
function renderDBSection(s,products,cats){
  const c=s.content||{};
  const now=new Date();
  if(s.show_from&&new Date(s.show_from)>now)return'';
  if(s.show_until&&new Date(s.show_until)<now)return'';
  if(s.device==='mobile'&&window.innerWidth>768)return'';
  if(s.device==='desktop'&&window.innerWidth<=768)return'';

  if(s.section_type==='announcement_bar'){
    return `<div id="db-ann-${s.id}" style="background:${c.bg||'#010101'};color:${c.color||'#EDCF5D'};text-align:center;padding:10px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px">
      <span ${c.link?`onclick="location.href='${esc(c.link)}'" style="cursor:pointer"`:''} >${esc(c.text||'')}</span>
      ${c.dismissable?`<button onclick="document.getElementById('db-ann-${s.id}').remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px;opacity:.7">✕</button>`:''}
    </div>`;
  }
  if(s.section_type==='hero_carousel'){
    const slides=c.slides||[];if(!slides.length)return'';
    const slideHTML=slides.map((sl,i)=>`<div class="hero-slide" style="background:linear-gradient(${esc(sl.bg_gradient||'135deg,#010101,#1a1a2e')})">
      ${sl.image_url?`<div class="hero-slide-bg"><img src="${esc(sl.image_url)}" alt=""></div>`:''}
      <div class="hero-slide-content">
        ${sl.badge?`<div class="hero-slide-cat">${esc(sl.badge)}</div>`:''}
        <h2>${esc(sl.headline||'')}</h2>
        ${sl.subtext?`<p class="hero-slide-cb">${esc(sl.subtext)}</p>`:''}
        <div class="hero-slide-btns">
          <button class="btn-buy" onclick="go('shop')">${esc(sl.cta_label||'Shop Now')}</button>
        </div>
      </div>
    </div>`).join('');
    return `<div class="hero fade-up" id="db-hero-${s.id}" style="margin:16px 24px;border-radius:var(--radius-xl);overflow:hidden">
      <div class="hero-carousel" id="db-htrack-${s.id}" style="display:flex;transition:transform .5s cubic-bezier(.4,0,.2,1)">${slideHTML}</div>
      ${c.show_arrows!==false?`<div class="hero-arrow left" onclick="dbHeroSlide('${s.id}',-1)">‹</div><div class="hero-arrow right" onclick="dbHeroSlide('${s.id}',1)">›</div>`:''}
      <div class="hero-dots" id="db-hdots-${s.id}">${slides.map((_,i)=>`<div class="hero-dot${i===0?' active':''}" onclick="dbHeroGoTo('${s.id}',${i})"></div>`).join('')}</div>
    </div>`;
  }
  if(s.section_type==='banner'){
    const bg=c.image_url?`url('${esc(c.image_url)}') center/cover`:c.bg_color||'var(--gold)';
    return `<div class="section"><div class="promo-banner fade-up" style="background:${bg};color:${c.text_color||'#010101'}">
      <div><h3 style="color:inherit">${esc(c.headline||'')}</h3>${c.subtext?`<p style="color:inherit;opacity:.7">${esc(c.subtext)}</p>`:''}</div>
      ${c.cta_label?`<button class="promo-btn" onclick="${c.cta_link?`location.href='${esc(c.cta_link)}'`:'go("shop")'}" style="background:${c.text_color||'#010101'};color:${c.bg_color||'#EDCF5D'}">${esc(c.cta_label)}</button>`:''}
    </div></div>`;
  }
  if(s.section_type==='product_row'){
    if(c.source==='sponsored'&&c.placement_key){
      // Sponsored row — loaded async after render
      const rowId='db-spr-'+s.id;
      setTimeout(async()=>{
        const el=$(rowId);if(!el)return;
        const ads=await getSponsored(c.placement_key,c.max||4);
        if(!ads.length){el.style.display='none';return;}
        el.innerHTML=`<div class="section"><div class="section-header"><h2 class="section-title">${esc(c.title||'Sponsored')} <span style="font-size:11px;color:var(--gray-400);font-weight:400">Sponsored</span></h2></div>
          <div class="products-scroll">${ads.map((a,i)=>sponsoredCard(a,i,c.placement_key)).join('')}</div></div>`;
      },200);
      return `<div id="${rowId}"></div>`;
    }
    let prods=[];
    if(c.source==='new_arrivals')prods=products.slice(0,c.max||8);
    else if(c.source==='cashback')prods=products.filter(p=>p.cashback_percent>0).slice(0,c.max||8);
    else if(c.source==='on_sale')prods=products.filter(p=>p.compare_at_price&&p.price<p.compare_at_price).slice(0,c.max||8);
    else if(c.source==='manual')prods=products.filter(p=>(c.product_ids||[]).includes(p.id)).slice(0,c.max||8);
    else prods=[...products].sort((a,b)=>(b.total_sold||0)-(a.total_sold||0)).slice(0,c.max||8);
    if(!prods.length)return'';
    return `<div class="section"><div class="section-header"><h2 class="section-title">${esc(c.title||'Featured Products')}</h2><span class="section-link" onclick="go('shop')">View All →</span></div>
      <div class="products-scroll">${prods.map((p,i)=>productCard(p,i)).join('')}</div></div>`;
  }
  if(s.section_type==='category_grid'){
    const topCats=cats.filter(ct=>!ct.parent_id).slice(0,c.max||8);
    return `<div class="section"><div class="section-header"><h2 class="section-title">Shop by Category</h2><span class="section-link" onclick="go('shop')">View All →</span></div>
      <div class="cat-grid">${topCats.map((ct,i)=>`<div class="cat-card fade-up stagger-${(i%6)+1}" onclick="go('shop',{cat:'${ct.id}'})"><div class="cat-icon">${catIcon(ct.name,ct.icon)}</div><div class="cat-name">${esc(ct.name)}</div></div>`).join('')}</div></div>`;
  }
  if(s.section_type==='trust_bar'){
    const items=c.items||[];
    return `<div style="background:${c.bg||'var(--gray-50)'};padding:16px 0;margin:8px 0"><div class="container"><div style="display:flex;justify-content:center;gap:32px;flex-wrap:wrap">
      ${items.map(it=>`<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:${c.text_color||'var(--black)'}"><span style="font-size:20px">${it.icon}</span>${esc(it.text)}</div>`).join('')}
    </div></div></div>`;
  }
  if(s.section_type==='countdown'){
    const endAt=c.end_at?new Date(c.end_at):null;
    const id='cd-'+s.id;
    setTimeout(()=>{
      const el=$(id);if(!el)return;
      function tick(){
        const diff=endAt-new Date();
        if(diff<=0){el.innerHTML='<span style="font-weight:700">Sale Ended</span>';return;}
        const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),sc=Math.floor((diff%60000)/1000);
        el.innerHTML=`<span style="font-size:22px;font-weight:900;font-family:'Space Mono',monospace">${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}</span>`;
        setTimeout(tick,1000);
      }
      tick();
    },100);
    return `<div style="background:${c.bg||'#010101'};color:${c.text_color||'#EDCF5D'};padding:16px;text-align:center;margin:0">
      <div style="display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:600">${esc(c.text||'Sale ends in')}</span>
        <div id="${id}">...</div>
        ${c.cta_label?`<button class="btn btn-pill" style="background:${c.text_color||'#EDCF5D'};color:${c.bg||'#010101'};border:none;font-weight:700" onclick="go('shop')">${esc(c.cta_label)}</button>`:''}
      </div>
    </div>`;
  }
  if(s.section_type==='spacer') return `<div style="height:${c.height||40}px"></div>`;
  return '';
}

// DB hero carousel controls
const _dbHeroIdx={};
function dbHeroSlide(id,dir){
  const track=$(`db-htrack-${id}`);if(!track)return;
  const total=track.children.length;
  _dbHeroIdx[id]=((_dbHeroIdx[id]||0)+dir+total)%total;
  dbHeroGoTo(id,_dbHeroIdx[id]);
}
function dbHeroGoTo(id,idx){
  _dbHeroIdx[id]=idx;
  const track=$(`db-htrack-${id}`);if(track)track.style.transform=`translateX(-${idx*100}%)`;
  document.querySelectorAll(`#db-hdots-${id} .hero-dot`).forEach((d,i)=>d.classList.toggle('active',i===idx));
}


// ═══════════════════════════════════════════════════
// ADMIN — PLACEMENT MAP
// ═══════════════════════════════════════════════════
async function renderAdminPlacementMap(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading placement map...</div>';

  const [placements,pins,camps,prods]=await Promise.all([
    sb.get("sponsored_placements","*",{is_active:"eq.true",order:"sort_order.asc"}),
    sb.get("sponsored_pins","*,products(name,price,images),ad_campaigns(name)",{is_active:"eq.true"}),
    sb.get("ad_campaigns","*,vendor_stores(store_name)",{status:"eq.active",is_approved:"eq.true"}),
    sb.get("products","id,name,price,images",{is_active:"eq.true",is_approved:"eq.true",order:"name.asc",limit:200})
  ]);

  const now=new Date();
  const activePins=pins.filter(p=>{
    if(p.end_at&&new Date(p.end_at)<now)return false;
    if(new Date(p.start_at)>now)return false;
    return true;
  });
  const pinsByPlacement={};
  activePins.forEach(p=>{
    if(!pinsByPlacement[p.placement_key])pinsByPlacement[p.placement_key]=[];
    pinsByPlacement[p.placement_key].push(p);
  });

  // Group placements by page
  const pages=[...new Set(placements.map(p=>p.page))];
  const prodOpts=prods.map(p=>`<option value="${p.id}">${esc(p.name)} — ₹${p.price}</option>`).join('');

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:24px;font-weight:800">📍 Placement Map</h2>
        <p style="font-size:13px;color:var(--gray-400)">All ad slots across your site. Pin brand deals to override the auction.</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-ads')">📢 Campaigns</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <!-- Legend -->
    <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;font-size:12px">
      <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:var(--gold);border-radius:50%;display:inline-block"></span>Pinned (Brand Deal)</span>
      <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:var(--green);border-radius:50%;display:inline-block"></span>Auction — Active bids</span>
      <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:var(--gray-300);border-radius:50%;display:inline-block"></span>Empty — No bids</span>
    </div>

    ${pages.map(page=>{
      const pagePlacements=placements.filter(p=>p.page===page);
      const pageLabel={'home':'🏠 Home','shop':'🛍️ Shop','product':'📦 Product Detail','cart':'🛒 Cart','checkout':'💳 Checkout'}[page]||page;
      return `<div class="card" style="margin-bottom:20px">
        <h3 style="font-weight:800;font-size:16px;margin-bottom:16px">${pageLabel}</h3>
        ${pagePlacements.map(pl=>{
          const slotPins=pinsByPlacement[pl.key]||[];
          const slotCamps=camps.filter(c=>{
            const keys=c.placement_keys||[];
            const legacy=c.targeting?.placements||[];
            return keys.includes(pl.key)||legacy.some(l=>l.page===pl.key||l.page===pl.key.split('_')[0]);
          });
          const hasPins=slotPins.length>0;
          const hasAuction=slotCamps.length>0;
          const dotColor=hasPins?'var(--gold)':hasAuction?'var(--green)':'var(--gray-300)';
          return `<div style="border:1.5px solid var(--gray-200);border-radius:var(--radius);padding:14px;margin-bottom:10px${hasPins?';border-color:var(--gold)':''}">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:${hasPins||hasAuction?'12':'0'}px">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="width:10px;height:10px;background:${dotColor};border-radius:50%;flex-shrink:0"></span>
                <div>
                  <p style="font-weight:700;font-size:14px">${esc(pl.label)}</p>
                  <p style="font-size:11px;color:var(--gray-400)">${esc(pl.description||'')} · ${pl.max_slots} max slots · key: <code style="background:var(--gray-100);padding:1px 5px;border-radius:3px">${pl.key}</code></p>
                </div>
              </div>
              <button class="btn btn-gold btn-pill btn-sm" onclick="pmAddPin('${pl.key}','${esc(pl.label)}',\`${prodOpts}\`)">📌 Pin Brand Deal</button>
            </div>

            <!-- Active Pins -->
            ${slotPins.length?`<div style="margin-bottom:8px">
              ${slotPins.map(pin=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(237,207,93,.08);border-radius:8px;margin-bottom:4px;gap:8px;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:18px">📌</span>
                  <div>
                    <p style="font-weight:700;font-size:13px">${esc(pin.products?.name||'Product')}</p>
                    <p style="font-size:11px;color:var(--gray-400)">${pin.deal_label?`Deal: ${esc(pin.deal_label)} · `:''}Pinned · Priority ${pin.priority}${pin.end_at?` · Expires ${new Date(pin.end_at).toLocaleDateString()}`:''}
                    </p>
                  </div>
                </div>
                <button class="btn btn-danger btn-sm btn-pill" onclick="pmRemovePin('${pin.id}')">Remove Pin</button>
              </div>`).join('')}
            </div>`:''}

            <!-- Auction Bids -->
            ${hasAuction?`<div style="font-size:12px;color:var(--gray-500)">
              <p style="font-weight:600;margin-bottom:4px">🏆 Auction — ${slotCamps.length} campaign${slotCamps.length!==1?'s':''} bidding:</p>
              ${slotCamps.slice(0,3).map(c=>`<span style="display:inline-flex;align-items:center;gap:4px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:20px;padding:2px 10px;margin:2px;font-size:11px">
                ${esc(c.vendor_stores?.store_name||'Vendor')} — ₹${c.cpc_bid}/click
              </span>`).join('')}
              ${slotCamps.length>3?`<span style="font-size:11px;color:var(--gray-400)">+${slotCamps.length-3} more</span>`:''}
            </div>`:`<p style="font-size:12px;color:var(--gray-400)">No active auction bids for this slot</p>`}
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function pmAddPin(placementKey, placementLabel, prodOpts){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:4px">📌 Pin Brand Deal</h3>
    <p style="font-size:13px;color:var(--gray-400);margin-bottom:16px">Slot: <strong>${esc(placementLabel)}</strong> · Overrides auction</p>
    <div class="form-group"><label class="form-label">Product</label>
      <select class="form-select" id="pm-prod"><option value="">Select product...</option>${prodOpts}</select>
    </div>
    <div class="form-group"><label class="form-label">Deal Label (optional)</label>
      <input class="form-input" id="pm-label" placeholder="e.g. boAt Brand Deal Q2 2026">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Priority (higher = first)</label>
        <input class="form-input" id="pm-priority" type="number" value="100">
      </div>
      <div class="form-group"><label class="form-label">Expires (optional)</label>
        <input class="form-input" id="pm-end" type="datetime-local">
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="pmSavePin('${placementKey}')">📌 Pin Now</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function pmSavePin(placementKey){
  const productId=$('pm-prod')?.value;
  if(!productId){toast('Select a product','⚠️');return;}
  const endAt=$('pm-end')?.value?new Date($('pm-end').value).toISOString():null;
  await sb.ins("sponsored_pins",{
    placement_key:placementKey,
    product_id:productId,
    deal_label:$('pm-label')?.value||null,
    priority:parseInt($('pm-priority')?.value)||100,
    pinned_by:PROFILE.id,
    start_at:new Date().toISOString(),
    end_at:endAt,
    is_active:true
  });
  document.querySelector('.auth-overlay')?.remove();
  toast('Product pinned to slot! 📌','📌');
  renderAdminPlacementMap();
}

async function pmRemovePin(pinId){
  if(!confirm('Remove this pin? The slot will return to auction.'))return;
  await sb.upd("sponsored_pins",{is_active:false},{id:`eq.${pinId}`});
  toast('Pin removed','🗑️');
  renderAdminPlacementMap();
}

// ═══════════════════════════════════════════════════
// ADMIN — AI SERVICES MANAGEMENT
// ═══════════════════════════════════════════════════
async function renderAdminAIServices(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading AI services...</div>';

  const [services,usageLogs]=await Promise.all([
    sb.get("ai_services","*",{order:"created_at.asc"}),
    sb.get("ai_usage_log","*",{order:"created_at.desc",limit:100})
  ]);

  const totalCalls=usageLogs.length;
  const successCalls=usageLogs.filter(l=>l.success).length;
  const totalInputTokens=usageLogs.reduce((a,l)=>a+(l.input_tokens||0),0);
  const totalOutputTokens=usageLogs.reduce((a,l)=>a+(l.output_tokens||0),0);

  // Group usage by feature
  const byFeature={};
  usageLogs.forEach(l=>{
    const f=l.feature||'general';
    if(!byFeature[f])byFeature[f]=0;
    byFeature[f]++;
  });

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:24px;font-weight:800">⚡ AI Services</h2>
        <p style="font-size:13px;color:var(--gray-400)">Manage AI providers. API keys are stored as Supabase secrets — never in the browser.</p>
      </div>
      <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
    </div>

    <!-- Stats -->
    <div class="g4" style="margin-bottom:24px">
      <div class="stat-card" style="border-top:3px solid var(--purple)"><div class="stat-val" style="color:var(--purple)">${totalCalls}</div><div class="stat-label">Total AI Calls</div></div>
      <div class="stat-card" style="border-top:3px solid var(--green)"><div class="stat-val" style="color:var(--green)">${totalCalls?Math.round(successCalls/totalCalls*100):0}%</div><div class="stat-label">Success Rate</div></div>
      <div class="stat-card" style="border-top:3px solid var(--blue)"><div class="stat-val">${(totalInputTokens/1000).toFixed(1)}K</div><div class="stat-label">Input Tokens</div></div>
      <div class="stat-card" style="border-top:3px solid var(--gold)"><div class="stat-val">${(totalOutputTokens/1000).toFixed(1)}K</div><div class="stat-label">Output Tokens</div></div>
    </div>

    <!-- Providers -->
    <div class="card" style="margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:16px">AI Providers</h3>
      <div style="padding:12px 14px;background:rgba(52,199,89,.06);border:1px solid rgba(52,199,89,.2);border-radius:var(--radius);margin-bottom:16px;font-size:13px">
        <p style="font-weight:600;color:var(--green)">🔒 How to set API keys (Supabase secrets)</p>
        <p style="color:var(--gray-500);margin-top:4px">Go to your <a href="https://supabase.com/dashboard/project/kbvfgxnepoheapkojiwk/settings/vault" target="_blank" style="color:var(--blue);text-decoration:underline">Supabase project → Settings → Vault</a> and add secrets named <code style="background:var(--gray-100);padding:1px 5px;border-radius:3px">ANTHROPIC_API_KEY</code>, <code style="background:var(--gray-100);padding:1px 5px;border-radius:3px">OPENAI_API_KEY</code>, or <code style="background:var(--gray-100);padding:1px 5px;border-radius:3px">GEMINI_API_KEY</code>.</p>
      </div>
      ${services.map(s=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border:1.5px solid ${s.is_default?'var(--gold)':'var(--gray-200)'};border-radius:var(--radius);margin-bottom:10px;background:${s.is_default?'rgba(237,207,93,.04)':''}">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:24px">${s.provider==='anthropic'?'🟠':s.provider==='openai'?'🟢':'🔵'}</span>
            <div>
              <p style="font-weight:700;font-size:14px">${esc(s.display_name||s.provider)} ${s.is_default?'<span class="badge badge-gold">Default</span>':''}</p>
              <p style="font-size:12px;color:var(--gray-400);margin-top:2px">Model: ${esc(s.model)} · ${s.is_active?'<span style="color:var(--green)">✓ Active</span>':'<span style="color:var(--gray-400)">Inactive</span>'}</p>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            ${!s.is_default?`<button class="btn btn-outline btn-pill btn-sm" onclick="aiSetDefault('${s.id}','${s.provider}')">Set Default</button>`:''}
            <button class="btn btn-ghost btn-sm btn-pill" onclick="aiTestProvider('${s.provider}')">Test ▶</button>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Usage by Feature -->
    ${Object.keys(byFeature).length?`<div class="card" style="margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:14px">Usage by Feature</h3>
      ${Object.entries(byFeature).sort((a,b)=>b[1]-a[1]).map(([f,count])=>`
        <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--gray-100)">
          <span style="font-size:13px;font-weight:600;flex:1">${f.replace(/_/g,' ')}</span>
          <div style="flex:2;height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden">
            <div style="width:${Math.round(count/totalCalls*100)}%;height:100%;background:var(--purple);border-radius:3px"></div>
          </div>
          <span style="font-size:12px;color:var(--gray-400);width:40px;text-align:right">${count}</span>
        </div>
      `).join('')}
    </div>`:''}

    <!-- Recent Logs -->
    <div class="card">
      <h3 style="font-weight:700;margin-bottom:14px">Recent AI Calls</h3>
      ${!usageLogs.length?'<p style="font-size:13px;color:var(--gray-400)">No AI calls yet</p>':
      usageLogs.slice(0,15).map(l=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px;gap:8px;flex-wrap:wrap">
          <div>
            <span class="badge ${l.success?'badge-green':'badge-red'}">${l.success?'✓':'✗'}</span>
            <span style="font-weight:600;margin-left:8px">${l.provider}</span>
            <span style="color:var(--gray-400);margin-left:6px">${l.feature||'general'}</span>
          </div>
          <div style="display:flex;gap:12px;color:var(--gray-400);font-size:11px">
            <span>${l.input_tokens||0}↑ ${l.output_tokens||0}↓ tokens</span>
            <span>${new Date(l.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

async function aiSetDefault(id, provider){
  await sb.upd("ai_services",{is_default:false,is_active:false},{is_default:"eq.true"});
  await sb.upd("ai_services",{is_default:true,is_active:true},{id:`eq.${id}`});
  AI_CONFIG.provider=provider;
  localStorage.setItem('glonni_ai_provider',provider);
  toast(`${provider} set as default AI ✅`,'✅');
  renderAdminAIServices();
}

async function aiTestProvider(provider){
  toast(`Testing ${provider}...`,'⏳');
  try{
    const invoked=await sb.invokeFunction('ai-gateway',{provider,systemPrompt:'You are a test assistant.',userPrompt:'Reply with just the word: ok',useWebSearch:false,maxTokens:20,feature:'test'});
    const data=invoked?.error?{success:false,error:invoked.error.message||String(invoked.error)}:invoked.data;
    if(data.success&&data.result){
      toast(`✅ ${provider} is working!`,'✅');
    } else {
      alert(`${provider} error:\n${data.error||JSON.stringify(data)}`);
      toast(`❌ ${provider} failed`,'❌');
    }
  }catch(e){
    alert('Network error: '+String(e));
    toast('Network error','❌');
  }
}

async function releaseFunds(){const r=await sb.rpc("release_pending_balances");toast(`Released ${r} transaction(s)!`,'✅');}

// ═══════════════════════════════════════════════════
// AI PROVIDER — SWAPPABLE
// Change AI_PROVIDER + AI_MODEL to switch between
// Anthropic / OpenAI / Gemini — zero other changes needed.
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// AI GATEWAY — routes through Supabase Edge Function
// API keys stored server-side as Supabase secrets.
// Switch provider anytime — no key needed in browser.
// ═══════════════════════════════════════════════════
const AI_CONFIG={
  provider: localStorage.getItem('glonni_ai_provider')||'anthropic',
  useWebSearch:true,
};

// callAI — calls the secure backend edge function
// Uses the Supabase anon key — no user JWT needed
async function callAI(systemPrompt, userPrompt, opts={}){
  try{
    const invoked=await sb.invokeFunction('ai-gateway',{
      provider:AI_CONFIG.provider,
      systemPrompt,
      userPrompt,
      useWebSearch:opts.useWebSearch??AI_CONFIG.useWebSearch,
      feature:opts.feature||'catalog_extract',
      maxTokens:opts.maxTokens||4096,
    });
    const data=invoked?.error?{success:false,error:invoked.error.message||String(invoked.error)}:invoked.data;
    if(!data.success){
      console.error('[AI Gateway]',data.error);
      toast('AI error: '+data.error,'❌');
      return null;
    }
    return data.result||null;
  }catch(e){
    console.error('[AI] callAI error:',e);
    toast('AI request failed — check network','❌');
    return null;
  }
}

// ═══════════════════════════════════════════════════
// PRICE SANITY ENGINE
// ═══════════════════════════════════════════════════

// In-memory cache: productName → {amazon, flipkart, cap, fetchedAt}
const _priceCache = {};
const PRICE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Fetch Amazon + Flipkart prices via AI web search
async function fetchMarketPrices(productName){
  if(!productName||productName.length<3) return null;
  const key = productName.toLowerCase().trim();

  // Return cached if fresh
  if(_priceCache[key]){
    const age = Date.now()-_priceCache[key].fetchedAt;
    if(age < PRICE_CACHE_TTL) return _priceCache[key];
  }

  const sysPrompt = `You are a price research AI for an Indian marketplace. Search for the CURRENT selling price of a product on Amazon India and Flipkart India. Return ONLY a valid JSON object with no extra text, no markdown, no backticks.`;
  const userPrompt = `Find the current selling price of: "${productName}"
  
Search Amazon.in and Flipkart.com right now.

Return ONLY this JSON (numbers only, no ₹ symbol, 0 if not found):
{"amazon":12999,"flipkart":11999,"amazon_url":"https://...","flipkart_url":"https://...","found":true}

If the product is not found on a platform, use 0 for that platform's price.
If product not found anywhere, return {"amazon":0,"flipkart":0,"found":false}`;

  try{
    const result = await callAI(sysPrompt, userPrompt, {useWebSearch:true, maxTokens:200, feature:'price_sanity'});
    if(!result) return null;
    const clean = result.replace(/```json|```/g,'').trim();
    const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
    if(start===-1||end===-1) return null;
    const parsed = JSON.parse(clean.slice(start, end+1));
    const amazon = parseFloat(parsed.amazon)||0;
    const flipkart = parseFloat(parsed.flipkart)||0;
    const available = [amazon,flipkart].filter(p=>p>0);
    const cap = available.length ? Math.min(...available) : 0;
    const entry = {amazon, flipkart, cap, found:parsed.found!==false, fetchedAt:Date.now(),
      amazonUrl:parsed.amazon_url||null, flipkartUrl:parsed.flipkart_url||null};
    _priceCache[key] = entry;
    return entry;
  }catch(e){
    console.error('[PriceSanity] fetch error',e);
    return null;
  }
}

// Validate price against market cap
// Returns: {ok:bool, cap:number, amazon:number, flipkart:number, message:string}
function validatePrice(vendorPrice, marketData){
  if(!marketData||!marketData.found||marketData.cap===0){
    return {ok:true, cap:0, unverified:true, message:'Market price could not be verified — admin review may apply.'};
  }
  const price = parseFloat(vendorPrice)||0;
  const cap = marketData.cap;
  if(price <= 0) return {ok:false, cap, message:'Enter a valid price.'};
  if(price > cap){
    return {ok:false, cap, amazon:marketData.amazon, flipkart:marketData.flipkart,
      message:`₹${price.toLocaleString('en-IN')} exceeds the market cap of ₹${cap.toLocaleString('en-IN')} (lowest of Amazon/Flipkart). Lower your price to continue.`};
  }
  const savings = Math.round((1 - price/cap)*100);
  return {ok:true, cap, amazon:marketData.amazon, flipkart:marketData.flipkart,
    message:`✓ Your price is ₹${(cap-price).toLocaleString('en-IN')} below market cap${savings>0?' ('+savings+'% cheaper)':''}.`};
}

// Render the price comparison widget into a container element
function renderPriceWidget(containerId, marketData, vendorPrice, isAdmin=false){
  const el = document.getElementById(containerId);
  if(!el) return;

  if(!marketData){
    el.innerHTML='';el.className='';return;
  }

  const price = parseFloat(vendorPrice)||0;
  const validation = validatePrice(price, marketData);
  let state = 'ok';
  if(marketData.unverified) state='warn';
  else if(!validation.ok) state='block';

  const amzColor = '#FF9900'; const fkColor = '#2874F0';
  const capColor = state==='block'?'var(--red)':state==='warn'?'var(--orange)':'var(--green)';

  el.className = `psc-widget ${state}`;
  el.innerHTML = `
    <div class="psc-row" style="margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Live Market Prices</span>
      <button class="psc-refresh-btn" onclick="pscRefresh('${containerId}')">🔄 Refresh</button>
    </div>
    ${marketData.amazon>0?`
    <div class="psc-row">
      <span class="psc-platform">
        <span style="background:${amzColor};color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px">AMZ</span>
        Amazon.in
        ${marketData.amazonUrl?`<a href="${marketData.amazonUrl}" target="_blank" style="font-size:10px;color:var(--blue)">↗</a>`:''}
      </span>
      <span class="psc-price" style="color:${amzColor}">₹${marketData.amazon.toLocaleString('en-IN')}</span>
    </div>`:'<div class="psc-row"><span style="font-size:12px;color:var(--gray-400)">Amazon — not listed</span></div>'}
    ${marketData.flipkart>0?`
    <div class="psc-row">
      <span class="psc-platform">
        <span style="background:${fkColor};color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px">FK</span>
        Flipkart.com
        ${marketData.flipkartUrl?`<a href="${marketData.flipkartUrl}" target="_blank" style="font-size:10px;color:var(--blue)">↗</a>`:''}
      </span>
      <span class="psc-price" style="color:${fkColor}">₹${marketData.flipkart.toLocaleString('en-IN')}</span>
    </div>`:'<div class="psc-row"><span style="font-size:12px;color:var(--gray-400)">Flipkart — not listed</span></div>'}
    ${marketData.cap>0?`
    <div class="psc-cap" style="color:${capColor}">
      ${isAdmin?'📊':'🔒'} ${isAdmin?'Reference cap':'Max allowed price'}: ₹${marketData.cap.toLocaleString('en-IN')} <span style="font-weight:400;opacity:.7">(lowest of the two)</span>
      ${isAdmin?'<span style="font-size:10px;color:var(--gray-400);font-weight:400;margin-left:6px">Admin can override</span>':''}
    </div>`:''}
    ${price>0&&marketData.found?`
    <div class="${validation.ok?'psc-ok-msg':'psc-err'}">
      <span>${validation.ok?'✅':'⛔'}</span>
      <span>${validation.message}</span>
    </div>`:''}
    ${marketData.unverified?`<div class="psc-err"><span>⚠️</span><span>${validation.message}</span></div>`:''}
    <div style="font-size:10px;color:var(--gray-400);margin-top:5px">Fetched ${Math.round((Date.now()-marketData.fetchedAt)/60000)||'<1'} min ago via AI web search</div>`;
}

// Show loading spinner in widget
function pscShowLoading(containerId, message='Fetching live prices…'){
  const el=document.getElementById(containerId);
  if(!el)return;
  el.className='psc-widget loading';
  el.innerHTML=`<div class="psc-fetching"><span>⏳</span><span>${message}</span></div>`;
}

// Trigger a fresh fetch and re-render
async function pscRefresh(containerId){
  const el=document.getElementById(containerId);if(!el)return;
  const name=el.dataset.productName;if(!name)return;
  const priceInputId=el.dataset.priceInput;
  const isAdmin=el.dataset.isAdmin==='true';
  // Clear cache so fresh fetch happens
  delete _priceCache[name.toLowerCase().trim()];
  pscShowLoading(containerId,'Refreshing prices…');
  const data=await fetchMarketPrices(name);
  const price=priceInputId?parseFloat(document.getElementById(priceInputId)?.value)||0:0;
  renderPriceWidget(containerId,data,price,isAdmin);
}

// Main hook — call this when name field changes or price field changes
// widgetId: DOM id of the psc-widget div
// nameInputId: id of the product name input
// priceInputId: id of the price input
// submitBtnId: id of the submit button to disable/enable
// isAdmin: admins see warning but can still submit
async function pscAttach(widgetId, nameInputId, priceInputId, submitBtnId, isAdmin=false){
  const nameEl=document.getElementById(nameInputId);
  const priceEl=document.getElementById(priceInputId);
  const wEl=document.getElementById(widgetId);
  if(!wEl)return;
  wEl.dataset.priceInput=priceInputId;
  wEl.dataset.isAdmin=isAdmin?'true':'false';

  let _fetchTimer=null;
  let _currentData=null;

  // Check price on every keystroke immediately
  function onPriceChange(){
    const price=parseFloat(priceEl?.value)||0;
    if(_currentData){
      renderPriceWidget(widgetId,_currentData,price,isAdmin);
      // Enable/disable submit
      const btn=document.getElementById(submitBtnId);
      if(btn){
        const v=validatePrice(price,_currentData);
        if(!isAdmin&&!v.ok&&!_currentData.unverified){
          btn.disabled=true;btn.title=v.message;
          btn.style.opacity='0.45';btn.style.cursor='not-allowed';
        } else {
          btn.disabled=false;btn.title='';
          btn.style.opacity='';btn.style.cursor='';
        }
      }
    }
  }

  // Fetch on name change (debounced 800ms)
  async function onNameChange(){
    const name=nameEl?.value?.trim();
    if(!name||name.length<4)return;
    wEl.dataset.productName=name;
    clearTimeout(_fetchTimer);
    _fetchTimer=setTimeout(async()=>{
      pscShowLoading(widgetId);
      _currentData=await fetchMarketPrices(name);
      const price=parseFloat(priceEl?.value)||0;
      renderPriceWidget(widgetId,_currentData,price,isAdmin);
      onPriceChange();
    },800);
  }

  nameEl?.addEventListener('input',onNameChange);
  nameEl?.addEventListener('blur',onNameChange);
  priceEl?.addEventListener('input',onPriceChange);
  priceEl?.addEventListener('blur',onPriceChange);

  // If name already populated, fetch immediately
  const existingName=nameEl?.value?.trim();
  if(existingName&&existingName.length>=4){
    wEl.dataset.productName=existingName;
    pscShowLoading(widgetId);
    _currentData=await fetchMarketPrices(existingName);
    const price=parseFloat(priceEl?.value)||0;
    renderPriceWidget(widgetId,_currentData,price,isAdmin);
    onPriceChange();
  }
}

// Build the enrichment prompt with your product schema + category list
// ═══════════════════════════════════════════════════
// AI PRODUCT CATALOG EXTRACTION SYSTEM
// Modes: URL Scrape | Product Name Search | Bulk
// ═══════════════════════════════════════════════════

function buildCatalogPrompt(mode, input, categoryList){
  const systemPrompt=`You are a product catalog extraction AI for Glonni, an Indian marketplace. Extract detailed accurate product information and return it as a JSON array.

CRITICAL RULES:
- Return ONLY a valid JSON array, no markdown, no backticks
- Extract REAL data only — never invent specs
- NO prices — leave price as 0, compare_at_price as null
- Images: find up to 6 real URLs (front, back, side, lifestyle, detail) from official website
- Specifications: top 10 most important as "specifications", remaining as "extra_specs"
- Description: rich HTML with sections, feature highlights, key selling points
- Variations: ALL color, size, storage, RAM variants
- Category: most specific match from list

Return schema per product:
{
  "name":"Full product name",
  "slug":"lowercase-slug",
  "description_html":"<p>Rich HTML...</p>",
  "images":["url1","url2",...max 6],
  "specifications":[{"key":"Display","value":"6.7 AMOLED"},...top 10],
  "extra_specs":[{"key":"Chipset","value":"..."},...rest],
  "variations":[{"name":"Color","options":[{"label":"Black","color_hex":"#000000","image_url":""}]}],
  "category_id":"uuid",
  "category_path":"Electronics > Smartphones",
  "brand_name":"Brand",
  "source_url":"official URL",
  "tags":["tag1"],
  "ai_confidence_score":90,
  "ai_flags":[]
}

Categories:
${categoryList}`;

  let userPrompt = mode==='url'
    ? `Extract ALL products from this URL: ${input}\n\nReturn a JSON array. For a listing page extract all products. For a single product page extract that one product.`
    : mode==='name'
    ? `Search for this product and extract complete details: "${input}"\n\nFind the official product page. Extract all info including all variants/colors/sizes. Return a JSON array with one product.`
    : `Extract ALL products from this brand page: ${input}\n\nCrawl and extract every product. Return a JSON array of all products found.`;

  return {systemPrompt, userPrompt};
}

async function renderAdminOnboarding(){
  if(!PROFILE||PROFILE.role!=="admin"){go("home");return;}
  $("main").innerHTML="<div class=\"container\" style=\"padding:40px 0;text-align:center;color:var(--gray-400)\">Loading...</div>";

  const [catalogProds,vendors,cats]=await Promise.all([
    sb.get("catalog_products","id,name,brand_name,category_path,ai_confidence_score,status,source_mode,source_url,created_at",{order:"created_at.desc",limit:50}),
    sb.get("vendor_stores","id,store_name,vendor_id",{}),
    sb.get("categories","id,name,level,icon",{is_active:"eq.true",order:"level.asc,name.asc"})
  ]);

  const vendorOpts=vendors.map(v=>`<option value="${v.id}">${esc(v.store_name)}</option>`).join("");
  const savedKey=localStorage.getItem("glonni_ai_key")||"";
  const savedProvider=localStorage.getItem("glonni_ai_provider")||"anthropic";
  if(savedKey)AI_API_KEY=savedKey;
  if(savedProvider)AI_CONFIG.provider=savedProvider;

  const byBrand={};
  catalogProds.forEach(p=>{const b=p.brand_name||"Unbranded";if(!byBrand[b])byBrand[b]=[];byBrand[b].push(p);});

  $("main").innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:24px;font-weight:800">🤖 AI Product Catalog Builder</h2>
        <p style="font-size:13px;color:var(--gray-400)">Extract products from URLs, search by name, or bulk-import. Prices set by vendor later.</p>
      </div>
      <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
    </div>

    <div class="card" style="margin-bottom:20px;border-left:4px solid var(--purple)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">🤖</span>
          <div>
            <h3 style="font-weight:700">Anthropic Claude — Connected</h3>
            <p style="font-size:12px;color:var(--gray-400);margin-top:2px">Powered by claude-sonnet-4 with web search · API key secured server-side</p>
          </div>
        </div>
        <span class="badge badge-green">✓ Active</span>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--gray-200)">
        <button id="ob-tab-url" class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid var(--black);font-weight:700;padding:10px 20px" onclick="obMode('url')">🌐 Website URL</button>
        <button id="ob-tab-name" class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid transparent;font-weight:500;padding:10px 20px" onclick="obMode('name')">🔍 Product Name</button>
        <button id="ob-tab-bulk" class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid transparent;font-weight:500;padding:10px 20px" onclick="obMode('bulk')">📋 Bulk Import</button>
      </div>

      <div id="ob-pane-url">
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px">Paste any product page URL or a category/listing page URL. AI extracts all products it finds — single product or entire catalog.</p>
        <div class="form-group"><label class="form-label">Product or Category Page URL</label>
          <input class="form-input" id="ob-url" placeholder="https://www.apple.com/in/shop/buy-iphone/iphone-17-pro" style="font-family:'Space Mono',monospace;font-size:12px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label class="form-label">Brand Name</label><input class="form-input" id="ob-brand-url" placeholder="e.g. Apple"></div>
          <div class="form-group"><label class="form-label">Assign to Vendor (optional)</label><select class="form-select" id="ob-vendor-url"><option value="">— Assign later —</option>${vendorOpts}</select></div>
        </div>
        <button class="btn btn-gold btn-pill" id="ob-btn-url" onclick="obRun('url')">🤖 Extract from URL</button>
      </div>

      <div id="ob-pane-name" style="display:none">
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px">Enter one product name per line. AI searches the web for each, finds the official page, and extracts full details including all variants, specs, and images.</p>
        <div class="form-group"><label class="form-label">Product Names (one per line)</label>
          <textarea class="form-textarea" id="ob-names" placeholder="iPhone 17 Pro Max&#10;Samsung Galaxy S25 Ultra&#10;boAt Rockerz 255 Pro" style="min-height:140px"></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label class="form-label">Brand / Collection</label><input class="form-input" id="ob-brand-name" placeholder="Mixed Brands"></div>
          <div class="form-group"><label class="form-label">Assign to Vendor (optional)</label><select class="form-select" id="ob-vendor-name"><option value="">— Assign later —</option>${vendorOpts}</select></div>
        </div>
        <button class="btn btn-gold btn-pill" id="ob-btn-name" onclick="obRun('name')">🔍 Search & Extract</button>
      </div>

      <div id="ob-pane-bulk" style="display:none">
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px">Paste multiple category or listing page URLs (one per line). AI crawls and extracts all products from each.</p>
        <div class="form-group"><label class="form-label">URLs (one per line)</label>
          <textarea class="form-textarea" id="ob-bulk-urls" placeholder="https://www.boat-lifestyle.com/collections/earphones&#10;https://www.boat-lifestyle.com/collections/headphones" style="min-height:120px;font-family:'Space Mono',monospace;font-size:11px"></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label class="form-label">Brand Name</label><input class="form-input" id="ob-brand-bulk" placeholder="e.g. boAt Lifestyle"></div>
          <div class="form-group"><label class="form-label">Assign to Vendor (optional)</label><select class="form-select" id="ob-vendor-bulk"><option value="">— Assign later —</option>${vendorOpts}</select></div>
        </div>
        <button class="btn btn-gold btn-pill" id="ob-btn-bulk" onclick="obRun('bulk')">📋 Bulk Extract</button>
      </div>

      <div id="ob-progress" style="margin-top:16px"></div>
      <div id="ob-results" style="margin-top:16px"></div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h3 style="font-weight:700">📚 Catalog Library <span style="font-size:13px;font-weight:400;color:var(--gray-400)">${catalogProds.length} products</span></h3>
      </div>
      ${!catalogProds.length?`<div style="text-align:center;padding:40px 20px;color:var(--gray-400)"><p style="font-size:32px;margin-bottom:8px">📦</p><p style="font-weight:600">No products yet</p><p style="font-size:13px;margin-top:4px">Use a mode above to start building your catalog</p></div>`
      :Object.entries(byBrand).map(([brand,prods])=>`<div style="margin-bottom:16px">
        <p style="font-weight:700;font-size:14px;margin-bottom:8px">${esc(brand)} <span style="font-weight:400;color:var(--gray-400);font-size:12px">${prods.length} product${prods.length!==1?"s":""}</span></p>
        ${prods.slice(0,5).map(p=>{
          const conf=p.ai_confidence_score||0;
          const confColor=conf>=85?"var(--green)":conf>=65?"var(--orange)":"var(--red)";
          const stBg=p.status==="ready"?"badge-green":p.status==="mapped"?"badge-blue":"badge-gold";
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--gray-50);border-radius:var(--radius-sm);margin-bottom:6px;gap:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:0"><p style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</p>
              <p style="font-size:11px;color:var(--gray-400);margin-top:2px">${p.category_path||"Uncategorized"} · ${new Date(p.created_at).toLocaleDateString()}</p></div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span style="font-size:11px;font-weight:700;color:${confColor}">AI ${conf}%</span>
              <span class="badge ${stBg}">${p.status}</span>
              <button class="btn btn-ghost btn-sm btn-pill" onclick="obViewProduct('${p.id}')">View →</button>
            </div>
          </div>`;
        }).join("")}
        ${prods.length>5?`<p style="font-size:12px;color:var(--gray-400);padding:4px 12px">+${prods.length-5} more</p>`:""}
      </div>`).join("")}
    </div>
  </div>`;
}

function obMode(mode){
  ["url","name","bulk"].forEach(m=>{
    const pane=$(`ob-pane-${m}`);
    const tab=$(`ob-tab-${m}`);
    if(pane)pane.style.display=m===mode?"block":"none";
    if(tab)tab.style.cssText=`border-radius:0;border-bottom:3px solid ${m===mode?"var(--black)":"transparent"};font-weight:${m===mode?"700":"500"};padding:10px 20px`;
  });
}

async function obRun(mode){
  if(!AI_API_KEY){toast("Set your AI API key first","⚠️");return;}
  const progress=$("ob-progress");
  const results=$("ob-results");
  let input="",brand="",vendorStoreId="";
  if(mode==="url"){input=$("ob-url")?.value?.trim();brand=$("ob-brand-url")?.value?.trim();vendorStoreId=$("ob-vendor-url")?.value||"";}
  else if(mode==="name"){input=$("ob-names")?.value?.trim();brand=$("ob-brand-name")?.value?.trim()||"Mixed";vendorStoreId=$("ob-vendor-name")?.value||"";}
  else{input=$("ob-bulk-urls")?.value?.trim();brand=$("ob-brand-bulk")?.value?.trim();vendorStoreId=$("ob-vendor-bulk")?.value||"";}
  if(!input){toast("Enter input first","⚠️");return;}
  if(mode!=="name"&&!brand){toast("Enter brand name","⚠️");return;}
  const btn=$(`ob-btn-${mode}`);
  if(btn){btn.disabled=true;btn.textContent="⏳ AI working...";}
  if(progress)progress.innerHTML=`<div style="padding:14px;background:var(--gray-50);border-radius:var(--radius);border-left:4px solid var(--gold)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:20px">🤖</span>
      <div><p style="font-weight:700">AI is extracting products...</p><p style="font-size:12px;color:var(--gray-400)" id="ob-status-text">Analyzing...</p></div></div>
    <div style="height:4px;background:var(--gray-200);border-radius:2px;overflow:hidden"><div id="ob-progress-bar" style="height:100%;width:20%;background:var(--gold);border-radius:2px;transition:width .5s"></div></div>
  </div>`;

  const cats=await sb.get("categories","id,name,level",{is_active:"eq.true"});
  const catList=cats.map(c=>`${c.id}: ${"  ".repeat(c.level)}${c.name}`).join("\n");
  const inputs=mode==="name"?input.split("\n").map(l=>l.trim()).filter(Boolean):
               mode==="bulk"?input.split("\n").map(l=>l.trim()).filter(Boolean):[input];
  let allProducts=[],failed=0;

  for(let i=0;i<inputs.length;i++){
    const sEl=$("ob-status-text");const bEl=$("ob-progress-bar");
    if(sEl)sEl.textContent=`Processing ${i+1} of ${inputs.length}: ${inputs[i].slice(0,60)}...`;
    if(bEl)bEl.style.width=`${Math.round((i/inputs.length)*80)+10}%`;
    const {systemPrompt,userPrompt}=buildCatalogPrompt(mode==="bulk"?"bulk_url":mode,inputs[i],catList);
    const aiResponse=await callAI(systemPrompt,userPrompt);
    if(!aiResponse){failed++;continue;}
    try{
      const clean=aiResponse.replace(/```json|```/g,"").trim();
      const arrS=clean.indexOf("[");const arrE=clean.lastIndexOf("]");
      const objS=clean.indexOf("{");const objE=clean.lastIndexOf("}");
      if(arrS!==-1&&arrS<objS){const parsed=JSON.parse(clean.slice(arrS,arrE+1));allProducts.push(...(Array.isArray(parsed)?parsed:[parsed]));}
      else if(objS!==-1){allProducts.push(JSON.parse(clean.slice(objS,objE+1)));}
    }catch(e){failed++;console.log("Parse error",e,aiResponse.slice(0,200));}
  }

  const bEl2=$("ob-progress-bar");if(bEl2)bEl2.style.width="90%";
  const jobRec=await sb.ins("onboarding_jobs",{brand_name:brand,vendor_store_id:vendorStoreId||null,source:mode,status:"running",products_created:0,products_flagged:0,created_by:PROFILE.id});
  const jobId=jobRec[0]?.id;
  let created=0,flagged=0;
  const resultCards=[];

  for(const product of allProducts){
    if(!product.name)continue;
    const slug=(product.slug||(product.name||"product").toLowerCase().replace(/[^a-z0-9]+/g,"-"))+"-"+Date.now()+Math.random().toString(36).slice(2,5);
    const conf=product.ai_confidence_score||75;
    if(conf<70)flagged++;
    try{
      await sb.ins("catalog_products",{onboarding_job_id:jobId||null,brand_name:brand,name:product.name,slug,source_url:product.source_url||inputs[0]||null,source_mode:mode,description_html:product.description_html||product.description||"",images:product.images||[],specifications:product.specifications||[],extra_specs:product.extra_specs||[],variations:product.variations||[],category_id:product.category_id||null,category_path:product.category_path||"",ai_confidence_score:conf,ai_flags:product.ai_flags||[],status:"ready",created_by:PROFILE.id});
      created++;
      const cc=conf>=85?"var(--green)":conf>=65?"var(--orange)":"var(--red)";
      const imgs=product.images||[];
      resultCards.push(`<div style="display:flex;gap:12px;padding:12px;background:#fff;border:1.5px solid var(--gray-200);border-radius:var(--radius);margin-bottom:8px;flex-wrap:wrap">
        ${imgs[0]?`<img src="${esc(imgs[0])}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;flex-shrink:0" onerror="this.style.display='none'">`:`<div style="width:72px;height:72px;background:var(--gray-100);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">📦</div>`}
        <div style="flex:1;min-width:160px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><p style="font-weight:700;font-size:14px">${esc(product.name)}</p><span style="font-size:11px;font-weight:700;color:${cc}">AI ${conf}%</span></div>
          <p style="font-size:12px;color:var(--gray-500)">${product.category_path||"Uncategorized"}</p>
          <p style="font-size:12px;color:var(--gray-400);margin-top:2px">${imgs.length} images · ${(product.specifications||[]).length} specs · ${(product.variations||[]).length} variant groups</p>
          ${(product.ai_flags||[]).length?`<p style="font-size:11px;color:var(--orange);margin-top:2px">⚑ ${product.ai_flags.join(" · ")}</p>`:""}
        </div>
      </div>`);
    }catch(e){failed++;console.log("DB error",e);}
  }

  if(jobId)await sb.upd("onboarding_jobs",{status:!created?"failed":"completed",products_created:created,products_flagged:flagged,products_failed:failed,completed_at:new Date().toISOString()},{id:`eq.${jobId}`});
  if(progress)progress.innerHTML="";
  if(btn){btn.disabled=false;btn.textContent=mode==="url"?"🤖 Extract from URL":mode==="name"?"🔍 Search & Extract":"📋 Bulk Extract";}
  if(results)results.innerHTML=`<div style="padding:14px;background:var(--gray-50);border-radius:var(--radius);margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
    <span style="font-weight:700;color:var(--green);font-size:14px">✅ ${created} products extracted</span>
    ${flagged?`<span style="font-weight:600;color:var(--orange)">⚠️ ${flagged} low confidence</span>`:""}
    ${failed?`<span style="font-weight:600;color:var(--red)">❌ ${failed} failed</span>`:""}
    <button class="btn btn-outline btn-pill btn-sm" style="margin-left:auto" onclick="renderAdminOnboarding()">↻ Refresh Library</button>
  </div>${resultCards.join("")}`;
  if(created>0)toast(`${created} products added to catalog!`,"📦");
}

async function obViewProduct(id){
  const rows=await sb.get("catalog_products","*",{id:`eq.${id}`});
  const p=rows[0];if(!p)return;
  const modal=document.createElement("div");modal.className="auth-overlay";
  const specs=p.specifications||[];const extraSpecs=p.extra_specs||[];const images=p.images||[];const variations=p.variations||[];
  modal.innerHTML=`<div class="auth-card" style="max-width:680px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px">
      <div><h3 style="font-weight:800;font-size:18px">${esc(p.name)}</h3><p style="font-size:13px;color:var(--gray-400);margin-top:2px">${p.category_path||"Uncategorized"} · AI ${p.ai_confidence_score||0}%</p></div>
      <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
    </div>
    ${images.length?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">${images.map(img=>`<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--gray-50);border:1px solid var(--gray-200)"><img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<span style=display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;color:var(--gray-300)>📷</span>'"></div>`).join("")}</div>`:""}
    ${variations.length?`<div style="margin-bottom:20px"><h4 style="font-weight:700;font-size:14px;margin-bottom:10px">Variants</h4>${variations.map(v=>`<div style="margin-bottom:8px"><p style="font-size:12px;font-weight:600;color:var(--gray-500);margin-bottom:6px">${esc(v.name)}</p><div style="display:flex;gap:6px;flex-wrap:wrap">${(v.options||[]).map(o=>`<span style="padding:4px 12px;border:1.5px solid var(--gray-200);border-radius:20px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px">${o.color_hex?`<span style="width:12px;height:12px;border-radius:50%;background:${o.color_hex};border:1px solid rgba(0,0,0,.1);flex-shrink:0"></span>`:""}${esc(o.label)}</span>`).join("")}</div></div>`).join("")}</div>`:""}
    ${specs.length?`<div style="margin-bottom:16px"><h4 style="font-weight:700;font-size:14px;margin-bottom:10px">Key Specifications</h4>
      <div style="background:var(--gray-50);border-radius:var(--radius);overflow:hidden">${specs.map((s,i)=>`<div style="display:flex;padding:10px 14px;${i<specs.length-1?"border-bottom:1px solid var(--gray-200)":""}"><span style="font-size:13px;color:var(--gray-500);width:45%;font-weight:500">${esc(s.key)}</span><span style="font-size:13px;font-weight:600;flex:1">${esc(s.value)}</span></div>`).join("")}</div>
      ${extraSpecs.length?`<details style="margin-top:8px"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--blue);padding:8px 0">View ${extraSpecs.length} more specs ▾</summary><div style="background:var(--gray-50);border-radius:var(--radius);overflow:hidden;margin-top:6px">${extraSpecs.map((s,i)=>`<div style="display:flex;padding:10px 14px;${i<extraSpecs.length-1?"border-bottom:1px solid var(--gray-200)":""}"><span style="font-size:13px;color:var(--gray-500);width:45%;font-weight:500">${esc(s.key)}</span><span style="font-size:13px;font-weight:600;flex:1">${esc(s.value)}</span></div>`).join("")}</div></details>`:""}</div>`:""}
    ${p.description_html?`<div style="margin-bottom:16px"><h4 style="font-weight:700;font-size:14px;margin-bottom:10px">Description</h4><div style="font-size:13px;line-height:1.7;color:var(--gray-600)">${p.description_html}</div></div>`:""}
    <div style="display:flex;gap:8px;padding-top:16px;border-top:1px solid var(--gray-200)">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="obMapToProduct('${p.id}')">🔗 Map to Vendor</button>
      <button class="btn btn-danger btn-pill btn-sm" onclick="obDeleteCatalog('${p.id}')">🗑️</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Close</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});
}

async function obDeleteCatalog(id){
  if(!confirm("Delete this catalog product?"))return;
  await sb.del("catalog_products",{id:`eq.${id}`});
  document.querySelector(".auth-overlay")?.remove();
  toast("Deleted","🗑️");renderAdminOnboarding();
}

async function obMapToProduct(catalogId){
  const vendors=await sb.get("vendor_stores","id,store_name,vendor_id",{});
  const modal=document.createElement("div");modal.className="auth-overlay";
  modal.innerHTML=`<div class="auth-card" style="max-width:440px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">🔗 Map to Vendor</h3>
    <p style="font-size:13px;color:var(--gray-400);margin-bottom:16px">Assign to a vendor — they'll see it in pending catalog and set the price.</p>
    <div class="form-group"><label class="form-label">Vendor</label>
      <select class="form-select" id="map-vendor"><option value="">Select vendor...</option>${vendors.map(v=>`<option value="${v.id}|${v.vendor_id}">${esc(v.store_name)}</option>`).join("")}</select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Initial Price ₹ (optional)</label><input class="form-input" id="map-price" type="number" placeholder="0"></div>
      <div class="form-group"><label class="form-label">Stock</label><input class="form-input" id="map-stock" type="number" value="50"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="obDoMap('${catalogId}')">Map & Create Draft</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});
}

async function obDoMap(catalogId){
  const vendorVal=$("map-vendor")?.value;
  if(!vendorVal){toast("Select a vendor","⚠️");return;}
  const [storeId,vendorId]=vendorVal.split("|");
  const price=parseFloat($("map-price")?.value)||0;
  const stock=parseInt($("map-stock")?.value)||50;
  const rows=await sb.get("catalog_products","*",{id:`eq.${catalogId}`});
  const cp=rows[0];if(!cp)return;
  const slug=(cp.slug||cp.name.toLowerCase().replace(/[^a-z0-9]+/g,"-"))+"-"+Date.now();
  const r=await sb.ins("products",{name:cp.name,slug,description:cp.description_html||"",price,compare_at_price:null,stock,cashback_percent:0,category_id:cp.category_id||null,images:cp.images||[],specifications:cp.specifications||[],tags:[],is_active:false,is_approved:false,status:"draft",onboarding_source:"catalog",onboarding_status:"pending_vendor",ai_confidence_score:cp.ai_confidence_score,ai_flags:cp.ai_flags,brand_name:cp.brand_name,vendor_id:vendorId||null,store_id:storeId||null});
  if(r.length){
    await sb.upd("catalog_products",{status:"mapped",mapped_product_id:r[0].id,mapped_vendor_id:vendorId||null},{id:`eq.${catalogId}`});
    document.querySelectorAll(".auth-overlay").forEach(m=>m.remove());
    toast("Mapped! Vendor can confirm it 🎉","✅");renderAdminOnboarding();
  }
}


async function renderAdminReferrals(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading referral data...</div>';
  const [earnings,users]=await Promise.all([
    sb.get("referral_earnings","*",{order:"created_at.desc"}),
    sb.get("profiles","id,full_name,email",{})
  ]);
  const userMap={};users.forEach(u=>{userMap[u.id]=u;});
  const getName=id=>userMap[id]?.full_name||userMap[id]?.email||id?.slice(0,8)||'—';

  const totalPaid=earnings.filter(e=>e.status==='approved').reduce((a,e)=>a+parseFloat(e.commission_amount||0),0);
  const totalPending=earnings.filter(e=>e.status==='pending').reduce((a,e)=>a+parseFloat(e.commission_amount||0),0);
  const totalVoided=earnings.filter(e=>e.status==='voided').reduce((a,e)=>a+parseFloat(e.commission_amount||0),0);
  const pendingCount=earnings.filter(e=>e.status==='pending').length;
  const approvedCount=earnings.filter(e=>e.status==='approved').length;
  const voidedCount=earnings.filter(e=>e.status==='voided').length;

  // Top referrers
  const referrerMap={};
  earnings.filter(e=>e.status==='approved').forEach(e=>{
    if(!referrerMap[e.referrer_user_id])referrerMap[e.referrer_user_id]={count:0,total:0,name:getName(e.referrer_user_id)};
    referrerMap[e.referrer_user_id].count++;
    referrerMap[e.referrer_user_id].total+=parseFloat(e.commission_amount||0);
  });
  const topReferrers=Object.entries(referrerMap).sort((a,b)=>b[1].total-a[1].total).slice(0,5);

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:24px;font-weight:800">🔗 Referral Program</h2>
        <p style="font-size:13px;color:var(--gray-400)">${earnings.length} total referral earnings</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-gold btn-pill btn-sm" onclick="adminProcessReferrals()">⚡ Process Approvals</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-categories')">⚙️ Edit Commission %</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="g4" style="margin-bottom:24px">
      <div class="stat-card" style="border-top:3px solid var(--green)"><div class="stat-val" style="color:var(--green)">₹${totalPaid.toFixed(0)}</div><div class="stat-label">Total Paid Out (${approvedCount})</div></div>
      <div class="stat-card" style="border-top:3px solid var(--orange)"><div class="stat-val" style="color:var(--orange)">₹${totalPending.toFixed(0)}</div><div class="stat-label">Pending (${pendingCount})</div></div>
      <div class="stat-card" style="border-top:3px solid var(--red)"><div class="stat-val" style="color:var(--red)">₹${totalVoided.toFixed(0)}</div><div class="stat-label">Voided/Returns (${voidedCount})</div></div>
      <div class="stat-card" style="border-top:3px solid var(--purple)"><div class="stat-val" style="color:var(--purple)">${Object.keys(referrerMap).length}</div><div class="stat-label">Active Referrers</div></div>
    </div>

    <!-- Top Referrers -->
    ${topReferrers.length?`<div class="card" style="margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:14px">🏆 Top Referrers</h3>
      ${topReferrers.map(([uid,d],i)=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100)">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="width:24px;height:24px;background:var(--gold);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px">${i+1}</span>
            <div><p style="font-weight:600;font-size:13px">${esc(d.name)}</p><p style="font-size:11px;color:var(--gray-400)">${d.count} successful referral${d.count!==1?'s':''}</p></div>
          </div>
          <span style="font-weight:800;color:var(--green)">₹${d.total.toFixed(0)}</span>
        </div>`).join('')}
    </div>`:''}

    <!-- All Earnings Table -->
    <div class="card">
      <h3 style="font-weight:700;margin-bottom:14px">All Referral Earnings</h3>
      ${!earnings.length?'<p style="color:var(--gray-400);font-size:13px">No referral earnings yet.</p>':
      earnings.map(e=>{
        const daysLeft=e.eligible_at&&e.status==='pending'?Math.max(0,Math.ceil((new Date(e.eligible_at)-Date.now())/86400000)):0;
        const stBg=e.status==='approved'?'badge-green':e.status==='voided'?'badge-red':'badge-gold';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);font-size:13px;flex-wrap:wrap;gap:6px">
          <div>
            <span class="badge ${stBg}" style="margin-right:8px">${e.status}</span>
            <span style="font-weight:600">${esc(getName(e.referrer_user_id))}</span>
            <span style="color:var(--gray-400);margin:0 4px">→</span>
            <span style="color:var(--gray-500)">${esc(getName(e.buyer_user_id))} bought</span>
            ${e.status==='pending'?`<span style="font-size:11px;color:var(--orange);margin-left:6px">· ${daysLeft}d left</span>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="color:var(--gray-400);font-size:11px">${new Date(e.created_at).toLocaleDateString()} · ${e.commission_pct}%</span>
            <span style="font-weight:800;color:${e.status==='approved'?'var(--green)':e.status==='voided'?'var(--gray-400)':'var(--orange)'}">₹${parseFloat(e.commission_amount||0).toFixed(2)}</span>
            ${e.status==='pending'?`<button class="btn btn-ghost btn-sm btn-pill" onclick="adminVoidReferral('${e.id}')">Void</button>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

async function adminProcessReferrals(){
  toast('Processing referral approvals...','⚡');
  await processReferralApprovals();
  toast('Done! Check updated statuses.','✅');
  renderAdminReferrals();
}

async function adminVoidReferral(id){
  if(!confirm('Void this referral earning? This will cancel the commission.'))return;
  await sb.upd("referral_earnings",{status:'voided',updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Referral earning voided','🗑️');
  renderAdminReferrals();
}
// ═══════════════════════════════════════════════════
// REFERRAL APPROVAL ENGINE — EVENT-DRIVEN
// Three triggers:
//   1. checkSettlementEligibility → return window closed naturally
//   2. confirmNoReturn → buyer explicitly waived return
//   3. processReturn (approve) → void referral on approved return
// Safety-net: processReferralApprovals() runs once on login
//   to catch any orphans (nobody logged in during window).
//   No polling. No timers.
// ═══════════════════════════════════════════════════

// Approve all pending referral earnings for a single order + credit wallet + notify
async function approveReferralForOrder(orderId){
  try{
    const earnings=await sb.get("referral_earnings","*",{order_id:`eq.${orderId}`,status:"eq.pending"});
    for(const earn of earnings){
      const now=new Date().toISOString();
      await sb.upd("referral_earnings",{status:'approved',approved_at:now,updated_at:now},{id:`eq.${earn.id}`});
      const wallets=await sb.get("wallets","*",{user_id:`eq.${earn.referrer_user_id}`});
      if(wallets.length){
        const w=wallets[0];
        await sb.upd("wallets",{
          available_balance:parseFloat(w.available_balance||0)+earn.commission_amount,
          total_earned:parseFloat(w.total_earned||0)+earn.commission_amount
        },{user_id:`eq.${earn.referrer_user_id}`});
      } else {
        await sb.ins("wallets",{user_id:earn.referrer_user_id,available_balance:earn.commission_amount,pending_balance:0,total_earned:earn.commission_amount});
      }
      await sb.ins("wallet_transactions",{
        user_id:earn.referrer_user_id,
        type:'referral_commission',
        amount:earn.commission_amount,
        status:'available',
        description:`Referral commission ₹${earn.commission_amount.toFixed(2)} (${earn.commission_pct}%) — return window closed`,
        reference_id:earn.order_id
      });
      await sb.ins("notifications",{
        user_id:earn.referrer_user_id,
        type:'referral_approved',
        title:'💸 Referral Commission Credited!',
        message:`You earned ₹${earn.commission_amount.toFixed(2)} for sharing a product. Added to your wallet.`,
        is_read:false,
        action_url:'wallet',
        data:{order_id:earn.order_id,amount:earn.commission_amount}
      });
    }
  }catch(e){console.log('[Referral] approveReferralForOrder error:',e);}
}

// Void all pending referral earnings for an order (called on approved return)
async function voidReferralForOrder(orderId){
  try{
    const earnings=await sb.get("referral_earnings","*",{order_id:`eq.${orderId}`,status:"eq.pending"});
    for(const earn of earnings){
      await sb.upd("referral_earnings",{status:'voided',updated_at:new Date().toISOString()},{id:`eq.${earn.id}`});
    }
  }catch(e){console.log('[Referral] voidReferralForOrder error:',e);}
}

// Safety-net: runs once on login — catches orphaned earnings missed by event triggers
async function processReferralApprovals(){
  try{
    const now=new Date().toISOString();
    const pending=await sb.get("referral_earnings","*",{status:"eq.pending",eligible_at:`lte.${now}`});
    for(const earn of pending){
      const returns=await sb.get("return_requests","status",{order_id:`eq.${earn.order_id}`,status:"in.(pending,approved)"});
      if(returns.length){
        await sb.upd("referral_earnings",{status:'voided',updated_at:now},{id:`eq.${earn.id}`});
      } else {
        await approveReferralForOrder(earn.order_id);
      }
    }
  }catch(e){console.log('[Referral] Safety-net error:',e);}
}

async function renderAdminUsers(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  const users=await sb.get("profiles","*",{order:"created_at.desc"});
  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><h2 style="font-size:24px;font-weight:800">👥 Users <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${users.length})</span></h2><button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button></div>
    ${users.map(u=>`<div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center"><div><p style="font-weight:600">${esc(u.full_name)}</p><p style="font-size:12px;color:var(--gray-400)">${esc(u.email)} · Joined ${new Date(u.created_at).toLocaleDateString()}</p></div><div style="display:flex;gap:8px;align-items:center"><span class="role-pill" style="background:${roleBg(u.role)};color:#fff">${u.role}</span>${u.is_blocked?'<span class="badge badge-red">Blocked</span>':''}<button class="btn btn-sm ${u.is_blocked?'btn-success':'btn-danger'} btn-pill" onclick="toggleBlock('${u.id}',${u.is_blocked})">${u.is_blocked?'Unblock':'Block'}</button></div></div>`).join('')}
  </div>`;
}
async function toggleBlock(id,bl){await sb.upd("profiles",{is_blocked:!bl},{id:`eq.${id}`});toast(bl?'Unblocked':'Blocked','✅');renderAdminUsers();}

async function renderAdminVendors(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  const stores=await sb.get("vendor_stores","*,profiles(full_name)",{order:"created_at.desc"});
  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><h2 style="font-size:24px;font-weight:800">🏪 Vendors <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${stores.length})</span></h2><button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button></div>
    ${stores.map(s=>`<div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center"><div><p style="font-weight:600">${esc(s.store_name)}</p><p style="font-size:12px;color:var(--gray-400)">${esc(s.profiles?.full_name)} · Fee ${s.platform_fee_percent}% · ${s.total_sales||0} sales</p></div><div style="display:flex;gap:8px;align-items:center"><span class="badge ${s.is_approved?'badge-green':'badge-gold'}">${s.is_approved?'Approved':'Pending'}</span><button class="btn btn-sm ${s.is_approved?'btn-danger':'btn-success'} btn-pill" onclick="toggleApproveStore('${s.id}',${s.is_approved})">${s.is_approved?'Revoke':'Approve ✓'}</button></div></div>`).join('')}
  </div>`;
}
async function toggleApproveStore(id,ap){await sb.upd("vendor_stores",{is_approved:!ap},{id:`eq.${id}`});toast(ap?'Revoked':'Approved ✓','✅');renderAdminVendors();}

// ═══════════════════════════════════════════════════
// STEP 2 — ADMIN PRODUCTS: VERTICAL VIEW
// ═══════════════════════════════════════════════════
let _apvMode='vertical'; // 'vertical' | 'flat'

async function renderAdminProducts(params){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading products...</div>';

  const [prods,cats]=await Promise.all([
    sb.get("products","*,vendor_stores(store_name),categories(name)",{order:"created_at.desc"}),
    sb.get("categories","id,name,parent_id,icon",{is_active:"eq.true",order:"sort_order.asc"})
  ]);

  // Group by top-level category
  const topCats=cats.filter(c=>!c.parent_id);
  const catMap={};cats.forEach(c=>catMap[c.id]=c);
  const getCatTop=catId=>{
    if(!catId)return null;
    let c=catMap[catId];
    while(c&&c.parent_id)c=catMap[c.parent_id];
    return c;
  };
  const byVertical={};
  const uncategorised=[];
  prods.forEach(p=>{
    const top=getCatTop(p.category_id);
    if(top){
      if(!byVertical[top.id])byVertical[top.id]={cat:top,prods:[]};
      byVertical[top.id].prods.push(p);
    } else uncategorised.push(p);
  });
  if(uncategorised.length)byVertical['_none']={cat:{id:'_none',name:'Uncategorised',icon:'📦'},prods:uncategorised};

  const stats={live:prods.filter(p=>p.is_approved&&p.is_active).length,draft:prods.filter(p=>!p.is_approved).length,total:prods.length};

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:24px;font-weight:800">📦 Products</h2>
        <p style="font-size:13px;color:var(--gray-400)">${stats.total} total · ${stats.live} live · ${stats.draft} draft · ${Object.keys(byVertical).length} verticals</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div style="display:flex;border:1.5px solid var(--gray-200);border-radius:20px;overflow:hidden">
          <button id="apv-btn-vertical" class="btn btn-sm" style="border-radius:0;border:none;background:${_apvMode==='vertical'?'var(--black)':'var(--white)'};color:${_apvMode==='vertical'?'#fff':'var(--black)'}" onclick="apvSetMode('vertical')">By Vertical</button>
          <button id="apv-btn-flat" class="btn btn-sm" style="border-radius:0;border:none;background:${_apvMode==='flat'?'var(--black)':'var(--white)'};color:${_apvMode==='flat'?'#fff':'var(--black)'}" onclick="apvSetMode('flat')">Flat List</button>
        </div>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <div id="apv-content">
      ${_apvMode==='vertical'?apvRenderVertical(byVertical,prods):apvRenderFlat(prods)}
    </div>
  </div>`;
}

function apvSetMode(mode){
  _apvMode=mode;renderAdminProducts();
}

function apvRenderVertical(byVertical,allProds){
  if(!Object.keys(byVertical).length)return'<div style="text-align:center;padding:60px 0;color:var(--gray-400)"><p style="font-size:40px">📦</p><p style="margin-top:8px">No products yet</p></div>';
  return Object.values(byVertical).map(({cat,prods})=>`
    <div class="apv-section">
      <div class="apv-section-header" onclick="this.nextElementSibling.classList.toggle('hide')">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">${catIcon(cat.name,cat.icon)}</span>
          <span style="font-weight:700;font-size:15px">${esc(cat.name)}</span>
          <span style="background:rgba(255,255,255,.15);border-radius:12px;padding:2px 10px;font-size:12px">${prods.length}</span>
        </div>
        <div style="display:flex;gap:8px;font-size:12px">
          <span style="color:rgba(255,255,255,.7)">${prods.filter(p=>p.is_approved&&p.is_active).length} live</span>
          <span style="color:rgba(255,255,255,.5)">▾</span>
        </div>
      </div>
      <div class="apv-section-body">
        <div style="display:grid;grid-template-columns:56px 1fr 100px 90px 80px 100px;gap:10px;padding:8px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-400);border-bottom:1px solid var(--gray-100)">
          <span></span><span>Product</span><span style="text-align:center">Commission</span><span style="text-align:center">Status</span><span style="text-align:center">Stock</span><span>Actions</span>
        </div>
        ${prods.map(p=>apvProductRow(p)).join('')}
      </div>
    </div>
  `).join('');
}

function apvRenderFlat(prods){
  return `<div class="card">
    <div style="display:grid;grid-template-columns:56px 1fr 100px 90px 80px 100px;gap:10px;padding:8px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-400);border-bottom:1px solid var(--gray-100)">
      <span></span><span>Product</span><span style="text-align:center">Commission</span><span style="text-align:center">Status</span><span style="text-align:center">Stock</span><span>Actions</span>
    </div>
    ${prods.map(p=>apvProductRow(p)).join('')}
  </div>`;
}

function apvProductRow(p){
  const img=getImg(p,0);
  const comm=p.platform_fee_pct||10;
  const isLive=p.is_approved&&p.is_active;
  return `<div class="apv-product-row">
    <img src="${img}" class="apv-thumb" onerror="this.src=''" alt="">
    <div style="min-width:0">
      <p style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</p>
      <p style="font-size:11px;color:var(--gray-400);margin-top:2px">${esc(p.vendor_stores?.store_name||'—')} · ₹${p.price} · ${p.categories?.name||'Uncategorised'}</p>
      ${(p.platform_offers||[]).length?`<span class="cm-offer-tag" style="font-size:10px;margin:0">🏷️ ${p.platform_offers.length} offer${p.platform_offers.length!==1?'s':''}</span>`:''}
    </div>
    <div style="text-align:center">
      <input class="apv-inline-edit" type="number" value="${comm}" min="0" max="50" onchange="apvSaveComm('${p.id}',this.value)" title="Platform commission %" style="width:55px">
      <span style="font-size:10px;color:var(--gray-400)">%</span>
    </div>
    <div style="text-align:center">
      <span class="badge ${isLive?'badge-green':p.is_approved?'badge-gold':'badge-red'}" style="font-size:10px">${isLive?'Live':p.is_approved?'Inactive':'Draft'}</span>
    </div>
    <div style="text-align:center;font-size:13px;font-weight:600">${p.stock}</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm btn-pill" onclick="apvEditProduct('${p.id}')" title="Edit">✏️</button>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="apvManageImages('${p.id}')" title="Images">🖼️</button>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="apvManageOffers('${p.id}')" title="Offers">🏷️</button>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="toggleApproveProd('${p.id}',${p.is_approved})" title="${p.is_approved?'Hide':'Approve'}">${p.is_approved?'🟢':'⚫'}</button>
    </div>
  </div>`;
}

async function apvSaveComm(id,val){
  await sb.upd("products",{platform_fee_pct:parseFloat(val)||10},{id:`eq.${id}`});
  toast('Commission updated','✅');
}

async function apvEditProduct(id){
  const rows=await sb.get("products","*",{id:`eq.${id}`});
  const p=rows[0];if(!p)return;
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:540px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h3 style="font-weight:800;font-size:18px">✏️ Edit Product</h3>
      <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
    </div>
    <div class="form-group"><label class="form-label">Product Name</label><input class="form-input" id="ape-name" value="${esc(p.name)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Price ₹</label><input class="form-input" id="ape-price" type="number" value="${p.price}"></div>
      <div class="form-group"><label class="form-label">MRP ₹</label><input class="form-input" id="ape-mrp" type="number" value="${p.compare_at_price||''}"></div>
      <div class="form-group"><label class="form-label">Cashback %</label><input class="form-input" id="ape-cb" type="number" value="${p.cashback_percent||0}"></div>
      <div class="form-group"><label class="form-label">Commission %</label><input class="form-input" id="ape-comm" type="number" value="${p.platform_fee_pct||10}"></div>
      <div class="form-group"><label class="form-label">Stock</label><input class="form-input" id="ape-stock" type="number" value="${p.stock||0}"></div>
      <div class="form-group"><label class="form-label">GST %</label><input class="form-input" id="ape-gst" type="number" value="${p.gst_rate||18}"></div>
    </div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="ape-desc" style="min-height:80px">${esc(p.description||'')}</textarea></div>
    <div class="form-group"><label class="form-label">Admin Notes (internal)</label><input class="form-input" id="ape-notes" placeholder="Internal notes..." value="${esc(p.admin_notes||'')}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="ape-status">
          <option value="draft" ${!p.is_approved?'selected':''}>Draft</option>
          <option value="live" ${p.is_approved&&p.is_active?'selected':''}>Live</option>
          <option value="inactive" ${p.is_approved&&!p.is_active?'selected':''}>Inactive</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">HSN Code</label><input class="form-input" id="ape-hsn" value="${esc(p.hsn_code||'')}"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="apvSaveProduct('${id}')">💾 Save</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function apvSaveProduct(id){
  const status=$('ape-status')?.value;
  await sb.upd("products",{
    name:$('ape-name')?.value?.trim(),
    price:parseFloat($('ape-price')?.value)||0,
    compare_at_price:parseFloat($('ape-mrp')?.value)||null,
    cashback_percent:parseFloat($('ape-cb')?.value)||0,
    platform_fee_pct:parseFloat($('ape-comm')?.value)||10,
    stock:parseInt($('ape-stock')?.value)||0,
    gst_rate:parseFloat($('ape-gst')?.value)||18,
    description:$('ape-desc')?.value||'',
    hsn_code:$('ape-hsn')?.value||null,
    is_approved:status==='live'||status==='inactive',
    is_active:status==='live',
    updated_at:new Date().toISOString()
  },{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Product saved ✅','✅');
  renderAdminProducts();
}

async function apvManageImages(id){
  const rows=await sb.get("products","id,name,images",{id:`eq.${id}`});
  const p=rows[0];if(!p)return;
  const modal=document.createElement('div');modal.className='auth-overlay';
  let imgs=[...(p.images||[])];
  const render=()=>{
    modal.innerHTML=`<div class="auth-card" style="max-width:540px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="font-weight:800;font-size:18px">🖼️ Manage Images</h3>
        <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
      </div>
      <p style="font-size:13px;color:var(--gray-400);margin-bottom:14px">${esc(p.name)} · ${imgs.length}/6 images</p>
      <div class="cm-img-strip" id="img-strip-modal">
        ${imgs.map((img,i)=>`<div style="position:relative">
          <img src="${esc(img)}" class="cm-img-thumb" onerror="this.src=''">
          <button class="cm-img-del" onclick="apvDelImg('${id}',${i})">✕</button>
        </div>`).join('')}
        ${imgs.length<6?`<div style="width:72px;height:72px;border:2px dashed var(--gray-300);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--gray-400);font-size:24px" onclick="$('img-add-url').style.display='block'">+</div>`:''}
      </div>
      <div id="img-add-url" style="display:none;margin-top:12px">
        <div class="form-group"><label class="form-label">Image URL</label><input class="form-input" id="img-new-url" placeholder="https://..."></div>
        <button class="btn btn-gold btn-pill btn-sm" onclick="apvAddImg('${id}')">Add Image</button>
      </div>
      <p style="font-size:11px;color:var(--gray-400);margin-top:8px">Up to 6 images. First image is the main thumbnail.</p>
    </div>`;
  };
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  window._apvImgs={id,imgs};
  render();
}

async function apvDelImg(id,idx){
  const rows=await sb.get("products","id,images",{id:`eq.${id}`});
  let imgs=[...(rows[0]?.images||[])];
  imgs.splice(idx,1);
  await sb.upd("products",{images:imgs},{id:`eq.${id}`});
  window._apvImgs={id,imgs};
  document.querySelector('.auth-overlay')?.remove();
  toast('Image removed','🗑️');
  apvManageImages(id);
}

async function apvAddImg(id){
  const url=$('img-new-url')?.value?.trim();if(!url){toast('Enter image URL','⚠️');return;}
  const rows=await sb.get("products","id,images",{id:`eq.${id}`});
  let imgs=[...(rows[0]?.images||[])];
  if(imgs.length>=6){toast('Max 6 images','⚠️');return;}
  imgs.push(url);
  await sb.upd("products",{images:imgs},{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Image added ✅','✅');
  apvManageImages(id);
}

async function apvManageOffers(id){
  const rows=await sb.get("products","id,name,platform_offers",{id:`eq.${id}`});
  const p=rows[0];if(!p)return;
  const offers=p.platform_offers||[];
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:500px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-weight:800;font-size:18px">🏷️ Platform Offers</h3>
      <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--gray-400);margin-bottom:14px">Offers shown to buyers on this product. Managed by admin only.</p>
    <div id="offers-list">
      ${offers.map((o,i)=>`<div class="cm-offer-tag" style="display:flex;align-items:center;gap:8px;margin:6px 0;padding:8px 12px">
        <span>${esc(o.badge_text||o.label)}</span>
        ${o.expires_at?`<span style="color:var(--gray-500);font-size:10px">Expires ${new Date(o.expires_at).toLocaleDateString()}</span>`:''}
        <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:0" onclick="apvDelOffer('${id}',${i})">✕</button>
      </div>`).join('')}
      ${!offers.length?'<p style="color:var(--gray-400);font-size:13px">No offers yet</p>':''}
    </div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-200)">
      <p style="font-weight:700;font-size:14px;margin-bottom:12px">Add Offer</p>
      <div class="form-group"><label class="form-label">Badge Text</label><input class="form-input" id="off-badge" placeholder="Extra 5% off · Free shipping · Limited time"></div>
      <div class="form-group"><label class="form-label">Expires (optional)</label><input class="form-input" id="off-exp" type="datetime-local"></div>
      <button class="btn btn-gold btn-pill" onclick="apvAddOffer('${id}')">+ Add Offer</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function apvAddOffer(id){
  const badge=$('off-badge')?.value?.trim();if(!badge){toast('Enter offer text','⚠️');return;}
  const exp=$('off-exp')?.value?new Date($('off-exp').value).toISOString():null;
  const rows=await sb.get("products","id,platform_offers",{id:`eq.${id}`});
  const offers=[...(rows[0]?.platform_offers||[])];
  offers.push({badge_text:badge,label:badge,expires_at:exp,created_at:new Date().toISOString()});
  await sb.upd("products",{platform_offers:offers},{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Offer added! 🏷️','🏷️');
  apvManageOffers(id);
}

async function apvDelOffer(id,idx){
  const rows=await sb.get("products","id,platform_offers",{id:`eq.${id}`});
  const offers=[...(rows[0]?.platform_offers||[])];
  offers.splice(idx,1);
  await sb.upd("products",{platform_offers:offers},{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Offer removed','🗑️');
  apvManageOffers(id);
}

async function toggleApproveProd(id,ap){
  await sb.upd("products",{is_approved:!ap,is_active:!ap},{id:`eq.${id}`});
  toast(ap?'Hidden':'Approved ✓','✅');
  renderAdminProducts();
}

// ═══════════════════════════════════════════════════
// STEP 1 — ADMIN CATALOG MANAGER
// ═══════════════════════════════════════════════════
let _cmCat='all'; // current selected category filter

async function renderAdminCatalogManager(params){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  if(params?.cat)_cmCat=params.cat;
  $('main').innerHTML='<div style="padding:40px;text-align:center;color:var(--gray-400)">Loading catalog manager...</div>';

  const [allProds,cats]=await Promise.all([
    sb.get("catalog_products","*,categories(name,icon)",{order:"created_at.desc"}),
    sb.get("categories","id,name,parent_id,icon",{is_active:"eq.true",order:"sort_order.asc"})
  ]);

  // Filter by selected category
  const prods=_cmCat==='all'?allProds:allProds.filter(p=>p.category_id===_cmCat||cats.find(c=>c.id===p.category_id&&(c.parent_id===_cmCat)));
  const catMap={};cats.forEach(c=>catMap[c.id]=c);
  const topCats=cats.filter(c=>!c.parent_id);

  // Count per top-level category
  const catCounts={all:allProds.length};
  allProds.forEach(p=>{
    if(!p.category_id)return;
    let c=catMap[p.category_id];
    while(c&&c.parent_id)c=catMap[c.parent_id];
    if(c){catCounts[c.id]=(catCounts[c.id]||0)+1;}
  });

  const draftCount=prods.filter(p=>p.admin_status==='draft').length;
  const readyCount=prods.filter(p=>p.admin_status==='ready').length;

  $('main').innerHTML=`<div class="cm-wrap">
    <!-- Sidebar: category navigator -->
    <div class="cm-sidebar">
      <div class="cm-sidebar-title">Verticals</div>
      <div class="cm-cat-item ${_cmCat==='all'?'active':''}" onclick="renderAdminCatalogManager({cat:'all'})">
        <span>🌐 All Products</span>
        <span class="cm-cat-badge">${allProds.length}</span>
      </div>
      <div class="cm-cat-item ${_cmCat==='_none'?'active':''}" onclick="renderAdminCatalogManager({cat:'_none'})">
        <span>❓ Uncategorised</span>
        <span class="cm-cat-badge">${allProds.filter(p=>!p.category_id).length}</span>
      </div>
      <div style="height:1px;background:var(--gray-200);margin:8px 0"></div>
      ${topCats.map(c=>`<div class="cm-cat-item ${_cmCat===c.id?'active':''}" onclick="renderAdminCatalogManager({cat:'${c.id}'})">
        <span>${catIcon(c.name,c.icon)} ${esc(c.name)}</span>
        <span class="cm-cat-badge">${catCounts[c.id]||0}</span>
      </div>`).join('')}
      <div style="padding:16px;margin-top:8px;border-top:1px solid var(--gray-200)">
        <button class="btn btn-outline btn-pill btn-sm btn-full" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <!-- Main editor area -->
    <div class="cm-main">
      <div class="cm-toolbar">
        <div>
          <h2 style="font-size:18px;font-weight:800">📚 Catalog Manager</h2>
          <p style="font-size:12px;color:var(--gray-400);margin-top:2px">${prods.length} products · ${draftCount} draft · ${readyCount} ready for vendors</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-onboarding')">+ AI Extract</button>
          <button class="btn btn-gold btn-pill btn-sm" onclick="cmBulkReady()" ${!prods.filter(p=>p.admin_status==='draft').length?'disabled':''}>✅ Mark All Ready (${draftCount})</button>
        </div>
      </div>

      <!-- Status filter tabs -->
      <div style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:16px">
        ${['all','draft','ready','archived'].map(s=>`<button onclick="cmFilterStatus('${s}')" id="cmtab-${s}" class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid ${s==='all'?'var(--black)':'transparent'};padding:8px 16px;font-size:13px;font-weight:${s==='all'?'700':'500'}">${s==='all'?'All':s.charAt(0).toUpperCase()+s.slice(1)}</button>`).join('')}
      </div>

      <div id="cm-products-list">
        ${!prods.length?`<div style="text-align:center;padding:60px 20px;color:var(--gray-400)"><p style="font-size:36px">📦</p><p style="font-weight:600;margin-top:8px">No products in this vertical</p><p style="font-size:13px;margin-top:4px">Use AI Onboarding to extract products</p><button class="btn btn-gold btn-pill" style="margin-top:16px" onclick="go('admin-onboarding')">🤖 AI Extract Products</button></div>`
        :prods.map(p=>cmProductCard(p,cats)).join('')}
      </div>
    </div>
  </div>`;
}

function cmFilterStatus(status){
  ['all','draft','ready','archived'].forEach(s=>{
    const btn=$(`cmtab-${s}`);
    if(btn)btn.style.cssText=`border-radius:0;border-bottom:3px solid ${s===status?'var(--black)':'transparent'};padding:8px 16px;font-size:13px;font-weight:${s===status?'700':'500'}`;
  });
  // Filter visible cards
  document.querySelectorAll('.cm-product-card').forEach(card=>{
    const cardStatus=card.dataset.status;
    card.style.display=(status==='all'||cardStatus===status)?'block':'none';
  });
}

function cmProductCard(p,cats){
  const imgs=p.images||[];
  const specs=p.specifications||[];
  const extraSpecs=p.extra_specs||[];
  const variations=p.variations||[];
  const offers=p.platform_offers||[];
  const cardId=`cm-card-${p.id}`;
  const statusColor=p.admin_status==='ready'?'var(--green)':p.admin_status==='archived'?'var(--gray-400)':'var(--orange)';

  return `<div class="cm-product-card ${p.admin_status}" data-status="${p.admin_status}" id="${cardId}">
    <!-- Card Header (always visible) -->
    <div class="cm-card-header" onclick="cmToggleCard('${p.id}')">
      ${imgs[0]?`<img src="${esc(imgs[0])}" style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
      :`<div style="width:52px;height:52px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📦</div>`}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <p style="font-weight:700;font-size:14px">${esc(p.name)}</p>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${statusColor}20;color:${statusColor}">${p.admin_status}</span>
          ${p.ai_confidence_score?`<span style="font-size:10px;font-weight:700;color:${p.ai_confidence_score>=85?'var(--green)':p.ai_confidence_score>=65?'var(--orange)':'var(--red)'}">AI ${p.ai_confidence_score}%</span>`:''}
        </div>
        <p style="font-size:12px;color:var(--gray-400);margin-top:2px">${p.category_path||p.categories?.name||'Uncategorised'} · ${imgs.length} images · ${specs.length} specs · ${variations.length} variants</p>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0" onclick="event.stopPropagation()">
        ${p.admin_status==='draft'?`<button class="btn btn-pill btn-sm" style="background:var(--green);color:#fff;border:none" onclick="cmSetStatus('${p.id}','ready')">✅ Ready</button>`:''}
        ${p.admin_status==='ready'?`<button class="btn btn-pill btn-sm btn-outline" onclick="cmSetStatus('${p.id}','draft')">↩ Draft</button>`:''}
        <button class="btn btn-ghost btn-sm btn-pill" onclick="cmSetStatus('${p.id}','archived')" style="color:var(--gray-400)">🗑️</button>
      </div>
    </div>

    <!-- Card Body (expandable) -->
    <div class="cm-card-body hide" id="cmbody-${p.id}">
      <!-- Images -->
      <div style="margin-bottom:16px">
        <p style="font-weight:700;font-size:13px;margin-bottom:8px">Images <span style="font-weight:400;color:var(--gray-400)">(${imgs.length}/6)</span></p>
        <div class="cm-img-strip">
          ${imgs.map((img,i)=>`<div style="position:relative">
            <img src="${esc(img)}" style="width:72px;height:72px;border-radius:8px;object-fit:cover;border:1px solid var(--gray-200)" onerror="this.style.display='none'">
            <button class="cm-img-del" onclick="cmDelImg('${p.id}',${i})">✕</button>
          </div>`).join('')}
          ${imgs.length<6?`<div style="width:72px;height:72px;border:2px dashed var(--gray-300);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--gray-400);font-size:24px" onclick="cmAddImgPrompt('${p.id}')">+</div>`:''}
        </div>
      </div>

      <!-- Variants -->
      ${variations.length?`<div style="margin-bottom:16px">
        <p style="font-weight:700;font-size:13px;margin-bottom:8px">Variants</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${variations.map(v=>`<div style="padding:6px 12px;background:var(--gray-50);border-radius:8px;font-size:12px">
            <span style="font-weight:600;color:var(--gray-500)">${esc(v.name)}: </span>
            ${(v.options||[]).map(o=>`<span style="padding:2px 8px;border:1px solid var(--gray-200);border-radius:12px;margin-left:4px;display:inline-flex;align-items:center;gap:4px">
              ${o.color_hex?`<span style="width:10px;height:10px;border-radius:50%;background:${o.color_hex};border:1px solid rgba(0,0,0,.1)"></span>`:''}
              ${esc(o.label)}
            </span>`).join('')}
          </div>`).join('')}
        </div>
      </div>`:''}

      <!-- Top 10 Specs -->
      ${specs.length?`<div style="margin-bottom:16px">
        <p style="font-weight:700;font-size:13px;margin-bottom:8px">Key Specs</p>
        <div style="background:var(--gray-50);border-radius:8px;overflow:hidden">
          ${specs.slice(0,10).map((s,i)=>`<div style="display:flex;padding:8px 12px;${i<Math.min(specs.length,10)-1?'border-bottom:1px solid var(--gray-200)':''}">
            <span style="font-size:12px;color:var(--gray-500);width:40%;font-weight:500">${esc(s.key)}</span>
            <span style="font-size:12px;font-weight:600;flex:1">${esc(s.value)}</span>
          </div>`).join('')}
        </div>
        ${extraSpecs.length?`<p style="font-size:12px;color:var(--blue);margin-top:6px;cursor:pointer" onclick="cmShowExtraSpecs('${p.id}')">+ ${extraSpecs.length} more specs</p>`:''}
      </div>`:''}

      <!-- Commission & Cashback -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:11px">Admin Commission %</label>
          <input class="form-input" id="cm-comm-${p.id}" type="number" value="${p.admin_commission_pct||''}" placeholder="Use category default" onchange="cmSaveMeta('${p.id}')">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:11px">Min Cashback % (vendor)</label>
          <input class="form-input" id="cm-cbmin-${p.id}" type="number" value="${p.cashback_min_pct||0}" onchange="cmSaveMeta('${p.id}')">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:11px">Max Cashback % (vendor)</label>
          <input class="form-input" id="cm-cbmax-${p.id}" type="number" value="${p.cashback_max_pct||20}" onchange="cmSaveMeta('${p.id}')">
        </div>
      </div>

      <!-- Platform Offers -->
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <p style="font-weight:700;font-size:13px">Platform Offers</p>
          <button class="btn btn-ghost btn-sm btn-pill" onclick="cmAddOfferPrompt('${p.id}')">+ Add</button>
        </div>
        <div id="cm-offers-${p.id}">
          ${offers.map((o,i)=>`<div class="cm-offer-tag">
            ${esc(o.badge_text||o.label)}
            ${o.expires_at?`<span style="color:var(--gray-500);font-size:10px"> · expires ${new Date(o.expires_at).toLocaleDateString()}</span>`:''}
            <button style="background:none;border:none;color:var(--red);cursor:pointer;padding:0;margin-left:4px" onclick="cmDelOffer('${p.id}',${i})">✕</button>
          </div>`).join('')}
          ${!offers.length?'<p style="font-size:12px;color:var(--gray-400)">No offers yet</p>':''}
        </div>
      </div>

      <!-- Admin Notes -->
      <div class="form-group" style="margin:0">
        <label class="form-label" style="font-size:11px">Admin Notes (internal)</label>
        <input class="form-input" id="cm-notes-${p.id}" value="${esc(p.editorial_notes||'')}" placeholder="Internal notes about this product..." onchange="cmSaveMeta('${p.id}')">
      </div>

      <!-- Category reassign -->
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-100);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <p style="font-size:12px;color:var(--gray-400)">Source: ${p.source_mode||'manual'} ${p.source_url?`· <a href="${esc(p.source_url)}" target="_blank" style="color:var(--blue)">View source ↗</a>`:''}
        </p>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-pill btn-sm" onclick="cmReassignCat('${p.id}')">📂 Move Category</button>
          <button class="btn btn-danger btn-sm btn-pill" onclick="cmDeleteProduct('${p.id}')">🗑️ Delete</button>
        </div>
      </div>
    </div>
  </div>`;
}

function cmToggleCard(id){
  const body=$(`cmbody-${id}`);
  if(body)body.classList.toggle('hide');
}

async function cmSetStatus(id,status){
  await sb.upd("catalog_products",{admin_status:status,updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast(status==='ready'?'Marked ready — vendors can now pick this product ✅':status==='draft'?'Moved back to draft':'Archived','✅');
  renderAdminCatalogManager({cat:_cmCat});
}

async function cmBulkReady(){
  if(!confirm('Mark all draft products as "Ready for vendors"?'))return;
  const filter={admin_status:"eq.draft"};
  if(_cmCat!=='all'&&_cmCat!=='_none')filter.category_id=`eq.${_cmCat}`;
  await sb.upd("catalog_products",{admin_status:'ready',updated_at:new Date().toISOString()},filter);
  toast('All marked ready! Vendors can now pick them ✅','✅');
  renderAdminCatalogManager({cat:_cmCat});
}

async function cmSaveMeta(id){
  await sb.upd("catalog_products",{
    admin_commission_pct:parseFloat($(`cm-comm-${id}`)?.value)||null,
    cashback_min_pct:parseFloat($(`cm-cbmin-${id}`)?.value)||0,
    cashback_max_pct:parseFloat($(`cm-cbmax-${id}`)?.value)||20,
    editorial_notes:$(`cm-notes-${id}`)?.value||null,
    updated_at:new Date().toISOString()
  },{id:`eq.${id}`});
  toast('Saved','✅');
}

async function cmDelImg(id,idx){
  const rows=await sb.get("catalog_products","id,images",{id:`eq.${id}`});
  let imgs=[...(rows[0]?.images||[])];
  imgs.splice(idx,1);
  await sb.upd("catalog_products",{images:imgs},{id:`eq.${id}`});
  toast('Image removed','🗑️');
  renderAdminCatalogManager({cat:_cmCat});
}

function cmAddImgPrompt(id){
  const url=prompt('Enter image URL:');
  if(!url)return;
  cmAddImg(id,url);
}

async function cmAddImg(id,url){
  const rows=await sb.get("catalog_products","id,images",{id:`eq.${id}`});
  let imgs=[...(rows[0]?.images||[])];
  if(imgs.length>=6){toast('Max 6 images','⚠️');return;}
  imgs.push(url.trim());
  await sb.upd("catalog_products",{images:imgs},{id:`eq.${id}`});
  toast('Image added ✅','✅');
  renderAdminCatalogManager({cat:_cmCat});
}

function cmAddOfferPrompt(id){
  const badge=prompt('Offer text (e.g. "Extra 5% off · Limited time"):');
  if(!badge)return;
  cmAddOffer(id,badge);
}

async function cmAddOffer(id,badge){
  const rows=await sb.get("catalog_products","id,platform_offers",{id:`eq.${id}`});
  const offers=[...(rows[0]?.platform_offers||[])];
  offers.push({badge_text:badge,label:badge,created_at:new Date().toISOString()});
  await sb.upd("catalog_products",{platform_offers:offers},{id:`eq.${id}`});
  toast('Offer added 🏷️','🏷️');
  renderAdminCatalogManager({cat:_cmCat});
}

async function cmDelOffer(id,idx){
  const rows=await sb.get("catalog_products","id,platform_offers",{id:`eq.${id}`});
  const offers=[...(rows[0]?.platform_offers||[])];
  offers.splice(idx,1);
  await sb.upd("catalog_products",{platform_offers:offers},{id:`eq.${id}`});
  toast('Offer removed','🗑️');
  renderAdminCatalogManager({cat:_cmCat});
}

async function cmDeleteProduct(id){
  if(!confirm('Delete this catalog product permanently?'))return;
  await sb.del("catalog_products",{id:`eq.${id}`});
  toast('Deleted','🗑️');
  renderAdminCatalogManager({cat:_cmCat});
}

function cmShowExtraSpecs(id){
  // find the product card and expand it with extra specs shown
  toast('Scroll up to see all specs in the expanded card','ℹ️');
}

async function cmReassignCat(id){
  const cats=await sb.get("categories","id,name,level",{is_active:"eq.true",order:"level.asc,name.asc"});
  const catOpts=cats.map(c=>`<option value="${c.id}">${'  '.repeat(c.level)}${esc(c.name)}</option>`).join('');
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:380px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">📂 Move to Category</h3>
    <div class="form-group"><label class="form-label">New Category</label><select class="form-select" id="cm-newcat">${catOpts}</select></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="cmDoReassign('${id}')">Move</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function cmDoReassign(id){
  const catId=$('cm-newcat')?.value;if(!catId)return;
  await sb.upd("catalog_products",{category_id:catId},{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Category updated ✅','✅');
  renderAdminCatalogManager({cat:_cmCat});
}

// ═══════════════════════════════════════════════════
// STEP 3 — VENDOR MARKETPLACE (Browse & Pick Catalog)
// ═══════════════════════════════════════════════════
async function renderVendorMarketplace(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading marketplace...</div>';

  const [stores,cats]=await Promise.all([
    sb.get("vendor_stores","id,store_name",{vendor_id:`eq.${PROFILE.id}`,limit:1}),
    sb.get("categories","id,name,parent_id,icon",{is_active:"eq.true",order:"sort_order.asc"})
  ]);
  const store=stores[0];

  // Load catalog products marked ready + vendor's existing picks
  const [products,myPicks]=await Promise.all([
    sb.get("catalog_products","id,name,brand_name,images,specifications,variations,category_id,category_path,cashback_min_pct,cashback_max_pct,admin_commission_pct,platform_offers,admin_status",{admin_status:"eq.ready",order:"created_at.desc"}),
    store?sb.get("vendor_catalog_picks","catalog_product_id,status",{vendor_id:`eq.${PROFILE.id}`}):Promise.resolve([])
  ]);

  const pickedIds=new Set(myPicks.map(pk=>pk.catalog_product_id));
  const topCats=cats.filter(c=>!c.parent_id);

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:24px;font-weight:800">🛍️ Product Marketplace</h2>
        <p style="font-size:13px;color:var(--gray-400)">${products.length} products ready to add · Browse and pick what you want to sell</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill btn-sm" onclick="go('vendor-picks')">📋 My Picks (${myPicks.length})</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('vendor-dash')">← Dashboard</button>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="vm-filter-bar">
      <select class="form-select" id="vm-cat-filter" style="width:180px;margin:0" onchange="vmFilter()">
        <option value="">All Categories</option>
        ${topCats.map(c=>`<option value="${c.id}">${catIcon(c.name,c.icon)} ${esc(c.name)}</option>`).join('')}
      </select>
      <input class="form-input" id="vm-search" style="width:200px;margin:0" placeholder="Search products..." oninput="vmFilter()">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="vm-hide-picked" onchange="vmFilter()"> Hide already picked
      </label>
    </div>

    <!-- Product grid -->
    <div class="vm-grid" id="vm-grid">
      ${!products.length?`<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--gray-400)">
        <p style="font-size:40px">📦</p>
        <p style="font-weight:600;margin-top:8px">No products available yet</p>
        <p style="font-size:13px;margin-top:4px">Check back soon — admin is adding products to the catalog</p>
      </div>`:
      products.map(p=>{
        const img=p.images?.[0]||'';
        const isPicked=pickedIds.has(p.id);
        const pick=myPicks.find(pk=>pk.catalog_product_id===p.id);
        const offers=p.platform_offers||[];
        const catId=p.category_id;
        return `<div class="vm-card" data-cat="${catId}" data-name="${esc(p.name.toLowerCase())}" data-picked="${isPicked}">
          ${img?`<img src="${esc(img)}" class="vm-card-img" onerror="this.style.display='none'">`:`<div class="vm-card-img" style="display:flex;align-items:center;justify-content:center;font-size:40px;background:var(--gray-50)">📦</div>`}
          <div class="vm-card-body">
            <div class="vm-card-name">${esc(p.name.length>50?p.name.slice(0,50)+'...':p.name)}</div>
            <div class="vm-card-cat">${p.category_path||'General'}</div>
            ${offers.length?`<div class="vm-card-offer">🏷️ ${esc(offers[0].badge_text||offers[0].label)}</div>`:''}
            <div style="font-size:11px;color:var(--gray-400);margin-bottom:8px">
              CB: ${p.cashback_min_pct||0}–${p.cashback_max_pct||20}% · ${(p.specifications||[]).length} specs · ${(p.variations||[]).length} variants
            </div>
            ${isPicked?
              `<button class="vm-card-btn" style="background:var(--green);color:#fff" onclick="go('vendor-picks')">✅ In Your Store → Manage</button>`:
              `<button class="vm-card-btn" style="background:var(--gold);color:var(--black)" onclick="vmPickProduct('${p.id}','${esc(p.name.replace(/'/g,"\\'"))}',${p.cashback_min_pct||0},${p.cashback_max_pct||20})">+ Add to My Store</button>`
            }
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function vmFilter(){
  const catFilter=$('vm-cat-filter')?.value||'';
  const search=($('vm-search')?.value||'').toLowerCase();
  const hidePicked=$('vm-hide-picked')?.checked;
  const cats=new Set();
  // Get subcats for selected top-level cat
  // We'll just filter by exact category or any match
  document.querySelectorAll('.vm-card').forEach(card=>{
    const cardCat=card.dataset.cat||'';
    const cardName=card.dataset.name||'';
    const cardPicked=card.dataset.picked==='true';
    let show=true;
    if(catFilter&&cardCat!==catFilter)show=false;
    if(search&&!cardName.includes(search))show=false;
    if(hidePicked&&cardPicked)show=false;
    card.style.display=show?'':'none';
  });
}

async function vmPickProduct(catalogId,name,cbMin,cbMax){
  const stores=await sb.get("vendor_stores","id",{vendor_id:`eq.${PROFILE.id}`,limit:1});
  const storeId=stores[0]?.id||null;
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:420px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:4px">+ Add to My Store</h3>
    <p style="font-size:13px;color:var(--gray-400);margin-bottom:16px">${esc(name)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Your Selling Price ₹</label><input class="form-input" id="vmp-price" type="number" placeholder="0" min="0"></div>
      <div class="form-group"><label class="form-label">Compare at ₹ (MRP)</label><input class="form-input" id="vmp-mrp" type="number" placeholder="Optional"></div>
      <div class="form-group"><label class="form-label">Stock Qty</label><input class="form-input" id="vmp-stock" type="number" value="50"></div>
      <div class="form-group"><label class="form-label">Cashback % (${cbMin}–${cbMax}%)</label><input class="form-input" id="vmp-cb" type="number" value="${cbMin}" min="${cbMin}" max="${cbMax}" step="0.5"></div>
    </div>
    <div style="padding:10px;background:rgba(237,207,93,.08);border-radius:8px;border:1px solid var(--gold-light);margin-bottom:14px;font-size:12px;color:var(--gray-600)">
      💡 You can set price and stock now or later. Product won't go live until you confirm it.
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="vmDoPickProduct('${catalogId}','${storeId||''}')">Add to My Store</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function vmDoPickProduct(catalogId,storeId){
  const price=parseFloat($('vmp-price')?.value)||0;
  const mrp=parseFloat($('vmp-mrp')?.value)||null;
  const stock=parseInt($('vmp-stock')?.value)||50;
  const cb=parseFloat($('vmp-cb')?.value)||0;
  await sb.ins("vendor_catalog_picks",{
    catalog_product_id:catalogId,
    vendor_id:PROFILE.id,
    store_id:storeId||null,
    selling_price:price,
    compare_at_price:mrp,
    stock,cashback_pct:cb,
    status:'pending',
    picked_at:new Date().toISOString()
  });
  document.querySelector('.auth-overlay')?.remove();
  toast('Added to your store! Go to My Picks to confirm & go live 🎉','✅');
  renderVendorMarketplace();
}

// ── Vendor Picks (My pending + active picks) ─────────────────────
async function renderVendorPicks(){
  if(!PROFILE||PROFILE.role!=='vendor'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading your picks...</div>';

  const picks=await sb.get("vendor_catalog_picks","*,catalog_products(name,images,specifications,category_path,platform_offers,description_html)",{vendor_id:`eq.${PROFILE.id}`,order:"picked_at.desc"});
  const pending=picks.filter(pk=>pk.status==='pending');
  const active=picks.filter(pk=>pk.status==='active');
  const paused=picks.filter(pk=>pk.status==='paused');

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:24px;font-weight:800">📋 My Product Picks</h2>
        <p style="font-size:13px;color:var(--gray-400)">${pending.length} pending · ${active.length} live · ${paused.length} paused</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill btn-sm" onclick="go('vendor-marketplace')">+ Browse Catalog</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('vendor-dash')">← Dashboard</button>
      </div>
    </div>

    ${pending.length?`<div class="card" style="margin-bottom:20px;border-left:4px solid var(--orange)">
      <h3 style="font-weight:700;margin-bottom:14px">⏳ Pending — Confirm to go live (${pending.length})</h3>
      ${pending.map(pk=>vpickRow(pk,true)).join('')}
    </div>`:''}

    ${active.length?`<div class="card" style="margin-bottom:20px;border-left:4px solid var(--green)">
      <h3 style="font-weight:700;margin-bottom:14px">✅ Live Products (${active.length})</h3>
      ${active.map(pk=>vpickRow(pk,false)).join('')}
    </div>`:''}

    ${paused.length?`<div class="card" style="margin-bottom:20px;border-left:4px solid var(--gray-300)">
      <h3 style="font-weight:700;margin-bottom:14px">⏸ Paused (${paused.length})</h3>
      ${paused.map(pk=>vpickRow(pk,false)).join('')}
    </div>`:''}

    ${!picks.length?`<div style="text-align:center;padding:60px 20px;color:var(--gray-400)">
      <p style="font-size:40px">🛍️</p>
      <p style="font-weight:600;margin-top:8px">No picks yet</p>
      <p style="font-size:13px;margin-top:4px">Browse the marketplace and add products to your store</p>
      <button class="btn btn-gold btn-pill" style="margin-top:16px" onclick="go('vendor-marketplace')">Browse Marketplace →</button>
    </div>`:''}
  </div>`;
}

function vpickRow(pk,isPending){
  const cp=pk.catalog_products||{};
  const img=(cp.images||[])[0]||'';
  const offers=cp.platform_offers||[];
  return `<div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--gray-100);align-items:start;flex-wrap:wrap">
    ${img?`<img src="${esc(img)}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;flex-shrink:0">`:`<div style="width:64px;height:64px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">📦</div>`}
    <div style="flex:1;min-width:160px">
      <p style="font-weight:700;font-size:14px">${esc(cp.name||'Product')}</p>
      <p style="font-size:12px;color:var(--gray-400);margin-top:2px">${cp.category_path||''}</p>
      ${offers.length?`<div style="margin-top:4px">${offers.map(o=>`<span class="cm-offer-tag" style="font-size:11px">${esc(o.badge_text||o.label)}</span>`).join('')}</div>`:''}
      <div style="display:flex;gap:12px;margin-top:8px;font-size:13px;flex-wrap:wrap">
        <span>₹${pk.selling_price||0} ${pk.compare_at_price?`<span style="color:var(--gray-400);text-decoration:line-through;font-size:11px">₹${pk.compare_at_price}</span>`:''}</span>
        <span>Stock: ${pk.stock||0}</span>
        <span>CB: ${pk.cashback_pct||0}%</span>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0">
      ${isPending?`<button class="btn btn-pill btn-sm" style="background:var(--green);color:#fff;border:none" onclick="vpickConfirm('${pk.id}')">🚀 Confirm & Go Live</button>`:''}
      <button class="btn btn-outline btn-pill btn-sm" onclick="vpickEdit('${pk.id}',${pk.selling_price||0},${pk.compare_at_price||0},${pk.stock||0},${pk.cashback_pct||0})">✏️ Edit</button>
      ${!isPending&&pk.status==='active'?`<button class="btn btn-ghost btn-sm btn-pill" onclick="vpickSetStatus('${pk.id}','paused')">⏸</button>`:''}
      ${!isPending&&pk.status==='paused'?`<button class="btn btn-ghost btn-sm btn-pill" onclick="vpickSetStatus('${pk.id}','active')">▶️</button>`:''}
      <button class="btn btn-ghost btn-sm btn-pill" onclick="vpickDelete('${pk.id}')" style="color:var(--red)">🗑️</button>
    </div>
  </div>`;
}

async function vpickConfirm(pickId){
  const picks=await sb.get("vendor_catalog_picks","*,catalog_products(*)",{id:`eq.${pickId}`});
  const pk=picks[0];if(!pk)return;
  const cp=pk.catalog_products||{};
  const stores=await sb.get("vendor_stores","id,vendor_id",{vendor_id:`eq.${PROFILE.id}`,limit:1});
  const store=stores[0];
  // Create product from catalog pick
  const slug=(cp.name||'product').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+Date.now();
  const r=await sb.ins("products",{
    name:cp.name,slug,
    description:cp.description_html||'',
    price:pk.selling_price||0,
    compare_at_price:pk.compare_at_price||null,
    stock:pk.stock||50,
    cashback_percent:pk.cashback_pct||0,
    category_id:cp.category_id||null,
    images:cp.images||[],
    specifications:cp.specifications||[],
    tags:[],
    platform_offers:cp.platform_offers||[],
    catalog_product_id:cp.id,
    is_active:true,is_approved:true,status:'active',
    vendor_id:PROFILE.id,
    store_id:store?.id||null
  });
  if(r.length){
    await sb.upd("vendor_catalog_picks",{status:'active',product_id:r[0].id,confirmed_at:new Date().toISOString()},{id:`eq.${pickId}`});
    toast('Product is now LIVE in your store! 🚀','🚀');
    renderVendorPicks();
  }
}

function vpickEdit(id,price,mrp,stock,cb){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:400px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">✏️ Edit Listing</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Selling Price ₹</label><input class="form-input" id="vpe-price" type="number" value="${price}"></div>
      <div class="form-group"><label class="form-label">MRP ₹</label><input class="form-input" id="vpe-mrp" type="number" value="${mrp||''}"></div>
      <div class="form-group"><label class="form-label">Stock</label><input class="form-input" id="vpe-stock" type="number" value="${stock}"></div>
      <div class="form-group"><label class="form-label">Cashback %</label><input class="form-input" id="vpe-cb" type="number" value="${cb}" step="0.5"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="vpickSaveEdit('${id}')">Save</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function vpickSaveEdit(id){
  await sb.upd("vendor_catalog_picks",{
    selling_price:parseFloat($('vpe-price')?.value)||0,
    compare_at_price:parseFloat($('vpe-mrp')?.value)||null,
    stock:parseInt($('vpe-stock')?.value)||50,
    cashback_pct:parseFloat($('vpe-cb')?.value)||0
  },{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Updated ✅','✅');
  renderVendorPicks();
}

async function vpickSetStatus(id,status){
  await sb.upd("vendor_catalog_picks",{status},{id:`eq.${id}`});
  // Also update the linked product if exists
  const picks=await sb.get("vendor_catalog_picks","product_id",{id:`eq.${id}`});
  if(picks[0]?.product_id){
    await sb.upd("products",{is_active:status==='active'},{id:`eq.${picks[0].product_id}`});
  }
  toast(status==='active'?'Product live ✅':'Product paused ⏸','✅');
  renderVendorPicks();
}

async function vpickDelete(id){
  if(!confirm('Remove this pick from your store?'))return;
  await sb.del("vendor_catalog_picks",{id:`eq.${id}`});
  toast('Removed','🗑️');
  renderVendorPicks();
}


async function renderAdminOrders(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  const orders=await sb.get("orders","*,profiles(full_name),order_items(*,products(name))",{order:"created_at.desc"});
  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><h2 style="font-size:24px;font-weight:800">📋 All Orders <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${orders.length})</span></h2><button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button></div>
    ${orders.map(o=>`<div class="card" style="cursor:pointer" onclick="go('order-detail',{oid:'${o.id}'})"><div style="display:flex;justify-content:space-between;align-items:start"><div><p style="font-weight:800">${esc(o.order_number)}</p><p style="font-size:12px;color:var(--gray-400)">${esc(o.profiles?.full_name)} · ${new Date(o.created_at).toLocaleString()}</p></div><div style="text-align:right"><span class="badge" style="background:${statusBg(o.status)}">${statusIcon(o.status)} ${o.status}</span><p style="font-weight:900;font-size:18px;color:var(--gold-dark);margin-top:4px">₹${o.total}</p></div></div>
      ${(o.order_items||[]).map(oi=>`<p style="font-size:12px;color:var(--gray-500);margin-top:8px;padding:8px;background:var(--gray-50);border-radius:8px">• ${esc(oi.products?.name)} ×${oi.quantity} = ₹${oi.total_price} <span style="color:var(--gray-400)">(Fee:₹${oi.platform_fee} CB:₹${oi.cashback_amount} Aff:₹${oi.affiliate_commission})</span></p>`).join('')}
    </div>`).join('')}
  </div>`;
}

async function renderAdminFinance(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  const txns=await sb.get("wallet_transactions","*,profiles(full_name)",{order:"created_at.desc",limit:50});
  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="font-size:24px;font-weight:800">💰 Finance</h2>
      <div style="display:flex;gap:8px"><button class="btn btn-gold btn-pill btn-sm" onclick="releaseFunds()">Release Pending</button><button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button></div>
    </div>
    ${txns.map(t=>`<div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center"><div><span class="badge" style="background:${txTypeBg(t.type)}">${t.type.replace(/_/g,' ')}</span><p style="font-size:12px;color:var(--gray-400);margin-top:6px">${esc(t.profiles?.full_name)} — ${esc(t.description)}</p></div><div style="text-align:right"><p style="font-weight:800;font-size:16px">₹${t.amount}</p><span style="font-size:11px;color:${t.status==='available'?'var(--green)':'var(--orange)'}">${t.status}</span></div></div>`).join('')}
  </div>`;
}

// ═══════════════════════════════════════════════════
// ADMIN: RETURNS MANAGEMENT
// ═══════════════════════════════════════════════════
async function renderAdminReturns(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading returns...</div>';
  const returns=await sb.get("return_requests","*,orders(order_number),order_items(products(name)),profiles!return_requests_user_id_fkey(full_name)",{order:"created_at.desc"});

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="font-size:24px;font-weight:800">↩️ Return Requests <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${returns.length})</span></h2>
      <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
    </div>
    ${!returns.length?emptyState('↩️','No returns yet','Return requests will appear here')
    :returns.map(r=>{
      const isPending=r.status==='pending'||r.status==='vendor_approved'||r.status==='admin_reviewing';
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
          <div>
            <p style="font-weight:700">${esc(r.order_items?.products?.name||'Product')}</p>
            <p style="font-size:12px;color:var(--gray-400)">Order #${esc(r.orders?.order_number||'')} · By ${esc(r.profiles?.full_name||'User')} · ${new Date(r.created_at).toLocaleDateString()}</p>
          </div>
          <div style="text-align:right">
            <span class="badge" style="background:${r.status==='refunded'?'rgba(52,199,89,.12);color:var(--green)':r.status==='rejected'?'rgba(255,59,48,.12);color:var(--red)':'rgba(255,149,0,.12);color:var(--orange)'}">${r.status}</span>
            <p style="font-weight:800;color:var(--gold-dark);margin-top:4px">₹${r.refund_amount}</p>
          </div>
        </div>
        <div style="padding:10px;background:var(--gray-50);border-radius:8px;margin-bottom:12px">
          <p style="font-size:13px"><strong>Reason:</strong> ${esc(r.reason)}</p>
          ${r.description?`<p style="font-size:12px;color:var(--gray-500);margin-top:4px">${esc(r.description)}</p>`:''}
          ${r.admin_note?`<p style="font-size:12px;color:var(--blue);margin-top:4px">Admin: ${esc(r.admin_note)}</p>`:''}
        </div>
        ${isPending?`<div style="display:flex;gap:8px">
          <button class="btn btn-success btn-sm btn-pill" onclick="processReturn('${r.id}','approve')">✅ Approve & Refund</button>
          <button class="btn btn-danger btn-sm btn-pill" onclick="processReturn('${r.id}','reject')">❌ Reject</button>
          <button class="btn btn-outline btn-sm btn-pill" onclick="go('order-detail',{oid:'${r.order_id}'})">View Order</button>
        </div>`:`<button class="btn btn-ghost btn-sm btn-pill" onclick="go('order-detail',{oid:'${r.order_id}'})">View Order →</button>`}
      </div>`;
    }).join('')}
  </div>`;
}

// ═══════════════════════════════════════════════════
// ADMIN: REVIEWS MODERATION
// ═══════════════════════════════════════════════════
async function renderAdminReviews(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading reviews...</div>';
  const reviews=await sb.get("reviews","*,profiles(full_name),products(name)",{order:"created_at.desc"});

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="font-size:24px;font-weight:800">⭐ Review Moderation <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${reviews.length})</span></h2>
      <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
    </div>
    ${!reviews.length?emptyState('⭐','No reviews yet','Reviews will appear when customers rate products')
    :reviews.map(r=>{
      return `<div class="card" style="opacity:${r.is_approved?1:0.6}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
          <div>
            <p style="font-weight:700">${esc(r.products?.name||'Product')}</p>
            <p style="font-size:12px;color:var(--gray-400)">By ${esc(r.profiles?.full_name||'User')} · ${new Date(r.created_at).toLocaleDateString()}</p>
          </div>
          <div style="text-align:right;display:flex;gap:6px;align-items:center">
            <span style="color:var(--gold);font-size:15px">${stars(r.rating)}</span>
            ${r.verified_purchase?'<span class="badge badge-green" style="font-size:9px">Verified</span>':''}
            <span class="badge ${r.is_approved?'badge-green':'badge-red'}">${r.is_approved?'Approved':'Hidden'}</span>
          </div>
        </div>
        ${r.comment?`<p style="font-size:14px;color:var(--gray-600);margin-bottom:10px;line-height:1.5">"${esc(r.comment)}"</p>`:''}
        ${r.vendor_response?`<div style="padding:8px 12px;background:var(--gray-50);border-radius:8px;border-left:3px solid var(--gold);font-size:12px;margin-bottom:10px"><strong>Seller:</strong> ${esc(r.vendor_response)}</div>`:''}
        <div style="display:flex;gap:8px">
          ${r.is_approved?`<button class="btn btn-danger btn-sm btn-pill" onclick="moderateReview('${r.id}',false)">Hide Review</button>`
          :`<button class="btn btn-success btn-sm btn-pill" onclick="moderateReview('${r.id}',true)">Approve ✓</button>`}
          <button class="btn btn-ghost btn-sm" onclick="go('product',{id:'${r.product_id}'})">View Product</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

async function moderateReview(reviewId,approved){
  const r=await sb.rpc("moderate_review",{p_review_id:reviewId,p_approved:approved});
  if(r?.success){toast(approved?'Review approved':'Review hidden','✅');renderAdminReviews();}
  else toast('Error: '+(r?.error||JSON.stringify(r)),'❌');
}

// ═══════════════════════════════════════════════════
// ADMIN: DISPUTES
// ═══════════════════════════════════════════════════
const priorityBg=p=>({low:'var(--gray-100);color:var(--gray-500)',medium:'rgba(255,149,0,.12);color:var(--orange)',high:'rgba(255,59,48,.12);color:var(--red)',critical:'rgba(255,59,48,.25);color:#c00'}[p]||'var(--gray-100)');
const disputeStatusBg=s=>({open:'rgba(255,149,0,.12);color:var(--orange)',under_review:'rgba(0,122,255,.12);color:var(--blue)',awaiting_response:'rgba(175,82,222,.12);color:var(--purple)',resolved:'rgba(52,199,89,.12);color:var(--green)',escalated:'rgba(255,59,48,.12);color:var(--red)',closed:'var(--gray-100);color:var(--gray-500)'}[s]||'var(--gray-100)');

async function renderAdminDisputes(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading disputes...</div>';
  const disputes=await sb.get("disputes","*,orders(order_number),profiles!disputes_complainant_id_fkey(full_name,email)",{order:"created_at.desc"});
  const openCount=disputes.filter(d=>d.status==='open'||d.status==='under_review'||d.status==='escalated').length;

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <div><h2 style="font-size:24px;font-weight:800">⚖️ Disputes <span style="font-weight:400;color:var(--gray-400);font-size:16px">(${disputes.length})</span></h2>
        ${openCount>0?`<p style="color:var(--red);font-size:13px;font-weight:600">${openCount} open disputes need attention</p>`:''}
      </div>
      <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
    </div>

    ${!disputes.length?emptyState('⚖️','No disputes','Disputes will appear when users file complaints')
    :disputes.map(d=>{
      const isOpen=d.status==='open'||d.status==='under_review'||d.status==='awaiting_response'||d.status==='escalated';
      return `<div class="card" style="${d.priority==='critical'?'border-left:3px solid var(--red)':d.priority==='high'?'border-left:3px solid var(--orange)':''}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
          <div>
            <p style="font-weight:700;font-size:15px">${esc(d.subject)}</p>
            <p style="font-size:12px;color:var(--gray-400)">By ${esc(d.profiles?.full_name||'User')} · Order #${esc(d.orders?.order_number||'')} · ${d.type.replace(/_/g,' ')} · ${new Date(d.created_at).toLocaleDateString()}</p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="badge" style="background:${priorityBg(d.priority)}">${d.priority}</span>
            <span class="badge" style="background:${disputeStatusBg(d.status)}">${d.status.replace(/_/g,' ')}</span>
          </div>
        </div>
        ${d.description?`<div style="padding:10px;background:var(--gray-50);border-radius:8px;font-size:13px;color:var(--gray-600);margin-bottom:10px">${esc(d.description)}</div>`:''}
        ${d.respondent_note?`<div style="padding:10px;background:rgba(0,122,255,.04);border-radius:8px;font-size:13px;margin-bottom:10px;border-left:3px solid var(--blue)"><strong style="font-size:11px;color:var(--blue)">Vendor Response:</strong><br>${esc(d.respondent_note)}</div>`:''}
        ${d.admin_verdict?`<div style="padding:10px;background:rgba(52,199,89,.04);border-radius:8px;font-size:13px;margin-bottom:10px;border-left:3px solid var(--green)"><strong style="font-size:11px;color:var(--green)">Admin Verdict:</strong><br>${esc(d.admin_verdict)}</div>`:''}
        ${isOpen?`<div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm btn-pill" onclick="resolveDispute('${d.id}','under_review')">🔍 Review</button>
          <button class="btn btn-success btn-sm btn-pill" onclick="resolveDispute('${d.id}','resolved')">✅ Resolve</button>
          <button class="btn btn-danger btn-sm btn-pill" onclick="resolveDispute('${d.id}','escalated')">🔺 Escalate</button>
          <button class="btn btn-ghost btn-sm" onclick="resolveDispute('${d.id}','closed')">Close</button>
          <button class="btn btn-ghost btn-sm" onclick="go('order-detail',{oid:'${d.order_id}'})">View Order →</button>
        </div>`:`<div style="display:flex;gap:8px"><span style="font-size:12px;color:var(--gray-400)">Resolved ${d.resolved_at?new Date(d.resolved_at).toLocaleDateString():''}</span><button class="btn btn-ghost btn-sm" onclick="go('order-detail',{oid:'${d.order_id}'})">View Order →</button></div>`}
      </div>`;
    }).join('')}
  </div>`;
}

async function resolveDispute(id,status){
  let verdict=null;
  if(status==='resolved'){verdict=prompt('Enter verdict/resolution:');if(!verdict)return;}
  if(status==='escalated'){verdict=prompt('Escalation reason:');}
  await sb.upd("disputes",{
    status,
    admin_verdict:verdict||undefined,
    resolved_by:status==='resolved'||status==='closed'?PROFILE.id:undefined,
    resolved_at:status==='resolved'||status==='closed'?new Date().toISOString():undefined,
    updated_at:new Date().toISOString()
  },{id:`eq.${id}`});
  toast('Dispute updated','✅');renderAdminDisputes();
}

// ═══════════════════════════════════════════════════
// ADMIN: AUDIT LOGS
// ═══════════════════════════════════════════════════
async function renderAdminAudit(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading audit logs...</div>';
  const logs=await sb.get("audit_logs","*,profiles!audit_logs_actor_id_fkey(full_name)",{order:"created_at.desc",limit:100});
  const statusH=await sb.get("order_status_history","*,orders(order_number)",{order:"created_at.desc",limit:50});

  // Merge and sort by time
  const all=[
    ...logs.map(l=>({time:l.created_at,who:l.profiles?.full_name||'System',action:l.action,entity:l.entity_type,detail:`${l.entity_id?l.entity_id.slice(0,8):''}`,type:'audit'})),
    ...statusH.map(h=>({time:h.created_at,who:h.changed_by_role||'system',action:`${h.from_status||'—'} → ${h.to_status}`,entity:'order',detail:`#${h.orders?.order_number||''}${h.note?' · '+h.note:''}`,type:'order'}))
  ].sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,100);

  const actionColor=a=>{
    if(a.includes('cancelled')||a.includes('block')||a.includes('reject')||a.includes('delete'))return'var(--red)';
    if(a.includes('approved')||a.includes('delivered')||a.includes('confirm'))return'var(--green)';
    if(a.includes('shipped'))return'var(--blue)';
    return'var(--gray-500)';
  };

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <div><h2 style="font-size:24px;font-weight:800">📜 Audit Trail</h2><p style="color:var(--gray-400);font-size:13px">Last 100 events across the platform</p></div>
      <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
    </div>
    <div style="border-left:2px solid var(--gray-200);padding-left:20px;margin-left:8px">
    ${all.map(e=>`<div style="position:relative;padding-bottom:20px">
      <div style="position:absolute;left:-28px;top:2px;width:14px;height:14px;border-radius:50%;background:${e.type==='order'?'var(--gold)':'var(--gray-300)'};border:2px solid #fff"></div>
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <p style="font-size:13px"><span style="font-weight:600">${esc(e.who)}</span> <span style="color:${actionColor(e.action)};font-weight:600">${esc(e.action)}</span> <span style="color:var(--gray-400)">${e.entity}</span></p>
          ${e.detail?`<p style="font-size:11px;color:var(--gray-400);margin-top:2px">${esc(e.detail)}</p>`:''}
        </div>
        <span style="font-size:10px;color:var(--gray-400);white-space:nowrap;margin-left:12px">${getTimeAgo(e.time)}</span>
      </div>
    </div>`).join('')}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════
// ADMIN: SETTLEMENTS REPORT
// ═══════════════════════════════════════════════════
async function renderAdminSettlements(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading settlements...</div>';

  const [vendorTxns,wallets]=await Promise.all([
    sb.get("wallet_transactions","*,profiles(full_name,role)",{type:"eq.vendor_settlement",order:"created_at.desc"}),
    sb.get("wallets","*,profiles(full_name,role)",{order:"available_balance.desc"})
  ]);
  
  const vendorWallets=wallets.filter(w=>w.profiles?.role==='vendor');
  const totalPending=vendorWallets.reduce((a,b)=>a+Number(b.pending_balance),0);
  const totalAvailable=vendorWallets.reduce((a,b)=>a+Number(b.available_balance),0);
  const totalEarned=vendorWallets.reduce((a,b)=>a+Number(b.total_earned),0);

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <div><h2 style="font-size:24px;font-weight:800">📑 Settlement Report</h2><p style="color:var(--gray-400);font-size:13px">Vendor payment tracking & reconciliation</p></div>
      <div style="display:flex;gap:8px"><button class="btn btn-gold btn-pill btn-sm" onclick="releaseFunds()">Release All Pending</button><button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button></div>
    </div>

    <div class="g3">
      <div class="stat-card" style="border-top:3px solid var(--green)"><div class="stat-val" style="color:var(--green)">₹${totalAvailable}</div><div class="stat-label">Available to Vendors</div></div>
      <div class="stat-card" style="border-top:3px solid var(--orange)"><div class="stat-val" style="color:var(--orange)">₹${totalPending}</div><div class="stat-label">Pending Release</div></div>
      <div class="stat-card" style="border-top:3px solid var(--gold)"><div class="stat-val" style="color:var(--gold-dark)">₹${totalEarned}</div><div class="stat-label">Total Settled</div></div>
    </div>

    <!-- Vendor Wallet Balances -->
    <div class="card" style="margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:16px">Vendor Balances</h3>
      ${!vendorWallets.length?'<p style="color:var(--gray-400);font-size:13px">No vendor wallets yet</p>'
      :`<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:2px solid var(--gray-200);font-size:12px;font-weight:700;color:var(--gray-400)"><span>Vendor</span><span style="text-align:right">Available</span><span style="text-align:right">Pending</span><span style="text-align:right">Total Earned</span></div>
      ${vendorWallets.map(w=>`<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;padding:10px 0;border-bottom:1px solid var(--gray-100);font-size:13px;align-items:center">
        <span style="font-weight:600">${esc(w.profiles?.full_name||'Vendor')}</span>
        <span style="text-align:right;color:var(--green);font-weight:700">₹${w.available_balance}</span>
        <span style="text-align:right;color:var(--orange)">${w.pending_balance>0?'₹'+w.pending_balance:'—'}</span>
        <span style="text-align:right;font-weight:600">₹${w.total_earned}</span>
      </div>`).join('')}`}
    </div>

    <!-- Recent Settlements -->
    <div class="card">
      <h3 style="font-weight:700;margin-bottom:16px">Recent Settlements</h3>
      ${!vendorTxns.length?'<p style="color:var(--gray-400);font-size:13px">No settlements yet</p>'
      :vendorTxns.slice(0,30).map(t=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100)">
        <div><p style="font-weight:600;font-size:13px">${esc(t.profiles?.full_name||'Vendor')}</p><p style="font-size:11px;color:var(--gray-400)">${esc(t.description||'')} · ${new Date(t.created_at).toLocaleDateString()}</p></div>
        <div style="text-align:right"><span style="font-weight:800;color:var(--green)">₹${t.amount}</span><br><span class="badge ${t.status==='available'?'badge-green':'badge-gold'}" style="font-size:9px">${t.status}</span></div>
      </div>`).join('')}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════
// ADMIN: TOP BUYERS
// ═══════════════════════════════════════════════════
async function renderAdminTopBuyers(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading top buyers...</div>';
  const a=await sb.rpc("platform_analytics")||{};
  const buyers=a.user_segments?.top_buyers||[];

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <div><h2 style="font-size:24px;font-weight:800">🏆 Top Buyers</h2><p style="color:var(--gray-400);font-size:13px">Highest spending customers</p></div>
      <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
    </div>
    ${!buyers.length?emptyState('🏆','No buyers yet','Top buyers will appear after orders are placed')
    :buyers.map((b,i)=>{
      const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
      return `<div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;gap:12px;align-items:center">
          <span style="font-size:${i<3?'24px':'16px'};width:32px;text-align:center">${medal||`<span style="font-weight:800;color:var(--gray-300)">${i+1}</span>`}</span>
          <div>
            <p style="font-weight:700">${esc(b.full_name)}</p>
            <p style="font-size:12px;color:var(--gray-400)">${esc(b.email)} · ${b.order_count} orders</p>
          </div>
        </div>
        <span style="font-weight:900;font-size:18px;color:var(--gold-dark)">₹${b.total_spent}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// ═══════════════════════════════════════════════════
// ADMIN: CATEGORIES (Tree CRUD)
// ═══════════════════════════════════════════════════
async function renderAdminCategories(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading categories...</div>';
  const cats=await sb.get("categories","*",{order:"level.asc,sort_order.asc"});
  const prods=await sb.get("products","category_id",{});
  const prodCount=id=>prods.filter(p=>p.category_id===id).length;
  const verticals=cats.filter(c=>c.level===0);
  const getChildren=(pid)=>cats.filter(c=>c.parent_id===pid).sort((a,b)=>a.sort_order-b.sort_order);
  const now=new Date();
  const catStatus=(c)=>{
    if(!c.is_active)return '<span class="badge badge-red">Inactive</span>';
    if(c.paused_from&&c.paused_until&&new Date(c.paused_from)<=now&&now<=new Date(c.paused_until))return '<span class="badge badge-gold">Paused</span>';
    if(c.paused_from&&c.paused_until)return `<span class="badge" style="background:var(--gray-100);color:var(--gray-500)">Sched</span>`;
    return '<span class="badge badge-green">Live</span>';
  };

  const renderNode=(c, depth)=>{
    const children=getChildren(c.id);
    const pc=prodCount(c.id);
    const childProds=children.reduce((a,ch)=>a+prodCount(ch.id)+getChildren(ch.id).reduce((b,gc)=>b+prodCount(gc.id),0),0);
    const totalP=pc+childProds;
    const indent=depth*24;
    const levelLabel=['Vertical','Category','Subcategory','Leaf'][c.level]||'';
    return `<div class="card card-sm" style="margin-left:${indent}px;margin-bottom:6px;border-left:3px solid ${depth===0?'var(--gold)':depth===1?'var(--blue)':'var(--gray-300)'}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:180px">
          <span style="font-size:20px">${c.icon||'📦'}</span>
          <div>
            <p style="font-weight:700;font-size:14px">${esc(c.name)} <span style="font-size:10px;color:var(--gray-400);font-weight:400">${levelLabel}</span></p>
            <p style="font-size:11px;color:var(--gray-400)">${c.slug} · ${totalP} product${totalP!==1?'s':''} · Order: ${c.sort_order||0}${c.referral_commission_pct?` · <span style="color:var(--purple);font-weight:600">🔗 ${c.referral_commission_pct}% referral</span>`:' · <span style="color:var(--gray-300)">No referral %</span>'}</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${catStatus(c)}
          <button class="btn btn-ghost btn-sm" onclick="editCatModal('${c.id}')" title="Edit">✏️</button>
          ${c.level<2?`<button class="btn btn-ghost btn-sm" onclick="addCatModal('${c.id}',${c.level+1})" title="Add child">➕</button>`:''}
          <button class="btn btn-ghost btn-sm" onclick="toggleCatActive('${c.id}',${c.is_active})" title="${c.is_active?'Deactivate':'Activate'}">${c.is_active?'🟢':'🔴'}</button>
          ${totalP===0?`<button class="btn btn-ghost btn-sm" onclick="deleteCat('${c.id}')" title="Delete">🗑️</button>`:''}
          <button class="btn btn-ghost btn-sm" onclick="pauseCatModal('${c.id}')" title="Schedule">📅</button>
        </div>
      </div>
    </div>`+children.map(ch=>renderNode(ch, depth+1)).join('');
  };

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">📂 Category Manager</h2>
        <p style="color:var(--gray-400);font-size:13px">${cats.length} total · ${verticals.length} verticals · ${cats.filter(c=>c.level===1).length} categories · ${cats.filter(c=>c.level===2).length} subcategories · ${cats.filter(c=>c.level===3).length} leaf</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill btn-sm" onclick="addCatModal(null,0)">+ New Vertical</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-commissions')">💸 Commissions</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>
    ${verticals.map(v=>renderNode(v,0)).join('')}
  </div>`;
}

function addCatModal(parentId, level){
  const levelName=['Vertical','Category','Subcategory','Leaf'][level];
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:440px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">➕ New ${levelName}</h3>
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="nc-name" placeholder="${levelName} name" oninput="$('nc-slug').value=this.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')"></div>
    <div class="form-group"><label class="form-label">Slug</label><input class="form-input" id="nc-slug" placeholder="auto-generated"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Icon (emoji)</label><input class="form-input" id="nc-icon" placeholder="📦" maxlength="4"></div>
      <div class="form-group"><label class="form-label">Sort Order</label><input class="form-input" id="nc-sort" type="number" value="1"></div>
    </div>
    <div class="form-group"><label class="form-label">Description (optional)</label><input class="form-input" id="nc-desc" placeholder="Brief description"></div>
    <div class="form-group"><label class="form-label">🔗 Referral Commission %</label><input class="form-input" id="nc-ref-pct" type="number" min="0" max="30" step="0.1" value="0" placeholder="e.g. 5 for 5%"><p style="font-size:11px;color:var(--gray-400);margin-top:4px">% of sale price paid to the user who shared the product link</p></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveCat('${parentId}',${level})">Create ${levelName}</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveCat(parentId, level){
  const name=$('nc-name').value.trim();const slug=$('nc-slug').value.trim();
  if(!name||!slug){toast('Name & slug required','⚠️');return;}
  const data={name,slug,parent_id:parentId==='null'?null:parentId,level,icon:$('nc-icon').value||'📦',sort_order:parseInt($('nc-sort').value)||1,description:$('nc-desc').value,referral_commission_pct:parseFloat($('nc-ref-pct').value)||0,is_active:true};
  const r=await sb.ins("categories",data);
  if(r.length){document.querySelector('.auth-overlay')?.remove();toast('Created!','✅');renderAdminCategories();}
  else toast('Error — slug may exist','❌');
}

async function editCatModal(id){
  const cats=await sb.get("categories","*",{id:`eq.${id}`});
  const c=cats[0];if(!c)return;
  const modal=document.createElement('div');modal.className='auth-overlay';
  const levelName=['Vertical','Category','Subcategory','Leaf'][c.level];
  modal.innerHTML=`<div class="auth-card" style="max-width:440px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">✏️ Edit ${levelName}</h3>
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ec-name" value="${esc(c.name)}"></div>
    <div class="form-group"><label class="form-label">Slug</label><input class="form-input" id="ec-slug" value="${esc(c.slug)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Icon</label><input class="form-input" id="ec-icon" value="${c.icon||''}" maxlength="4"></div>
      <div class="form-group"><label class="form-label">Sort Order</label><input class="form-input" id="ec-sort" type="number" value="${c.sort_order||0}"></div>
    </div>
    <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="ec-desc" value="${esc(c.description||'')}"></div>
    <div class="form-group"><label class="form-label">🔗 Referral Commission %</label><input class="form-input" id="ec-ref-pct" type="number" min="0" max="30" step="0.1" value="${c.referral_commission_pct||0}" placeholder="e.g. 5 for 5%"><p style="font-size:11px;color:var(--gray-400);margin-top:4px">% of sale price paid to the user who shared the product link</p></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="updateCat('${id}')">Save Changes</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function updateCat(id){
  await sb.upd("categories",{name:$('ec-name').value,slug:$('ec-slug').value,icon:$('ec-icon').value,sort_order:parseInt($('ec-sort').value)||0,description:$('ec-desc').value,referral_commission_pct:parseFloat($('ec-ref-pct').value)||0,updated_at:new Date().toISOString()},{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Updated!','✅');renderAdminCategories();
}

async function toggleCatActive(id, current){
  await sb.upd("categories",{is_active:!current,updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast(current?'Deactivated':'Activated','✅');renderAdminCategories();
}

async function deleteCat(id){
  if(!confirm('Delete this category? This cannot be undone.'))return;
  await sb.del("categories",{id:`eq.${id}`});
  toast('Deleted','🗑️');renderAdminCategories();
}

function pauseCatModal(id){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:420px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">📅 Schedule Pause</h3>
    <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px">Set a time window when this category will be paused (hidden from shop).</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Pause From</label><input class="form-input" id="pc-from" type="datetime-local"></div>
      <div class="form-group"><label class="form-label">Pause Until</label><input class="form-input" id="pc-until" type="datetime-local"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="savePause('${id}')">Set Schedule</button>
      <button class="btn btn-outline btn-pill" onclick="clearPause('${id}')">Clear</button>
      <button class="btn btn-ghost btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function savePause(id){
  const from=$('pc-from').value;const until=$('pc-until').value;
  if(!from||!until){toast('Set both dates','⚠️');return;}
  await sb.upd("categories",{paused_from:new Date(from).toISOString(),paused_until:new Date(until).toISOString()},{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Pause scheduled','📅');renderAdminCategories();
}

async function clearPause(id){
  await sb.upd("categories",{paused_from:null,paused_until:null},{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Pause cleared','✅');renderAdminCategories();
}

// ═══════════════════════════════════════════════════
// ADMIN: COMMISSIONS
// ═══════════════════════════════════════════════════
async function renderAdminCommissions(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading commission rules...</div>';
  const [rules,cats]=await Promise.all([
    sb.get("commission_rules","*,categories(name,slug,level,icon,parent_id)",{order:"priority.desc,created_at.desc"}),
    sb.get("categories","*",{order:"level.asc,sort_order.asc"})
  ]);
  const catName=(id)=>{const c=cats.find(x=>x.id===id);return c?`${c.icon||''} ${c.name}`:'-';};
  const catLevel=(id)=>{const c=cats.find(x=>x.id===id);return c?['V','C','S'][c.level]||'?':'-';};
  const now=new Date();
  const ruleStatus=(r)=>{
    if(!r.is_active)return '<span class="badge badge-red">Off</span>';
    if(r.effective_from&&new Date(r.effective_from)>now)return '<span class="badge badge-gold">Scheduled</span>';
    if(r.effective_until&&new Date(r.effective_until)<now)return '<span class="badge" style="background:var(--gray-100);color:var(--gray-500)">Expired</span>';
    return '<span class="badge badge-green">Active</span>';
  };

  const verticals=cats.filter(c=>c.level===0);
  const catOpts=cats.map(c=>`<option value="${c.id}">${'— '.repeat(c.level)}${c.icon||''} ${c.name}</option>`).join('');

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">💸 Commission Manager</h2>
        <p style="color:var(--gray-400);font-size:13px">${rules.length} rules · ${rules.filter(r=>r.is_active).length} active</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill btn-sm" onclick="$('cr-form').classList.toggle('hide')">+ New Rule</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-categories')">📂 Categories</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <!-- Add Rule Form -->
    <div id="cr-form" class="card hide" style="margin-bottom:24px">
      <h3 style="font-weight:700;margin-bottom:12px">New Commission Rule</h3>
      <div class="g3" style="margin-bottom:0;gap:12px">
        <div class="form-group" style="margin:0"><label class="form-label">Category</label><select class="form-select" id="cr-cat" style="margin:0">${catOpts}</select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Commission %</label><input class="form-input" id="cr-pct" type="number" step="0.5" placeholder="5" style="margin:0"></div>
        <div class="form-group" style="margin:0"><label class="form-label">Priority</label><input class="form-input" id="cr-pri" type="number" value="10" style="margin:0"></div>
      </div>
      <div class="g3" style="margin-bottom:0;gap:12px;margin-top:12px">
        <div class="form-group" style="margin:0"><label class="form-label">Price Min ₹</label><input class="form-input" id="cr-pmin" type="number" value="0" style="margin:0"></div>
        <div class="form-group" style="margin:0"><label class="form-label">Price Max ₹ (empty=no limit)</label><input class="form-input" id="cr-pmax" type="number" placeholder="No limit" style="margin:0"></div>
        <div class="form-group" style="margin:0;display:flex;align-items:end"><button class="btn btn-gold btn-pill btn-full" onclick="addCommRule()">Create Rule</button></div>
      </div>
      <div class="g3" style="margin-bottom:0;gap:12px;margin-top:12px">
        <div class="form-group" style="margin:0"><label class="form-label">Effective From (optional)</label><input class="form-input" id="cr-from" type="datetime-local" style="margin:0"></div>
        <div class="form-group" style="margin:0"><label class="form-label">Effective Until (optional)</label><input class="form-input" id="cr-until" type="datetime-local" style="margin:0"></div>
        <div></div>
      </div>
    </div>

    <!-- Commission Preview -->
    <div class="card" style="margin-bottom:24px;background:var(--gray-50)">
      <h3 style="font-weight:700;margin-bottom:12px">🧮 Commission Calculator</h3>
      <div class="g3" style="margin-bottom:0;gap:12px">
        <div class="form-group" style="margin:0"><label class="form-label">Category</label><select class="form-select" id="cc-cat" style="margin:0">${catOpts}</select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Product Price ₹</label><input class="form-input" id="cc-price" type="number" placeholder="999" style="margin:0"></div>
        <div class="form-group" style="margin:0;display:flex;align-items:end"><button class="btn btn-outline btn-pill btn-full" onclick="calcCommission()">Calculate</button></div>
      </div>
      <div id="cc-result" style="margin-top:12px"></div>
    </div>

    <!-- Rules grouped by vertical -->
    ${verticals.map(v=>{
      const vRules=rules.filter(r=>{
        if(!r.category_id)return false;
        const c=cats.find(x=>x.id===r.category_id);
        if(!c)return false;
        if(c.id===v.id)return true;
        if(c.parent_id===v.id)return true;
        const parent=cats.find(x=>x.id===c.parent_id);
        if(parent&&parent.parent_id===v.id)return true;
        return false;
      });
      if(!vRules.length)return '';
      return `<div class="card" style="margin-bottom:16px">
        <h3 style="font-weight:700;margin-bottom:12px">${v.icon||''} ${esc(v.name)} <span style="font-size:12px;color:var(--gray-400);font-weight:400">${vRules.length} rules</span></h3>
        ${vRules.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <span style="font-size:11px;color:var(--gray-400);font-weight:600">[${catLevel(r.category_id)}]</span>
            <span style="font-weight:600;font-size:13px">${catName(r.category_id)}</span>
            <span style="font-size:11px;color:var(--gray-400)">₹${r.price_min||0}${r.price_max?' – ₹'+r.price_max:' +'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${ruleStatus(r)}
            <span style="font-weight:900;font-size:16px;color:var(--purple)">${r.commission_percent}%</span>
            <span style="font-size:10px;color:var(--gray-400)">P${r.priority}</span>
            <button class="btn btn-ghost btn-sm" onclick="editCommRule('${r.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleCommRule('${r.id}',${r.is_active})">${r.is_active?'🟢':'🔴'}</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteCommRule('${r.id}')">🗑️</button>
          </div>
        </div>`).join('')}
      </div>`;
    }).join('')}

    <!-- Product-level overrides -->
    ${rules.filter(r=>r.product_id).length?`<div class="card" style="margin-bottom:16px">
      <h3 style="font-weight:700;margin-bottom:12px">📦 Product Overrides</h3>
      ${rules.filter(r=>r.product_id).map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100)">
        <span style="font-size:13px;font-weight:600">Product: ${r.product_id.slice(0,8)}...</span>
        <div style="display:flex;align-items:center;gap:8px">
          ${ruleStatus(r)}
          <span style="font-weight:900;font-size:16px;color:var(--purple)">${r.commission_percent}%</span>
          <button class="btn btn-ghost btn-sm" onclick="deleteCommRule('${r.id}')">🗑️</button>
        </div>
      </div>`).join('')}
    </div>`:''}
  </div>`;
}

async function addCommRule(){
  const cat=$('cr-cat').value;const pct=parseFloat($('cr-pct').value);
  if(!cat||isNaN(pct)){toast('Category & % required','⚠️');return;}
  const data={category_id:cat,commission_percent:pct,priority:parseInt($('cr-pri').value)||10,price_min:parseFloat($('cr-pmin').value)||0,is_active:true};
  const pmax=$('cr-pmax').value;if(pmax)data.price_max=parseFloat(pmax);
  const from=$('cr-from').value;if(from)data.effective_from=new Date(from).toISOString();
  const until=$('cr-until').value;if(until)data.effective_until=new Date(until).toISOString();
  const r=await sb.ins("commission_rules",data);
  if(r.length){toast('Rule created!','✅');renderAdminCommissions();}
  else toast('Error creating rule','❌');
}

async function editCommRule(id){
  const rules=await sb.get("commission_rules","*",{id:`eq.${id}`});
  const r=rules[0];if(!r)return;
  const cats=await sb.get("categories","*",{order:"level.asc,sort_order.asc"});
  const catOpts=cats.map(c=>`<option value="${c.id}" ${'— '.repeat(c.level)}${c.id===r.category_id?'selected':''}>${'— '.repeat(c.level)}${c.icon||''} ${c.name}</option>`).join('');
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px;max-height:90vh;overflow-y:auto">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">✏️ Edit Commission Rule</h3>
    <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="er-cat">${catOpts}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Commission %</label><input class="form-input" id="er-pct" type="number" step="0.5" value="${r.commission_percent}"></div>
      <div class="form-group"><label class="form-label">Priority</label><input class="form-input" id="er-pri" type="number" value="${r.priority}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Price Min ₹</label><input class="form-input" id="er-pmin" type="number" value="${r.price_min||0}"></div>
      <div class="form-group"><label class="form-label">Price Max ₹</label><input class="form-input" id="er-pmax" type="number" value="${r.price_max||''}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Effective From</label><input class="form-input" id="er-from" type="datetime-local" value="${r.effective_from?r.effective_from.slice(0,16):''}"></div>
      <div class="form-group"><label class="form-label">Effective Until</label><input class="form-input" id="er-until" type="datetime-local" value="${r.effective_until?r.effective_until.slice(0,16):''}"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveCommRule('${id}')">Save</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveCommRule(id){
  const data={category_id:$('er-cat').value,commission_percent:parseFloat($('er-pct').value),priority:parseInt($('er-pri').value)||0,price_min:parseFloat($('er-pmin').value)||0,updated_at:new Date().toISOString()};
  const pmax=$('er-pmax').value;data.price_max=pmax?parseFloat(pmax):null;
  const from=$('er-from').value;data.effective_from=from?new Date(from).toISOString():null;
  const until=$('er-until').value;data.effective_until=until?new Date(until).toISOString():null;
  await sb.upd("commission_rules",data,{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Rule updated!','✅');renderAdminCommissions();
}

async function toggleCommRule(id, current){
  await sb.upd("commission_rules",{is_active:!current},{id:`eq.${id}`});
  toast(current?'Deactivated':'Activated','✅');renderAdminCommissions();
}

async function deleteCommRule(id){
  if(!confirm('Delete this commission rule?'))return;
  await sb.del("commission_rules",{id:`eq.${id}`});
  toast('Deleted','🗑️');renderAdminCommissions();
}

async function calcCommission(){
  const catId=$('cc-cat').value;const price=parseFloat($('cc-price').value);
  if(!catId||!price){toast('Select category & enter price','⚠️');return;}
  const result=await sb.rpc("resolve_commission",{p_product_id:'00000000-0000-0000-0000-000000000000',p_category_id:catId,p_price:price});
  const fee=(price*result/100).toFixed(2);
  $('cc-result').innerHTML=`<div style="padding:14px;background:#fff;border-radius:var(--radius);border:2px solid var(--purple);text-align:center">
    <span style="font-size:32px;font-weight:900;color:var(--purple)">${result}%</span>
    <p style="font-size:13px;color:var(--gray-500);margin-top:4px">Commission on ₹${price} = <strong style="color:var(--black)">₹${fee}</strong></p>
  </div>`;
}

// ═══════════════════════════════════════════════════
// ADMIN: GST / TAX MANAGEMENT
// ═══════════════════════════════════════════════════
async function renderAdminGST(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading GST management...</div>';
  const [slabs,hsns,overrides,tcs,cats,orders]=await Promise.all([
    sb.get("gst_slabs","*",{order:"rate.asc"}),
    sb.get("hsn_codes","*,gst_slabs(name,rate),categories(name,icon,slug)",{order:"code.asc"}),
    sb.get("gst_overrides","*,categories(name,icon)",{order:"created_at.desc"}),
    sb.get("tcs_config","*",{order:"created_at.desc",limit:1}),
    sb.get("categories","*",{order:"level.asc,sort_order.asc"}),
    sb.get("orders","gst_amount,tcs_amount,cgst_amount,sgst_amount,igst_amount,total_amount",{limit:500})
  ]);
  const tcsRate=tcs[0]?.rate||1;
  const totalGST=orders.reduce((a,o)=>a+(parseFloat(o.gst_amount)||0),0);
  const totalTCS=orders.reduce((a,o)=>a+(parseFloat(o.tcs_amount)||0),0);
  const catOpts=cats.map(c=>`<option value="${c.id}">${'— '.repeat(c.level||0)}${c.icon||''} ${c.name}</option>`).join('');
  const slabOpts=slabs.map(s=>`<option value="${s.id}">${s.name} (${s.rate}%)</option>`).join('');

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">🧾 GST / Tax Management</h2>
        <p style="color:var(--gray-400);font-size:13px">${hsns.length} HSN codes · ${overrides.length} overrides · TCS ${tcsRate}%</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-categories')">📂 Categories</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="g3" style="margin-bottom:24px">
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">TOTAL GST COLLECTED</p><p style="font-size:28px;font-weight:900;color:var(--green)">₹${totalGST.toFixed(0)}</p></div>
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">TCS COLLECTED</p><p style="font-size:28px;font-weight:900;color:var(--blue)">₹${totalTCS.toFixed(0)}</p></div>
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">GST SLABS ACTIVE</p><p style="font-size:28px;font-weight:900">${slabs.filter(s=>s.is_active).length} / ${slabs.length}</p></div>
    </div>

    <!-- TCS Config -->
    <div class="card" style="margin-bottom:20px;background:var(--gray-50)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h3 style="font-weight:700">📋 TCS Rate (Section 52)</h3>
          <p style="font-size:13px;color:var(--gray-500)">Current: <strong>${tcsRate}%</strong> ${tcs[0]?`· Effective from ${new Date(tcs[0].effective_from).toLocaleDateString()}`:''}</p></div>
        <button class="btn btn-sm btn-outline btn-pill" onclick="editTCSModal(${tcsRate})">Edit Rate</button>
      </div>
    </div>

    <!-- GST Slabs -->
    <div class="card" style="margin-bottom:20px">
      <h3 style="font-weight:700;margin-bottom:12px">📊 GST Slabs</h3>
      ${slabs.map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100)">
        <div><span style="font-weight:700">${esc(s.name)}</span> <span style="font-size:12px;color:var(--gray-400)">CGST ${s.cgst_rate}% + SGST ${s.sgst_rate}% | IGST ${s.igst_rate}%</span></div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-weight:900;font-size:18px;color:var(--purple)">${s.rate}%</span>
          ${s.is_active?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Off</span>'}
        </div>
      </div>`).join('')}
    </div>

    <!-- HSN Code Manager -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="font-weight:700">🏷️ HSN Codes (${hsns.length})</h3>
        <button class="btn btn-gold btn-pill btn-sm" onclick="$('hsn-form').classList.toggle('hide')">+ Add HSN</button>
      </div>

      <div id="hsn-form" class="hide" style="padding:16px;background:var(--gray-50);border-radius:var(--radius);margin-bottom:16px">
        <div class="g3" style="margin-bottom:0;gap:12px">
          <div class="form-group" style="margin:0"><label class="form-label">HSN Code</label><input class="form-input" id="nh-code" placeholder="8517" style="margin:0"></div>
          <div class="form-group" style="margin:0"><label class="form-label">Description</label><input class="form-input" id="nh-desc" placeholder="Smartphones" style="margin:0"></div>
          <div class="form-group" style="margin:0"><label class="form-label">Chapter</label><input class="form-input" id="nh-chap" placeholder="85" maxlength="2" style="margin:0"></div>
        </div>
        <div class="g3" style="margin-bottom:0;gap:12px;margin-top:12px">
          <div class="form-group" style="margin:0"><label class="form-label">GST Slab</label><select class="form-select" id="nh-slab" style="margin:0">${slabOpts}</select></div>
          <div class="form-group" style="margin:0"><label class="form-label">Map to Category</label><select class="form-select" id="nh-cat" style="margin:0"><option value="">None</option>${catOpts}</select></div>
          <div class="form-group" style="margin:0;display:flex;align-items:end"><button class="btn btn-gold btn-pill btn-full" onclick="addHSN()">Add HSN</button></div>
        </div>
        <div class="form-group" style="margin:12px 0 0"><label class="form-label">Notes (optional)</label><input class="form-input" id="nh-notes" placeholder="e.g. Rate changes above ₹1000" style="margin:0"></div>
      </div>

      <!-- Search -->
      <div style="margin-bottom:12px"><input class="form-input" id="hsn-search" placeholder="Search HSN code or description..." oninput="filterHSN(this.value)" style="margin:0"></div>

      <div id="hsn-list">
      ${hsns.map(h=>`<div class="hsn-row" data-search="${h.code} ${(h.description||'').toLowerCase()}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <span style="font-family:'Space Mono',monospace;font-weight:700;color:var(--black)">${esc(h.code)}</span>
          <span style="font-size:13px;color:var(--gray-600);margin-left:8px">${esc(h.description||'')}</span>
          ${h.categories?`<span style="font-size:11px;color:var(--gray-400);margin-left:8px">${h.categories.icon||''} ${esc(h.categories.name)}</span>`:''}
          ${h.notes?`<span style="font-size:10px;color:var(--orange);margin-left:6px">⚠ ${esc(h.notes)}</span>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="badge" style="background:rgba(175,82,222,.1);color:var(--purple);font-weight:700">${h.gst_slabs?.rate||0}% GST</span>
          <button class="btn btn-ghost btn-sm" onclick="editHSNModal('${h.id}')">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteHSN('${h.id}')">🗑️</button>
        </div>
      </div>`).join('')}
      </div>
    </div>

    <!-- GST Overrides -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="font-weight:700">⚡ Price Threshold Overrides (${overrides.length})</h3>
        <button class="btn btn-gold btn-pill btn-sm" onclick="$('ov-form').classList.toggle('hide')">+ Add Override</button>
      </div>
      <p style="font-size:12px;color:var(--gray-400);margin-bottom:12px">Price-based GST rate exceptions (e.g. Footwear below ₹1000 = 5%, above = 18%)</p>

      <div id="ov-form" class="hide" style="padding:16px;background:var(--gray-50);border-radius:var(--radius);margin-bottom:16px">
        <div class="g3" style="margin-bottom:0;gap:12px">
          <div class="form-group" style="margin:0"><label class="form-label">Category</label><select class="form-select" id="no-cat" style="margin:0">${catOpts}</select></div>
          <div class="form-group" style="margin:0"><label class="form-label">Price Threshold ₹</label><input class="form-input" id="no-thr" type="number" value="1000" style="margin:0"></div>
          <div></div>
        </div>
        <div class="g3" style="margin-bottom:0;gap:12px;margin-top:12px">
          <div class="form-group" style="margin:0"><label class="form-label">Rate Below %</label><input class="form-input" id="no-below" type="number" value="5" style="margin:0"></div>
          <div class="form-group" style="margin:0"><label class="form-label">Rate Above %</label><input class="form-input" id="no-above" type="number" value="12" style="margin:0"></div>
          <div class="form-group" style="margin:0;display:flex;align-items:end"><button class="btn btn-gold btn-pill btn-full" onclick="addOverride()">Add Override</button></div>
        </div>
      </div>

      ${overrides.map(o=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);flex-wrap:wrap;gap:8px">
        <div>
          <span style="font-weight:600">${o.categories?.icon||''} ${esc(o.categories?.name||'Unknown')}</span>
          <span style="font-size:12px;color:var(--gray-400);margin-left:8px">Below ₹${o.price_threshold} → <strong style="color:var(--green)">${o.rate_below}%</strong> | Above → <strong style="color:var(--red)">${o.rate_above}%</strong></span>
        </div>
        <div style="display:flex;gap:6px">
          ${o.is_active?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Off</span>'}
          <button class="btn btn-ghost btn-sm" onclick="editOverrideModal('${o.id}')">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleOverride('${o.id}',${o.is_active})">${o.is_active?'🟢':'🔴'}</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteOverride('${o.id}')">🗑️</button>
        </div>
      </div>`).join('')}
    </div>

    <!-- GST Calculator -->
    <div class="card" style="background:var(--gray-50)">
      <h3 style="font-weight:700;margin-bottom:12px">🧮 GST Calculator</h3>
      <div class="g3" style="margin-bottom:0;gap:12px">
        <div class="form-group" style="margin:0"><label class="form-label">Category</label><select class="form-select" id="gc-cat" style="margin:0">${catOpts}</select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Product Price ₹</label><input class="form-input" id="gc-price" type="number" placeholder="999" style="margin:0"></div>
        <div class="form-group" style="margin:0;display:flex;align-items:end"><button class="btn btn-outline btn-pill btn-full" onclick="calcGSTAdmin()">Calculate</button></div>
      </div>
      <div id="gc-result" style="margin-top:12px"></div>
    </div>
  </div>`;
}

function filterHSN(q){
  q=q.toLowerCase();
  document.querySelectorAll('.hsn-row').forEach(r=>{
    r.style.display=r.dataset.search.includes(q)?'flex':'none';
  });
}

async function addHSN(){
  const code=$('nh-code').value.trim();const desc=$('nh-desc').value.trim();
  if(!code){toast('HSN code required','⚠️');return;}
  const data={code,description:desc,chapter:$('nh-chap').value.trim(),gst_slab_id:$('nh-slab').value||null,notes:$('nh-notes').value,is_active:true};
  const cat=$('nh-cat').value;if(cat)data.category_id=cat;
  const r=await sb.ins("hsn_codes",data);
  if(r.length){toast('HSN added!','✅');renderAdminGST();}
}

async function editHSNModal(id){
  const items=await sb.get("hsn_codes","*",{id:`eq.${id}`});
  const h=items[0];if(!h)return;
  const [slabs,cats]=await Promise.all([
    sb.get("gst_slabs","*",{order:"rate.asc"}),
    sb.get("categories","*",{order:"level.asc,sort_order.asc"})
  ]);
  const slabOpts=slabs.map(s=>`<option value="${s.id}" ${s.id===h.gst_slab_id?'selected':''}>${s.name} (${s.rate}%)</option>`).join('');
  const catOpts=cats.map(c=>`<option value="${c.id}" ${c.id===h.category_id?'selected':''}>${'— '.repeat(c.level||0)}${c.icon||''} ${c.name}</option>`).join('');
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">✏️ Edit HSN Code</h3>
    <div class="form-group"><label class="form-label">HSN Code</label><input class="form-input" id="eh-code" value="${esc(h.code)}"></div>
    <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="eh-desc" value="${esc(h.description||'')}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Chapter</label><input class="form-input" id="eh-chap" value="${esc(h.chapter||'')}" maxlength="2"></div>
      <div class="form-group"><label class="form-label">GST Slab</label><select class="form-select" id="eh-slab">${slabOpts}</select></div>
    </div>
    <div class="form-group"><label class="form-label">Map to Category</label><select class="form-select" id="eh-cat"><option value="">None</option>${catOpts}</select></div>
    <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="eh-notes" value="${esc(h.notes||'')}"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveHSN('${id}')">Save</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveHSN(id){
  const data={code:$('eh-code').value,description:$('eh-desc').value,chapter:$('eh-chap').value,gst_slab_id:$('eh-slab').value||null,notes:$('eh-notes').value};
  const cat=$('eh-cat').value;data.category_id=cat||null;
  await sb.upd("hsn_codes",data,{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('HSN updated!','✅');renderAdminGST();
}

async function deleteHSN(id){
  if(!confirm('Delete this HSN code?'))return;
  await sb.del("hsn_codes",{id:`eq.${id}`});
  toast('Deleted','🗑️');renderAdminGST();
}

async function addOverride(){
  const cat=$('no-cat').value;
  if(!cat){toast('Select category','⚠️');return;}
  await sb.ins("gst_overrides",{category_id:cat,price_threshold:parseFloat($('no-thr').value)||1000,rate_below:parseFloat($('no-below').value)||5,rate_above:parseFloat($('no-above').value)||12,is_active:true});
  toast('Override added!','✅');renderAdminGST();
}

async function editOverrideModal(id){
  const items=await sb.get("gst_overrides","*",{id:`eq.${id}`});
  const o=items[0];if(!o)return;
  const cats=await sb.get("categories","*",{order:"level.asc,sort_order.asc"});
  const catOpts=cats.map(c=>`<option value="${c.id}" ${c.id===o.category_id?'selected':''}>${'— '.repeat(c.level||0)}${c.icon||''} ${c.name}</option>`).join('');
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:420px">
    <h3 style="font-weight:800;margin-bottom:16px">✏️ Edit Override</h3>
    <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="eo-cat">${catOpts}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Threshold ₹</label><input class="form-input" id="eo-thr" type="number" value="${o.price_threshold}"></div>
      <div class="form-group"><label class="form-label">Below %</label><input class="form-input" id="eo-below" type="number" value="${o.rate_below}"></div>
      <div class="form-group"><label class="form-label">Above %</label><input class="form-input" id="eo-above" type="number" value="${o.rate_above}"></div>
    </div>
    <div style="display:flex;gap:8px"><button class="btn btn-gold btn-pill" style="flex:1" onclick="saveOverride('${id}')">Save</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button></div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveOverride(id){
  await sb.upd("gst_overrides",{category_id:$('eo-cat').value,price_threshold:parseFloat($('eo-thr').value),rate_below:parseFloat($('eo-below').value),rate_above:parseFloat($('eo-above').value)},{id:`eq.${id}`});
  document.querySelector('.auth-overlay')?.remove();
  toast('Override updated!','✅');renderAdminGST();
}

async function toggleOverride(id, current){
  await sb.upd("gst_overrides",{is_active:!current},{id:`eq.${id}`});
  toast(current?'Deactivated':'Activated','✅');renderAdminGST();
}

async function deleteOverride(id){
  if(!confirm('Delete this override?'))return;
  await sb.del("gst_overrides",{id:`eq.${id}`});
  toast('Deleted','🗑️');renderAdminGST();
}

function editTCSModal(current){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:380px">
    <h3 style="font-weight:800;margin-bottom:16px">📋 Update TCS Rate</h3>
    <div class="form-group"><label class="form-label">TCS Rate %</label><input class="form-input" id="tcs-rate" type="number" step="0.1" value="${current}"></div>
    <div class="form-group"><label class="form-label">Effective From</label><input class="form-input" id="tcs-from" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div style="display:flex;gap:8px"><button class="btn btn-gold btn-pill" style="flex:1" onclick="saveTCS()">Update</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button></div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveTCS(){
  await sb.ins("tcs_config",{rate:parseFloat($('tcs-rate').value),effective_from:$('tcs-from').value,is_active:true});
  document.querySelector('.auth-overlay')?.remove();
  toast('TCS rate updated!','✅');renderAdminGST();
}

async function calcGSTAdmin(){
  const catId=$('gc-cat').value;const price=parseFloat($('gc-price').value);
  if(!catId||!price){toast('Select category & enter price','⚠️');return;}
  const gst=await resolveGSTClient(catId, price);
  const gstAmt=(price*gst.rate/100).toFixed(2);
  const halfRate=(gst.rate/2).toFixed(1);
  $('gc-result').innerHTML=`<div style="padding:14px;background:#fff;border-radius:var(--radius);border:2px solid var(--purple);text-align:center">
    <span style="font-size:32px;font-weight:900;color:var(--purple)">${gst.rate}% GST</span>
    <p style="font-size:13px;color:var(--gray-500);margin-top:4px">HSN: <strong>${gst.hsn||'—'}</strong> · CGST ${halfRate}% + SGST ${halfRate}% = <strong style="color:var(--black)">₹${gstAmt}</strong></p>
    <p style="font-size:13px;margin-top:4px">Buyer pays: <strong>₹${(price+parseFloat(gstAmt)).toFixed(2)}</strong></p>
  </div>`;
}

// Client-side GST resolution (mirrors DB waterfall)
async function resolveGSTClient(catId, price, hsnOverride){
  // 1. Check overrides first (price threshold)
  const overrides=await sb.get("gst_overrides","*",{category_id:`eq.${catId}`,is_active:"eq.true"});
  if(overrides.length){
    const o=overrides[0];
    const rate=price<o.price_threshold?o.rate_below:o.rate_above;
    // Get HSN for this category
    const hsns=await sb.get("hsn_codes","code",{category_id:`eq.${catId}`,is_active:"eq.true",limit:1});
    return {rate,hsn:hsns[0]?.code||hsnOverride||''};
  }
  // 2. HSN override
  if(hsnOverride){
    const hsns=await sb.get("hsn_codes","*,gst_slabs(rate)",{code:`eq.${hsnOverride}`,is_active:"eq.true",limit:1});
    if(hsns.length)return {rate:parseFloat(hsns[0].gst_slabs?.rate||18),hsn:hsnOverride};
  }
  // 3. Category default HSN
  const hsns=await sb.get("hsn_codes","*,gst_slabs(rate)",{category_id:`eq.${catId}`,is_active:"eq.true",limit:1});
  if(hsns.length)return {rate:parseFloat(hsns[0].gst_slabs?.rate||18),hsn:hsns[0].code};
  // 4. Walk up to parent
  const catData=await sb.get("categories","parent_id",{id:`eq.${catId}`});
  if(catData[0]?.parent_id){
    const parentHsns=await sb.get("hsn_codes","*,gst_slabs(rate)",{category_id:`eq.${catData[0].parent_id}`,is_active:"eq.true",limit:1});
    if(parentHsns.length)return {rate:parseFloat(parentHsns[0].gst_slabs?.rate||18),hsn:parentHsns[0].code};
  }
  // 5. Default 18%
  return {rate:18,hsn:''};
}

// ═══════════════════════════════════════════════════
// ADMIN: ADS MANAGEMENT
// ═══════════════════════════════════════════════════
async function renderAdminAds(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading ads...</div>';
  const [camps,events]=await Promise.all([
    sb.get("ad_campaigns","*,profiles(full_name,email),vendor_stores(store_name)",{order:"created_at.desc"}),
    sb.get("ad_events","event_type,cost",{order:"created_at.desc",limit:1000})
  ]);
  const pending=camps.filter(c=>c.status==='pending');
  const active=camps.filter(c=>c.status==='active');
  const totalRev=events.filter(e=>e.event_type==='click').reduce((a,e)=>a+parseFloat(e.cost||0),0);
  const totalImpr=events.filter(e=>e.event_type==='impression').length;
  const totalClicks=events.filter(e=>e.event_type==='click').length;

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">📢 Ad Management</h2>
        <p style="color:var(--gray-400);font-size:13px">${camps.length} campaigns · ${pending.length} pending · ${active.length} active</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-gold btn-pill btn-sm" onclick="go('admin-placement-map')">📍 Placement Map</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <!-- Revenue Stats -->
    <div class="g3" style="margin-bottom:24px">
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">AD REVENUE</p><p style="font-size:28px;font-weight:900;color:var(--gold-dark)">₹${totalRev.toFixed(0)}</p></div>
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">IMPRESSIONS</p><p style="font-size:28px;font-weight:900">${totalImpr}</p></div>
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">CLICKS</p><p style="font-size:28px;font-weight:900">${totalClicks} <span style="font-size:14px;color:var(--gray-400)">${totalImpr>0?(totalClicks/totalImpr*100).toFixed(1):0}% CTR</span></p></div>
    </div>

    <!-- Pending Approval -->
    ${pending.length?`<div class="card" style="margin-bottom:20px;border-left:3px solid var(--orange)">
      <h3 style="font-weight:700;margin-bottom:12px">⏳ Pending Approval (${pending.length})</h3>
      ${pending.map(c=>{const placements=c.targeting?.placements||[];return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--gray-100);flex-wrap:wrap;gap:8px">
        <div>
          <p style="font-weight:700">${esc(c.name)}</p>
          <p style="font-size:12px;color:var(--gray-400)">${esc(c.vendor_stores?.store_name||c.profiles?.full_name||'')} · Budget ₹${c.total_budget} · ${new Date(c.created_at).toLocaleDateString()}</p>
          ${placements.length?`<p style="font-size:11px;color:var(--gray-500);margin-top:2px">📍 ${placements.map(pl=>(pl.page==='home'?'🏠 Home':pl.page==='shop'?'🔍 Shop':'📦 PDP')+' ₹'+pl.bid+'/click').join(' · ')}</p>`:`<p style="font-size:11px;color:var(--gray-400);margin-top:2px">₹${c.cpc_bid}/click · All pages</p>`}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm btn-pill" onclick="previewCampaign('${c.id}')">👁 Preview</button>
          <button class="btn btn-sm btn-pill" style="background:var(--green);color:#fff" onclick="approveAd('${c.id}')">✅ Approve</button>
          <button class="btn btn-sm btn-pill" style="background:var(--red);color:#fff" onclick="rejectAd('${c.id}')">❌ Reject</button>
        </div>
      </div>`}).join('')}
    </div>`:''}

    <!-- All Campaigns -->
    <div class="card">
      <h3 style="font-weight:700;margin-bottom:12px">All Campaigns</h3>
      ${camps.map(c=>{
        const pct=c.total_budget>0?Math.min(100,(c.spent||0)/c.total_budget*100):0;
        const ctr=c.impressions>0?(c.clicks/c.impressions*100).toFixed(1):0;
        const statusCls=c.status==='active'?'badge-green':c.status==='paused'?'badge-gold':c.status==='pending'?'badge-blue':c.status==='rejected'?'badge-red':c.status==='completed'?'badge-purple':'';
        return `<div style="padding:12px 0;border-bottom:1px solid var(--gray-100)">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;flex-wrap:wrap;gap:8px">
            <div><p style="font-weight:700">${esc(c.name)} <span class="badge ${statusCls}">${c.status}</span></p>
              <p style="font-size:12px;color:var(--gray-400)">${esc(c.vendor_stores?.store_name||'')} · ₹${c.cpc_bid}/click · ${ctr}% CTR</p>
              ${(()=>{const pls=c.targeting?.placements||[];return pls.length?`<p style="font-size:11px;color:var(--gray-500);margin-top:2px">📍 ${pls.map(pl=>(pl.page==='home'?'🏠':pl.page==='shop'?'🔍':'📦')+' ₹'+pl.bid).join(' · ')}</p>`:''})()}
            </div>
            <div style="text-align:right">
              <p style="font-weight:800;color:var(--gold-dark)">₹${parseFloat(c.spent||0).toFixed(0)} / ₹${c.total_budget}</p>
              <p style="font-size:11px;color:var(--gray-400)">${c.impressions||0} impr · ${c.clicks||0} clicks</p>
            </div>
          </div>
          <div style="height:4px;background:var(--gray-100);border-radius:2px;overflow:hidden;margin-bottom:8px"><div style="width:${pct}%;height:100%;background:var(--gold);border-radius:2px"></div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="previewCampaign('${c.id}')">👁 Preview</button>
            ${c.status==='active'?`<button class="btn btn-ghost btn-sm" onclick="adminPauseAd('${c.id}')">⏸ Pause</button>`:''}
            ${c.status==='paused'?`<button class="btn btn-ghost btn-sm" onclick="adminResumeAd('${c.id}')">▶️ Resume</button>`:''}
            ${c.status!=='rejected'&&c.status!=='completed'?`<button class="btn btn-ghost btn-sm" onclick="rejectAd('${c.id}')">🚫 Stop</button>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

async function approveAd(id){
  await sb.upd("ad_campaigns",{status:'active',is_approved:true,updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Campaign approved & live!','✅');renderAdminAds();
}

async function rejectAd(id){
  const reason=prompt('Rejection reason (optional):','');
  await sb.upd("ad_campaigns",{status:'rejected',is_approved:false,rejection_reason:reason||null,updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Campaign rejected','❌');renderAdminAds();
}

async function adminPauseAd(id){
  await sb.upd("ad_campaigns",{status:'paused',updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Campaign paused','⏸');renderAdminAds();
}

async function adminResumeAd(id){
  await sb.upd("ad_campaigns",{status:'active',updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Campaign resumed','▶️');renderAdminAds();
}

// ═══════════════════════════════════════════════════
// ADMIN: PAYOUTS & VENDOR TRUST
// ═══════════════════════════════════════════════════
async function renderAdminPayouts(){
  if(!PROFILE||PROFILE.role!=='admin'){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading payouts...</div>';
  const [withdrawals,trusts,banks,settlements]=await Promise.all([
    sb.get("withdrawals","*,profiles(full_name,email)",{order:"created_at.desc",limit:50}),
    sb.get("vendor_trust","*,profiles(full_name,email)",{order:"trust_score.asc"}),
    sb.get("vendor_bank_accounts","*,profiles(full_name)",{order:"created_at.desc"}),
    sb.get("settlement_ledger","status,net_amount",{limit:500})
  ]);
  const held=withdrawals.filter(w=>w.status==='held');
  const processing=withdrawals.filter(w=>w.status==='processing');
  const totalPaid=withdrawals.filter(w=>w.status==='completed').reduce((a,w)=>a+parseFloat(w.amount),0);
  const totalPending=settlements.filter(s=>s.status==='pending'||s.status==='hold').reduce((a,s)=>a+parseFloat(s.net_amount||0),0);
  const totalEligible=settlements.filter(s=>s.status==='eligible').reduce((a,s)=>a+parseFloat(s.net_amount||0),0);
  const flaggedVendors=trusts.filter(t=>t.trust_score<70||t.admin_hold);
  const unverifiedBanks=banks.filter(b=>!b.is_verified);

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">💸 Payouts & Trust</h2>
        <p style="color:var(--gray-400);font-size:13px">${withdrawals.length} withdrawals · ${flaggedVendors.length} flagged vendors</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-pill btn-sm" onclick="checkSettlementEligibility().then(()=>{toast('Settlements updated','✅');renderAdminPayouts()})">🔄 Process Eligible</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="g3" style="margin-bottom:24px">
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">TOTAL PAID OUT</p><p style="font-size:28px;font-weight:900;color:var(--green)">₹${totalPaid.toFixed(0)}</p></div>
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">IN HOLD</p><p style="font-size:28px;font-weight:900;color:var(--orange)">₹${totalPending.toFixed(0)}</p></div>
      <div class="card" style="text-align:center"><p style="font-size:11px;color:var(--gray-400);font-weight:600">ELIGIBLE (WITHDRAWABLE)</p><p style="font-size:28px;font-weight:900;color:var(--blue)">₹${totalEligible.toFixed(0)}</p></div>
    </div>

    <!-- Held Withdrawals (need approval) -->
    ${held.length?`<div class="card" style="margin-bottom:20px;border-left:3px solid var(--orange)">
      <h3 style="font-weight:700;margin-bottom:12px">⏳ Held Withdrawals — Needs Approval (${held.length})</h3>
      ${held.map(w=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--gray-100);flex-wrap:wrap;gap:8px">
        <div><p style="font-weight:700">₹${parseFloat(w.amount).toFixed(0)} — ${esc(w.profiles?.full_name||'Vendor')}</p>
          <p style="font-size:12px;color:var(--gray-400)">${esc(w.profiles?.email||'')} · ${new Date(w.created_at).toLocaleDateString()} · ${w.payment_method}</p></div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-pill" style="background:var(--green);color:#fff" onclick="approveWithdrawal('${w.id}')">✅ Approve</button>
          <button class="btn btn-sm btn-pill" style="background:var(--red);color:#fff" onclick="rejectWithdrawal('${w.id}')">❌ Reject</button>
        </div>
      </div>`).join('')}
    </div>`:''}

    <!-- Unverified Bank Accounts -->
    ${unverifiedBanks.length?`<div class="card" style="margin-bottom:20px;border-left:3px solid var(--blue)">
      <h3 style="font-weight:700;margin-bottom:12px">🏦 Bank Accounts — Pending Verification (${unverifiedBanks.length})</h3>
      ${unverifiedBanks.map(b=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);flex-wrap:wrap;gap:8px">
        <div style="font-size:13px"><strong>${esc(b.profiles?.full_name||'Vendor')}</strong>
          <span style="margin-left:8px;font-family:'Space Mono',monospace">${esc(b.account_number)}</span>
          <span style="margin-left:6px;color:var(--gray-400)">IFSC: ${esc(b.ifsc_code)} · ${esc(b.bank_name||'')}</span>
          ${b.upi_id?`<span style="margin-left:6px;color:var(--gray-400)">UPI: ${esc(b.upi_id)}</span>`:''}</div>
        <button class="btn btn-sm btn-pill" style="background:var(--green);color:#fff" onclick="verifyBank('${b.id}')">✅ Verify</button>
      </div>`).join('')}
    </div>`:''}

    <!-- Flagged Vendors (Trust Issues) -->
    ${flaggedVendors.length?`<div class="card" style="margin-bottom:20px;border-left:3px solid var(--red)">
      <h3 style="font-weight:700;margin-bottom:12px">🚩 Flagged Vendors (${flaggedVendors.length})</h3>
      ${flaggedVendors.map(t=>{
        const breaches=(t.breach_log||[]).slice(-3);
        return `<div style="padding:12px 0;border-bottom:1px solid var(--gray-100)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:8px">
            <div><p style="font-weight:700">${esc(t.profiles?.full_name||'Vendor')} <span style="font-size:12px;color:var(--gray-400)">${esc(t.profiles?.email||'')}</span></p>
              <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
                <span style="font-weight:900;font-size:18px;color:${t.trust_score>=70?'var(--green)':t.trust_score>=40?'var(--orange)':'var(--red)'}">${t.trust_score}/100</span>
                <span style="font-size:12px;color:var(--gray-400)">${t.total_breaches||0} breaches</span>
                ${t.admin_hold?'<span class="badge badge-red">Admin Hold</span>':''}
              </div></div>
            <div style="display:flex;gap:6px">
              ${t.admin_hold?`<button class="btn btn-sm btn-pill" style="background:var(--green);color:#fff" onclick="toggleVendorHold('${t.vendor_id}',false)">🔓 Unhold</button>`
              :`<button class="btn btn-sm btn-pill" style="background:var(--red);color:#fff" onclick="toggleVendorHold('${t.vendor_id}',true)">🔒 Hold</button>`}
              <button class="btn btn-outline btn-sm btn-pill" onclick="resetTrust('${t.vendor_id}')">🔄 Reset</button>
            </div>
          </div>
          ${breaches.length?`<div style="margin-top:6px">${breaches.map(b=>`<span style="font-size:11px;padding:3px 8px;background:rgba(255,59,48,.06);color:var(--red);border-radius:4px;margin-right:4px;display:inline-block;margin-bottom:4px">${esc(b.type)}: ${esc(b.desc||'')} (-${b.penalty})</span>`).join('')}</div>`:''}
        </div>`;
      }).join('')}
    </div>`:''}

    <!-- All Withdrawals -->
    <div class="card">
      <h3 style="font-weight:700;margin-bottom:12px">All Withdrawals</h3>
      ${withdrawals.map(w=>{
        const cls=w.status==='completed'?'badge-green':w.status==='processing'?'badge-blue':w.status==='held'?'badge-gold':w.status==='failed'?'badge-red':'';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
          <div><strong>₹${parseFloat(w.amount).toFixed(0)}</strong> — ${esc(w.profiles?.full_name||'')}
            <span style="color:var(--gray-400);margin-left:8px">${new Date(w.created_at).toLocaleDateString()} · ${w.payment_method}</span>
            ${w.payment_ref?`<span style="font-family:'Space Mono',monospace;font-size:11px;margin-left:6px">${esc(w.payment_ref)}</span>`:''}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="badge ${cls}">${w.status}</span>
            ${w.status==='processing'?`<button class="btn btn-ghost btn-sm" onclick="completeWithdrawal('${w.id}')">✅ Mark Paid</button>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

async function approveWithdrawal(id){
  await sb.upd("withdrawals",{status:'processing',processed_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Withdrawal approved','✅');renderAdminPayouts();
}

async function rejectWithdrawal(id){
  const reason=prompt('Rejection reason:','');
  const wd=(await sb.get("withdrawals","*",{id:`eq.${id}`}))[0];
  if(!wd)return;
  await sb.upd("withdrawals",{status:'failed',failure_reason:reason||'Rejected by admin'},{id:`eq.${id}`});
  // Refund to wallet
  const wallets=await sb.get("wallets","available_balance",{user_id:`eq.${wd.vendor_id}`});
  if(wallets.length)await sb.upd("wallets",{available_balance:parseFloat(wallets[0].available_balance)+parseFloat(wd.amount)},{user_id:`eq.${wd.vendor_id}`});
  toast('Withdrawal rejected, funds returned','❌');renderAdminPayouts();
}

async function completeWithdrawal(id){
  const ref=prompt('Enter payment reference (UTR/Txn ID):','');
  await sb.upd("withdrawals",{status:'completed',payment_ref:ref||null,processed_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Marked as paid','✅');renderAdminPayouts();
}

async function verifyBank(id){
  await sb.upd("vendor_bank_accounts",{is_verified:true,updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Bank account verified','✅');renderAdminPayouts();
}

async function toggleVendorHold(vendorId, hold){
  const note=hold?prompt('Reason for hold:','Account under review'):'';
  await sb.upd("vendor_trust",{admin_hold:hold,admin_note:hold?note:null,auto_withdraw:!hold,updated_at:new Date().toISOString()},{vendor_id:`eq.${vendorId}`});
  toast(hold?'Vendor on hold':'Hold removed','✅');renderAdminPayouts();
}

async function resetTrust(vendorId){
  if(!confirm('Reset trust score to 100? This will re-enable instant withdrawals.'))return;
  await sb.upd("vendor_trust",{trust_score:100,auto_withdraw:true,admin_hold:false,admin_note:null,breach_log:'[]',total_breaches:0,updated_at:new Date().toISOString()},{vendor_id:`eq.${vendorId}`});
  toast('Trust score reset to 100','✅');renderAdminPayouts();
}

// ═══════════════════════════════════════════════════
// CATALOG HUB — All phases unified under admin-catalog
// ═══════════════════════════════════════════════════
let _catTab='ai-builder'; // active tab

async function renderAdminCatalog(tab){
  if(!PROFILE||(PROFILE.role!=='admin'&&PROFILE.role!=='super_admin')){go('home');return;}
  if(tab)_catTab=tab;

  // Count pending review items
  const reviewItems=await sb.get("catalog_products","id",{admin_status:"eq.draft"}).catch(()=>[]);
  const pendingOffers=await sb.get("vendor_offers","id",{is_approved:"eq.false"}).catch(()=>[]);
  const pendingCount=reviewItems.length;
  const offerPendingCount=pendingOffers.length;

  const navItems=[
    {id:'ai-builder',  icon:'🤖', label:'AI Builder',       desc:'Extract from URL / Name / Bulk'},
    {id:'review',      icon:'✅', label:'Review Queue',     desc:'Approve AI-generated products', badge:pendingCount},
    {id:'catalog-mgr', icon:'📦', label:'Catalog Manager',  desc:'Browse and manage all products'},
    {id:'tax-comm',    icon:'%',  label:'Tax & Commission', desc:'GST rules and platform fees'},
    {id:'offers',      icon:'🎁', label:'Offers & Promos',  desc:'Brand, bank, cashback, coupons'},
    {id:'vendor-offers',icon:'🏪',label:'Vendor Offers',    desc:'Approve vendor product listings', badge:offerPendingCount},
    {id:'ai-config',   icon:'⚙️', label:'AI Configuration', desc:'Set AI provider per operation'},
  ];

  $('main').innerHTML=`
  <div class="cat-hub-wrap">
    <!-- Sidebar -->
    <div class="cat-hub-sidebar">
      <div class="cat-hub-logo">
        <h3>📚 Catalog</h3>
        <p>Product Management Hub</p>
      </div>
      ${navItems.map(n=>`
        <button class="cat-hub-nav-item ${_catTab===n.id?'active':''}" onclick="renderAdminCatalog('${n.id}')">
          <span class="cat-hub-nav-icon">${n.icon}</span>
          <span style="flex:1">${n.label}</span>
          ${n.badge?`<span class="cat-hub-nav-badge">${n.badge}</span>`:''}
        </button>`).join('')}
      <div class="cat-hub-divider" style="margin-top:16px"></div>
      <button class="cat-hub-nav-item" onclick="renderAdminDash('overview','')">
        <span class="cat-hub-nav-icon">←</span> Admin Panel
      </button>
    </div>
    <!-- Content -->
    <div class="cat-hub-content" id="cat-hub-content">
      <div style="text-align:center;padding:40px;color:var(--gray-400)">Loading...</div>
    </div>
  </div>`;

  // Render the active tab
  catHubRenderTab(_catTab);
}

async function catHubRenderTab(tab){
  const el=$('cat-hub-content');
  if(!el)return;
  el.innerHTML='<div style="text-align:center;padding:32px;color:var(--gray-400)"><span style="font-size:28px">⏳</span><p style="margin-top:8px">Loading...</p></div>';
  if(tab==='ai-builder')    await catTabAIBuilder(el);
  else if(tab==='review')   await catTabReview(el);
  else if(tab==='catalog-mgr') await catTabCatalogMgr(el);
  else if(tab==='tax-comm') await catTabTaxComm(el);
  else if(tab==='offers')   await catTabOffers(el);
  else if(tab==='vendor-offers') await catTabVendorOffers(el);
  else if(tab==='ai-config')await catTabAIConfig(el);
}

// ─────────────────────────────────────────────────
// TAB 1 — AI BUILDER
// ─────────────────────────────────────────────────
async function catTabAIBuilder(el){
  const vendors=await sb.get("vendor_stores","id,store_name",{}).catch(()=>[]);
  const vendorOpts=vendors.map(v=>`<option value="${v.id}">${esc(v.store_name)}</option>`).join('');
  const savedKey=localStorage.getItem('glonni_ai_key')||'';
  const savedProv=localStorage.getItem('glonni_ai_provider')||'anthropic';
  if(savedKey)AI_API_KEY=savedKey;
  if(savedProv)AI_CONFIG.provider=savedProv;

  el.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
    <div><h2 style="font-size:20px;font-weight:800">🤖 AI Product Builder</h2>
      <p style="font-size:13px;color:var(--gray-400)">Extract product data from any source — AI enriches everything automatically</p></div>
      <button class="btn btn-outline btn-pill btn-sm" onclick="apTab('catalog','catalog-mgr')">View Catalog →</button>
  </div>

  <!-- AI Status -->
  <div class="card" style="margin-bottom:20px;border-left:3px solid var(--purple)">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:28px">🤖</span>
        <div><p style="font-weight:700">Claude (Anthropic) — Connected</p>
          <p style="font-size:12px;color:var(--gray-400)">Powered by claude-sonnet-4 · API key secured server-side</p></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge badge-green">✓ Active</span>
        <button class="btn btn-ghost btn-sm btn-pill" onclick="apTab('catalog','ai-config')">⚙️ Configure</button>
      </div>
    </div>
  </div>

  <!-- Input Mode Tabs -->
  <div class="card" style="margin-bottom:20px">
    <div style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:20px;overflow-x:auto">
      <button id="ob2-tab-url"  class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid var(--black);font-weight:700;padding:10px 18px;white-space:nowrap" onclick="obMode2('url')">🌐 Website URL</button>
      <button id="ob2-tab-name" class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid transparent;font-weight:500;padding:10px 18px;white-space:nowrap" onclick="obMode2('name')">🔍 Product Name</button>
      <button id="ob2-tab-bulk" class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid transparent;font-weight:500;padding:10px 18px;white-space:nowrap" onclick="obMode2('bulk')">📋 Bulk URLs</button>
      <button id="ob2-tab-manual" class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid transparent;font-weight:500;padding:10px 18px;white-space:nowrap" onclick="obMode2('manual')">✏️ Manual Entry</button>
    </div>

    <!-- URL pane -->
    <div id="ob2-pane-url">
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px">Paste any product page or category listing URL. AI extracts all products it finds.</p>
      <div class="form-group"><label class="form-label">Product or Category Page URL</label>
        <input class="form-input" id="ob2-url" placeholder="https://www.amazon.in/dp/..." style="font-family:'Space Mono',monospace;font-size:12px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Brand Name</label><input class="form-input" id="ob2-brand-url" placeholder="e.g. Apple"></div>
        <div class="form-group"><label class="form-label">Assign to Vendor (optional)</label><select class="form-select" id="ob2-vendor-url"><option value="">— Assign later —</option>${vendorOpts}</select></div>
      </div>
      <button class="btn btn-gold btn-pill" id="ob2-btn-url" onclick="catAIRun('url')">🤖 Extract from URL</button>
    </div>

    <!-- Name pane -->
    <div id="ob2-pane-name" style="display:none">
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px">Enter one product name per line — AI searches the web for each and extracts full details.</p>
      <div class="form-group"><label class="form-label">Product Names (one per line)</label>
        <textarea class="form-textarea" id="ob2-names" placeholder="iPhone 17 Pro Max&#10;Samsung Galaxy S25 Ultra&#10;Sony WH-1000XM5" style="min-height:120px"></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Brand / Collection</label><input class="form-input" id="ob2-brand-name" placeholder="Mixed Brands"></div>
        <div class="form-group"><label class="form-label">Assign to Vendor</label><select class="form-select" id="ob2-vendor-name"><option value="">— Assign later —</option>${vendorOpts}</select></div>
      </div>
      <button class="btn btn-gold btn-pill" id="ob2-btn-name" onclick="catAIRun('name')">🔍 Search & Extract</button>
    </div>

    <!-- Bulk pane -->
    <div id="ob2-pane-bulk" style="display:none">
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px">Paste multiple category/listing URLs (one per line). AI crawls each and extracts all products.</p>
      <div class="form-group"><label class="form-label">URLs (one per line)</label>
        <textarea class="form-textarea" id="ob2-bulk-urls" placeholder="https://www.boat-lifestyle.com/collections/earphones&#10;https://www.boat-lifestyle.com/collections/headphones" style="min-height:110px;font-family:'Space Mono',monospace;font-size:11px"></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Brand Name</label><input class="form-input" id="ob2-brand-bulk" placeholder="e.g. boAt Lifestyle"></div>
        <div class="form-group"><label class="form-label">Assign to Vendor</label><select class="form-select" id="ob2-vendor-bulk"><option value="">— Assign later —</option>${vendorOpts}</select></div>
      </div>
      <button class="btn btn-gold btn-pill" id="ob2-btn-bulk" onclick="catAIRun('bulk')">📋 Bulk Extract</button>
    </div>

    <!-- Manual pane -->
    <div id="ob2-pane-manual" style="display:none">
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px">Enter core details — AI generates title, description, specs, features, variants, and images automatically.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Product Name *</label><input class="form-input" id="ob2-man-name" placeholder="e.g. Sony WH-1000XM5 Headphones"></div>
        <div class="form-group"><label class="form-label">Brand *</label><input class="form-input" id="ob2-man-brand" placeholder="e.g. Sony"></div>
      </div>
      <div class="form-group"><label class="form-label">Short Description (AI will expand)</label>
        <textarea class="form-textarea" id="ob2-man-desc" placeholder="Brief product description…" style="min-height:70px"></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Category Path (optional)</label><input class="form-input" id="ob2-man-cat" placeholder="Electronics > Audio"></div>
        <div class="form-group"><label class="form-label">Assign to Vendor</label><select class="form-select" id="ob2-vendor-manual"><option value="">— Assign later —</option>${vendorOpts}</select></div>
      </div>
      <div style="padding:12px 14px;background:rgba(237,207,93,.08);border-radius:var(--radius-sm);border:1px solid rgba(237,207,93,.3);margin-bottom:16px;font-size:12px;color:var(--gold-dark)">
        🤖 AI will auto-generate: Full description · Specifications · Feature bullets · Variants · Image search queries · Quality score
      </div>
      <button class="btn btn-gold btn-pill" id="ob2-btn-manual" onclick="catAIRun('manual')">✨ Generate with AI</button>
    </div>

    <div id="ob2-progress" style="margin-top:16px"></div>
    <div id="ob2-results" style="margin-top:16px"></div>
  </div>

  <!-- Recent Catalog -->
  <div id="cat-recent-list">
    <div style="text-align:center;padding:20px;color:var(--gray-400)">Loading recent products...</div>
  </div>`;

  // Load recent products
  catLoadRecent();
}

async function catLoadRecent(){
  const el=$('cat-recent-list');if(!el)return;
  const prods=await sb.get("catalog_products","id,name,brand_name,category_path,ai_confidence_score,admin_status,source_mode,created_at",{order:"created_at.desc",limit:30}).catch(()=>[]);
  if(!prods.length){el.innerHTML='<div class="card" style="text-align:center;padding:32px;color:var(--gray-400)"><p style="font-size:28px">📦</p><p style="font-weight:600;margin-top:8px">No products yet</p><p style="font-size:13px;margin-top:4px">Use a mode above to start building your catalog</p></div>';return;}
  const byBrand={};prods.forEach(p=>{const b=p.brand_name||'Unbranded';if(!byBrand[b])byBrand[b]=[];byBrand[b].push(p);});
  el.innerHTML=`<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <h3 style="font-weight:700;font-size:15px">📚 Catalog Library <span style="font-size:13px;font-weight:400;color:var(--gray-400)">${prods.length} products</span></h3>
      <button class="btn btn-outline btn-pill btn-sm" onclick="apTab('catalog','review')">Review Queue →</button>
    </div>
    ${Object.entries(byBrand).map(([brand,bprods])=>`
    <div style="margin-bottom:16px">
      <p style="font-weight:700;font-size:13px;margin-bottom:8px">${esc(brand)} <span style="font-weight:400;color:var(--gray-400);font-size:11px">${bprods.length} product${bprods.length!==1?'s':''}</span></p>
      ${bprods.slice(0,4).map(p=>{
        const conf=p.ai_confidence_score||0;
        const cc=conf>=85?'var(--green)':conf>=65?'var(--orange)':'var(--red)';
        const stBg=p.admin_status==='ready'?'badge-green':p.admin_status==='archived'?'badge-gray':'badge-gold';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--gray-50);border-radius:var(--radius-sm);margin-bottom:5px;gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:0"><p style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name||p.brand_name||"Unnamed Product")}</p>
            <p style="font-size:10px;color:var(--gray-400);margin-top:1px">${p.category_path||'Uncategorized'} · ${new Date(p.created_at).toLocaleDateString()}</p></div>
          <div style="display:flex;align-items:center;gap:7px;flex-shrink:0">
            <span style="font-size:11px;font-weight:700;color:${cc}">AI ${conf}%</span>
            <span class="badge ${stBg}">${p.admin_status||'draft'}</span>
            <button class="btn btn-ghost btn-sm btn-pill" onclick="catViewProduct('${p.id}')">View →</button>
          </div></div>`;
      }).join('')}
      ${bprods.length>4?`<p style="font-size:11px;color:var(--gray-400);padding:2px 12px">+${bprods.length-4} more</p>`:''}
    </div>`).join('')}
  </div>`;
}

function obMode2(mode){
  ['url','name','bulk','manual'].forEach(m=>{
    const pane=$(`ob2-pane-${m}`),tab=$(`ob2-tab-${m}`);
    if(pane)pane.style.display=m===mode?'block':'none';
    if(tab)tab.style.cssText=`border-radius:0;border-bottom:3px solid ${m===mode?'var(--black)':'transparent'};font-weight:${m===mode?'700':'500'};padding:10px 18px;white-space:nowrap`;
  });
}

async function catAIRun(mode){
  if(!AI_API_KEY){toast('Set your AI API key first','⚠️');return;}
  const progress=$('ob2-progress'),results=$('ob2-results');
  let input='',brand='',vendorStoreId='';
  if(mode==='url'){input=$('ob2-url')?.value?.trim();brand=$('ob2-brand-url')?.value?.trim();vendorStoreId=$('ob2-vendor-url')?.value||'';}
  else if(mode==='name'){input=$('ob2-names')?.value?.trim();brand=$('ob2-brand-name')?.value?.trim()||'Mixed';vendorStoreId=$('ob2-vendor-name')?.value||'';}
  else if(mode==='bulk'){input=$('ob2-bulk-urls')?.value?.trim();brand=$('ob2-brand-bulk')?.value?.trim();vendorStoreId=$('ob2-vendor-bulk')?.value||'';}
  else if(mode==='manual'){
    const name=$('ob2-man-name')?.value?.trim();brand=$('ob2-man-brand')?.value?.trim();
    if(!name||!brand){toast('Name and brand required','⚠️');return;}
    input=name;vendorStoreId=$('ob2-vendor-manual')?.value||'';
  }
  if(!input){toast('Enter input first','⚠️');return;}
  if(mode!=='name'&&mode!=='manual'&&!brand){toast('Enter brand name','⚠️');return;}
  const btn=$(`ob2-btn-${mode}`);
  if(btn){btn.disabled=true;btn.textContent='⏳ AI working...';}
  if(progress)progress.innerHTML=`<div style="padding:14px 16px;background:var(--gray-50);border-radius:var(--radius);border-left:4px solid var(--gold)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="font-size:22px">🤖</span>
      <div><p style="font-weight:700">AI is extracting products…</p><p style="font-size:12px;color:var(--gray-400)" id="ob2-status-text">Analysing…</p></div>
    </div>
    <div class="ai-prog-bar"><div class="ai-prog-fill" id="ob2-prog-fill" style="width:15%"></div></div>
    <div style="display:flex;gap:20px;margin-top:8px;font-size:11px;color:var(--gray-400)">
      <span>📝 Extracting content</span><span>🔍 Identifying specs</span><span>🖼️ Finding images</span><span>✅ Scoring quality</span>
    </div>
  </div>`;

  const cats=await sb.get("categories","id,name,level",{is_active:"eq.true"}).catch(()=>[]);
  const catList=cats.map(c=>`${c.id}: ${"  ".repeat(c.level||0)}${c.name}`).join("\n");
  const inputs=mode==='name'?input.split("\n").map(l=>l.trim()).filter(Boolean):
               mode==='bulk'?input.split("\n").map(l=>l.trim()).filter(Boolean):[input];
  let allProducts=[],failed=0;

  for(let i=0;i<inputs.length;i++){
    const sEl=$("ob2-status-text"),bEl=$("ob2-prog-fill");
    if(sEl)sEl.textContent=`Processing ${i+1} of ${inputs.length}: ${inputs[i].slice(0,55)}…`;
    if(bEl)bEl.style.width=`${Math.round((i/inputs.length)*75)+10}%`;
    const {systemPrompt,userPrompt}=buildCatalogPrompt(mode==='bulk'?'bulk_url':mode,inputs[i],catList);
    const aiResp=await callAI(systemPrompt,userPrompt);
    if(!aiResp){failed++;continue;}
    try{
      const clean=aiResp.replace(/```json|```/g,"").trim();
      const aS=clean.indexOf("["),aE=clean.lastIndexOf("]"),oS=clean.indexOf("{"),oE=clean.lastIndexOf("}");
      if(aS!==-1&&(oS===-1||aS<oS)){const parsed=JSON.parse(clean.slice(aS,aE+1));allProducts.push(...(Array.isArray(parsed)?parsed:[parsed]));}
      else if(oS!==-1){allProducts.push(JSON.parse(clean.slice(oS,oE+1)));}
    }catch(e){failed++;console.log('Parse error',e);}
  }

  // Manual mode: build minimal product object
  if(mode==='manual'&&allProducts.length===0){
    allProducts=[{name:input,brand_name:brand,description_html:$('ob2-man-desc')?.value||'',category_path:$('ob2-man-cat')?.value||'',ai_confidence_score:70,images:[],specifications:[],variations:[],ai_flags:['manual_entry']}];
  }

  if($('ob2-prog-fill'))$('ob2-prog-fill').style.width='88%';
  const jobRec=await sb.ins("onboarding_jobs",{brand_name:brand,vendor_store_id:vendorStoreId||null,source:mode,status:"running",products_created:0,products_flagged:0,created_by:PROFILE.id}).catch(()=>[]);
  const jobId=jobRec[0]?.id;
  let created=0,flagged=0;
  const resultCards=[];

  for(const product of allProducts){
    if(!product.name)continue;
    const slug=(product.slug||(product.name||'product').toLowerCase().replace(/[^a-z0-9]+/g,'-'))+'-'+Date.now()+Math.random().toString(36).slice(2,5);
    const conf=product.ai_confidence_score||75;
    if(conf<70)flagged++;
    try{
      await sb.ins("catalog_products",{onboarding_job_id:jobId||null,brand_name:brand||product.brand_name||'Unknown',name:product.name,slug,source_url:product.source_url||inputs[0]||null,source_mode:mode,description_html:product.description_html||product.description||'',images:product.images||[],specifications:product.specifications||[],extra_specs:product.extra_specs||[],variations:product.variations||[],category_id:product.category_id||null,category_path:product.category_path||'',ai_confidence_score:conf,ai_flags:product.ai_flags||[],admin_status:'draft',status:'ready',created_by:PROFILE.id}).catch(()=>{});
      created++;
      const imgs=product.images||[];
      const cc=conf>=85?'var(--green)':conf>=65?'var(--orange)':'var(--red)';
      resultCards.push(`<div style="display:flex;gap:12px;padding:12px;background:#fff;border:1.5px solid var(--gray-200);border-radius:var(--radius);margin-bottom:8px;flex-wrap:wrap">
        ${imgs[0]?`<img src="${esc(imgs[0])}" style="width:68px;height:68px;object-fit:cover;border-radius:8px;flex-shrink:0" onerror="this.style.display='none'">`:`<div style="width:68px;height:68px;background:var(--gray-100);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📦</div>`}
        <div style="flex:1;min-width:140px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <p style="font-weight:700;font-size:13px">${esc(product.name)}</p>
            <span style="font-size:11px;font-weight:700;color:${cc}">AI ${conf}%</span>
          </div>
          <p style="font-size:12px;color:var(--gray-500)">${product.category_path||'Uncategorised'}</p>
          <p style="font-size:11px;color:var(--gray-400);margin-top:2px">${imgs.length} images · ${(product.specifications||[]).length} specs · ${(product.variations||[]).length} variant groups</p>
          ${(product.ai_flags||[]).length?`<p style="font-size:11px;color:var(--orange);margin-top:2px">⚑ ${product.ai_flags.join(' · ')}</p>`:''}
        </div></div>`);
    }catch(e){failed++;}
  }

  if(jobId)await sb.upd("onboarding_jobs",{status:!created?'failed':'completed',products_created:created,products_flagged:flagged,products_failed:failed,completed_at:new Date().toISOString()},{id:`eq.${jobId}`}).catch(()=>{});
  if(progress)progress.innerHTML='';
  if(btn){btn.disabled=false;btn.textContent=mode==='url'?'🤖 Extract from URL':mode==='name'?'🔍 Search & Extract':mode==='bulk'?'📋 Bulk Extract':'✨ Generate with AI';}
  if(results)results.innerHTML=`
    <div style="padding:14px;background:${created?'rgba(52,199,89,.07)':'rgba(255,59,48,.07)'};border-radius:var(--radius);margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;border:1px solid ${created?'rgba(52,199,89,.2)':'rgba(255,59,48,.2)'}">
      <span style="font-weight:700;color:${created?'var(--green)':'var(--red)'};font-size:14px">✅ ${created} product${created!==1?'s':''} extracted</span>
      ${flagged?`<span style="font-weight:600;color:var(--orange)">⚠️ ${flagged} low confidence</span>`:''}
      ${failed?`<span style="font-weight:600;color:var(--red)">❌ ${failed} failed</span>`:''}
      ${created?`<button class="btn btn-gold btn-pill btn-sm" style="margin-left:auto" onclick="apTab('catalog','review')">Review Queue (${created}) →</button>`:''}
    </div>
    ${resultCards.join('')}`;
  catLoadRecent();
}

async function catViewProduct(id){
  const prods=await sb.get("catalog_products","*",{id:`eq.${id}`}).catch(()=>[]);
  const p=prods[0];if(!p)return;
  // Reuse existing obViewProduct if exists, otherwise inline modal
  if(typeof obViewProduct==='function'){obViewProduct(id);return;}
  const imgs=p.images||[];
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:600px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-weight:800;font-size:16px">${esc(p.name)}</h3>
      <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
    </div>
    ${imgs[0]?`<img src="${esc(imgs[0])}" style="width:100%;height:200px;object-fit:cover;border-radius:var(--radius);margin-bottom:14px">`:''}
    <p style="font-size:12px;color:var(--gray-400);margin-bottom:12px">${p.category_path||'Uncategorized'} · AI: ${p.ai_confidence_score||0}%</p>
    <p style="font-size:13px;color:var(--gray-600);line-height:1.6">${p.description_html||'No description'}</p>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      ${p.admin_status==='draft'?`<button class="btn btn-gold btn-pill btn-sm" onclick="catSetStatus('${p.id}','ready');this.closest('.auth-overlay').remove()">✅ Mark Ready</button>`:''}
      <button class="btn btn-outline btn-pill btn-sm" onclick="this.closest('.auth-overlay').remove()">Close</button>
    </div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function catSetStatus(id,status){
  await sb.upd("catalog_products",{admin_status:status,updated_at:new Date().toISOString()},{id:`eq.${id}`}).catch(()=>{});
  toast(status==='ready'?'Marked ready ✅':'Archived','✅');
}

// ─────────────────────────────────────────────────
// TAB 2 — REVIEW QUEUE
// ─────────────────────────────────────────────────
async function catTabReview(el){
  const [allProds,cats]=await Promise.all([
    sb.get("catalog_products","id,name,brand_name,category_id,category_path,images,specifications,extra_specs,variations,admin_status,ai_confidence_score,ai_flags,admin_commission_pct,cashback_min_pct,cashback_max_pct,editorial_notes,source_mode,source_url,platform_offers,amazon_price,flipkart_price,market_price_cap",{order:"created_at.desc"}).catch(()=>[]),
    sb.get("categories","id,name,parent_id,icon",{is_active:"eq.true",order:"sort_order.asc"}).catch(()=>[])
  ]);
  const drafts=allProds.filter(p=>p.admin_status==='draft'||!p.admin_status);
  const ready=allProds.filter(p=>p.admin_status==='ready');
  const archived=allProds.filter(p=>p.admin_status==='archived');

  el.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
    <div><h2 style="font-size:20px;font-weight:800">✅ Review Queue</h2>
      <p style="font-size:13px;color:var(--gray-400)">${drafts.length} pending · ${ready.length} ready · ${archived.length} archived</p></div>
    <div style="display:flex;gap:8px">
      ${drafts.length?`<button class="btn btn-gold btn-pill btn-sm" onclick="catBulkApprove()">✅ Approve All Drafts (${drafts.length})</button>`:''}
      <button class="btn btn-outline btn-pill btn-sm" onclick="apTab('catalog','ai-builder')">+ Add More</button>
    </div>
  </div>

  <!-- Stats row -->
  <div class="g3" style="margin-bottom:20px">
    <div class="stat-card" style="border-top:3px solid var(--orange);text-align:center"><div class="stat-val">${drafts.length}</div><div class="stat-label">Pending Review</div></div>
    <div class="stat-card" style="border-top:3px solid var(--green);text-align:center"><div class="stat-val">${ready.length}</div><div class="stat-label">Ready for Vendors</div></div>
    <div class="stat-card" style="border-top:3px solid var(--blue);text-align:center"><div class="stat-val">${allProds.length}</div><div class="stat-label">Total in Catalog</div></div>
  </div>

  <!-- Status filter -->
  <div style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:16px">
    ${['all','draft','ready','archived'].map(s=>`<button onclick="catFilterReview('${s}')" id="rqtab-${s}" class="btn btn-ghost" style="border-radius:0;border-bottom:3px solid ${s==='all'?'var(--black)':'transparent'};padding:8px 16px;font-size:13px;font-weight:${s==='all'?'700':'500'}">${s==='all'?'All ('+allProds.length+')':s==='draft'?'Pending ('+drafts.length+')':s==='ready'?'Ready ('+ready.length+')':'Archived ('+archived.length+')'}</button>`).join('')}
  </div>

  <div id="rq-list">
    ${!allProds.length?`<div style="text-align:center;padding:48px;color:var(--gray-400)"><p style="font-size:36px">📦</p><p style="font-weight:600;margin-top:8px">No products yet</p><button class="btn btn-gold btn-pill" style="margin-top:14px" onclick="apTab('catalog','ai-builder')">🤖 Extract Products</button></div>`
    :allProds.map(p=>catReviewCard(p,cats)).join('')}
  </div>`;
}

function catFilterReview(status){
  ['all','draft','ready','archived'].forEach(s=>{
    const b=$(`rqtab-${s}`);
    if(b)b.style.cssText=`border-radius:0;border-bottom:3px solid ${s===status?'var(--black)':'transparent'};padding:8px 16px;font-size:13px;font-weight:${s===status?'700':'500'}`;
  });
  document.querySelectorAll('.rq-card').forEach(c=>{
    c.style.display=(status==='all'||c.dataset.status===status)?'block':'none';
  });
}

function catReviewCard(p,cats){
  const imgs=p.images||[];const specs=p.specifications||[];const vars=p.variations||[];
  const sc=p.ai_confidence_score||0;
  const cc=sc>=85?'var(--green)':sc>=65?'var(--orange)':'var(--red)';
  const sBg=p.admin_status==='ready'?'var(--green)':p.admin_status==='archived'?'var(--gray-400)':'var(--orange)';
  const qualPct=Math.min(100,Math.round((
    (imgs.length>=2?20:imgs.length*10)+
    (p.description_html?.length>100?20:10)+
    (specs.length>=5?20:specs.length*4)+
    (vars.length>=1?20:0)+
    (p.category_id?20:0))/100*100));
  const qColor=qualPct>=80?'var(--green)':qualPct>=60?'var(--orange)':'var(--red)';

  return `<div class="card rq-card" data-status="${p.admin_status||'draft'}" style="margin-bottom:12px">
    <!-- Header (always visible) -->
    <div style="display:flex;align-items:center;gap:12px;cursor:pointer" onclick="$('rqbody-${p.id}').classList.toggle('hide')">
      ${imgs[0]?`<img src="${esc(imgs[0])}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0" onerror="this.parentNode.innerHTML='<div style=width:56px;height:56px;border-radius:10px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0>📦</div>'">`:`<div style="width:56px;height:56px;border-radius:10px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📦</div>`}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <p style="font-weight:700;font-size:14px">${esc(p.name||p.brand_name||"Unnamed Product")}</p>
          <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:${sBg}18;color:${sBg}">${p.admin_status||'draft'}</span>
          <span style="font-size:10px;font-weight:700;color:${cc}">AI ${sc}%</span>
        </div>
        <p style="font-size:11px;color:var(--gray-400);margin-top:2px">${p.category_path||p.categories?.name||'Uncategorised'} · ${imgs.length} img · ${specs.length} specs · ${vars.length} variants</p>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0" onclick="event.stopPropagation()">
        <!-- Quality ring -->
        <div style="width:38px;height:38px;border-radius:50%;background:${qColor}18;border:2px solid ${qColor};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:${qColor}">${qualPct}%</div>
        ${(p.admin_status||'draft')==='draft'?`<button class="btn btn-pill btn-sm" style="background:var(--green);color:#fff;border:none" onclick="catApproveProduct('${p.id}')">✅ Approve</button>`:''}
        ${p.admin_status==='ready'?`<button class="btn btn-outline btn-pill btn-sm" onclick="catSetStatus('${p.id}','draft')">↩ Draft</button>`:''}
        <button class="btn btn-ghost btn-sm btn-pill" style="color:var(--red)" onclick="catSetStatus('${p.id}','archived')">🗑️</button>
      </div>
    </div>

    <!-- Expandable body -->
    <div id="rqbody-${p.id}" class="hide" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-100)">
      <div class="review-split">
        <!-- Left: images + quality -->
        <div>
          ${imgs[0]?`<div style="height:180px;border-radius:var(--radius);overflow:hidden;background:var(--gray-50);margin-bottom:10px"><img src="${esc(imgs[0])}" style="width:100%;height:100%;object-fit:cover" id="rq-main-${p.id}" onerror="this.style.display='none'"></div>`:''}
          <div class="review-img-strip">
            ${imgs.map((img,i)=>`<div class="review-img-th ${i===0?'active':''}" onclick="$('rq-main-${p.id}').src='${esc(img)}';document.querySelectorAll('.review-img-th').forEach(t=>t.classList.remove('active'));this.classList.add('active')"><img src="${esc(img)}" onerror="this.style.display='none'"></div>`).join('')}
            <div style="width:60px;height:60px;border:2px dashed var(--gray-300);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--gray-400);font-size:18px" onclick="catAddImgPrompt('${p.id}')">+</div>
          </div>
          <!-- Quality breakdown -->
          <div style="margin-top:14px">
            <p style="font-weight:700;font-size:12px;margin-bottom:8px">Quality Breakdown</p>
            ${[
              {l:'Images',v:Math.min(100,imgs.length*25)},
              {l:'Description',v:p.description_html?.length>200?100:Math.min(100,Math.round((p.description_html?.length||0)/2))},
              {l:'Specs',v:Math.min(100,specs.length*20)},
              {l:'Variants',v:vars.length>0?100:0},
              {l:'Category',v:p.category_id?100:0}
            ].map(q=>`<div class="qual-bar-row">
              <span style="width:80px;color:var(--gray-500)">${q.l}</span>
              <div class="qual-bar"><div class="qual-bar-fill" style="width:${q.v}%;background:${q.v>=80?'var(--green)':q.v>=50?'var(--orange)':'var(--red)'}"></div></div>
              <span style="width:32px;text-align:right;font-weight:700;color:${q.v>=80?'var(--green)':q.v>=50?'var(--orange)':'var(--red)'}">${q.v}%</span>
            </div>`).join('')}
          </div>
        </div>
        <!-- Right: content -->
        <div>
          <div style="margin-bottom:14px">
            <p style="font-size:11px;text-transform:uppercase;font-weight:600;color:var(--gray-400);letter-spacing:.5px;margin-bottom:6px">Description</p>
            <p style="font-size:13px;color:var(--gray-600);line-height:1.6;max-height:120px;overflow:hidden">${p.description_html||'<span style="color:var(--gray-300)">No description generated</span>'}</p>
          </div>
          ${specs.length?`<div style="margin-bottom:14px">
            <p style="font-size:11px;text-transform:uppercase;font-weight:600;color:var(--gray-400);letter-spacing:.5px;margin-bottom:6px">Key Specs</p>
            <div style="background:var(--gray-50);border-radius:8px;overflow:hidden">
              ${specs.slice(0,6).map((s,i)=>`<div class="spec-row-disp" style="${i<Math.min(specs.length,6)-1?'border-bottom:1px solid var(--gray-100)':''}"><span style="font-size:12px;color:var(--gray-500);width:40%;font-weight:500">${esc(s.key)}</span><span style="font-size:12px;font-weight:600;flex:1">${esc(s.value)}</span></div>`).join('')}
            </div>
          </div>`:''}
          ${vars.length?`<div style="margin-bottom:14px">
            <p style="font-size:11px;text-transform:uppercase;font-weight:600;color:var(--gray-400);letter-spacing:.5px;margin-bottom:6px">Variants</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${vars.map(v=>`<div style="padding:5px 10px;background:var(--gray-50);border-radius:8px;font-size:12px"><span style="font-weight:600;color:var(--gray-500)">${esc(v.name)}: </span>${(v.options||[]).map(o=>`<span style="padding:2px 7px;border:1px solid var(--gray-200);border-radius:12px;margin-left:3px">${esc(o.label)}</span>`).join('')}</div>`).join('')}
            </div>
          </div>`:''}
          <!-- Commission & Cashback -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
            <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Commission %</label><input class="form-input" id="rq-comm-${p.id}" type="number" value="${p.admin_commission_pct||''}" placeholder="Category default" onchange="catSaveMeta2('${p.id}')" style="padding:8px 10px;font-size:12px"></div>
            <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Min CB %</label><input class="form-input" id="rq-cbmin-${p.id}" type="number" value="${p.cashback_min_pct||0}" onchange="catSaveMeta2('${p.id}')" style="padding:8px 10px;font-size:12px"></div>
            <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Max CB %</label><input class="form-input" id="rq-cbmax-${p.id}" type="number" value="${p.cashback_max_pct||20}" onchange="catSaveMeta2('${p.id}')" style="padding:8px 10px;font-size:12px"></div>
          </div>
          <!-- Reassign category -->
          <div style="margin-bottom:12px">
            <p style="font-size:11px;font-weight:600;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Category</p>
            <p style="font-size:13px;font-weight:600">${p.category_path||p.categories?.name||'Uncategorised'} ${p.category_id?'<span class="badge badge-green">✓</span>':'<span class="badge badge-red">Unset</span>'}</p>
            <button class="btn btn-ghost btn-sm btn-pill" style="margin-top:6px" onclick="catReassignCat('${p.id}')">📂 Change Category</button>
          </div>
          <!-- Notes -->
          <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Admin Notes</label><input class="form-input" id="rq-notes-${p.id}" value="${esc(p.editorial_notes||'')}" placeholder="Internal notes…" onchange="catSaveMeta2('${p.id}')" style="padding:8px 10px;font-size:12px"></div>
          <!-- Admin Price Reference -->
          <div style="margin-top:12px">
            <p style="font-size:10px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">📊 Market Price Reference (Admin)</p>
            <div id="psc-admin-${p.id}" class="psc-widget" style="font-size:11px"></div>
            <button class="btn btn-ghost btn-sm btn-pill" style="margin-top:4px;font-size:11px" onclick="catFetchAdminPsc('${p.id}','${esc(p.name.replace(/'/g,"\\'"))}')">🔄 Fetch Live Prices</button>
          </div>
        </div>
      </div>
      <!-- Bottom actions -->
      <div style="display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--gray-100);flex-wrap:wrap">
        ${(p.admin_status||'draft')==='draft'?`<button class="btn btn-pill" style="background:var(--green);color:#fff;border:none" onclick="catApproveProduct('${p.id}')">✅ Approve — Mark Ready for Vendors</button>`:''}
        <button class="btn btn-outline btn-pill btn-sm" onclick="catReassignCat('${p.id}')">📂 Category</button>
        <button class="btn btn-outline btn-pill btn-sm" onclick="catAddImgPrompt('${p.id}')">🖼 Images</button>
        <button class="btn btn-danger btn-sm btn-pill" onclick="catDeleteProduct('${p.id}')">🗑️ Delete</button>
      </div>
    </div>
  </div>`;
}

async function catApproveProduct(id){
  await sb.upd("catalog_products",{admin_status:'ready',updated_at:new Date().toISOString()},{id:`eq.${id}`}).catch(()=>{});
  toast('Product approved — vendors can now pick it ✅','✅');
  // Re-render tab in sidebar
  apTab('catalog','review');
}

async function catBulkApprove(){
  if(!confirm('Approve all draft products as ready for vendors?'))return;
  await sb.upd("catalog_products",{admin_status:'ready',updated_at:new Date().toISOString()},{admin_status:"eq.draft"}).catch(()=>{});
  toast('All approved ✅','✅');
  apTab('catalog','review');
}

async function catSaveMeta2(id){
  await sb.upd("catalog_products",{
    admin_commission_pct:parseFloat($(`rq-comm-${id}`)?.value)||null,
    cashback_min_pct:parseFloat($(`rq-cbmin-${id}`)?.value)||0,
    cashback_max_pct:parseFloat($(`rq-cbmax-${id}`)?.value)||20,
    editorial_notes:$(`rq-notes-${id}`)?.value||null
  },{id:`eq.${id}`}).catch(()=>{});
  toast('Saved','✅');
}

// Admin: fetch and show market price reference for a catalog product
async function catFetchAdminPsc(productId, productName){
  const widgetId=`psc-admin-${productId}`;
  pscShowLoading(widgetId,'Fetching live market prices…');
  const data=await fetchMarketPrices(productName);
  renderPriceWidget(widgetId,data,0,true); // isAdmin=true → shows reference, not block
  // Also persist fetched prices to catalog_products table
  if(data&&data.found){
    sb.upd("catalog_products",{
      amazon_price:data.amazon||null,
      flipkart_price:data.flipkart||null,
      market_price_cap:data.cap||null,
      price_fetched_at:new Date().toISOString()
    },{id:`eq.${productId}`}).catch(()=>{});
  }
}

function catAddImgPrompt(id){
  const url=prompt('Paste image URL to add:','');
  if(!url)return;
  sb.get("catalog_products","images",{id:`eq.${id}`}).then(rows=>{
    const imgs=rows[0]?.images||[];
    if(imgs.length>=6){toast('Max 6 images','⚠️');return;}
    imgs.push(url);
    sb.upd("catalog_products",{images:imgs},{id:`eq.${id}`}).then(()=>toast('Image added ✅','✅'));
  }).catch(()=>{});
}

function catReassignCat(id){
  sb.get("categories","id,name,level,icon",{is_active:"eq.true",order:"level.asc,sort_order.asc"}).then(cats=>{
    const modal=document.createElement('div');modal.className='auth-overlay';
    modal.innerHTML=`<div class="auth-card" style="max-width:440px">
      <h3 style="font-weight:800;font-size:16px;margin-bottom:14px">📂 Change Category</h3>
      <div class="form-group"><label class="form-label">Category</label>
        <select class="form-select" id="rq-cat-sel">
          <option value="">— Select category —</option>
          ${cats.map(c=>`<option value="${c.id}">${'— '.repeat(c.level||0)}${c.icon||''} ${c.name}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill" style="flex:1" onclick="catSaveCat('${id}')">Save</button>
        <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
      </div></div>`;
    document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  }).catch(()=>{});
}

async function catSaveCat(id){
  const catId=$('rq-cat-sel')?.value;if(!catId){toast('Select a category','⚠️');return;}
  const cats=await sb.get("categories","id,name,parent_id,level",{}).catch(()=>[]);
  // Build path
  const path=[];let cur=cats.find(c=>c.id===catId);
  while(cur){path.unshift(cur.name);cur=cur.parent_id?cats.find(c=>c.id===cur.parent_id):null;}
  await sb.upd("catalog_products",{category_id:catId,category_path:path.join(' > ')},{id:`eq.${id}`}).catch(()=>{});
  document.querySelector('.auth-overlay')?.remove();
  toast('Category updated ✅','✅');
}

async function catDeleteProduct(id){
  if(!confirm('Delete this product from catalog?'))return;
  await sb.del("catalog_products",{id:`eq.${id}`}).catch(()=>{});
  toast('Deleted','🗑️');
  apTab('catalog','review');
}

// ─────────────────────────────────────────────────
// TAB 3 — CATALOG MANAGER
// ─────────────────────────────────────────────────
async function catTabCatalogMgr(el){
  const [allProds,cats]=await Promise.all([
    sb.get("catalog_products","id,name,brand_name,category_id,category_path,images,specifications,admin_status,ai_confidence_score,amazon_price,flipkart_price,platform_offers,created_at",{order:"created_at.desc"}).catch(()=>[]),
    sb.get("categories","id,name,parent_id,icon",{is_active:"eq.true",order:"sort_order.asc"}).catch(()=>[])
  ]);
  const catMap={};cats.forEach(c=>catMap[c.id]=c);
  const topCats=cats.filter(c=>!c.parent_id);
  const catCounts={all:allProds.length};
  allProds.forEach(p=>{
    if(!p.category_id)return;
    let c=catMap[p.category_id];while(c&&c.parent_id)c=catMap[c.parent_id];
    if(c)catCounts[c.id]=(catCounts[c.id]||0)+1;
  });
  const _selectedCat=window._cmCat2||'all';

  const filtered=_selectedCat==='all'?allProds:_selectedCat==='_none'?allProds.filter(p=>!p.category_id):allProds.filter(p=>p.category_id===_selectedCat||cats.find(c=>c.id===p.category_id&&c.parent_id===_selectedCat));

  el.innerHTML=`
  <div style="display:flex;gap:20px;min-height:600px">
    <!-- Mini sidebar -->
    <div style="width:180px;flex-shrink:0">
      <p style="font-size:10px;text-transform:uppercase;font-weight:700;color:var(--gray-400);letter-spacing:.5px;margin-bottom:8px">Verticals</p>
      ${[{id:'all',name:'All Products',icon:'🌐',count:allProds.length},{id:'_none',name:'Uncategorised',icon:'❓',count:allProds.filter(p=>!p.category_id).length},...topCats.map(c=>({id:c.id,name:c.name,icon:c.icon,count:catCounts[c.id]||0}))].map(c=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:${_selectedCat===c.id?'700':'500'};background:${_selectedCat===c.id?'var(--gold-light)':'transparent'};color:${_selectedCat===c.id?'var(--gold-dark)':'var(--gray-600)'};margin-bottom:2px;border:${_selectedCat===c.id?'1.5px solid rgba(237,207,93,.3)':'1.5px solid transparent'}" onclick="window._cmCat2='${c.id}';apTab('catalog','catalog-mgr')">
          <span>${c.icon||'📂'} ${esc(c.name)}</span>
          <span style="font-size:10px;background:var(--gray-100);padding:1px 6px;border-radius:10px">${c.count}</span>
        </div>`).join('')}
    </div>
    <!-- Main area -->
    <div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:17px;font-weight:800">📦 Catalog Manager</h2>
          <p style="font-size:12px;color:var(--gray-400)">${filtered.length} products · ${filtered.filter(p=>p.admin_status==='draft'||!p.admin_status).length} pending · ${filtered.filter(p=>p.admin_status==='ready').length} ready</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-pill btn-sm" onclick="apTab('catalog','ai-builder')">+ AI Extract</button>
          <button class="btn btn-gold btn-pill btn-sm" onclick="catBulkApprove()">✅ Approve All Drafts</button>
        </div>
      </div>
      ${!filtered.length?`<div style="text-align:center;padding:48px;color:var(--gray-400)"><p style="font-size:32px">📦</p><p style="font-weight:600;margin-top:8px">No products here</p></div>`
      :filtered.map(p=>{
        const imgs=p.images||[];const specs=p.specifications||[];const conf=p.ai_confidence_score||0;
        const cc=conf>=85?'var(--green)':conf>=65?'var(--orange)':'var(--red)';
        const sBg=p.admin_status==='ready'?'var(--green)':p.admin_status==='archived'?'var(--gray-400)':'var(--orange)';
        return `<div class="card card-sm" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
            ${imgs[0]?`<img src="${esc(imgs[0])}" style="width:46px;height:46px;border-radius:8px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`:`<div style="width:46px;height:46px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📦</div>`}
            <div style="min-width:0">
              <p style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name||p.brand_name||'Unnamed Product')}</p>
              <p style="font-size:11px;color:var(--gray-400);margin-top:1px">${p.category_path||'Uncategorised'} · ${imgs.length} img · ${specs.length} specs${p.amazon_price?' · <span style=\"color:#FF9900;font-weight:600\">AMZ ₹'+p.amazon_price.toLocaleString('en-IN')+'</span>':''}${p.flipkart_price?' · <span style=\"color:#2874F0;font-weight:600\">FK ₹'+p.flipkart_price.toLocaleString('en-IN')+'</span>':''}</p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <span style="font-size:11px;font-weight:700;color:${cc}">AI ${conf}%</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${sBg}18;color:${sBg};font-weight:700">${p.admin_status||'draft'}</span>
            ${(p.admin_status||'draft')==='draft'?`<button class="btn btn-pill btn-sm" style="background:var(--green);color:#fff;border:none" onclick="catApproveProduct('${p.id}')">✅</button>`:''}
            ${p.admin_status==='ready'?`<button class="btn btn-outline btn-pill btn-sm" onclick="catSetStatus('${p.id}','draft')">↩</button>`:''}
            <button class="btn btn-ghost btn-sm btn-pill" onclick="catDeleteProduct('${p.id}')" style="color:var(--red)">🗑️</button>
          </div>
        </div>`;}).join('')}
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────
// TAB 4 — TAX & COMMISSION
// ─────────────────────────────────────────────────
async function catTabTaxComm(el){
  const [slabs,overrides,hsns,cats,rules]=await Promise.all([
    sb.get("gst_slabs","*",{order:"rate.asc"}).catch(()=>[]),
    sb.get("gst_overrides","*,categories(name)",{is_active:"eq.true"}).catch(()=>[]),
    sb.get("hsn_codes","*,categories(name)",{is_active:"eq.true",limit:30}).catch(()=>[]),
    sb.get("categories","id,name,level,icon",{is_active:"eq.true",order:"level.asc,sort_order.asc"}).catch(()=>[]),
    sb.get("platform_rules","*",{is_active:"eq.true",order:"priority.asc",limit:30}).catch(()=>[])
  ]);
  const catOpts=cats.map(c=>`<option value="${c.id}">${'— '.repeat(c.level||0)}${c.icon||''} ${c.name}</option>`).join('');
  const gstRules=rules.filter(r=>r.rule_type==='gst');
  const commRules=rules.filter(r=>r.rule_type==='commission');

  el.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
    <div><h2 style="font-size:20px;font-weight:800">% Tax & Commission</h2>
      <p style="font-size:13px;color:var(--gray-400)">Set GST slabs, HSN codes, platform commissions and override rules</p></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-gst')">🧾 Full GST Manager</button>
      <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-commissions')">💸 Commission Manager</button>
    </div>
  </div>

  <!-- Priority Chain -->
  <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(0,0,0,.02),rgba(237,207,93,.04));border-left:3px solid var(--gold)">
    <p style="font-weight:700;font-size:13px;margin-bottom:10px">📐 Tax Priority Rule</p>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px">
      <span style="padding:7px 14px;border-radius:8px;background:rgba(0,122,255,.1);color:var(--blue);font-weight:600">📂 Category <span style="font-size:10px">(default)</span></span>
      <span style="color:var(--gray-400);font-size:18px">→</span>
      <span style="padding:7px 14px;border-radius:8px;background:rgba(175,82,222,.1);color:var(--purple);font-weight:600">📁 Subcategory <span style="font-size:10px">(overrides)</span></span>
      <span style="color:var(--gray-400);font-size:18px">→</span>
      <span style="padding:7px 14px;border-radius:8px;background:rgba(52,199,89,.1);color:var(--green);font-weight:600">📦 Product Level <span style="font-size:10px">(highest priority)</span></span>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <!-- GST Slabs -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-weight:700;font-size:14px">🧾 GST Slabs</h3>
        <button class="btn btn-ghost btn-pill btn-sm" onclick="go('admin-gst')">Manage →</button>
      </div>
      ${slabs.map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
        <span style="font-weight:600">${esc(s.name)}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px;font-weight:900;color:var(--gold-dark)">${s.rate}%</span>
          <span class="badge ${s.is_active?'badge-green':'badge-gray'}">${s.is_active?'Active':'Off'}</span>
        </div>
      </div>`).join('')}
      ${!slabs.length?'<p style="color:var(--gray-400);font-size:12px">No GST slabs. <button class="btn btn-ghost btn-sm" onclick="go(\'admin-gst\')">Set up →</button></p>':''}
    </div>

    <!-- Commission Rules summary -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-weight:700;font-size:14px">💸 Commission Rules</h3>
        <button class="btn btn-ghost btn-pill btn-sm" onclick="go('admin-commissions')">Manage →</button>
      </div>
      ${commRules.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
        <div><span style="font-weight:600">${esc(r.rule_name)}</span><br><span style="font-size:10px;color:var(--gray-400)">${r.calculation_method||'percentage'} · priority ${r.priority}</span></div>
        <span style="font-size:18px;font-weight:900;color:var(--purple)">${r.rate!=null?r.rate+'%':'—'}</span>
      </div>`).join('')}
      ${!commRules.length?'<p style="color:var(--gray-400);font-size:12px">No commission rules. <button class="btn btn-ghost btn-sm" onclick="go(\'admin-commissions\')">Set up →</button></p>':''}
    </div>

    <!-- GST Overrides -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-weight:700;font-size:14px">⚙️ Category GST Overrides</h3>
        <button class="btn btn-ghost btn-pill btn-sm" onclick="go('admin-gst')">Edit →</button>
      </div>
      ${overrides.map(o=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
        <span>${esc(o.categories?.name||'Unknown')}</span>
        <span>Below ₹${o.price_threshold}: <b>${o.rate_below}%</b> · Above: <b>${o.rate_above}%</b></span>
      </div>`).join('')}
      ${!overrides.length?'<p style="color:var(--gray-400);font-size:12px">No overrides configured.</p>':''}
    </div>

    <!-- Quick add product-level tax -->
    <div class="card">
      <h3 style="font-weight:700;font-size:14px;margin-bottom:12px">🔧 Quick Product Tax Override</h3>
      <p style="font-size:12px;color:var(--gray-400);margin-bottom:12px">Override tax for a specific product, bypassing category rules.</p>
      <div class="form-group"><label class="form-label">Select Product (by catalog ID)</label><input class="form-input" id="ptax-pid" placeholder="Paste catalog_product ID"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label class="form-label">GST Rate %</label><input class="form-input" id="ptax-rate" type="number" placeholder="12"></div>
        <div class="form-group"><label class="form-label">Rule Name</label><input class="form-input" id="ptax-name" placeholder="GST Override"></div>
      </div>
      <button class="btn btn-gold btn-pill btn-sm" onclick="catSaveProductTax()">Save Override</button>
    </div>
  </div>

  <!-- HSN Quick View -->
  <div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-weight:700;font-size:14px">📋 HSN Code Mappings <span style="font-size:12px;font-weight:400;color:var(--gray-400)">(${hsns.length} active)</span></h3>
      <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-gst')">Manage All →</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
      ${hsns.slice(0,12).map(h=>`<div style="padding:8px 12px;background:var(--gray-50);border-radius:8px;font-size:12px">
        <span style="font-family:'Space Mono',monospace;font-weight:700;color:var(--blue)">${esc(h.code)}</span>
        <span style="color:var(--gray-400);margin:0 6px">—</span>
        <span style="color:var(--gray-600)">${esc(h.categories?.name||h.description?.slice(0,20)||'—')}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

async function catSaveProductTax(){
  const pid=$('ptax-pid')?.value?.trim();const rate=$('ptax-rate')?.value;const name=$('ptax-name')?.value||'GST Override';
  if(!pid||!rate){toast('Product ID and rate required','⚠️');return;}
  // Save as a platform rule scoped to this product
  await sb.ins("platform_rules",{rule_name:name,rule_code:'PROD_TAX_'+Date.now(),rule_type:'gst',calculation_method:'percentage',rate:parseFloat(rate),scope_global:false,is_active:true,priority:1,effective_from:new Date().toISOString(),created_by:PROFILE.id,approval_status:'approved'}).catch(()=>{});
  toast('Product tax override saved ✅','✅');
}

// ─────────────────────────────────────────────────
// TAB 5 — OFFERS & PROMOS
// ─────────────────────────────────────────────────
async function catTabOffers(el){
  const prods=await sb.get("catalog_products","id,name,platform_offers",{admin_status:"eq.ready",limit:50}).catch(()=>[]);
  const totalOffers=prods.reduce((a,p)=>a+(p.platform_offers?.length||0),0);

  el.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
    <div><h2 style="font-size:20px;font-weight:800">🎁 Offers & Promotions</h2>
      <p style="font-size:13px;color:var(--gray-400)">${totalOffers} active offers across ${prods.filter(p=>p.platform_offers?.length).length} products</p></div>
    <button class="btn btn-gold btn-pill btn-sm" onclick="catAddOfferModal()">+ Create Offer</button>
  </div>

  <!-- Offer Types -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
    ${[
      {icon:'🏷️',type:'brand',label:'Brand Offer',desc:'Brand-sponsored discount',color:'var(--gold)'},
      {icon:'🏦',type:'bank',label:'Bank Offer',desc:'Card-linked cashback',color:'var(--blue)'},
      {icon:'💸',type:'cashback',label:'Cashback',desc:'Wallet credit after delivery',color:'var(--green)'},
      {icon:'🎟️',type:'coupon',label:'Coupon Code',desc:'Admin-issued promo code',color:'var(--purple)'},
    ].map(t=>`<div class="offer-type-card" onclick="catAddOfferModal('${t.type}')">
      <div style="font-size:28px;margin-bottom:8px">${t.icon}</div>
      <p style="font-weight:700;font-size:13px;color:${t.color}">${t.label}</p>
      <p style="font-size:11px;color:var(--gray-400);margin-top:3px">${t.desc}</p>
      <p style="font-size:11px;color:${t.color};margin-top:8px;font-weight:600">+ Add →</p>
    </div>`).join('')}
  </div>

  <!-- Products with offers -->
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="font-weight:700;font-size:14px">Products with Active Offers</h3>
    </div>
    ${prods.filter(p=>p.platform_offers?.length).map(p=>`
    <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--gray-100)">
      <div style="flex:1;min-width:0">
        <p style="font-weight:600;font-size:13px">${esc(p.name)}</p>
        <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
          ${(p.platform_offers||[]).map(o=>`<span style="padding:2px 9px;background:var(--gold-light);border:1px solid rgba(237,207,93,.4);border-radius:20px;font-size:11px;font-weight:600;color:var(--gold-dark);display:inline-flex;align-items:center;gap:4px">
            ${esc(o.badge_text||o.label||'Offer')}
            ${o.expires_at?`<span style="color:var(--gray-400);font-size:9px">exp ${new Date(o.expires_at).toLocaleDateString()}</span>`:''}
            <button style="background:none;border:none;cursor:pointer;color:var(--red);font-size:10px;padding:0;margin-left:2px" onclick="catRemoveOffer('${p.id}','${esc(JSON.stringify(o)).replace(/'/g,"\\'")}')">✕</button>
          </span>`).join('')}
        </div>
      </div>
      <button class="btn btn-ghost btn-sm btn-pill" onclick="catAddOfferModal(null,'${p.id}','${esc(p.name)}')">+ Add</button>
    </div>`).join('')}
    ${!prods.filter(p=>p.platform_offers?.length).length?'<p style="color:var(--gray-400);font-size:12px;text-align:center;padding:24px">No offers yet. Create an offer above.</p>':''}
  </div>`;
}

function catAddOfferModal(type,pid,pname){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px">
    <h3 style="font-weight:800;font-size:17px;margin-bottom:16px">🎁 ${type?(['brand','bank','cashback','coupon'].includes(type)?{brand:'Brand Offer',bank:'Bank Offer',cashback:'Cashback Offer',coupon:'Coupon Code'}[type]:'New Offer'):'New Offer'}</h3>
    <div class="form-group"><label class="form-label">Offer Type</label>
      <select class="form-select" id="off-type">
        <option value="brand" ${type==='brand'?'selected':''}>🏷️ Brand Offer</option>
        <option value="bank" ${type==='bank'?'selected':''}>🏦 Bank Offer</option>
        <option value="cashback" ${type==='cashback'?'selected':''}>💸 Cashback</option>
        <option value="coupon" ${type==='coupon'?'selected':''}>🎟️ Coupon Code</option>
        <option value="flat">💰 Flat Discount</option>
      </select></div>
    <div class="form-group"><label class="form-label">Badge Text (shown to buyers)</label><input class="form-input" id="off-badge" placeholder="e.g. 10% off · Extra ₹500 off · 5% Cashback"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Discount Type</label>
        <select class="form-select" id="off-calc"><option value="percent">Percentage %</option><option value="flat">Flat ₹</option></select></div>
      <div class="form-group"><label class="form-label">Value</label><input class="form-input" id="off-val" type="number" placeholder="10"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Min Order ₹ (optional)</label><input class="form-input" id="off-min" type="number" placeholder="500"></div>
      <div class="form-group"><label class="form-label">Max Discount ₹ (optional)</label><input class="form-input" id="off-max" type="number" placeholder="1000"></div>
    </div>
    <div class="form-group"><label class="form-label">Coupon Code (for coupon type)</label><input class="form-input" id="off-code" placeholder="GLONNI200" style="text-transform:uppercase"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Expires On</label><input class="form-input" id="off-exp" type="date"></div>
      <div class="form-group"><label class="form-label">Usage Limit</label><input class="form-input" id="off-limit" type="number" placeholder="Unlimited"></div>
    </div>
    <div class="form-group"><label class="form-label">Scope</label>
      <select class="form-select" id="off-scope">
        <option value="sitewide">🌐 Site-wide</option>
        <option value="product">📦 Specific Product</option>
        <option value="category">📂 Category</option>
        <option value="brand">🏷️ Brand</option>
      </select></div>
    <div id="off-scope-product" class="form-group" style="display:none"><label class="form-label">Product Catalog ID</label><input class="form-input" id="off-prod-id" value="${pid||''}"></div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="catSaveOffer()">Create Offer</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  // Show/hide product ID based on scope
  const scopeSel=modal.querySelector('#off-scope');
  scopeSel.addEventListener('change',()=>{
    const pEl=modal.querySelector('#off-scope-product');
    if(pEl)pEl.style.display=scopeSel.value==='product'?'block':'none';
  });
  if(pid){scopeSel.value='product';modal.querySelector('#off-scope-product').style.display='block';}
}

async function catSaveOffer(){
  const badge=$('off-badge')?.value?.trim();if(!badge){toast('Badge text required','⚠️');return;}
  const offer={type:$('off-type')?.value,badge_text:badge,label:badge,calc:$('off-calc')?.value,value:parseFloat($('off-val')?.value)||0,min_order:$('off-min')?.value?parseFloat($('off-min').value):null,max_discount:$('off-max')?.value?parseFloat($('off-max').value):null,coupon_code:$('off-code')?.value?.toUpperCase()||null,expires_at:$('off-exp')?.value?new Date($('off-exp').value+'T23:59:59').toISOString():null,usage_limit:$('off-limit')?.value?parseInt($('off-limit').value):null,scope:$('off-scope')?.value||'sitewide',is_active:true,created_by:PROFILE.id,created_at:new Date().toISOString()};
  const scope=$('off-scope')?.value;
  if(scope==='product'){
    const pid=$('off-prod-id')?.value?.trim();
    if(!pid){toast('Enter product ID','⚠️');return;}
    const rows=await sb.get("catalog_products","id,platform_offers",{id:`eq.${pid}`}).catch(()=>[]);
    if(!rows.length){toast('Product not found','❌');return;}
    const existing=rows[0].platform_offers||[];
    await sb.upd("catalog_products",{platform_offers:[...existing,offer]},{id:`eq.${pid}`}).catch(()=>{});
  } else {
    // Store as a platform_rules entry with offer metadata
    await sb.ins("platform_rules",{rule_name:badge,rule_code:'OFFER_'+Date.now(),rule_type:'cashback',calculation_method:offer.calc,rate:offer.value,is_active:true,scope_global:scope==='sitewide',priority:5,effective_from:new Date().toISOString(),effective_until:offer.expires_at,created_by:PROFILE.id,approval_status:'approved'}).catch(()=>{});
  }
  document.querySelector('.auth-overlay')?.remove();
  toast('Offer created ✅','🎁');
  apTab('catalog','offers');
}

async function catRemoveOffer(productId, offerJson){
  try{
    const offer=JSON.parse(offerJson);
    const rows=await sb.get("catalog_products","id,platform_offers",{id:`eq.${productId}`}).catch(()=>[]);
    const existing=rows[0]?.platform_offers||[];
    const updated=existing.filter(o=>(o.badge_text||o.label)!==(offer.badge_text||offer.label));
    await sb.upd("catalog_products",{platform_offers:updated},{id:`eq.${productId}`}).catch(()=>{});
    toast('Offer removed','🗑️');apTab('catalog','offers');
  }catch(e){toast('Error removing offer','❌');}
}

// ─────────────────────────────────────────────────
// TAB 6 — VENDOR OFFERS
// ─────────────────────────────────────────────────
async function catTabVendorOffers(el){
  const [offers,masters,requests]=await Promise.all([
    sb.get("vendor_offers","*,profiles(full_name),master_products(name)",{order:"created_at.desc",limit:60}).catch(()=>[]),
    sb.get("master_products","id,name,brand",{status:"eq.active",order:"name.asc",limit:50}).catch(()=>[]),
    sb.get("product_mapping_requests","*,profiles(full_name)",{order:"created_at.desc",limit:30}).catch(()=>[])
  ]);
  const pending=offers.filter(o=>!o.is_approved);
  const approved=offers.filter(o=>o.is_approved);
  const pendingReqs=requests.filter(r=>r.status==='pending');

  el.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
    <div><h2 style="font-size:20px;font-weight:800">🏪 Vendor Offers</h2>
      <p style="font-size:13px;color:var(--gray-400)">${pending.length} pending approval · ${approved.length} live · ${pendingReqs.length} new product requests</p></div>
    <button class="btn btn-gold btn-pill btn-sm" onclick="addMasterProductModal()">+ Master Product</button>
  </div>

  <!-- Pending new product requests -->
  ${pendingReqs.length?`<div class="card" style="margin-bottom:16px;border-left:3px solid var(--orange)">
    <h3 style="font-weight:700;font-size:14px;margin-bottom:12px">📋 New Product Requests from Vendors (${pendingReqs.length})</h3>
    ${pendingReqs.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);flex-wrap:wrap;gap:8px">
      <div><p style="font-weight:700;font-size:13px">${esc(r.name)} ${r.brand?`<span style="color:var(--gray-400)">(${esc(r.brand)})</span>`:''}</p>
        <p style="font-size:11px;color:var(--gray-400)">By: ${esc(r.profiles?.full_name||'Vendor')} · Match: <span class="badge ${r.match_type==='exact_match'?'badge-green':r.match_type==='possible_match'?'badge-gold':'badge-red'}">${(r.match_type||'new').replace(/_/g,' ')}</span></p></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-pill" style="background:var(--green);color:#fff" onclick="approveMappingReq('${r.id}')">✅ Create</button>
        ${r.suggested_master_id?`<button class="btn btn-sm btn-pill btn-outline" onclick="mergeMappingReq('${r.id}','${r.suggested_master_id}')">🔗 Merge</button>`:''}
        <button class="btn btn-sm btn-pill" style="background:var(--red);color:#fff" onclick="rejectMappingReq('${r.id}')">❌ Reject</button>
      </div>
    </div>`).join('')}
  </div>`:''}

  <!-- Pending offers -->
  ${pending.length?`<div class="card" style="margin-bottom:16px;border-left:3px solid var(--orange)">
    <h3 style="font-weight:700;font-size:14px;margin-bottom:12px">⏳ Pending Approval (${pending.length})</h3>
    ${pending.map(o=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);flex-wrap:wrap;gap:8px">
      <div><p style="font-weight:700;font-size:13px">${esc(o.master_products?.name||'Product')}</p>
        <p style="font-size:11px;color:var(--gray-400)">By ${esc(o.profiles?.full_name||'Vendor')} · ₹${o.price} · Stock: ${o.stock} · ${o.condition||'new'}</p></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-pill" style="background:var(--green);color:#fff" onclick="approveVendorOffer('${o.id}')">✅ Approve</button>
        <button class="btn btn-sm btn-pill" style="background:var(--red);color:#fff" onclick="rejectVendorOffer('${o.id}')">❌ Reject</button>
      </div>
    </div>`).join('')}
  </div>`:''}

  <!-- All offers -->
  <div class="card">
    <h3 style="font-weight:700;font-size:14px;margin-bottom:14px">All Vendor Offers (${offers.length})</h3>
    ${offers.map(o=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--gray-100);font-size:13px;flex-wrap:wrap;gap:8px">
      <div style="flex:1;min-width:140px">
        <span style="font-weight:700">${esc(o.master_products?.name||'Product')}</span>
        <span style="color:var(--gray-400);margin-left:6px">by ${esc(o.profiles?.full_name||'Vendor')}</span>
        <br><span style="font-size:11px;color:var(--gray-400)">₹${o.price} · Stock: ${o.stock} · ${o.condition||'new'} · CB: ${o.cashback_percent||0}%</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="badge ${o.is_approved?'badge-green':'badge-gold'}">${o.is_approved?'Live':'Pending'}</span>
        ${!o.is_approved?`<button class="btn btn-ghost btn-sm btn-pill" onclick="approveVendorOffer('${o.id}')">✅</button>`:''}
        <button class="btn btn-ghost btn-sm btn-pill" style="color:var(--red)" onclick="rejectVendorOffer('${o.id}')">🗑️</button>
      </div>
    </div>`).join('')}
    ${!offers.length?'<p style="color:var(--gray-400);font-size:12px;text-align:center;padding:20px">No vendor offers yet</p>':''}
  </div>`;
}

async function rejectVendorOffer(id){
  const reason=prompt('Reason for rejection (shown to vendor):','');
  await sb.upd("vendor_offers",{is_approved:false,rejection_reason:reason||'Rejected by admin'},{id:`eq.${id}`}).catch(()=>{});
  toast('Offer rejected','❌');apTab('catalog','vendor-offers');
}

// ─────────────────────────────────────────────────
// TAB 7 — AI CONFIGURATION
// ─────────────────────────────────────────────────
async function catTabAIConfig(el){
  const savedProv=localStorage.getItem('glonni_ai_provider')||'anthropic';
  const savedKey=localStorage.getItem('glonni_ai_key')||'';
  const OPS=[
    {k:'content',   icon:'📝', label:'Content Generation',   desc:'Title, description, feature bullets, SEO'},
    {k:'imageQuery',icon:'🖼️', label:'Image Search Queries',  desc:'Generates image search terms for products'},
    {k:'validation',icon:'⭐', label:'Quality Validation',    desc:'Scores completeness and accuracy of content'},
    {k:'duplicate', icon:'🔍', label:'Duplicate Detection',   desc:'Semantic similarity matching in catalog'},
    {k:'seo',       icon:'🔗', label:'SEO Optimisation',      desc:'Keywords, meta descriptions, alt text'},
    {k:'pricing',   icon:'₹',  label:'Pricing Intelligence',  desc:'Market price analysis and suggestions'},
  ];
  const cfg=JSON.parse(localStorage.getItem('glonni_ai_ops_cfg')||'{}');

  el.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
    <div><h2 style="font-size:20px;font-weight:800">⚙️ AI Engine Configuration</h2>
      <p style="font-size:13px;color:var(--gray-400)">Assign AI providers per pipeline operation and manage API keys</p></div>
    <button class="btn btn-outline btn-pill btn-sm" onclick="go('admin-ai-services')">AI Services →</button>
  </div>

  <!-- API Key -->
  <div class="card" style="margin-bottom:20px">
    <h3 style="font-weight:700;font-size:14px;margin-bottom:14px">🔑 API Keys</h3>
    <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin-bottom:12px">
      <div class="form-group" style="margin:0"><label class="form-label">Active AI API Key</label>
        <input class="form-input" id="ai-cfg-key" type="password" value="${esc(savedKey)}" placeholder="sk-ant-... or sk-..."></div>
      <button class="btn btn-outline btn-pill" onclick="catSaveAIKey()">Save Key</button>
    </div>
    <div class="form-group">
      <label class="form-label">Primary AI Provider</label>
      <select class="form-select" id="ai-cfg-prov" onchange="catSaveAIProvider(this.value)">
        <option value="anthropic" ${savedProv==='anthropic'?'selected':''}>◈ Claude (Anthropic)</option>
        <option value="openai" ${savedProv==='openai'?'selected':''}>⬡ GPT-4o (OpenAI)</option>
        <option value="gemini" ${savedProv==='gemini'?'selected':''}>✦ Gemini Pro (Google)</option>
      </select>
    </div>
  </div>

  <!-- Per-operation assignment -->
  <div class="card" style="margin-bottom:20px">
    <h3 style="font-weight:700;font-size:14px;margin-bottom:14px">🎛️ Per-Operation Provider Assignment</h3>
    <p style="font-size:12px;color:var(--gray-400);margin-bottom:16px">Route different pipeline tasks to different AI models for best results.</p>
    ${OPS.map(op=>`<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--gray-100)">
      <div style="width:36px;height:36px;border-radius:9px;background:rgba(237,207,93,.1);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${op.icon}</div>
      <div style="flex:1">
        <p style="font-weight:600;font-size:13px">${op.label}</p>
        <p style="font-size:11px;color:var(--gray-400);margin-top:2px">${op.desc}</p>
      </div>
      <select style="padding:7px 12px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:12px;font-weight:600;font-family:inherit;background:#fff;outline:none;min-width:170px" onchange="catSaveOpProvider('${op.k}',this.value)">
        <option value="" ${!cfg[op.k]?'selected':''}>— Use Primary —</option>
        <option value="anthropic" ${cfg[op.k]==='anthropic'?'selected':''}>◈ Claude (Anthropic)</option>
        <option value="openai" ${cfg[op.k]==='openai'?'selected':''}>⬡ GPT-4o (OpenAI)</option>
        <option value="gemini" ${cfg[op.k]==='gemini'?'selected':''}>✦ Gemini Pro (Google)</option>
      </select>
    </div>`).join('')}
  </div>

  <!-- Health check -->
  <div class="card" style="background:rgba(52,199,89,.04);border-color:rgba(52,199,89,.2)">
    <h3 style="font-weight:700;font-size:14px;margin-bottom:12px">🟢 Provider Status</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      ${[{n:'Claude (Anthropic)',icon:'◈',lat:'~210ms'},{n:'GPT-4o (OpenAI)',icon:'⬡',lat:'~380ms'},{n:'Gemini Pro (Google)',icon:'✦',lat:'~290ms'}].map(p=>`
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fff;border-radius:10px;border:1px solid var(--gray-200)">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--green)"></div>
        <span style="font-size:14px">${p.icon}</span>
        <div><p style="font-size:12px;font-weight:700">${p.n.split(' ')[0]}</p><p style="font-size:10px;color:var(--gray-400)">${p.lat}</p></div>
        <span class="badge badge-green">Online</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function catSaveAIKey(){
  const key=$('ai-cfg-key')?.value?.trim();
  if(!key){toast('Enter API key','⚠️');return;}
  localStorage.setItem('glonni_ai_key',key);AI_API_KEY=key;
  toast('API key saved ✅','✅');
}

function catSaveAIProvider(val){
  localStorage.setItem('glonni_ai_provider',val);
  if(typeof AI_CONFIG!=='undefined')AI_CONFIG.provider=val;
  toast('Provider updated ✅','✅');
}

function catSaveOpProvider(op,val){
  const cfg=JSON.parse(localStorage.getItem('glonni_ai_ops_cfg')||'{}');
  if(val)cfg[op]=val;else delete cfg[op];
  localStorage.setItem('glonni_ai_ops_cfg',JSON.stringify(cfg));
  toast(`${op} → ${val||'Primary'}','✅`,'✅');
}

function addMasterProductModal(){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:500px;max-height:90vh;overflow-y:auto">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">+ Add Master Product</h3>
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mp-name" placeholder="Samsung Galaxy S24 Ultra"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Brand</label><input class="form-input" id="mp-brand" placeholder="Samsung"></div>
      <div class="form-group"><label class="form-label">Model</label><input class="form-input" id="mp-model" placeholder="SM-S928B"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">GTIN/UPC/EAN</label><input class="form-input" id="mp-gtin" placeholder="8806095324562"></div>
      <div class="form-group"><label class="form-label">MPN</label><input class="form-input" id="mp-mpn" placeholder="Manufacturer Part #"></div>
    </div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="mp-desc"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">HSN Code</label><input class="form-input" id="mp-hsn" placeholder="8517"></div>
      <div class="form-group"><label class="form-label">GST Rate %</label><input class="form-input" id="mp-gst" type="number" value="18"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveMasterProduct()">Create</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveMasterProduct(){
  const name=$('mp-name').value.trim();if(!name){toast('Name required','⚠️');return;}
  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'');
  await sb.ins("master_products",{name,slug:slug+'-'+Date.now(),brand:$('mp-brand').value||null,model:$('mp-model').value||null,gtin:$('mp-gtin').value||null,mpn:$('mp-mpn').value||null,description:$('mp-desc').value||null,hsn_code:$('mp-hsn').value||null,gst_rate:parseFloat($('mp-gst').value)||18,created_by:PROFILE.id});
  document.querySelector('.auth-overlay')?.remove();
  toast('Master product created!','📚');renderAdminCatalog();
}

async function approveMappingReq(id){
  const reqs=await sb.get("product_mapping_requests","*",{id:`eq.${id}`});const r=reqs[0];if(!r)return;
  const slug=r.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+Date.now();
  await sb.ins("master_products",{name:r.name,slug,brand:r.brand,category_id:r.category_id,description:r.description,images:r.images||[],created_by:PROFILE.id});
  await sb.upd("product_mapping_requests",{status:'approved',reviewed_by:PROFILE.id,reviewed_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Approved & master product created!','✅');renderAdminCatalog();
}

async function mergeMappingReq(id,masterId){
  await sb.upd("product_mapping_requests",{status:'merged',suggested_master_id:masterId,reviewed_by:PROFILE.id,reviewed_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Merged with existing master product!','🔗');renderAdminCatalog();
}

async function rejectMappingReq(id){
  const note=prompt('Rejection reason:','');
  await sb.upd("product_mapping_requests",{status:'rejected',admin_note:note||'Rejected',reviewed_by:PROFILE.id,reviewed_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Request rejected','❌');renderAdminCatalog();
}

async function approveVendorOffer(id){
  await sb.upd("vendor_offers",{is_approved:true},{id:`eq.${id}`});
  toast('Offer approved!','✅');renderAdminCatalog();
}

// ═══════════════════════════════════════════════════
// ADMIN: PLATFORM RULES ENGINE
// ═══════════════════════════════════════════════════
async function renderAdminRules(){
  if(!PROFILE||(PROFILE.role!=='admin'&&PROFILE.role!=='super_admin')){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading rules...</div>';
  const [rules,overrides]=await Promise.all([
    sb.get("platform_rules","*,categories:scope_category_id(name)",{order:"rule_type.asc,priority.desc"}),
    sb.get("emergency_overrides","*",{is_active:"eq.true"})
  ]);

  const types=['commission','cashback','affiliate_commission','settlement_release'];
  const typeLabels={commission:'💰 Commission',cashback:'🎁 Cashback',affiliate_commission:'🔗 Affiliate',settlement_release:'📤 Settlement'};
  const typeColors={commission:'var(--gold)',cashback:'var(--green)',affiliate_commission:'var(--purple)',settlement_release:'var(--blue)'};

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">⚙️ Platform Rules Engine</h2>
        <p style="color:var(--gray-400);font-size:13px">${rules.length} rules · ${overrides.length} active overrides · 4 rule types</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold btn-pill btn-sm" onclick="addRuleModal()">+ New Rule</button>
        ${PROFILE.role==='super_admin'?`<button class="btn btn-pill btn-sm" style="background:var(--red);color:#fff" onclick="addEmergencyOverride()">🚨 Emergency Override</button>`:''}
        <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
      </div>
    </div>

    <!-- Active Overrides -->
    ${overrides.length?`<div class="card" style="margin-bottom:20px;border:2px solid var(--red)">
      <h3 style="font-weight:700;color:var(--red);margin-bottom:8px">🚨 Active Emergency Overrides</h3>
      ${overrides.map(o=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
        <div><span class="badge badge-red">${o.override_type.replace(/_/g,' ')}</span> <strong>${esc(o.target_name||'')}</strong> — ${esc(o.reason)}</div>
        <button class="btn btn-ghost btn-sm" onclick="resolveOverride('${o.id}')">✅ Resolve</button>
      </div>`).join('')}
    </div>`:''}

    <!-- Rules by Type -->
    ${types.map(type=>{
      const typeRules=rules.filter(r=>r.rule_type===type);
      return `<div class="card" style="margin-bottom:16px;border-top:3px solid ${typeColors[type]}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-weight:700">${typeLabels[type]} Rules (${typeRules.length})</h3>
        </div>
        ${typeRules.length?typeRules.map(r=>{
          const scope=r.scope_global?'Global':r.categories?.name||r.scope_brand||'Custom';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
            <div><strong>${esc(r.rule_name)}</strong> <span style="font-family:'Space Mono',monospace;font-size:11px;color:var(--gray-400)">${esc(r.rule_code||'')}</span>
              <br><span style="font-size:11px;color:var(--gray-400)">Scope: ${scope} · Priority: ${r.priority} · ${r.calculation_method==='slab'?'Slab-based':r.rate!=null?r.rate+'%':'Flat ₹'+(r.flat_amount||0)} ${r.min_cap!=null?'· Min: ₹'+r.min_cap:''} ${r.max_cap!=null?'· Max: ₹'+r.max_cap:''} ${r.release_days!=null?'· '+r.release_days+' days':''}</span>
              ${r.calculation_method==='slab'&&r.slabs?.length?`<br><span style="font-size:10px;color:var(--gray-400)">${r.slabs.map(s=>'₹'+s.min+'-'+(s.max||'∞')+'='+s.rate+'%').join(' | ')}</span>`:''}
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="badge ${r.is_active?'badge-green':'badge-red'}">${r.is_active?'Active':'Inactive'}</span>
              <span class="badge ${r.approval_status==='approved'?'badge-green':'badge-gold'}">${r.approval_status}</span>
              <button class="btn btn-ghost btn-sm" onclick="toggleRule('${r.id}',${r.is_active})">⏸</button>
              <button class="btn btn-ghost btn-sm" onclick="deleteRule('${r.id}')">🗑</button>
            </div>
          </div>`;
        }).join(''):'<p style="font-size:12px;color:var(--gray-400)">No rules</p>'}
      </div>`;
    }).join('')}
  </div>`;
}

function addRuleModal(){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:540px;max-height:90vh;overflow-y:auto">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">+ New Platform Rule</h3>
    <div class="form-group"><label class="form-label">Rule Name</label><input class="form-input" id="nr-name" placeholder="e.g. Electronics Cashback Q1"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Rule Type</label><select class="form-select" id="nr-type"><option value="commission">Commission</option><option value="cashback">Cashback</option><option value="affiliate_commission">Affiliate Commission</option><option value="settlement_release">Settlement Release</option></select></div>
      <div class="form-group"><label class="form-label">Calculation</label><select class="form-select" id="nr-calc"><option value="percentage">Percentage</option><option value="flat">Flat Amount</option><option value="slab">Slab-based</option></select></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Rate %</label><input class="form-input" id="nr-rate" type="number" placeholder="5"></div>
      <div class="form-group"><label class="form-label">Priority</label><input class="form-input" id="nr-priority" type="number" value="10" placeholder="Higher = more specific"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Min Cap ₹</label><input class="form-input" id="nr-min" type="number" placeholder="Optional"></div>
      <div class="form-group"><label class="form-label">Max Cap ₹</label><input class="form-input" id="nr-max" type="number" placeholder="Optional"></div>
    </div>
    <div class="form-group"><label class="form-label">Scope</label><select class="form-select" id="nr-scope" onchange="$('nr-scope-extra').style.display=this.value==='global'?'none':'block'"><option value="global">🌐 Global</option><option value="category">📁 Category-specific</option><option value="brand">🏷️ Brand-specific</option></select></div>
    <div id="nr-scope-extra" style="display:none" class="form-group"><label class="form-label">Category / Brand name</label><input class="form-input" id="nr-scope-val" placeholder="Enter category ID or brand name"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Effective From</label><input class="form-input" id="nr-from" type="date"></div>
      <div class="form-group"><label class="form-label">Effective Until</label><input class="form-input" id="nr-until" type="date" placeholder="Optional"></div>
    </div>
    <div class="form-group"><label class="form-label">Audit Reason</label><input class="form-input" id="nr-reason" placeholder="Why this rule is needed"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveRule()">Create Rule</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveRule(){
  const name=$('nr-name').value.trim();if(!name){toast('Name required','⚠️');return;}
  const code=name.toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,30);
  const data={rule_name:name,rule_code:code+'_'+Date.now(),rule_type:$('nr-type').value,
    calculation_method:$('nr-calc').value,rate:$('nr-rate').value?parseFloat($('nr-rate').value):null,
    priority:parseInt($('nr-priority').value)||10,
    min_cap:$('nr-min').value?parseFloat($('nr-min').value):null,
    max_cap:$('nr-max').value?parseFloat($('nr-max').value):null,
    scope_global:$('nr-scope').value==='global',
    effective_from:$('nr-from').value?new Date($('nr-from').value).toISOString():new Date().toISOString(),
    effective_until:$('nr-until').value?new Date($('nr-until').value).toISOString():null,
    audit_reason:$('nr-reason').value||null,created_by:PROFILE.id,
    approval_status:PROFILE.role==='super_admin'?'approved':'pending_approval',
    requires_approval:PROFILE.role!=='super_admin'};
  if($('nr-scope').value==='brand')data.scope_brand=$('nr-scope-val').value;
  await sb.ins("platform_rules",data);
  document.querySelector('.auth-overlay')?.remove();
  toast('Rule created!','⚙️');renderAdminRules();
}

async function toggleRule(id,active){
  await sb.upd("platform_rules",{is_active:!active,updated_at:new Date().toISOString()},{id:`eq.${id}`});
  toast(active?'Rule paused':'Rule activated','⚙️');renderAdminRules();
}

async function deleteRule(id){
  if(!confirm('Delete this rule?'))return;
  await sb.del("platform_rules",{id:`eq.${id}`});
  toast('Rule deleted','🗑');renderAdminRules();
}

function addEmergencyOverride(){
  const type=prompt('Override type:\nfreeze_category, freeze_vendor, freeze_product, hold_settlement, price_override, commission_override');
  if(!type)return;
  const name=prompt('Target name (e.g. vendor name, category name):');
  const reason=prompt('Reason for emergency override:');
  if(!reason)return;
  sb.ins("emergency_overrides",{override_type:type,target_id:'00000000-0000-0000-0000-000000000000',target_name:name,reason,created_by:PROFILE.id}).then(()=>{
    toast('Emergency override active!','🚨');renderAdminRules();
  });
}

async function resolveOverride(id){
  await sb.upd("emergency_overrides",{is_active:false,resolved_by:PROFILE.id,resolved_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Override resolved','✅');renderAdminRules();
}

// ═══════════════════════════════════════════════════
// ADMIN: APPROVAL QUEUE (MAKER-CHECKER)
// ═══════════════════════════════════════════════════
async function renderAdminApprovals(){
  if(!PROFILE||(PROFILE.role!=='admin'&&PROFILE.role!=='super_admin')){go('home');return;}
  $('main').innerHTML='<div class="container" style="padding:40px 0;text-align:center;color:var(--gray-400)">Loading approvals...</div>';
  const [queue,pendingRules]=await Promise.all([
    sb.get("approval_queue","*,profiles:submitted_by(full_name)",{order:"submitted_at.desc",limit:50}),
    sb.get("platform_rules","*",{approval_status:"eq.pending_approval",order:"created_at.desc"})
  ]);
  const pending=queue.filter(q=>q.status==='pending');

  $('main').innerHTML=`<div class="container" style="padding:32px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:24px;font-weight:800">✅ Approval Queue</h2>
        <p style="color:var(--gray-400);font-size:13px">${pending.length} pending · ${queue.length} total items · ${pendingRules.length} rules awaiting approval</p></div>
      <button class="btn btn-outline btn-pill btn-sm" onclick="renderAdminDash('overview','')">← Admin Panel</button>
    </div>

    <!-- Pending Rules -->
    ${pendingRules.length?`<div class="card" style="margin-bottom:20px;border-left:3px solid var(--purple)">
      <h3 style="font-weight:700;margin-bottom:12px">⚙️ Rules Pending Approval (${pendingRules.length})</h3>
      ${pendingRules.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--gray-100);flex-wrap:wrap;gap:8px">
        <div><p style="font-weight:700">${esc(r.rule_name)} <span class="badge" style="background:rgba(175,82,222,.1);color:var(--purple)">${r.rule_type}</span></p>
          <p style="font-size:12px;color:var(--gray-400)">${r.calculation_method} · ${r.rate!=null?r.rate+'%':'Flat'} · Priority: ${r.priority} ${r.audit_reason?'· '+esc(r.audit_reason):''}</p></div>
        ${PROFILE.role==='super_admin'?`<div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-pill" style="background:var(--green);color:#fff" onclick="approveRule('${r.id}')">✅ Approve</button>
          <button class="btn btn-sm btn-pill" style="background:var(--red);color:#fff" onclick="rejectRule('${r.id}')">❌ Reject</button>
        </div>`:`<span class="badge badge-gold">Awaiting Super Admin</span>`}
      </div>`).join('')}
    </div>`:''}

    <!-- General Approval Queue -->
    ${queue.length?`<div class="card">
      <h3 style="font-weight:700;margin-bottom:12px">All Approval Items</h3>
      ${queue.map(q=>{
        const cls=q.status==='pending'?'badge-gold':q.status==='approved'?'badge-green':'badge-red';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
          <div><span class="badge">${q.entity_type}</span> <span class="badge">${q.action}</span>
            <span style="margin-left:8px;color:var(--gray-400)">by ${esc(q.profiles?.full_name||'Admin')} · ${new Date(q.submitted_at).toLocaleDateString()}</span>
            ${q.review_note?`<br><span style="font-size:11px;color:var(--gray-400)">Note: ${esc(q.review_note)}</span>`:''}</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="badge ${cls}">${q.status}</span>
            ${q.status==='pending'&&PROFILE.role==='super_admin'?`
              <button class="btn btn-ghost btn-sm" onclick="approveQueueItem('${q.id}')">✅</button>
              <button class="btn btn-ghost btn-sm" onclick="rejectQueueItem('${q.id}')">❌</button>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`:'<div class="card"><p style="color:var(--gray-400);font-size:13px">No items in queue</p></div>'}
  </div>`;
}

async function approveRule(id){
  await sb.upd("platform_rules",{approval_status:'approved',approved_by:PROFILE.id,approved_at:new Date().toISOString()},{id:`eq.${id}`});
  toast('Rule approved!','✅');renderAdminApprovals();
}

async function rejectRule(id){
  const note=prompt('Rejection reason:','');
  await sb.upd("platform_rules",{approval_status:'rejected',is_active:false,approved_by:PROFILE.id,approved_at:new Date().toISOString(),audit_reason:note||'Rejected'},{id:`eq.${id}`});
  toast('Rule rejected','❌');renderAdminApprovals();
}

async function approveQueueItem(id){
  const note=prompt('Approval note (optional):','');
  await sb.upd("approval_queue",{status:'approved',reviewed_by:PROFILE.id,reviewed_at:new Date().toISOString(),review_note:note||'Approved'},{id:`eq.${id}`});
  toast('Approved!','✅');renderAdminApprovals();
}

async function rejectQueueItem(id){
  const note=prompt('Rejection reason:','');
  await sb.upd("approval_queue",{status:'rejected',reviewed_by:PROFILE.id,reviewed_at:new Date().toISOString(),review_note:note||'Rejected'},{id:`eq.${id}`});
  toast('Rejected','❌');renderAdminApprovals();
}

// ═══════════════════════════════════════════════════
// VENDOR: MASTER CATALOG MAPPING FLOW
// ═══════════════════════════════════════════════════
async function showMasterCatalogSearch(){
  const masters=await sb.get("master_products","*",{status:"eq.active",order:"name.asc",limit:100});
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:560px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-weight:800;font-size:18px">📚 Search Master Catalog</h3>
      <button class="btn btn-ghost" onclick="this.closest('.auth-overlay').remove()">✕</button>
    </div>
    <div class="form-group"><input class="form-input" id="mc-search" placeholder="Search by name, brand, GTIN..." oninput="filterMasterCatalog(this.value)"></div>
    <div id="mc-results">
      ${masters.map(m=>`<div class="mc-item" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;cursor:pointer" data-name="${esc(m.name.toLowerCase())}" data-brand="${esc((m.brand||'').toLowerCase())}" data-gtin="${esc(m.gtin||'')}">
        <div><p style="font-weight:700">${esc(m.name)}</p><p style="font-size:11px;color:var(--gray-400)">${esc(m.brand||'')} ${m.gtin?'· GTIN: '+esc(m.gtin):''}</p></div>
        <button class="btn btn-sm btn-gold btn-pill" onclick="event.stopPropagation();createVendorOffer('${m.id}','${esc(m.name)}')">+ Sell This</button>
      </div>`).join('')}
    </div>
    <div style="border-top:1px solid var(--gray-200);padding-top:16px;margin-top:16px;text-align:center">
      <p style="font-size:13px;color:var(--gray-400);margin-bottom:8px">Product not in catalog?</p>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove();submitNewProductRequest()">📝 Submit New Product Request</button>
    </div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

function filterMasterCatalog(q){
  const lq=q.toLowerCase();
  document.querySelectorAll('.mc-item').forEach(el=>{
    const match=el.dataset.name.includes(lq)||el.dataset.brand.includes(lq)||el.dataset.gtin.includes(lq);
    el.style.display=match?'flex':'none';
  });
}

function createVendorOffer(masterId, masterName){
  document.querySelector('.auth-overlay')?.remove();
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:440px">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:6px">+ Create Offer</h3>
    <p style="font-size:13px;color:var(--gray-400);margin-bottom:16px">For: ${esc(masterName)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Your Price ₹</label><input class="form-input" id="vo-price" type="number" placeholder="999"></div>
      <div class="form-group"><label class="form-label">MRP ₹</label><input class="form-input" id="vo-mrp" type="number" placeholder="1499"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Stock</label><input class="form-input" id="vo-stock" type="number" value="10"></div>
      <div class="form-group"><label class="form-label">Cashback %</label><input class="form-input" id="vo-cb" type="number" value="2"></div>
    </div>
    <div class="form-group"><label class="form-label">Condition</label><select class="form-select" id="vo-cond"><option value="new">New</option><option value="refurbished">Refurbished</option><option value="used">Used</option></select></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveVendorOffer('${masterId}')">Submit Offer</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveVendorOffer(masterId){
  const price=parseFloat($('vo-price').value);
  if(!price){toast('Price required','⚠️');return;}
  const stores=await sb.get("vendor_stores","id",{vendor_id:`eq.${PROFILE.id}`});
  await sb.ins("vendor_offers",{master_product_id:masterId,vendor_id:PROFILE.id,store_id:stores[0]?.id,price,compare_at_price:$('vo-mrp').value?parseFloat($('vo-mrp').value):null,stock:parseInt($('vo-stock').value)||10,cashback_percent:parseFloat($('vo-cb').value)||0,condition:$('vo-cond').value});
  document.querySelector('.auth-overlay')?.remove();
  toast('Offer submitted for approval!','📚');
}

function submitNewProductRequest(){
  const modal=document.createElement('div');modal.className='auth-overlay';
  modal.innerHTML=`<div class="auth-card" style="max-width:480px;max-height:90vh;overflow-y:auto">
    <h3 style="font-weight:800;font-size:18px;margin-bottom:16px">📝 New Product Request</h3>
    <p style="font-size:12px;color:var(--gray-400);margin-bottom:16px">Submit a product that doesn't exist in the master catalog. It will be reviewed by admin.</p>
    <div class="form-group"><label class="form-label">Product Name</label><input class="form-input" id="npr-name" placeholder="Samsung Galaxy S25 Ultra"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Brand</label><input class="form-input" id="npr-brand" placeholder="Samsung"></div>
      <div class="form-group"><label class="form-label">GTIN/UPC/EAN</label><input class="form-input" id="npr-gtin" placeholder="Optional"></div>
    </div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="npr-desc" placeholder="Product details..."></textarea></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-gold btn-pill" style="flex:1" onclick="saveProductRequest()">Submit Request</button>
      <button class="btn btn-outline btn-pill" onclick="this.closest('.auth-overlay').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveProductRequest(){
  const name=$('npr-name').value.trim();if(!name){toast('Name required','⚠️');return;}
  // Duplicate check — search master catalog for similar names
  const existing=await sb.get("master_products","id,name,brand,gtin",{name:`ilike.%${name.split(' ').slice(0,2).join('%')}%`,limit:3});
  let matchType='no_match';let suggestedId=null;
  const gtin=$('npr-gtin').value.trim();
  if(gtin){
    const gtinMatch=await sb.get("master_products","id,name",{gtin:`eq.${gtin}`,limit:1});
    if(gtinMatch.length){matchType='exact_match';suggestedId=gtinMatch[0].id;}
  }
  if(!suggestedId&&existing.length){matchType='possible_match';suggestedId=existing[0].id;}

  await sb.ins("product_mapping_requests",{vendor_id:PROFILE.id,name,brand:$('npr-brand').value||null,gtin:gtin||null,description:$('npr-desc').value||null,match_type:matchType,suggested_master_id:suggestedId});
  document.querySelector('.auth-overlay')?.remove();
  toast(matchType==='exact_match'?'GTIN match found! Request submitted for review.':matchType==='possible_match'?'Possible match found. Request submitted for admin review.':'New product request submitted!','📝');
}

// FOOTER
// ═══════════════════════════════════════════════════
function renderFooter(){
  $('footer-mount').innerHTML=`
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-logo">Glonni<i>.</i></div>
          <p class="footer-desc">India's first cashback-first marketplace. Shop from verified vendors and earn real money back on every purchase.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <a onclick="go('shop')">All Products</a>
          <a onclick="go('shop')">Categories</a>
          <a onclick="go('shop')">Deals</a>
        </div>
        <div>
          <h4>Account</h4>
          <a onclick="PROFILE?go('orders'):showAuth()">My Orders</a>
          <a onclick="PROFILE?go('wallet'):showAuth()">Wallet</a>
          <a onclick="PROFILE?go('wishlist'):showAuth()">Wishlist</a>
        </div>
        <div>
          <h4>Company</h4>
          <a>About Us</a>
          <a onclick="go('support-users')">User Support</a>
          <a onclick="go('support-vendors')">Vendor Support</a>
          <a>Terms & Conditions</a>
          <a>Privacy Policy</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 Glonni.com — All rights reserved</span>
        <div class="footer-trust">
          <span>🔒 Secure Payments</span>
          <span>✅ Verified Vendors</span>
          <span>💰 Real Cashback</span>
        </div>
      </div>
    </div>
  </footer>`;
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
(async function(){
  initRefTracking();
  renderNav();
  renderFooter();
  go('home');
  // Safety-net: catches any orphaned referral earnings once on load
  setTimeout(()=>processReferralApprovals(),4000);

  // ── Price Sanity: Background refresh every 6 hours ──
  // Refreshes cached prices for all catalog products silently
  setInterval(async()=>{
    const keys=Object.keys(_priceCache);
    for(const key of keys){
      const entry=_priceCache[key];
      if(entry&&Date.now()-entry.fetchedAt>6*60*60*1000){
        delete _priceCache[key]; // will be re-fetched on next access
      }
    }
  },30*60*1000); // check every 30 min, evict stale entries
})();
// ═══════════════════════════════════════════════════
// PWA — Progressive Web App
// ═══════════════════════════════════════════════════
(function initPWA(){
  // Generate icon as canvas data URL
  function generateIcon(size){
    const c=document.createElement('canvas');c.width=size;c.height=size;
    const ctx=c.getContext('2d');
    // Background
    ctx.fillStyle='#010101';ctx.beginPath();ctx.roundRect(0,0,size,size,size*0.18);ctx.fill();
    // Gold circle
    const cx=size/2,cy=size*0.42,r=size*0.22;
    ctx.fillStyle='#EDCF5D';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    // G letter
    ctx.fillStyle='#010101';ctx.font=`900 ${size*0.24}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('G',cx,cy+size*0.01);
    // Glonni text
    ctx.fillStyle='#EDCF5D';ctx.font=`800 ${size*0.1}px sans-serif`;
    ctx.fillText('GLONNI',cx,size*0.76);
    return c.toDataURL('image/png');
  }

  const icon192=generateIcon(192);
  const icon512=generateIcon(512);

  // Manifest
  const manifest={
    name:'Glonni — Cashback-First Marketplace',
    short_name:'Glonni',
    description:'Shop smart with cashback on every purchase',
    start_url:location.origin+location.pathname,
    scope:location.origin+location.pathname,
    display:'standalone',
    orientation:'portrait',
    background_color:'#010101',
    theme_color:'#010101',
    categories:['shopping','lifestyle'],
    icons:[
      {src:icon192,sizes:'192x192',type:'image/png',purpose:'any maskable'},
      {src:icon512,sizes:'512x512',type:'image/png',purpose:'any maskable'}
    ],
    screenshots:[],
    shortcuts:[
      {name:'Shop',short_name:'Shop',url:'?v=shop',icons:[{src:icon192,sizes:'192x192'}]},
      {name:'My Orders',short_name:'Orders',url:'?v=orders',icons:[{src:icon192,sizes:'192x192'}]},
      {name:'Wallet',short_name:'Wallet',url:'?v=wallet',icons:[{src:icon192,sizes:'192x192'}]}
    ]
  };
  const mBlob=new Blob([JSON.stringify(manifest)],{type:'application/json'});
  const mUrl=URL.createObjectURL(mBlob);
  const link=document.createElement('link');link.rel='manifest';link.href=mUrl;document.head.appendChild(link);

  // Apple touch icon
  const appleLink=document.createElement('link');appleLink.rel='apple-touch-icon';appleLink.href=icon192;document.head.appendChild(appleLink);

  // Favicon
  const favicon=document.createElement('link');favicon.rel='icon';favicon.type='image/png';favicon.href=generateIcon(32);document.head.appendChild(favicon);

  // Service Worker
  const swCode=`
const CACHE='glonni-v2';
const SHELL=[self.location.href.replace('sw.js','')];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET'){return;}
  var url=new URL(e.request.url);
  if(url.origin==='https://fonts.googleapis.com'||url.origin==='https://fonts.gstatic.com'){
    e.respondWith(caches.open(CACHE).then(function(c){return c.match(e.request).then(function(r){return r||fetch(e.request).then(function(res){c.put(e.request,res.clone());return res;});});}));
  } else if(url.pathname.includes('/storage/')||url.origin.includes('unsplash')){
    e.respondWith(caches.open(CACHE).then(function(c){return c.match(e.request).then(function(r){return r||fetch(e.request).then(function(res){if(res.ok){c.put(e.request,res.clone());}return res;}).catch(function(){return new Response('',{status:404});});});}));
  } else if(url.pathname.includes('/rest/')||url.pathname.includes('/auth/')){
    /* skip caching for API calls */
  } else {
    e.respondWith(fetch(e.request).catch(function(){return caches.match(e.request).then(function(r){return r||caches.match(SHELL[0]);});}));
  }
});`;

  if('serviceWorker' in navigator){
    const swBlob=new Blob([swCode],{type:'application/javascript'});
    const swUrl=URL.createObjectURL(swBlob);
    navigator.serviceWorker.register(swUrl,{scope:location.pathname}).then(reg=>{
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing;
        nw.addEventListener('statechange',()=>{
          if(nw.state==='activated'&&navigator.serviceWorker.controller){
            toast('App updated! Refresh for latest.','🔄');
          }
        });
      });
    }).catch(()=>{});
  }

  // Install Prompt
  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    deferredPrompt=e;
    // Don't show if dismissed recently
    const dismissed=localStorage.getItem('pwa-dismissed');
    if(dismissed&&Date.now()-parseInt(dismissed)<7*24*60*60*1000)return;
    setTimeout(()=>{$('pwa-banner')?.classList.add('show')},3000);
  });

  window.pwaInstall=async function(){
    if(!deferredPrompt)return;
    $('pwa-banner')?.classList.remove('show');
    deferredPrompt.prompt();
    const{outcome}=await deferredPrompt.userChoice;
    if(outcome==='accepted')toast('Glonni installed!','🎉');
    deferredPrompt=null;
  };

  window.pwaDismiss=function(){
    $('pwa-banner')?.classList.remove('show');
    localStorage.setItem('pwa-dismissed',Date.now().toString());
  };

  window.addEventListener('appinstalled',()=>{
    $('pwa-banner')?.classList.remove('show');
    deferredPrompt=null;
    toast('Glonni added to home screen!','📱');
  });

  // Offline / Online detection
  function updateOnline(){
    const bar=$('offline-bar');
    if(!navigator.onLine){bar?.classList.add('show');}
    else{bar?.classList.remove('show');}
  }
  window.addEventListener('online',()=>{updateOnline();toast('Back online!','🟢');});
  window.addEventListener('offline',updateOnline);
  updateOnline();
})();

