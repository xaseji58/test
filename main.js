'use strict';

const state = {
  token: localStorage.getItem('lm_admin_token') || '',
  tab: 'categories',
};

const els = {
  loginView: null,
  panelView: null,
  tokenInput: null,
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
  els.tokenInput = document.getElementById('tokenInput');
  els.loginBtn = document.getElementById('loginBtn');
  els.logoutBtn = document.getElementById('logoutBtn');

  if (state.token) { show('panelView'); hide('loginView'); refreshAll(); }
  else { show('loginView'); hide('panelView'); }

  els.loginBtn.onclick = () => {
    const t = els.tokenInput.value.trim();
    if (!t) return alert('Enter token');
    state.token = t; localStorage.setItem('lm_admin_token', t);
    show('panelView'); hide('loginView'); refreshAll();
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
