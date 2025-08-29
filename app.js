// --- Utilities ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const storeKey = 'civicmap.issues.v1';

const saveIssues = (data) => localStorage.setItem(storeKey, JSON.stringify(data));
const loadIssues = () => { try { return JSON.parse(localStorage.getItem(storeKey)) || []; } catch { return []; } };

function formatDate(ts){ const d = new Date(ts); return d.toLocaleString(); }

function statusClass(s){
    if(s==='resolved') return 'status-resolved';
    if(s==='in-progress') return 'status-progress';
    return 'status-open';
}

function statusLabel(s){
    if(s==='resolved') return 'Resolved';
    if(s==='in-progress') return 'In Progress';
    return 'Open';
}

// --- Map ---
let map, markersLayer;
let issues = loadIssues();
let activeEditId = null; // for editing existing issues

function initMap(){
    map = L.map('map').setView([20.5937, 78.9629], 5); // India default

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    map.on('click', (e) => {
    openIssueModal({ lat:e.latlng.lat.toFixed(6), lng:e.latlng.lng.toFixed(6) });
    });

    // Try geolocate
    $('#btnLocate').addEventListener('click', () => {
    if(!navigator.geolocation){ alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition((pos)=>{
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 14);
    }, ()=> alert('Unable to get location'));
    });
}

function iconForStatus(status){
    const color = status==='resolved' ? '#34d399' : status==='in-progress' ? '#60a5fa' : '#fbbf24';
    // Simple circle marker via DivIcon
    return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 2px rgba(0,0,0,.25)"></div>`,
    iconSize: [14,14],
    iconAnchor: [7,7]
    });
}

function renderMarkers(){
    markersLayer.clearLayers();
    filteredAndSorted().forEach(it => {
    const m = L.marker([it.lat, it.lng], { icon: iconForStatus(it.status) })
        .addTo(markersLayer)
        .on('click', ()=> openDetails(it.id));
    m.bindTooltip(`${it.title} — ${statusLabel(it.status)}`);
    });
}

// --- UI Rendering ---
function filteredAndSorted(){
    const q = $('#search').value.trim().toLowerCase();
    const cat = $('#filterCategory').value;
    const st = $('#filterStatus').value;
    const sort = $('#sortBy').value;

    let arr = [...issues];
    if(q){ arr = arr.filter(i => (i.title+" "+i.description).toLowerCase().includes(q)); }
    if(cat){ arr = arr.filter(i => i.category === cat); }
    if(st){ arr = arr.filter(i => i.status === st); }

    if(sort==='votes') arr.sort((a,b)=> b.votes - a.votes);
    else if(sort==='old') arr.sort((a,b)=> a.createdAt - b.createdAt);
    else arr.sort((a,b)=> b.createdAt - a.createdAt);

    return arr;
}

