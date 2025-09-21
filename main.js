'use strict';

const state = {
  token: localStorage.getItem('lm_admin_token') || '',
  tab: 'categories',
};

const els = {
  loginView: null,
  panelView: null,
  usernameInput: null,
  passwordInput: null,
  loginBtn: null,
  logoutBtn: null,
  tabs: null,
  tables: {},
};

function authHeaders() {
  return { 'Authorization': 'Bearer ' + state.token, 'Content-Type': 'application/json' };
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function switchTab(name){
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
  document.querySelector(`nav button[data-tab="${name}"]`).classList.add('active');
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  state.tab = name;
}

async function api(path, opts={}){
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function init(){
  els.loginView = document.getElementById('loginView');
  els.panelView = document.getElementById('panelView');
  els.usernameInput = document.getElementById('usernameInput');
  els.passwordInput = document.getElementById('passwordInput');
  els.loginBtn = document.getElementById('loginBtn');
  els.logoutBtn = document.getElementById('logoutBtn');

  if (state.token) { show('panelView'); hide('loginView'); refreshAll(); }
  else { show('loginView'); hide('panelView'); }

  els.loginBtn.onclick = async () => {
    const u = els.usernameInput.value.trim();
    const p = els.passwordInput.value.trim();
    if (!u || !p) return alert('Enter username and password');
    try {
      const res = await fetch('/auth/login', { method:'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
      if (!res.ok) throw new Error('Login failed');
      const { token } = await res.json();
      state.token = token; localStorage.setItem('lm_admin_token', token);
      show('panelView'); hide('loginView'); refreshAll();
    } catch (e) { alert('Login failed'); }
  };
  els.logoutBtn.onclick = () => { localStorage.removeItem('lm_admin_token'); state.token=''; hide('panelView'); show('loginView'); };

  document.querySelectorAll('nav button').forEach(btn=>{
    btn.onclick = ()=> switchTab(btn.dataset.tab);
  });

  // categories
  document.getElementById('addCategoryForm').onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/admin/categories', { method:'POST', headers: authHeaders(), body: JSON.stringify({ name: fd.get('name'), logo: fd.get('logo') }) });
    e.target.reset();
    loadCategories();
  };

  // channels
  document.getElementById('loadChannelsBtn').onclick = loadChannels;
  document.getElementById('addChannelForm').onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get('name'),
      logo: fd.get('logo'),
      priority: Number(fd.get('priority')||0),
      is_hide: fd.get('is_hide') ? 1 : 0,
    };
    await api(`/admin/categories/${Number(fd.get('category_id'))}/channels`, { method:'POST', headers: authHeaders(), body: JSON.stringify(body) });
    e.target.reset();
    loadChannels();
  };

  // streams
  document.getElementById('loadStreamsBtn').onclick = loadStreams;
  document.getElementById('addStreamForm').onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    let headersJSON = {};
    try { headersJSON = fd.get('headers') ? JSON.parse(fd.get('headers')) : {}; } catch { alert('Invalid headers JSON'); return; }
    const body = {
      name: fd.get('name'), url: fd.get('url'), url_type: Number(fd.get('url_type')||3),
      user_agent: fd.get('user_agent'), referer: fd.get('referer'), headers: headersJSON, drm: fd.get('drm')||null
    };
    await api(`/admin/channels/${Number(fd.get('channel_id'))}/streams`, { method:'POST', headers: authHeaders(), body: JSON.stringify(body) });
    e.target.reset();
    loadStreams();
  };

  // events
  document.getElementById('addEventForm').onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      start_time: Number(fd.get('start_time')),
      end_time: Number(fd.get('end_time')),
      champions: fd.get('champions'),
      commentary: fd.get('commentary'),
      team_1: { name: fd.get('team1_name'), logo: fd.get('team1_logo') },
      team_2: { name: fd.get('team2_name'), logo: fd.get('team2_logo') },
      channel: fd.get('channel')
    };
    await api('/admin/events', { method:'POST', headers: authHeaders(), body: JSON.stringify(body) });
    e.target.reset();
    loadEvents();
  };

  // event streams
  document.getElementById('loadEventStreamsBtn').onclick = loadEventStreams;
  document.getElementById('addEventStreamForm').onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    let headersJSON = {};
    try { headersJSON = fd.get('headers') ? JSON.parse(fd.get('headers')) : {}; } catch { alert('Invalid headers JSON'); return; }
    const body = {
      name: fd.get('name'), url: fd.get('url'), url_type: Number(fd.get('url_type')||3),
      user_agent: fd.get('user_agent'), referer: fd.get('referer'), headers: headersJSON, drm: fd.get('drm')||null
    };
    await api(`/admin/events/${Number(fd.get('event_id'))}/streams`, { method:'POST', headers: authHeaders(), body: JSON.stringify(body) });
    e.target.reset();
    loadEventStreams();
  };

  // initial loads
  loadCategories();

  // Import tab bindings
  const importResults = document.getElementById('importResults');
  let lastLoadedEventStreams = [];
  document.getElementById('importLoadCategoriesBtn').onclick = async ()=>{
    try{
      const data = await api('/admin/import/categories', { headers: authHeaders() });
      const items = data?.data || [];
      importResults.innerHTML = `<h3>External Categories (${items.length})</h3>` + items.map(c=>
        `<div class="card">[${c.id}] ${escapeHtml(c.name)} <button data-id="${c.id}" class="imp-add-cat">Add</button></div>`
      ).join('');
      importResults.querySelectorAll('.imp-add-cat').forEach(btn=>btn.onclick=()=>quickAddCategory(btn.dataset.id, items));
    }catch(e){ alert('Failed to load external categories'); }
  };
  document.getElementById('importLoadChannelsBtn').onclick = async ()=>{
    const extCatId = Number(document.getElementById('importCategoryId').value||0);
    if(!extCatId) return alert('Enter External Category ID');
    try{
      const data = await api(`/admin/import/categories/${extCatId}/channels`, { headers: authHeaders() });
      const items = data?.data || [];
      importResults.innerHTML = `<h3>External Channels for Category ${extCatId} (${items.length})</h3>` + items.map(ch=>
        `<div class="card">[${ch.id}] ${escapeHtml(ch.name)} <button data-id="${ch.id}" class="imp-add-ch">Add</button></div>`
      ).join('');
      importResults.querySelectorAll('.imp-add-ch').forEach(btn=>btn.onclick=()=>{
        const localCatId = Number(document.getElementById('importLocalCategoryId').value||0);
        if(!localCatId) return alert('Enter Local Category ID');
        quickAddChannel(localCatId, btn.dataset.id, items);
      });
    }catch(e){ alert('Failed to load external channels'); }
  };
  document.getElementById('importLoadEventsBtn').onclick = async ()=>{
    try{
      const data = await api('/admin/import/events', { headers: authHeaders() });
      const items = data?.data || [];
      importResults.innerHTML = `<h3>External Events (${items.length})</h3>` + items.map(ev=>
        `<div class="card">[${ev.id}] ${escapeHtml(ev.team_1?.name)} vs ${escapeHtml(ev.team_2?.name)} @ ${ev.start_time}
          <button data-id="${ev.id}" class="imp-add-ev">Add</button>
        </div>`
      ).join('');
      importResults.querySelectorAll('.imp-add-ev').forEach(btn=>btn.onclick=()=>quickAddEvent(btn.dataset.id, items));
    }catch(e){ alert('Failed to load external events'); }
  };
  document.getElementById('importLoadEventBtn').onclick = async ()=>{
    const evId = Number(document.getElementById('importEventId').value||0);
    if(!evId) return alert('Enter Event ID');
    try{
      const data = await api(`/admin/import/event/${evId}`, { headers: authHeaders() });
      const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      lastLoadedEventStreams = items;
      importResults.innerHTML = `<h3>External Event ${evId} Streams (${items.length})</h3>` + items.map(s=>
        `<div class="card">${escapeHtml(s.name||'')} - ${escapeHtml(s.url)}</div>`
      ).join('');
    }catch(e){ alert('Failed to load external event'); }
  };

  document.getElementById('importAddEventStreamsBtn').onclick = async ()=>{
    const localEventId = Number(document.getElementById('importLocalEventId').value||0);
    if(!localEventId) return alert('Enter Local Event ID');
    if(!lastLoadedEventStreams.length) return alert('Load external event streams first');
    try{
      for(const s of lastLoadedEventStreams){
        let headersJSON = {};
        try { headersJSON = s.headers && typeof s.headers === 'object' ? s.headers : (s.headers ? JSON.parse(s.headers) : {});} catch { headersJSON = {}; }
        await api(`/admin/events/${localEventId}/streams`, { method:'POST', headers: authHeaders(), body: JSON.stringify({
          name: s.name||'', url: s.url, url_type: Number(s.url_type||3), user_agent: s.user_agent||'', referer: s.referer||'', headers: headersJSON, drm: s.drm||null
        }) });
      }
      alert('Event streams imported');
    }catch(e){ alert('Failed to add event streams'); }
  };
}

async function quickAddCategory(extId, list){
  const c = list.find(x=>String(x.id)===String(extId));
  if(!c) return;
  await api('/admin/categories', { method:'POST', headers: authHeaders(), body: JSON.stringify({ name: c.name, logo: c.logo||'' }) });
  alert('Category added');
  loadCategories();
}

async function quickAddChannel(localCategoryId, extId, list){
  const ch = list.find(x=>String(x.id)===String(extId));
  if(!ch) return;
  await api(`/admin/categories/${localCategoryId}/channels`, { method:'POST', headers: authHeaders(), body: JSON.stringify({ name: ch.name, logo: ch.logo||'', priority: ch.priority||0, is_hide: ch.is_hide||0 }) });
  alert('Channel added');
}

async function quickAddEvent(extId, list){
  const ev = list.find(x=>String(x.id)===String(extId));
  if(!ev) return;
  const body = {
    start_time: ev.start_time, end_time: ev.end_time, champions: ev.champions||'', commentary: ev.commentary||'',
    team_1: { name: ev.team_1?.name||'', logo: ev.team_1?.logo||'' },
    team_2: { name: ev.team_2?.name||'', logo: ev.team_2?.logo||'' },
    channel: ev.channel||''
  };
  await api('/admin/events', { method:'POST', headers: authHeaders(), body: JSON.stringify(body) });
  alert('Event added');
  loadEvents();
}