function renderList(){
    const list = $('#issueList');
    list.innerHTML = '';
    const arr = filteredAndSorted();
    if(!arr.length){ list.innerHTML = `<div class="card"><div><h4>No issues yet</h4><div class="meta">Be the first to report a problem. Click on the map or use the ＋ button.</div></div></div>`; return; }
    for(const it of arr){
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
        <div>
        <h4>${escapeHtml(it.title)}</h4>
        <div class="meta">${escapeHtml(it.category)} • <span class="${statusClass(it.status)}">${statusLabel(it.status)}</span> • ${formatDate(it.createdAt)}</div>
        <div class="tags">
            <span class="tag">Lat ${Number(it.lat).toFixed(4)}</span>
            <span class="tag">Lng ${Number(it.lng).toFixed(4)}</span>
            <span class="tag">Votes ${it.votes}</span>
        </div>
        </div>
        <div class="actions">
        <button class="upvote" data-id="${it.id}">▲ ${it.votes}</button>
        <button class="btn-ghost" data-open="${it.id}" style="width:auto">Open</button>
        <button class="btn-ghost" data-edit="${it.id}" style="width:auto">Edit</button>
        </div>
    `;
    list.appendChild(el);
    }

    // attach handlers
    list.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', (e)=> openDetails(e.target.getAttribute('data-open'))));
    list.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', (e)=> startEdit(e.target.getAttribute('data-edit'))));
    list.querySelectorAll('.upvote').forEach(b=> b.addEventListener('click', (e)=> upvote(e.target.getAttribute('data-id'))));
}

function upvote(id){
    const idx = issues.findIndex(i=>i.id===id);
    if(idx>-1){ issues[idx].votes++; saveIssues(issues); renderList(); renderMarkers(); }
}

function openDetails(id){
    const it = issues.find(i=>i.id===id);
    if(!it) return;
    const body = $('#detailsBody');
    const img = it.photoDataUrl ? `<img src="${it.photoDataUrl}" alt="photo" style="max-width:100%; border-radius:12px; border:1px solid rgba(255,255,255,.08)" />` : '';
    const comments = (it.comments||[]).map(c=> `<div class="card" style="grid-template-columns:1fr"><div><div class="meta">${formatDate(c.ts)}</div><div>${escapeHtml(c.text)}</div></div></div>`).join('');
    const solutions = (it.solutions||[]).map(s=> `<div class="card" style="grid-template-columns:1fr"><div><div class="meta">Proposed • ${formatDate(s.ts)}</div><div>${escapeHtml(s.text)}</div></div></div>`).join('');

    body.innerHTML = `
    <div class="grid-2">
        <div>
        <h3 style="margin:0 0 6px 0">${escapeHtml(it.title)}</h3>
        <div class="meta">${escapeHtml(it.category)} • <span class="${statusClass(it.status)}">${statusLabel(it.status)}</span> • Votes ${it.votes}</div>
        <p style="margin-top:8px">${escapeHtml(it.description||'')}</p>
        <div style="display:flex; gap:8px; margin-top:8px">
            <button class="btn-ghost" id="detailsZoom" style="width:auto">Zoom to</button>
            <button class="btn-ghost" id="detailsEdit" style="width:auto">Edit</button>
            <select id="detailsStatus" style="width:auto">
            <option value="open" ${it.status==='open'?'selected':''}>Open</option>
            <option value="in-progress" ${it.status==='in-progress'?'selected':''}>In Progress</option>
            <option value="resolved" ${it.status==='resolved'?'selected':''}>Resolved</option>
            </select>
        </div>
        <div style="margin-top:10px" class="tags">
            <span class="tag">Lat ${Number(it.lat).toFixed(5)}</span>
            <span class="tag">Lng ${Number(it.lng).toFixed(5)}</span>
            <span class="tag">Created ${formatDate(it.createdAt)}</span>
            ${it.updatedAt ? `<span class="tag">Updated ${formatDate(it.updatedAt)}</span>` : ''}
        </div>
        </div>
        <div>${img}</div>
    </div>

    <h4 style="margin:12px 0 6px">Comments</h4>
    ${comments || '<div class="meta">No comments yet.</div>'}
    <div style="display:flex; gap:8px; margin-top:8px">
        <input id="commentInput" placeholder="Add a comment…" />
        <button id="commentAdd" class="btn" style="width:auto">Post</button>
    </div>

    <h4 style="margin:12px 0 6px">Proposed Solutions</h4>
    ${solutions || '<div class="meta">No solutions yet.</div>'}
    <div style="display:flex; gap:8px; margin-top:8px">
        <input id="solutionInput" placeholder="Suggest a solution…" />
        <button id="solutionAdd" class="btn" style="width:auto">Add</button>
    </div>
    `;

    // attach actions
    $('#detailsZoom').onclick = ()=> { map.setView([it.lat, it.lng], 17); };
    $('#detailsEdit').onclick = ()=> { closeDetails(); startEdit(id); };
    $('#detailsStatus').onchange = (e)=> { it.status = e.target.value; it.updatedAt = Date.now(); saveIssues(issues); renderList(); renderMarkers(); openDetails(id); };
    $('#commentAdd').onclick = ()=> { const t = $('#commentInput').value.trim(); if(!t) return; it.comments = it.comments||[]; it.comments.push({ text:t, ts:Date.now() }); $('#commentInput').value=''; it.updatedAt = Date.now(); saveIssues(issues); openDetails(id); };
    $('#solutionAdd').onclick = ()=> { const t = $('#solutionInput').value.trim(); if(!t) return; it.solutions = it.solutions||[]; it.solutions.push({ text:t, ts:Date.now() }); $('#solutionInput').value=''; it.updatedAt = Date.now(); saveIssues(issues); openDetails(id); };

    openDetailsModal();
}

// --- Modal helpers ---
function openIssueModal(preset={}){
    activeEditId = null;
    $('#modalTitle').textContent = 'Report an Issue';
    $('#btnDelete').classList.add('hidden');
    $('#issueForm').reset();
    $('#fStatus').value = 'open';
    if(preset.lat) $('#fLat').value = preset.lat;
    if(preset.lng) $('#fLng').value = preset.lng;
    openModal('#issueModal');
}

function startEdit(id){
    const it = issues.find(i=>i.id===id);
    if(!it) return;
    activeEditId = id;
    $('#modalTitle').textContent = 'Edit Issue';
    $('#btnDelete').classList.remove('hidden');
    $('#issueForm').reset();
    $('#fTitle').value = it.title;
    $('#fCategory').value = it.category;
    $('#fStatus').value = it.status;
    $('#fDesc').value = it.description||'';
    $('#fLat').value = it.lat;
    $('#fLng').value = it.lng;
    $('#fPhoto').value = '';
    openModal('#issueModal');
}

function openDetailsModal(){ openModal('#detailsModal'); }
function closeDetails(){ closeModal('#detailsModal'); }

function openModal(sel){ $(sel).classList.add('active'); }
function closeModal(sel){ $(sel).classList.remove('active'); }

// --- Form submit ---
$('#issueForm')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const title = $('#fTitle').value.trim();
    const category = $('#fCategory').value;
    const status = $('#fStatus').value;
    const description = $('#fDesc').value.trim();
    const lat = parseFloat($('#fLat').value);
    const lng = parseFloat($('#fLng').value);

    if(!title || isNaN(lat) || isNaN(lng)) { alert('Please provide title and valid coordinates.'); return; }

    const file = $('#fPhoto').files?.[0];
    let photoDataUrl = null;
    if(file){ photoDataUrl = await fileToDataUrl(file); }

    if(activeEditId){
    const idx = issues.findIndex(i=>i.id===activeEditId);
    if(idx>-1){
        issues[idx] = { ...issues[idx], title, category, status, description, lat, lng, updatedAt: Date.now(), ...(photoDataUrl?{photoDataUrl}:{}) };
    }
    } else {
    issues.push({ id: uid(), title, category, status, description, lat, lng, photoDataUrl, votes: 0, createdAt: Date.now(), comments:[], solutions:[] });
    }

    saveIssues(issues);
    renderList();
    renderMarkers();
    closeModal('#issueModal');
});

$('#btnDelete').addEventListener('click', ()=>{
    if(!activeEditId) return;
    if(confirm('Delete this issue?')){
    issues = issues.filter(i=>i.id!==activeEditId);
    saveIssues(issues); activeEditId=null; renderList(); renderMarkers(); closeModal('#issueModal');
    }
});

// --- Buttons / Filters ---
$('#btnAdd').addEventListener('click', ()=> openIssueModal());
$('#modalClose').addEventListener('click', ()=> closeModal('#issueModal'));
$('#detailsClose').addEventListener('click', ()=> closeDetails());

['#search','#filterCategory','#filterStatus','#sortBy'].forEach(sel=> $(sel).addEventListener('input', ()=> { renderList(); renderMarkers(); }));

// --- Import / Export JSON ---
$('#btnExport').addEventListener('click', ()=>{
    const data = JSON.stringify(issues, null, 2);
    const blob = new Blob([data], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `civicmap-export-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
});

$('#importFile').addEventListener('change', (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
    try { const data = JSON.parse(reader.result);
        if(Array.isArray(data)) { issues = data; saveIssues(issues); renderList(); renderMarkers(); alert('Import successful'); }
        else alert('Invalid file format');
    } catch { alert('Failed to parse file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
});

// --- Helpers ---
function escapeHtml(str=''){ return str.replace(/[&<>"']/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]) ); }

function fileToDataUrl(file){
    return new Promise((res, rej)=> { const r = new FileReader(); r.onerror = rej; r.onload = ()=> res(r.result); r.readAsDataURL(file); });
}

// --- Boot ---
window.addEventListener('DOMContentLoaded', ()=>{ initMap(); renderList(); renderMarkers(); });