async function loadCategories(){
  try{
    const rows = await api('/admin/categories', { headers: authHeaders() });
    const t = document.getElementById('categoriesTable');
    t.innerHTML = '<tr><th>ID</th><th>Name</th><th>Logo</th><th>Actions</th></tr>' +
      rows.map(r=>`<tr><td>${r.id}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.logo||'')}</td><td>
        <button data-id="${r.id}" class="del cat danger">Delete</button>
      </td></tr>`).join('');
    t.querySelectorAll('button.del.cat').forEach(btn=>btn.onclick=()=>delCategory(btn.dataset.id));
  }catch(e){ alert('Load categories failed'); }
}

async function delCategory(id){
  if(!confirm('Delete category '+id+'?')) return;
  await api(`/admin/categories/${id}`, { method:'DELETE', headers: authHeaders() });
  loadCategories();
}

async function loadChannels(){
  const id = Number(document.getElementById('channelsCategoryId').value || 0);
  if(!id) return alert('Enter Category ID');
  try{
    const rows = await api(`/admin/categories/${id}/channels`, { headers: authHeaders() });
    const t = document.getElementById('channelsTable');
    t.innerHTML = '<tr><th>ID</th><th>Name</th><th>Priority</th><th>Hidden</th><th>Actions</th></tr>' +
      rows.map(r=>`<tr><td>${r.id}</td><td>${escapeHtml(r.name)}</td><td>${r.priority||0}</td><td>${r.is_hide?1:0}</td><td>
        <button data-id="${r.id}" class="del ch danger">Delete</button>
      </td></tr>`).join('');
    t.querySelectorAll('button.del.ch').forEach(btn=>btn.onclick=()=>delChannel(btn.dataset.id));
  }catch(e){ alert('Load channels failed'); }
}

async function delChannel(id){
  if(!confirm('Delete channel '+id+'?')) return;
  await api(`/admin/channels/${id}`, { method:'DELETE', headers: authHeaders() });
  loadChannels();
}

async function loadStreams(){
  const id = Number(document.getElementById('streamsChannelId').value || 0);
  if(!id) return alert('Enter Channel ID');
  try{
    const rows = await api(`/admin/channels/${id}/streams`, { headers: authHeaders() });
    const t = document.getElementById('streamsTable');
    t.innerHTML = '<tr><th>ID</th><th>Name</th><th>URL</th><th>Type</th><th>Actions</th></tr>' +
      rows.map(r=>`<tr><td>${r.id}</td><td>${escapeHtml(r.name||'')}</td><td>${escapeHtml(r.url)}</td><td>${r.url_type||3}</td><td>
        <button data-id="${r.id}" class="del st danger">Delete</button>
      </td></tr>`).join('');
    t.querySelectorAll('button.del.st').forEach(btn=>btn.onclick=()=>delStream(btn.dataset.id));
  }catch(e){ alert('Load streams failed'); }
}

async function delStream(id){
  if(!confirm('Delete stream '+id+'?')) return;
  await api(`/admin/streams/${id}`, { method:'DELETE', headers: authHeaders() });
  loadStreams();
}

async function loadEvents(){
  try{
    const rows = await api('/admin/events', { headers: authHeaders() });
    const t = document.getElementById('eventsTable');
    t.innerHTML = '<tr><th>ID</th><th>Start</th><th>End</th><th>Teams</th><th>Actions</th></tr>' +
      rows.map(r=>`<tr><td>${r.id}</td><td>${r.start_time}</td><td>${r.end_time}</td><td>${escapeHtml(r.team1_name)} vs ${escapeHtml(r.team2_name)}</td><td>
        <button data-id="${r.id}" class="del ev danger">Delete</button>
      </td></tr>`).join('');
    t.querySelectorAll('button.del.ev').forEach(btn=>btn.onclick=()=>delEvent(btn.dataset.id));
  }catch(e){ alert('Load events failed'); }
}

async function delEvent(id){
  if(!confirm('Delete event '+id+'?')) return;
  await api(`/admin/events/${id}`, { method:'DELETE', headers: authHeaders() });
  loadEvents();
}

async function loadEventStreams(){
  const id = Number(document.getElementById('eventStreamsEventId').value || 0);
  if(!id) return alert('Enter Event ID');
  try{
    const rows = await api(`/admin/events/${id}/streams`, { headers: authHeaders() });
    const t = document.getElementById('eventStreamsTable');
    t.innerHTML = '<tr><th>ID</th><th>Name</th><th>URL</th><th>Type</th></tr>' +
      rows.map(r=>`<tr><td>${r.id}</td><td>${escapeHtml(r.name||'')}</td><td>${escapeHtml(r.url)}</td><td>${r.url_type||3}</td></tr>`).join('');
  }catch(e){ alert('Load event streams failed'); }
}

function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
}

window.addEventListener('DOMContentLoaded', init);
