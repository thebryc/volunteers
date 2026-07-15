// ══ STATE ════════════════════════════════════════
const DEFAULT = {
  passwords: { admin: 'vip27', staff: 'vip27' },
  categories: ['PY26 Interest/Waitlist','Mentor Referral','Team Referral','Late Intake/Interest Form','Interest Form','PY26 Self-Dismissed','Friendraiser','Court Connections','Alumni','Intake After Kickoff','Bingo','Exxon','Unsure Returners','Dow','FranU','LSU MBA','CityYear','Unitech','BRCC','PY25 Mentors','PY24 Mentors'],
  statuses: ['Invited to Friendraiser','Committed','Onboarding - Need BG Check','Late Intake - ask again','Final Email Sent','RSVPed to Training','RSVP July Bingo','Unavailable','Interested!','Zoom interest!','Zoom attended','Reask','Attended Bingo - Convos in Progress','Final Text Sent','Convos in Progress'],
  comms: ['Intake Welcome','Interest Follow-up','Follow-up 2','Bingo Invite','First Email Sent','Bingo Thank You','Missed Bingo Follow-Up','Virtual Session Invite','Intake Ask','Unavailable','Virtual Follow-up'],
  teamMembers: [],
  prospects: [],
  formUrls: { interest: '', intake: '' },
  events: [{
    id: 'court-connections',
    name: 'Court Connections',
    date: 'Thursday, April 9, 2026',
    time: '6:00 – 9:00 PM',
    location: 'Court to Table · 7477 Burbank Dr',
    desc: 'Volunteer Appreciation & Friendraiser Kickoff · Presented by Hancock Whitney',
    formUrl: 'https://docs.google.com/forms/d/1clhRvQnSjrWp4bnRgf1FNfY12HKZp83QRlarY1-U6d4/viewform',
    rsvps: [],
    checkins: [],
    active: true
  }],
  formResponses: { interest: [], applications: [] }
};

let DB = loadDB();
let currentRole = null;
let currentEventId = null;
let prospectView = 'table'; // 'table' or 'kanban'

function loadDB() {
  try {
    const saved = localStorage.getItem('bryc-py27-cache');
    return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT));
  } catch(e) { return JSON.parse(JSON.stringify(DEFAULT)); }
}

  function toggleBlock(id) {
  const el = document.getElementById(id);
  const toggle = document.getElementById(id + '-toggle');
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? '' : 'none';
  if (toggle) toggle.textContent = isHidden ? '▼' : '▶';
}

async function saveDB() {
  try { localStorage.setItem('bryc-py27-cache', JSON.stringify(DB)); } catch(e) {}
  if (window._fb) {
    if (currentRole) setSyncStatus('saving');
    try {
      await window._fb.setDoc(window._fb.DB_DOC, DB);
      if (currentRole) setSyncStatus('saved');
    } catch(e) {
      console.warn('Firebase save failed:', e);
      if (currentRole) setSyncStatus('error');
    }
  }
}

function setSyncStatus(state) {
  const el = document.getElementById('fb-sync-status');
  if (!el) return;
  if (state === 'live')    { el.textContent = '⬤ live'; el.style.color = '#4caf50'; }
  if (state === 'saving')  { el.textContent = '⬤ saving…'; el.style.color = 'var(--gold)'; }
  if (state === 'saved')   { el.textContent = '⬤ saved'; el.style.color = '#4caf50'; setTimeout(()=>setSyncStatus('live'), 2000); }
  if (state === 'error')   { el.textContent = '⬤ offline'; el.style.color = 'var(--danger)'; }
  if (state === 'loading') { el.textContent = '⬤ loading…'; el.style.color = 'var(--muted)'; }
}

async function loadFromFirebase() {
  try {
    const cached = localStorage.getItem('bryc-py27-cache');
    if (cached) {
      DB = JSON.parse(cached);
      renderAll();
      try { refreshEventDetail(); } catch(e) {}
      try { renderCourtQueue(); } catch(e) {}
      populateDropdowns();
    }
  } catch(e) {}
  if (!window._fb) return;
  try {
    const snap = await window._fb.getDoc(window._fb.DB_DOC);
    if (snap.exists()) {
      DB = snap.data();
      if (!currentEventId && DB.events?.length) currentEventId = DB.events[0].id;
      if (!DB.formUrls) DB.formUrls = { interest: '', intake: '' };
      try { localStorage.setItem('bryc-py27-cache', JSON.stringify(DB)); } catch(e) {}
    } else {
      await window._fb.setDoc(window._fb.DB_DOC, DB);
    }
    renderAll();
    try { refreshEventDetail(); } catch(e) {}
    try { renderCourtQueue(); } catch(e) {}
    populateDropdowns();
  } catch(e) { console.warn('Firebase load failed, using cache:', e); }
}

let _unsubscribe = null;
function startRealtimeSync() {
  if (!window._fb || _unsubscribe) return;
  setSyncStatus('loading');
  _unsubscribe = window._fb.onSnapshot(window._fb.DB_DOC, (snap) => {
    if (snap.exists() && currentRole) {
      DB = snap.data();
      if (!DB.formUrls) DB.formUrls = { interest: '', intake: '' };
      try { localStorage.setItem('bryc-py27-cache', JSON.stringify(DB)); } catch(e) {}
      renderAll();
      populateDropdowns();
      setSyncStatus('live');
    }
  }, (e) => { console.warn('Realtime sync error:', e); setSyncStatus('error'); });
}
function stopRealtimeSync() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
}

// ══ LOGIN ════════════════════════════════════════
let loginRole = 'admin';

function setLoginRole(role, btn) {
  loginRole = role;
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}

async function doLogin() {
  const pw = document.getElementById('login-pw').value;
  const err = document.getElementById('login-err');
  const btn = document.querySelector('#login-modal .login-btn');

  let role = null;
  if (pw === DB.passwords.admin && loginRole === 'admin') role = 'admin';
  else if (pw === DB.passwords.staff && loginRole === 'staff') role = 'staff';
  else {
    err.textContent = 'Incorrect password. Try again.';
    err.style.display = 'block';
    setTimeout(() => err.style.display = 'none', 3000);
    return;
  }

  if (!window._fbUser) {
    try {
      if (btn) { btn.textContent = 'Signing in with Google…'; btn.disabled = true; }
      err.style.display = 'none';
      await window._fb.signInWithPopup(window._fb.auth, window._fb.provider);
    } catch(e) {
      if (btn) { btn.textContent = 'SIGN IN'; btn.disabled = false; }
      err.textContent = 'Google sign-in failed or was cancelled.';
      err.style.display = 'block';
      setTimeout(() => err.style.display = 'none', 4000);
      return;
    }
    if (btn) { btn.textContent = 'SIGN IN'; btn.disabled = false; }
  }

  currentRole = role;
  document.getElementById('login-modal').classList.remove('open');
  document.getElementById('login-pw').value = '';
  startApp();
}

function startApp() {
  document.getElementById('app').style.display = '';
  document.getElementById('app').classList.add('show');
  document.getElementById('role-badge').textContent = currentRole === 'admin' ? 'Admin' : 'Staff';
  if (currentRole !== 'admin') {
    document.getElementById('settings-btn').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
  }
  populateDropdowns();
  preloadEventDefaults();
  renderAll();
  loadFromFirebase().then(() => startRealtimeSync());
}

function doLogout() {
  if (!confirm('Sign out?')) return;
  stopRealtimeSync();
  currentRole = null;
  if (window._fb && window._fbUser) {
    window._fb.signOut(window._fb.auth).catch(() => {});
    window._fbUser = null;
  }
  document.getElementById('app').classList.remove('show');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-modal').classList.add('open');
  document.getElementById('login-pw').value = '';
}

// ══ NAVIGATION ═══════════════════════════════════
function goPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id)?.classList.add('active');
  if (btn) {
    document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
    btn.classList?.add('active');
  }
  if (id === 'dashboard') renderDashboard();
  if (id === 'prospects') renderProspects();
  if (id === 'events') renderEventCards();
  if (id === 'settings') { renderSettings(); setTimeout(populateSheetSettings, 50); }
  window.scrollTo(0, 0);
}

// ══ DASHBOARD ════════════════════════════════════
function renderDashboard() {
  const p = DB.prospects;
  document.getElementById('d-total').textContent = p.length;
  document.getElementById('d-committed').textContent = p.filter(x => x.status === 'Committed').length;
  document.getElementById('d-interested').textContent = p.filter(x => x.status && x.status.includes('Interested')).length;
  document.getElementById('d-good').textContent = p.filter(x => x.good === 'yes').length;
  document.getElementById('d-events').textContent = DB.events.length;
  document.getElementById('d-responses').textContent = DB.formResponses.interest.length + DB.formResponses.applications.length;
  document.getElementById('sb-prospect-cnt').textContent = p.length;

  const recentTbody = document.getElementById('dash-recent-tbody');
if (recentTbody) {
  const recent = [...DB.prospects]
    .sort((a,b) => new Date(b.dateAdded||0) - new Date(a.dateAdded||0))
    .slice(0,8);
  recentTbody.innerHTML = recent.length ? recent.map(p => `<tr>
    <td><strong>${p.name||[p.fname,p.lname].filter(Boolean).join(' ')}</strong></td>
    <td>${p.category?`<span class="badge b-teal">${p.category}</span>`:'—'}</td>
    <td>${p.status?`<span class="badge b-gold">${p.status}</span>`:'—'}</td>
    <td style="font-size:12px;color:var(--muted)">${p.dateAdded||'—'}</td>
    <td><button class="btn btn-ghost btn-xs" onclick="openEditProspect('${p.email||''}')">Edit</button></td>
  </tr>`).join('') : `<tr><td colspan="5"><div class="empty"><div class="ei">🕐</div><p>No prospects yet.</p></div></td></tr>`;
}

  const statusCounts = {};
  p.forEach(x => { if(x.status) statusCounts[x.status] = (statusCounts[x.status]||0)+1; });
  const entries = Object.entries(statusCounts).sort((a,b)=>b[1]-a[1]);
  const maxS = Math.max(...Object.values(statusCounts), 1);
  const sg = document.getElementById('dash-status-grid');
  const statusColors = {
    'Invited to Friendraiser':'#e74c3c','Committed':'#2ecc71','Onboarding - Need BG Check':'#88ded0',
    'Late Intake - ask again':'#f0c917','Final Email Sent':'#ffa550','RSVPed to Training':'#b478ff',
    'RSVP July Bingo':'#88c4ff','Unavailable':'#e74c3c','Interested!':'#f0c917',
    'Zoom interest!':'#aaa','Zoom attended':'#aaa','Reask':'#aaa',
    'Attended Bingo - Convos in Progress':'#2ecc71','Final Text Sent':'#ffa550','Convos in Progress':'#ccc',
  };
  sg.innerHTML = entries.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:18px;width:100%;box-sizing:border-box;">${entries.map(([s,n]) => {
    const col = statusColors[s] || '#ed125f';
    return `<div style="background:white;border:1px solid rgba(0,0,0,0.08);border-top:3px solid ${col};border-radius:12px;padding:14px 16px;min-width:0;box-sizing:border-box;">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${col};margin-bottom:8px;">${s}</div>
      <div style="font-family:'barlow-semi-condensed',sans-serif;font-size:34px;font-weight:400;color:#1a1a1a;line-height:1;margin-bottom:8px;">${n}</div>
      <div style="height:3px;background:rgba(0,0,0,0.06);border-radius:2px;"><div style="width:${Math.round(n/maxS*100)}%;height:100%;background:${col};border-radius:2px;"></div></div>
    </div>`;}).join('')}</div>` : `<div class="empty"><div class="ei">📈</div><p>Add prospects to see breakdown.</p></div>`;
}

// ══ PROSPECTS ════════════════════════════════════
let _sortCol = 'dateAdded', _sortDir = -1;

function sortProspects(col) {
  if (_sortCol === col) { _sortDir *= -1; } else { _sortCol = col; _sortDir = 1; }
  renderProspects();
}

function statusSelectClass(s) {
  const m = {
    'Invited to Friendraiser':'s-invited','Committed':'s-committed','Onboarding - Need BG Check':'s-onboarding',
    'Late Intake - ask again':'s-late','Final Email Sent':'s-finalemail','RSVPed to Training':'s-rsvptrain',
    'RSVP July Bingo':'s-rsvpbingo','Unavailable':'s-unavail','Interested!':'s-interested',
    'Zoom interest!':'s-zoom','Zoom attended':'s-zoom','Reask':'s-reask',
    'Attended Bingo - Convos in Progress':'s-bingo','Final Text Sent':'s-finaltext',
    'Convos in Progress':'s-convos','Friendraiser Guest':'s-fguest','Friendraiser RSVP':'s-frsvp',
  };
  return m[s] || 's-default';
}

function inlineUpdateProspect(realIdx, field, value) {
  DB.prospects[realIdx][field] = value;
  const updated = DB.prospects[realIdx];
  saveDB();
  renderProspects();
  gsWriteProspectToSheet(updated, 'update').catch(() => {});
}

const PK_COLUMNS = {
  exploring:  ['Interested!','Zoom interest!','Zoom attended','Convos in Progress','Attended Bingo - Convos in Progress'],
  outreach:   ['Invited to Friendraiser','Friendraiser RSVP','Friendraiser Guest','Final Email Sent','Final Text Sent','RSVPed to Training','RSVP July Bingo','Late Intake - ask again','Reask'],
  onboarding: ['Onboarding - Need BG Check','Committed'],
  onhold:     ['Unavailable'],
};

function getProspectColumn(status) {
  if (!status) return 'new';
  for (const [col, statuses] of Object.entries(PK_COLUMNS)) {
    if (statuses.includes(status)) return col;
  }
  return 'new';
}

function setProspectView(view) {
  prospectView = view;
  const tableBlock = document.querySelector('#page-prospects .block');
  const kanban = document.getElementById('prospect-kanban');
  const tableBtn  = document.getElementById('prospect-view-table');
  const kanbanBtn = document.getElementById('prospect-view-kanban');
  if (view === 'kanban') {
    if (tableBlock) tableBlock.style.display = 'none';
    if (kanban) kanban.style.display = '';
    if (tableBtn)  { tableBtn.style.background = 'transparent'; tableBtn.style.color = 'var(--muted)'; }
    if (kanbanBtn) { kanbanBtn.style.background = 'var(--forest-light)'; kanbanBtn.style.color = 'white'; }
  } else {
    if (tableBlock) tableBlock.style.display = '';
    if (kanban) kanban.style.display = 'none';
    if (tableBtn)  { tableBtn.style.background = 'var(--forest-light)'; tableBtn.style.color = 'white'; }
    if (kanbanBtn) { kanbanBtn.style.background = 'transparent'; kanbanBtn.style.color = 'var(--muted)'; }
  }
  renderProspects();
}

function emailPkColumn(colId) {
  const col = document.getElementById(colId);
  if (!col) return;
  const emails = [...col.querySelectorAll('[data-email]')]
    .map(el => el.dataset.email)
    .filter(e => e && e.includes('@'));
  if (!emails.length) { alert('No email addresses found in this column.'); return; }
  window.open(`https://mail.google.com/mail/?view=cm&to=angela@thebryc.org&bcc=${encodeURIComponent(emails.join(','))}`);
}

function pkProspectCard(p, idx) {
  const name  = p.name || `${p.fname||''} ${p.lname||''}`.trim() || '(No Name)';
  const email = p.email || '';
  const phone = p.phone || '';
  const campus = p.campus || '';
  const days  = p.days ? p.days.split(',').map(s => s.trim()).filter(Boolean) : [];
  const roles = [p.role1, p.role2].filter(Boolean);
  const shortRole = r => r.replace('Research Mentor','Research LM').replace('Learning Mentor','Learning LM').replace('Upperclassmen Mentor','Upperclassmen LM').replace('Senior Mentor','Senior LM').replace('Not comfortable with any other role','No 2nd choice');
  return `
    <div data-email="${email}" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;cursor:pointer;transition:all .15s;"
         onmouseenter="this.style.background='var(--card-h)'" onmouseleave="this.style.background='var(--card)'"
         onclick="openEditProspect(${idx})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="font-weight:700;font-size:13px;color:var(--ink);">${name}</div>
        ${email ? `<a href="https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}" target="_blank" class="btn btn-ghost btn-xs" onclick="event.stopPropagation()" title="${email}">✉</a>` : ''}
      </div>
      ${p.category ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${p.category}</div>` : ''}
      ${campus ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">📍 ${campus}</div>` : ''}
      ${roles.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
          ${roles.map(r => `<span style="background:rgba(240,201,23,.1);color:var(--gold);padding:1px 6px;border-radius:50px;font-size:9px;font-weight:600;">${shortRole(r)}</span>`).join('')}
        </div>` : ''}
      ${days.length ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">📅 ${days.join(', ')}</div>` : ''}
      ${email ? `<div style="font-size:11px;color:var(--muted);">✉ ${email}</div>` : ''}
      ${phone ? `<div style="font-size:11px;color:var(--muted);">📞 ${phone}</div>` : ''}
    </div>`;
}
  
function renderProspects() {
  const q = document.getElementById('prospect-search')?.value.toLowerCase() || '';
  const fCat = document.getElementById('f-category')?.value || '';
  const fStat = document.getElementById('f-status')?.value || '';
  const fGood = document.getElementById('f-good')?.value || '';

  let list = DB.prospects.filter(p => {
    if (q && !`${p.name}${p.email}${p.phone}${p.org||''}`.toLowerCase().includes(q)) return false;
    if (fCat && p.category !== fCat) return false;
    if (fStat && p.status !== fStat) return false;
    if (fGood && p.good !== fGood) return false;
    return true;
  });

  list.sort((a, b) => {
    let av = (a[_sortCol] || '').toString().toLowerCase();
    let bv = (b[_sortCol] || '').toString().toLowerCase();
    if (av < bv) return -1 * _sortDir;
    if (av > bv) return  1 * _sortDir;
    return 0;
  });

  document.getElementById('prospect-count-badge').textContent = list.length;
  document.getElementById('prospect-total-label').textContent = DB.prospects.length;
  document.getElementById('sb-prospect-cnt').textContent = DB.prospects.length;

  const statuses   = ['', ...DB.statuses];
  const categories = ['', ...DB.categories];

  const tb = document.getElementById('prospects-tbody');
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="10"><div class="empty"><div class="ei">🎯</div><p>No prospects match your filters.</p></div></td></tr>`;
    return;
  }

  tb.innerHTML = list.map((p) => {
    const realIdx = DB.prospects.indexOf(p);
    const statusOpts = statuses.map(s => `<option value="${s}" ${p.status===s?'selected':''}>${s||'— status —'}</option>`).join('');
    const catOpts    = categories.map(c => `<option value="${c}" ${p.category===c?'selected':''}>${c||'— category —'}</option>`).join('');
    const goodOpts   = `<option value="" ${!p.good?'selected':''}>—</option><option value="yes" ${p.good==='yes'?'selected':''}>⭐ Yes</option><option value="no" ${p.good==='no'?'selected':''}>No</option>`;
    const statCls = statusSelectClass(p.status);
    const goodCls = p.good === 'yes' ? 'g-yes' : p.good === 'no' ? 'g-no' : 'g-empty';
    const gmailUrl = p.email ? `https://mail.google.com/mail/?authuser=angela@thebryc.org&view=cm&fs=1&to=${encodeURIComponent(p.email)}&su=${encodeURIComponent('Volunteer with BRYC')}&body=${encodeURIComponent('Hi ' + (p.fname||p.name.split(' ')[0]) + ',\n\n')}` : '';
    return `<tr>
      <td><strong>${p.name}</strong></td>
      <td><select class="sel-category s-default" onchange="inlineUpdateProspect(${realIdx},'category',this.value)">${catOpts}</select></td>
      <td><select class="sel-status ${statCls}" onchange="inlineUpdateProspect(${realIdx},'status',this.value); this.className='sel-status '+statusSelectClass(this.value);">${statusOpts}</select></td>
      <td>${p.comms ? `<span class="badge b-blue">${p.comms}</span>` : '—'}</td>
      <td>${p.teamRef ? `<span class="badge b-teal">${p.teamRef}</span>` : '—'}</td>
      <td><select class="sel-good ${goodCls}" onchange="inlineUpdateProspect(${realIdx},'good',this.value); this.className='sel-good '+(this.value==='yes'?'g-yes':this.value==='no'?'g-no':'g-empty');">${goodOpts}</select></td>
      <td style="font-size:12px">${p.email||'—'}</td>
      <td style="font-size:12px">${p.phone||'—'}</td>
      <td style="font-size:11px;color:var(--muted)">${p.dateAdded||'—'}</td>
      <td style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-gold btn-xs" onclick="openEditProspect(${realIdx})">✏ Edit</button>
        ${p.email ? `<a href="${gmailUrl}" target="_blank" class="btn btn-ghost btn-xs" style="text-decoration:none">✉ Email</a>` : ''}
      </td>
    </tr>`;
  }).join('');
  // Kanban view
  if (prospectView === 'kanban') {
    const cols = { exploring: [], outreach: [], onboarding: [], onhold: [], new: [] };
    list.forEach(p => {
      const col = getProspectColumn(p.status);
      cols[col].push(p);
    });
    ['exploring','outreach','onboarding','onhold','new'].forEach(col => {
      const el = document.getElementById(`pk-col-${col}`);
      const cnt = document.getElementById(`pk-col-${col}-cnt`);
      if (cnt) cnt.textContent = `${cols[col].length} people`;
      if (!el) return;
      if (cols[col].length === 0) {
        el.innerHTML = `<div style="text-align:center;padding:20px 12px;color:rgba(0,0,0,.2);font-size:12px;border:1px dashed rgba(0,0,0,.1);border-radius:10px;">Empty</div>`;
        return;
      }
      el.innerHTML = cols[col].map(p => pkProspectCard(p, DB.prospects.indexOf(p))).join('');
    });
  }
}

function clearFilters() {
  document.getElementById('prospect-search').value = '';
  document.getElementById('f-category').value = '';
  document.getElementById('f-status').value = '';
  document.getElementById('f-good').value = '';
  renderProspects();
}

function saveProspect() {
  const fname = document.getElementById('ap-fname').value.trim();
  const lname = document.getElementById('ap-lname').value.trim();
  if (!fname) { alert('Please enter a first name.'); return; }
  const newP = {
    name: `${fname} ${lname}`.trim(), fname, lname,
    email: document.getElementById('ap-email').value.trim(),
    phone: document.getElementById('ap-phone').value.trim(),
    category: document.getElementById('ap-category').value,
    status: document.getElementById('ap-status').value,
    teamRef: document.getElementById('ap-team-ref').value,
    comms: document.getElementById('ap-comms').value,
    good: document.getElementById('ap-good').value,
    dateAdded: document.getElementById('ap-date').value || new Date().toLocaleDateString(),
    notes: document.getElementById('ap-notes').value.trim(),
    customMsg: document.getElementById('ap-message').value.trim(),
    role1: document.getElementById('ap-role1').value,
    role2: document.getElementById('ap-role2').value,
    campus: [
      document.getElementById('ap-campus-downtown')?.checked ? 'Downtown' : null,
      document.getElementById('ap-campus-airline')?.checked ? 'Airline' : null,
      document.getElementById('ap-campus-unsure')?.checked ? 'Unsure' : null,
      document.getElementById('ap-campus-gmeets')?.checked ? 'Google Meets (Tutors)' : null,
    ].filter(Boolean).join(', '),
    days: ['mon','tue','wed','thu','na'].filter(d => document.getElementById(`ap-day-${d}`)?.checked).map(d => ({mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',na:'N/A — Tutor'}[d])).join(', ')
  };
  DB.prospects.push(newP);
  saveDB(); closeModal('add-prospect-modal');
  ['ap-fname','ap-lname','ap-email','ap-phone','ap-notes','ap-message'].forEach(id => document.getElementById(id).value = '');
  renderProspects(); renderDashboard();
  gsWriteProspectToSheet(newP, 'add').catch(() => {});
}

function openEditProspect(idx) {
  const p = DB.prospects[idx];
  document.getElementById('ep-idx').value = idx;
  document.getElementById('ep-fname').value = p.fname || p.name.split(' ')[0];
  document.getElementById('ep-lname').value = p.lname || p.name.split(' ').slice(1).join(' ');
  document.getElementById('ep-email').value = p.email || '';
  document.getElementById('ep-phone').value = p.phone || '';
  document.getElementById('ep-category').value = p.category || '';
  document.getElementById('ep-status').value = p.status || '';
  document.getElementById('ep-team-ref').value = p.teamRef || '';
  document.getElementById('ep-comms').value = p.comms || '';
  document.getElementById('ep-good').value = p.good || '';
  document.getElementById('ep-date').value = p.dateAdded || '';
  document.getElementById('ep-notes').value = p.notes || '';
  document.getElementById('ep-message').value = p.customMsg || '';
  document.getElementById('ep-role1').value = p.role1 || '';
  document.getElementById('ep-role2').value = p.role2 || '';
  ['downtown','airline','unsure','gmeets'].forEach(c => {
    const el = document.getElementById(`ep-campus-${c}`);
    if (el) el.checked = (p.campus || '').toLowerCase().includes(c);
  });
  ['mon','tue','wed','thu','na'].forEach(d => {
    const map = {mon:'monday',tue:'tuesday',wed:'wednesday',thu:'thursday',na:'n/a'};
    const el = document.getElementById(`ep-day-${d}`);
    if (el) el.checked = (p.days || '').toLowerCase().includes(map[d]);
    });
  openModal('edit-prospect-modal');
}

function updateProspect() {
  const idx = parseInt(document.getElementById('ep-idx').value);
  const fname = document.getElementById('ep-fname').value.trim();
  const lname = document.getElementById('ep-lname').value.trim();
  DB.prospects[idx] = {
    ...DB.prospects[idx], fname, lname, name: `${fname} ${lname}`.trim(),
    email: document.getElementById('ep-email').value.trim(),
    phone: document.getElementById('ep-phone').value.trim(),
    category: document.getElementById('ep-category').value,
    status: document.getElementById('ep-status').value,
    teamRef: document.getElementById('ep-team-ref').value,
    comms: document.getElementById('ep-comms').value,
    good: document.getElementById('ep-good').value,
    dateAdded: document.getElementById('ep-date').value,
    notes: document.getElementById('ep-notes').value.trim(),
    customMsg: document.getElementById('ep-message').value.trim(),
    role1: document.getElementById('ep-role1').value,
    role2: document.getElementById('ep-role2').value,
    campus: [
      document.getElementById('ap-campus-downtown')?.checked ? 'Downtown' : null,
      document.getElementById('ap-campus-airline')?.checked ? 'Airline' : null,
      document.getElementById('ap-campus-unsure')?.checked ? 'Unsure' : null,
      document.getElementById('ap-campus-gmeets')?.checked ? 'Google Meets (Tutors)' : null,
    ].filter(Boolean).join(', '),
    days: ['mon','tue','wed','thu','na'].filter(d => document.getElementById(`ep-day-${d}`)?.checked).map(d => ({mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',na:'N/A — Tutor'}[d])).join(', ')
  };
  const updated = DB.prospects[idx];
  saveDB(); closeModal('edit-prospect-modal'); renderProspects(); renderDashboard();
  gsWriteProspectToSheet(updated, 'update').catch(() => {});
}

function deleteProspect() {
  const idx = parseInt(document.getElementById('ep-idx').value);
  if (!confirm(`Delete ${DB.prospects[idx].name}?`)) return;
  const deleted = DB.prospects[idx];
  DB.prospects.splice(idx, 1);
  saveDB(); closeModal('edit-prospect-modal'); renderProspects(); renderDashboard();
  gsWriteProspectToSheet(deleted, 'delete').catch(() => {});
}

// ══ IMPORT PROSPECT CSV ══════════════════════════
function importProspectCSV() {
  const file = document.getElementById('import-csv-file').files[0];
  if (!file) { alert('Please select a CSV file.'); return; }
  const dupe = document.getElementById('import-dupe').value;
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    if (rows.length < 2) { alert('No data found.'); return; }
    const h = rows[0].map(x => x.toLowerCase().trim());
    const ce = k => h.findIndex(x => x === k.toLowerCase());
    const iDateAdded = ce('date added');
    const iCategory  = ce('category');
    const iFullName  = ce('full name');
    const iFirst     = ce('first');
    const iLast      = ce('last');
    const iEmail     = ce('email');
    const iPhone     = ce('phone');
    const iTeamRef   = ce('team referral');
    const iGood      = ce('good prospect?');
    const iStatus    = ce('status');
    const iVIPRAM    = ce('vip ram');
    const iComms     = ce('comms');
    const iNotes     = ce('date of comms/notes');
    const iMsg       = ce('customizable message');

    const existingEmails = new Set(DB.prospects.map(p => p.email?.toLowerCase()));
    let added = 0, skipped = 0, updated = 0;

    rows.slice(1).forEach(cols => {
      const g = i => i >= 0 ? (cols[i]||'').trim() : '';
      const fname = g(iFirst) || g(iFullName).split(' ')[0];
      const lname  = g(iLast)  || g(iFullName).split(' ').slice(1).join(' ');
      const name   = g(iFullName) || `${fname} ${lname}`.trim();
      const email  = g(iEmail).toLowerCase();
      if (!name) return;

      const prospect = {
        name, fname, lname, email, phone: g(iPhone),
        category: g(iCategory), status: g(iStatus),
        teamRef: g(iTeamRef), comms: g(iComms),
        good: g(iGood).toLowerCase().includes('yes') ? 'yes' : g(iGood) ? 'no' : '',
        dateAdded: g(iDateAdded) || new Date().toLocaleDateString(),
        notes: g(iNotes), customMsg: g(iMsg), vipRam: g(iVIPRAM)
      };

      if (dupe === 'skip' && email && existingEmails.has(email)) { skipped++; return; }
      if (dupe === 'update' && email && existingEmails.has(email)) {
        const idx = DB.prospects.findIndex(p => p.email?.toLowerCase() === email);
        if (idx >= 0) { DB.prospects[idx] = {...DB.prospects[idx], ...prospect}; updated++; return; }
      }
      DB.prospects.push(prospect);
      if (email) existingEmails.add(email);
      added++;
    });

    saveDB(); closeModal('import-modal');
    alert(`✅ Import complete!\nAdded: ${added} · Updated: ${updated} · Skipped: ${skipped}`);
    renderProspects(); renderDashboard();
  };
  reader.readAsText(file);
}

// ══ EVENTS ═══════════════════════════════════════
function renderEventCards() {
  const container = document.getElementById('event-cards-container');
  container.innerHTML = DB.events.map(ev => {
    const rsvpCount = ev.rsvps?.length || 0;
    const ciCount   = ev.checkins?.length || 0;
    const guestCount = ev.rsvps?.reduce((a,r) => a+(r.guests?.length||0), 0) || 0;
    return `
    <div class="event-card">
      <div class="event-card-bar"></div>
      <div class="event-card-body">
        ${ev.active ? `<div style="margin-bottom:8px"><span class="live-dot"></span><span style="font-size:10px;color:#ed125f;font-weight:700;letter-spacing:1px;text-transform:uppercase">Active</span></div>` : ''}
        <div class="event-card-name">${ev.name}</div>
        <div class="event-card-date">${[ev.date,ev.time].filter(Boolean).join(' · ')}</div>
        ${ev.location ? `<div style="font-size:11px;color:var(--muted);margin-bottom:10px">📍 ${ev.location}</div>` : ''}
        <div class="event-card-stats">
          <div><div class="ecs-num">${rsvpCount}</div><div class="ecs-lbl">RSVPs</div></div>
          <div><div class="ecs-num">${guestCount}</div><div class="ecs-lbl">Guests</div></div>
          <div><div class="ecs-num">${ciCount}</div><div class="ecs-lbl">Checked In</div></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-green btn-sm" onclick="openEventDetail('${ev.id}')">View Dashboard</button>
          <button class="btn btn-ghost btn-sm" onclick="openEditEvent('${ev.id}')">✏ Edit</button>
		  ${ev.formUrl ? `<a href="${ev.formUrl}" target="_blank" class="btn btn-ghost btn-sm" style="text-decoration:none">↗ RSVP Form</a>` : ''}
        </div>
      </div>
    </div>`;
  }).join('') + `
    <div class="event-add-card" onclick="openModal('create-event-modal')">
      <div class="plus">＋</div><span>Create Event</span>
    </div>`;
}

function createNewEvent() {
  const name = document.getElementById('ce-name').value.trim();
  if (!name) { alert('Please enter an event name.'); return; }
  const id = 'event-' + Date.now();
  DB.events.push({
    id, name,
    date: document.getElementById('ce-date').value.trim(),
    time: document.getElementById('ce-time').value.trim(),
    location: document.getElementById('ce-location').value.trim(),
    desc: document.getElementById('ce-desc').value.trim(),
    sheetId: document.getElementById('ce-sheet-id').value.trim(),
    sheetTab: document.getElementById('ce-sheet-tab').value.trim(),
    formTemplate: document.getElementById('ce-form-template').value,
    rsvps: [], checkins: [], active: true
  });
  saveDB(); closeModal('create-event-modal'); renderEventCards();
  ['ce-name','ce-date','ce-time','ce-location','ce-desc','ce-sheet-id','ce-sheet-tab'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ce-form-template').value = '';
}

function openEditEvent(eventId) {
  const ev = DB.events.find(e => e.id === eventId);
  if (!ev) return;
  document.getElementById('ee-id').value = ev.id;
  document.getElementById('ee-name').value = ev.name || '';
  document.getElementById('ee-date').value = ev.date || '';
  document.getElementById('ee-time').value = ev.time || '';
  document.getElementById('ee-location').value = ev.location || '';
  document.getElementById('ee-sheet-id').value = ev.sheetId || '';
document.getElementById('ee-sheet-tab').value = ev.sheetTab || '';
document.getElementById('ee-form-template').value = ev.formTemplate || '';
	document.getElementById('ee-banner-url').value = ev.bannerUrl || '';
document.getElementById('ee-kiosk-bg').value = ev.kioskBg || '';
document.getElementById('ee-kiosk-bg-swatch').style.background = ev.kioskBg || '';
	document.getElementById('ee-active').checked = !!ev.active;
  document.getElementById('ee-delete-link').style.display = (ev.id === 'court-connections') ? 'none' : '';
	openModal('edit-event-modal');
}

function updateEvent() {
  const id = document.getElementById('ee-id').value;
  const ev = DB.events.find(e => e.id === id);
  if (!ev) { alert('Event not found.'); return; }
  const name = document.getElementById('ee-name').value.trim();
  if (!name) { alert('Please enter an event name.'); return; }
  ev.name = name;
  ev.date = document.getElementById('ee-date').value.trim();
  ev.time = document.getElementById('ee-time').value.trim();
  ev.location = document.getElementById('ee-location').value.trim();
  ev.sheetId = document.getElementById('ee-sheet-id').value.trim();
ev.sheetTab = document.getElementById('ee-sheet-tab').value.trim();
ev.formTemplate = document.getElementById('ee-form-template').value;
	ev.bannerUrl = document.getElementById('ee-banner-url').value.trim();
ev.kioskBg = document.getElementById('ee-kiosk-bg').value.trim();
	ev.active = document.getElementById('ee-active').checked;
  saveDB();
  closeModal('edit-event-modal');
  renderEventCards();
  if (currentEventId === id) refreshEventDetail();
}

function requestDeleteEvent() {
  const id = document.getElementById('ee-id').value;
  const ev = DB.events.find(e => e.id === id);
  if (!ev) return;
  if (ev.id === 'court-connections') {
    alert('Court Connections cannot be deleted.');
    return;
  }
  const rsvpCount = (ev.rsvps || []).length;
  const ciCount = (ev.checkins || []).length;
  const warning = (rsvpCount || ciCount)
    ? `\n\nThis will permanently delete ${rsvpCount} RSVPs and ${ciCount} check-ins.`
    : '';
  const typed = prompt(`To delete "${ev.name}", type the event name exactly:${warning}`);
  if (typed === null) return;
  if (typed.trim() !== ev.name) {
    alert('Name did not match. Event was not deleted.');
    return;
  }
  confirmDeleteEvent(id);
}

function confirmDeleteEvent(id) {
  const idx = DB.events.findIndex(e => e.id === id);
  if (idx === -1) return;
  DB.events.splice(idx, 1);
  saveDB();
  closeModal('edit-event-modal');
  if (currentEventId === id) {
    currentEventId = DB.events[0]?.id || null;
    goPage('events', null);
  }
  renderEventCards();
}

function preloadEventDefaults() {
  const cc = DB.events.find(e => e.id === 'court-connections');
  if (!cc) return;
  if (!cc.sheetId || !cc.sheetTab) {
    try {
      const rsvpCfg = JSON.parse(localStorage.getItem('bryc-rsvp-sheet') || '{}');
      if (rsvpCfg.sheetId) cc.sheetId = rsvpCfg.sheetId;
      if (rsvpCfg.tabName) cc.sheetTab = rsvpCfg.tabName;
    } catch(e) {}
  }
  if (!cc.formTemplate) cc.formTemplate = 'court-connections';
  saveDB();
}

function openEventFormUrlEditor() {
  const ev = DB.events.find(e => e.id === currentEventId);
  const url = prompt('Paste the Google Form RSVP URL for this event:', ev?.formUrl || '');
  if (url === null) return;
  if (ev) { ev.formUrl = url.trim(); saveDB(); }
  alert('✅ RSVP Form URL saved!');
}

function openEventDetail(eventId) {
  currentEventId = eventId;
  const ev = DB.events.find(e => e.id === eventId);
  if (!ev) return;
  document.getElementById('ev-detail-title').textContent = ev.name;
  document.getElementById('ev-detail-sub').textContent = [ev.date, ev.time, ev.location].filter(Boolean).join(' · ');
  document.getElementById('kiosk-event-title').textContent = ev.name.toUpperCase();
  goPage('event-detail', null);
  refreshEventDetail();
}

function refreshEventDetail() {
  const isCC = currentEventId === 'court-connections';
	// Hide pickleball button in header for non-CC events
document.querySelectorAll('#page-event-detail .btn-row button').forEach(btn => {
  if (btn.textContent.includes('Pickleball')) {
    btn.style.setProperty('display', isCC ? '' : 'none', 'important');
  }
});

// Hide pickleball court queue block for non-CC events
const pickleBlocks = document.querySelectorAll('#page-event-detail .block');
pickleBlocks.forEach(b => {
  if (b.querySelector('.block-title')?.textContent.includes('Pickleball')) {
    b.style.display = isCC ? '' : 'none';
  }
});
  const evPage = document.getElementById('page-event-detail');
	const wasActive = evPage.classList.contains('active');
	evPage.className = isCC ? 'page cc-theme' : 'page';
	if (wasActive) evPage.classList.add('active');
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev) return;
  const rsvps = ev.rsvps || [];
  const checkins = ev.checkins || [];
  const yes = rsvps.filter(r => r.attending === 'yes').length;
  const maybe = rsvps.filter(r => r.attending === 'maybe').length;
  const no = rsvps.filter(r => r.attending === 'no').length;
  const guests = rsvps.reduce((a,r) => a+(r.guests?.length||0), 0);
  const raffle = checkins.filter(c => c.raffleEntry).length;

  document.getElementById('ev-total').textContent = rsvps.length;
  document.getElementById('ev-yes').textContent = yes;
  document.getElementById('ev-maybe').textContent = maybe;
  document.getElementById('ev-no').textContent = no;
  document.getElementById('ev-guests').textContent = guests;
  document.getElementById('ev-checkedin').textContent = checkins.length;
  document.getElementById('ev-raffle').textContent = raffle;
  document.getElementById('ev-expected').textContent = yes + maybe + guests;
  document.getElementById('ev-rsvp-badge').textContent = rsvps.length;
  document.getElementById('ev-ci-badge').textContent = checkins.length;

  const roleCounts = {};
rsvps.forEach(r => { if(r.role) roleCounts[r.role] = (roleCounts[r.role]||0)+1; });
const roleGrid = document.getElementById('ev-role-grid');
const roleEntries = Object.entries(roleCounts).sort((a,b)=>b[1]-a[1]);
const maxR = Math.max(...Object.values(roleCounts), 1);
const roleColors = {
  'Current Mentor/Tutor': '#ed125f',
  'Prospective Volunteer/Past Volunteer': '#f0c917',
  'Alumni': '#3a3088',
  'Local Institution/Organization': '#eb2627',
  'Friend of BRYC': '#00775f'
};
roleGrid.innerHTML = roleEntries.length ? `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:18px;width:100%;box-sizing:border-box;">${roleEntries.map(([role,cnt]) => {
  const col = roleColors[role] || '#888';
  return `<div style="background:white;border:1px solid rgba(0,0,0,0.08);border-top:3px solid ${col};border-radius:10px;padding:14px 16px;min-width:0;box-sizing:border-box;word-break:break-word;">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${col};margin-bottom:8px;">${role}</div>
    <div style="font-family:'proxima-nova',sans-serif;font-size:34px;font-weight:400;color:#1a1a1a;line-height:1;">${cnt}</div>
    <div style="font-size:11px;color:#888;margin-top:2px;">${Math.round(cnt/rsvps.length*100)}%</div>
    <div style="height:3px;background:rgba(0,0,0,0.06);border-radius:2px;margin-top:8px;"><div style="width:${Math.round(cnt/maxR*100)}%;height:100%;background:${col};border-radius:2px;"></div></div>
  </div>`;}).join('')}</div>` : `<div class="empty"><div class="ei">🏅</div><p>Import RSVPs to see role breakdown.</p></div>`;
  
  const rtb = document.getElementById('ev-rsvp-tbody');
  rtb.innerHTML = rsvps.length ? rsvps.map(r => `<tr>
    <td><strong>${r.name}</strong></td>
    <td style="font-size:12px">${r.email||'—'}</td>
    <td>${r.role?`<span class="badge b-teal">${r.role}</span>`:'—'}</td>
    <td>${attendBadge(r.attending)}</td>
    <td>${r.guests?.length||0}</td>
    <td style="font-size:11px;color:var(--muted)">${r.diet?.join(', ')||'—'}</td>
    <td style="font-size:11px;color:var(--muted)">${r.date||'—'}</td>
    <td>${r.email?`<a href="mailto:${r.email}?subject=${encodeURIComponent(ev.name)}" class="btn btn-ghost btn-xs" style="text-decoration:none">✉</a>`:'—'}</td>
  </tr>`).join('') : `<tr><td colspan="8"><div class="empty"><div class="ei">📭</div><p>No RSVPs imported yet.</p></div></td></tr>`;

  const rsvpGuests = rsvps.flatMap(r => (r.guests||[]).map(g => ({...g, by:r.name})));
const walkInCompanions = (ev.checkins||[])
  .filter(c => c.companion && c.companion.trim())
  .map(c => ({ name: c.companion, contact: '', by: c.name }));
const allGuests = [...rsvpGuests, ...walkInCompanions];
  const gtb = document.getElementById('ev-guests-tbody');
  gtb.innerHTML = allGuests.length ? allGuests.map(g => `<tr><td><strong>${g.name}</strong></td><td>${g.contact||'—'}</td><td>${g.by}</td></tr>`).join('')
    : `<tr><td colspan="3"><div class="empty"><div class="ei">👥</div><p>No guests recorded.</p></div></td></tr>`;

  const dietCounts = {};
  rsvps.forEach(r => r.diet?.forEach(d => { if(d&&d!=='None') dietCounts[d]=(dietCounts[d]||0)+1; }));
  const dietEntries = Object.entries(dietCounts).sort((a,b)=>b[1]-a[1]);
  const maxD = Math.max(...Object.values(dietCounts), 1);
  const dietBody = document.getElementById('ev-diet-body');
  dietBody.innerHTML = dietEntries.length ? `<div class="summary-grid">${dietEntries.map(([d,n]) =>
    `<div class="summary-card"><div class="summary-card-name">${d}</div>
    <div class="summary-card-num">${n}</div>
    <div class="summary-bar"><div class="summary-bar-fill" style="width:${Math.round(n/maxD*100)}%"></div></div></div>`).join('')}</div>`
    : `<div class="empty"><div class="ei">🥗</div><p>No dietary data yet.</p></div>`;

const citb = document.getElementById('ev-ci-tbody');
const ciTable2 = citb ? citb.closest('table') : null;
const ciThead2 = ciTable2 ? ciTable2.querySelector('thead') : null;

if (isCC) {
  if (ciThead2) ciThead2.innerHTML = '<tr><th style="width:40px;">#</th><th>Name</th><th>Type</th><th>Role</th><th>Contact</th><th>Guest</th><th>Both Commit</th><th>Raffle</th><th>Time</th></tr>';
  citb.innerHTML = checkins.length ? checkins.map((c, i) => `<tr>
    <td style="width:40px;"><strong style="color:var(--gold);font-family:'barlow-semi-condensed',sans-serif;font-size:18px;">#${i+1}</strong></td>
    <td><strong>${c.name}</strong></td>
    <td>${c.walkIn?'<span class="badge b-blue">Walk-In</span>':'<span class="badge b-green">RSVP</span>'}</td>
    <td>${c.role?`<span class="badge b-teal">${c.role}</span>`:'—'}</td>
    <td style="font-size:12px;">${c.contact||'—'}</td>
    <td>${c.guestName||'—'}</td>
    <td style="text-align:center">${(c.commitSelf&&c.commitGuest)?'✅':'—'}</td>
    <td style="text-align:center">${c.raffleEntry?'<span class="badge b-gold">🏆 Entered</span>':'—'}</td>
    <td style="font-size:11px;color:var(--muted)">${c.time||'—'}</td>
  </tr>`).join('') : `<tr><td colspan="9"><div class="empty"><div class="ei"></div><p>No check-ins yet.</p></div></td></tr>`;
} else {
  if (ciThead2) ciThead2.innerHTML = '<tr><th style="width:40px;">#</th><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Companion</th><th>Time</th></tr>';
  citb.innerHTML = checkins.length ? checkins.map((c, i) => `<tr>
    <td style="width:40px;"><strong style="color:var(--gold);font-family:'barlow-semi-condensed',sans-serif;font-size:18px;">#${i+1}</strong></td>
    <td><strong>${c.name}</strong></td>
    <td>${c.role?`<span class="badge b-teal">${c.role}</span>`:'—'}</td>
    <td style="font-size:12px;">${c.phone||'—'}</td>
    <td style="font-size:12px;">${c.email||'—'}</td>
    <td>${c.companion||'—'}</td>
    <td style="font-size:11px;color:var(--muted)">${c.time||'—'}</td>
  </tr>`).join('') : `<tr><td colspan="7"><div class="empty"><div class="ei"></div><p>No check-ins yet.</p></div></td></tr>`;
}
}

// ══ IMPORT RSVPs ══════════════════════════════════
function importRSVPCSV() {
  const file = document.getElementById('rsvp-csv-file').files[0];
  if (!file) { alert('Please select a CSV file.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    if (rows.length < 2) { alert('No data found.'); return; }
    const h = rows[0].map(x => x.toLowerCase().trim());
    const ci = k => h.findIndex(x => x.includes(k));
    const iFname   = h.findIndex(x => x === 'first name');
    const iLname   = h.findIndex(x => x === 'last name');
    const iEmail   = ci('email address');
    const iAttend  = ci('can you make it');
    const iRole    = ci('community role');
    const iTs      = ci('timestamp');
    const guestNameCols    = h.map((x,i) => x.includes("guest's first and last") ? i : -1).filter(i=>i>=0);
    const guestContactCols = h.map((x,i) => x.includes("guest's contact") ? i : -1).filter(i=>i>=0);
    const dietCols = h.map((x,i) => x.includes('dietary') ? i : -1).filter(i=>i>=0);
    const iRef1F = h.findIndex(x => x.includes('referral 1') && x.includes('first name'));
    const iRef1L = h.findIndex(x => x.includes('referral 1') && x.includes('last name'));
    const iRef1P = h.findIndex(x => x.includes('referral 1') && x.includes('phone'));
    const iRef1E = h.findIndex(x => x.includes('referral 1') && x.includes('email'));
    const iRef2N = h.findIndex(x => x.includes('referral 2') && (x.includes('first and last')||x.includes('first name')));
    const iRef3N = h.findIndex(x => x.includes('referral 3') && (x.includes('first and last')||x.includes('first name')));
    const iRef3E = h.findIndex(x => x.includes('referral 3') && x.includes('email'));

    const ev = DB.events.find(e => e.id === currentEventId);
    if (!ev) return;
    const existingEmails = new Set((ev.rsvps||[]).map(r => r.email));
    let added = 0, refs = 0;

    rows.slice(1).forEach(cols => {
      const g = i => i>=0 ? (cols[i]||'').trim() : '';
      const fname = g(iFname); const lname = g(iLname);
      const name = [fname,lname].filter(Boolean).join(' ');
      const email = g(iEmail);
      if (!name) return;
      if (email && existingEmails.has(email)) return;

      const attendRaw = g(iAttend).toLowerCase();
      let attending = 'no';
      if (attendRaw.includes('yes, ready')) attending = 'yes';
      else if (attendRaw.includes('maybe'))  attending = 'maybe';

      const guests = [];
      guestNameCols.forEach((ni,idx) => {
        const gn = g(ni); if(!gn) return;
        guests.push({name:gn, contact: guestContactCols[idx]?g(guestContactCols[idx]):''});
      });

      const dietSet = new Set();
      dietCols.forEach(di => { const v=g(di); if(v) v.split(',').forEach(d=>{const t=d.trim();if(t)dietSet.add(t);}); });

      ev.rsvps.push({
        id: Date.now()+Math.random(), fname, lname, name, email,
        role: g(iRole), attending, guests, diet:[...dietSet],
        date: g(iTs).split(' ')[0] || new Date().toLocaleDateString()
      });
      if(email) existingEmails.add(email);
      added++;

      const addRef = (rname, phone, email) => {
        if(!rname) return;
        DB.prospects.push({name:rname, email, phone, category:'Court Connections', status:'Invited to Friendraiser', teamRef:'', comms:'', good:'', dateAdded: new Date().toLocaleDateString(), notes:`Referred by ${name}`, customMsg:''});
        refs++;
      };
      addRef([g(iRef1F),g(iRef1L)].filter(Boolean).join(' '), g(iRef1P), g(iRef1E));
      addRef(g(iRef2N), '', '');
      addRef(g(iRef3N), '', g(iRef3E));
    });

    saveDB(); closeModal('import-rsvp-modal');
    alert(`✅ ${added} RSVPs imported · ${refs} referrals added to prospects`);
    refreshEventDetail();
  };
  reader.readAsText(file);
}

// ══ EMAIL HELPERS ════════════════════════════════
function emailEventAll(filter) {
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev) return;
  let list = ev.rsvps || [];
  if (filter === 'attending') list = list.filter(r => r.attending==='yes'||r.attending==='maybe');
  const emails = list.map(r => r.email).filter(Boolean);
  if (!emails.length) { alert('No email addresses found.'); return; }
  window.open(`https://mail.google.com/mail/?view=cm&bcc=${encodeURIComponent(emails.join(','))}&su=${encodeURIComponent(ev.name)}`, '_blank');
}

// ══ KIOSK ════════════════════════════════════════
function openKiosk() {
  const ev = DB.events.find(e => e.id === currentEventId);
  const isCC = currentEventId === 'court-connections';
  const overlay = document.getElementById('kiosk-overlay');

  // Set background color
const bg = ev?.kioskBg || '#00775f';
overlay.style.background = bg;
overlay.querySelectorAll('div').forEach(d => {
  const inline = d.getAttribute('style') || '';
  if (inline.includes('#00775f') || inline.includes('rgb(0, 119, 95)')) {
    d.style.background = bg;
  }
});

  // Set banner
  const bannerImg = overlay.querySelector('img[src*="banner"]');
  if (bannerImg) {
    bannerImg.src = ev?.bannerUrl || 'https://thebryc.github.io/volunteers/cc_banner.png';
  }

  // Hide CC-only elements for other events
  const showCCFeatures = isCC;
	// Rebuild walk-in form content based on event type
const walkinPanel = document.getElementById('kiosk-walkin-panel');
if (walkinPanel && !isCC) {
  walkinPanel.innerHTML = `
    <button onclick="hideKioskWalkin()" style="background:none;border:none;color:rgba(0,0,0,0.5);font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;text-transform:uppercase;margin-bottom:18px">← Back</button>
    <div style="font-family:'barlow-semi-condensed',sans-serif;font-size:28px;color:#00775f;letter-spacing:2px;margin-bottom:18px">Welcome! Let's check you in.</div>
    <div class="frow" style="margin-bottom:12px">
      <div class="fg"><label class="fl" style="color:#1a1a1a">First Name *</label><input type="text" id="kw-fname" style="font-size:16px;padding:13px"></div>
      <div class="fg"><label class="fl" style="color:#1a1a1a">Last Name *</label><input type="text" id="kw-lname" style="font-size:16px;padding:13px"></div>
    </div>
    <div class="fg" style="margin-bottom:12px">
      <label class="fl" style="color:#1a1a1a">I am a…</label>
      <select id="kw-role" style="font-size:15px">
        <option value="">Select…</option>
        <option>Interested in Mentoring</option>
        <option>New Mentor</option>
        <option>Returning Mentor</option>
      </select>
    </div>
    <div class="frow" style="margin-bottom:12px">
      <div class="fg"><label class="fl" style="color:#1a1a1a">Phone</label><input type="tel" id="kw-phone" style="font-size:15px"></div>
      <div class="fg"><label class="fl" style="color:#1a1a1a">Email</label><input type="email" id="kw-email" style="font-size:15px"></div>
    </div>
    <div class="fg" style="margin-bottom:12px">
      <label class="fl" style="color:#1a1a1a">Did you come with someone? Add their first and last name</label>
      <input type="text" id="kw-companion" placeholder="Optional" style="font-size:15px">
    </div>
    <button onclick="kioskWalkinSubmitSimple()" style="width:100%;background:#f0c917;color:#0a3d1f;border:none;border-radius:12px;padding:15px;font-family:'barlow-semi-condensed',sans-serif;font-size:22px;letter-spacing:2px;cursor:pointer;margin-top:8px">✅ CHECK ME IN</button>
  `;
}
	
const iPadBadge = document.getElementById('kiosk-raffle-badge');
const pickleBlock = document.getElementById('kiosk-pickle-prompt');

if (!isCC) {
  // Nuke the pickleball prompt entirely — no other function can un-hide what doesn't exist
  if (pickleBlock) pickleBlock.remove();
  if (iPadBadge) iPadBadge.remove();
} else {
  if (iPadBadge) iPadBadge.style.setProperty('display', '', 'important');
  if (pickleBlock) pickleBlock.style.setProperty('display', '', 'important');
}

  overlay.classList.add('open');
  setTimeout(() => document.getElementById('kiosk-search').focus(), 100);
}

function closeKiosk() { document.getElementById('kiosk-overlay').classList.remove('open'); resetKiosk(); }

function kioskSearch(q) {
  const res = document.getElementById('kiosk-results');
  if (!q.trim()) { res.innerHTML=''; return; }
  const ev = DB.events.find(e=>e.id===currentEventId);
  const rsvps = ev?.rsvps||[];
  const matches = rsvps.filter(r =>
    r.name.toLowerCase().includes(q.toLowerCase()) ||
    (r.guests||[]).some(g => g.name.toLowerCase().includes(q.toLowerCase()))
  );  if (!matches.length) {
    res.innerHTML=`<div style="text-align:center;color:var(--muted);font-size:16px;padding:20px">No match. <button onclick="showKioskWalkin()" style="background:none;border:none;color:var(--gold);font-size:16px;cursor:pointer;text-decoration:underline">Add yourself →</button></div>`;
    return;
  }
  const cards = [];
matches.forEach(r => {
  const idx = rsvps.indexOf(r);
  const alreadyIn = (ev.checkins||[]).find(c=>c.rsvpId===r.id);
  const isGuestMatch = !r.name.toLowerCase().includes(q.toLowerCase()) && (r.guests||[]).some(g=>g.name.toLowerCase().includes(q.toLowerCase()));
  
  if (isGuestMatch) {
    // Show a card for each matching guest
    (r.guests||[]).filter(g=>g.name.toLowerCase().includes(q.toLowerCase())).forEach(g => {
      const guestAlreadyIn = (ev.checkins||[]).find(c=>c.name===g.name);
      cards.push(`<div style="background:white;border:2px solid ${guestAlreadyIn?'#00775f':'#f0c917'};border-radius:12px;padding:16px 20px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;max-width:560px;margin-left:auto;margin-right:auto;">
        <div>
          <div style="font-size:18px;font-weight:700;color:#1a1a1a;">${g.name}</div>
          <div style="font-size:12px;color:#666;">BRYC Community</div>
        </div>
        ${guestAlreadyIn?'<span style="color:#00775f;font-size:13px;font-weight:700">✅ Checked In</span>':`<button onclick="kioskGuestCheckIn('${g.name}','${g.contact||''}')" style="background:#f0c917;color:#1a1a1a;border:none;border-radius:10px;padding:11px 22px;font-family:'barlow-semi-condensed',sans-serif;font-size:18px;font-weight:700;letter-spacing:1px;cursor:pointer">CHECK IN →</button>`}
      </div>`);
    });
  } else {
    cards.push(`<div style="background:white;border:2px solid ${alreadyIn?'#00775f':'#f0c917'};border-radius:12px;padding:16px 20px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;max-width:560px;margin-left:auto;margin-right:auto;">
      <div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;">${r.name}</div>
        <div style="font-size:12px;color:#666;">${r.role||'BRYC Community'} ${r.guests?.length?'· '+r.guests.length+' guest(s)':''}</div>
      </div>
      ${alreadyIn?`<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">   <span style="color:#00775f;font-size:13px;font-weight:700">✅ Checked In</span>   <button onclick="rejoinPickleQueue('${r.name}','${r.fname}')" style="background:#0a7c5c;color:white;border:none;border-radius:8px;padding:7px 14px;font-family:'barlow-semi-condensed',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">🏓 Join Queue</button> </div>`:`<button onclick="kioskCheckIn(${idx})" style="background:#f0c917;color:#1a1a1a;border:none;border-radius:10px;padding:11px 22px;font-family:'barlow-semi-condensed',sans-serif;font-size:18px;font-weight:700;letter-spacing:1px;cursor:pointer">CHECK IN →</button>`}
    </div>`);
  }
});
res.innerHTML = cards.join('');
}

function kioskCheckIn(idx) {
  const ev = DB.events.find(e=>e.id===currentEventId);
  const r = ev.rsvps[idx];
  const gnames = (r.guests||[]).map(g=>g.name).join(', ');
  document.getElementById('kiosk-results').innerHTML = `
    <div style="background:rgba(240,201,23,0.06);border:1px solid var(--border-gold);border-radius:14px;padding:20px">
      <div style="font-family:'barlow-semi-condensed',sans-serif;font-size:24px;color:var(--gold);letter-spacing:2px;margin-bottom:14px">Welcome, ${r.fname}! 🎉</div>
      <div class="fg" style="margin-bottom:14px">
        <label class="fl" style="color:white;">Is your guest here today?</label>
        <input type="text" id="kiosk-guest-inp" placeholder="Guest name (leave blank if none)" value="${gnames}"
          oninput="document.getElementById('kiosk-raffle-sec').style.display=this.value.trim()?'':'none'" style="font-size:16px;padding:13px">
      </div>
      <div id="kiosk-raffle-sec" style="${gnames?'':'display:none'}">
        <div style="background:rgba(240,201,23,0.08);border:1px solid rgba(240,201,23,0.25);border-radius:10px;padding:14px;margin-bottom:14px;text-align:center">
          <div style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">🏆 iPAD DRAWING — OCTOBER</div>
          <p style="font-size:13px;color:white;margin-bottom:12px">You're both one step closer to the October iPad drawing!</p>
          <img src="https://thebryc.github.io/volunteers/IPAD_DRAWING.png" style="width:100%;max-width:340px;border-radius:10px;">
  </div>
</div>
      </div>
      <button onclick="this.style.background='#00775f';this.style.color='white';this.textContent='⏳ Checking in...';this.disabled=true;kioskConfirm(${idx})" style="width:100%;background:#f0c917;color:#0a3d1f;border:none;border-radius:12px;padding:16px;font-family:'barlow-semi-condensed',sans-serif;font-size:24px;font-weight:700;letter-spacing:2px;cursor:pointer;">✅ CONFIRM CHECK-IN</button>
    </div>`;
}

  function kioskGuestCheckIn(guestName, guestContact) {
  const ev = DB.events.find(e=>e.id===currentEventId);
  if (!ev.checkins) ev.checkins = [];
  const ciRecord = {
    name: guestName,
    contact: guestContact,
    role: 'BRYC Community',
    guestName: '',
    walkIn: false,
    isGuest: true,
    time: new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
  };
  ev.checkins.push(ciRecord);
  saveDB();
  showKioskConfirm(guestName.split(' ')[0], false, '', ciRecord);
  try { refreshEventDetail(); } catch(e) {}
}

function kioskConfirm(idx) {
  const ev = DB.events.find(e=>e.id===currentEventId);
  const r = ev.rsvps[idx];
  const guestName   = document.getElementById('kiosk-guest-inp').value.trim();
  const commitSelf  = document.getElementById('kk-self')?.checked||false;
  const commitGuest = document.getElementById('kk-guest')?.checked||false;
  const raffleEntry = !!(guestName&&commitSelf&&commitGuest);
  if (!ev.checkins) ev.checkins = [];
  const ciRecord = {rsvpId:r.id, name:r.name, role:r.role, guestName, commitSelf, commitGuest, raffleEntry, walkIn:false, time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
  ev.checkins.push(ciRecord);
  saveDB();
  showKioskConfirm(r.fname, raffleEntry, guestName, ciRecord);
  try { refreshEventDetail(); } catch(e) {}
}

function showKioskWalkin() {
  const ev = DB.events.find(e => e.id === currentEventId);
  const bg = ev?.kioskBg || '#00775f';
  const panel = document.getElementById('kiosk-walkin-panel');
  panel.style.background = bg;
  panel.style.display = 'block';
}function hideKioskWalkin() { document.getElementById('kiosk-walkin-panel').style.display='none'; }
function toggleKioskGuest(show) { document.getElementById('kw-guest-block').style.display=show?'':'none'; }
function updateKioskRaffle() {
  const s=document.getElementById('kw-commit-self')?.checked;
  const g=document.getElementById('kw-commit-guest')?.checked;
  const el=document.getElementById('kw-raffle-status');
  el.textContent=s&&g?'🏆 You qualify for the iPad raffle!':'Both must commit to qualify.';
  el.style.color=s&&g?'var(--gold)':'var(--muted)';
}

function kioskWalkinSubmit() {
  const name=document.getElementById('kw-name').value.trim();
  if(!name){alert('Please enter your name.');return;}
  const hasGuest=document.querySelector('input[name="kw-guest"]:checked')?.value==='yes';
  const guestName=hasGuest?document.getElementById('kw-guest-name').value.trim():'';
  const commitSelf=hasGuest?document.getElementById('kw-commit-self').checked:false;
  const commitGuest=hasGuest?document.getElementById('kw-commit-guest').checked:false;
  const raffleEntry=!!(guestName&&commitSelf&&commitGuest);
  const ev=DB.events.find(e=>e.id===currentEventId);
  if(!ev.checkins)ev.checkins=[];
  const ciRecord2={name,role:document.getElementById('kw-role').value,contact:document.getElementById('kw-contact').value.trim(),guestName,commitSelf,commitGuest,raffleEntry,walkIn:true,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
  ev.checkins.push(ciRecord2);
  saveDB();
  hideKioskWalkin();
  showKioskConfirm(name.split(' ')[0], raffleEntry, guestName, ciRecord2);
  try { refreshEventDetail(); } catch(e) {}
}

function kioskWalkinSubmitSimple() {
  const fname = document.getElementById('kw-fname').value.trim();
  const lname = document.getElementById('kw-lname').value.trim();
  if (!fname) { alert('Please enter a first name.'); return; }
  const name = `${fname} ${lname}`.trim();
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev.checkins) ev.checkins = [];
  const ciRecord = {
    name,
    role: document.getElementById('kw-role').value,
    phone: document.getElementById('kw-phone').value.trim(),
    email: document.getElementById('kw-email').value.trim(),
    companion: document.getElementById('kw-companion').value.trim(),
    walkIn: true,
    time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
  };
  ev.checkins.push(ciRecord);
  saveDB();
  hideKioskWalkin();
  showKioskConfirm(fname, false, '', ciRecord);
  try { refreshEventDetail(); } catch(e) {}
}

function showKioskConfirm(fname, raffleEntry, guestName, checkinRecord) {
  const ev = DB.events.find(e => e.id === currentEventId);
  const bg = ev?.kioskBg || '#00775f';
  const panel = document.getElementById('kiosk-confirm-panel');
  if (panel) panel.style.background = bg;
	const isCC = currentEventId === 'court-connections';
const raffleBadge = document.getElementById('kiosk-raffle-badge');
const pickleBlock = document.getElementById('kiosk-pickle-prompt');
// (These may have been .remove()-d for non-CC events, so both checks safely no-op)
if (!isCC) {
  if (raffleBadge) raffleBadge.remove();
  if (pickleBlock) pickleBlock.remove();
}
	window._lastCheckinRecord = checkinRecord;
  document.getElementById('kiosk-confirm-name').textContent = `You're in, ${fname}!`;
  document.getElementById('kiosk-confirm-msg').textContent = guestName
    ? `You and ${guestName} are checked in.`
    : 'You are checked in. Enjoy the event!';
  const rb = document.getElementById('kiosk-raffle-badge');
if (rb) rb.style.display = raffleEntry ? 'block' : 'none';
  const hasParty = guestName && guestName.trim();
  const partyBtn = document.getElementById('kiosk-pickle-party-btn');
  if (partyBtn) partyBtn.style.display = hasParty ? '' : 'none';
  const pickleJoined = document.getElementById('kiosk-pickle-joined');
if (pickleJoined) pickleJoined.style.display = 'none';
const pickleProm = document.getElementById('kiosk-pickle-prompt');
if (pickleProm) pickleProm.style.display = '';
  document.getElementById('kiosk-confirm-panel').style.display = 'flex';
}

function resetKiosk() {
  document.getElementById('kiosk-search').value = '';
  document.getElementById('kiosk-results').innerHTML = '';
  document.getElementById('kiosk-confirm-panel').style.display = 'none';
  hideKioskWalkin();

  ['kw-name','kw-contact','kw-guest-name','kw-guest-contact'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['kw-commit-self','kw-commit-guest'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  document.querySelectorAll('input[name="kw-guest"]').forEach(r => r.checked = r.value === 'no');

  const guestBlock = document.getElementById('kw-guest-block');
  if (guestBlock) guestBlock.style.display = 'none';

  const step1 = document.getElementById('kiosk-pickle-step1');
  if (step1) step1.style.display = '';
  const step2 = document.getElementById('kiosk-pickle-step2');
  if (step2) step2.style.display = 'none';
  const joined = document.getElementById('kiosk-pickle-joined');
  if (joined) joined.style.display = 'none';

  const isCC_reset = currentEventId === 'court-connections';
  const pickleProm = document.getElementById('kiosk-pickle-prompt');
  if (pickleProm) pickleProm.style.setProperty('display', isCC_reset ? '' : 'none', 'important');

  const phoneEl = document.getElementById('pickle-phone');
  if (phoneEl) phoneEl.value = '';

  document.querySelectorAll('.pickle-num-btn').forEach(b => {
    b.style.background = 'rgba(255,255,255,0.15)';
    b.style.borderColor = 'rgba(255,255,255,0.3)';
    b.style.color = 'white';
    b.disabled = false;
  });

  const roleEl = document.getElementById('kw-role');
  if (roleEl) roleEl.value = '';

  window._picklePlayerCount = null;
}

function joinPickleQueue(mode) {
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev) return;
  if (!ev.pickleQueue) ev.pickleQueue = [];
  const rec = window._lastCheckinRecord || {};
  const guestName = rec.guestName || '';
  let displayName = rec.name || 'Guest';
  let partySize = 1;
  if (mode === 'party' && guestName) {
    displayName = `${rec.name} + ${guestName}`;
    partySize = 2;
  }
  if (ev.pickleQueue.find(e => e.primaryName === rec.name)) {
    document.getElementById('kiosk-pickle-joined').textContent = "You're already in the queue!";
    document.getElementById('kiosk-pickle-joined').style.display = 'block';
    return;
  }
  ev.pickleQueue.push({
    id: Date.now(),
    name: displayName,
    primaryName: rec.name,
    partySize,
    joinedAt: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
    status: 'waiting'
  });
  saveDB();
  renderCourtQueue();
  const pos = ev.pickleQueue.filter(e => e.status === 'waiting').length;
  document.getElementById('kiosk-pickle-joined').textContent = `✅ You're #${pos} in the queue!`;
  document.getElementById('kiosk-pickle-joined').style.display = 'block';
  document.querySelectorAll('#kiosk-pickle-prompt button').forEach(b => b.disabled = true);
}

function skipPickleQueue() {
  document.getElementById('kiosk-pickle-prompt').style.display = 'none';
}

 function rejoinPickleQueue(name, fname) {
  window._lastCheckinRecord = { name, fname };
  document.getElementById('kiosk-pickle-step1').style.display = '';
  document.getElementById('kiosk-pickle-step2').style.display = 'none';
  document.getElementById('kiosk-pickle-joined').style.display = 'none';
  document.querySelectorAll('.pickle-num-btn').forEach(b => {
    b.style.background = 'rgba(255,255,255,0.15)';
    b.style.borderColor = 'rgba(255,255,255,0.3)';
    b.style.color = 'white';
    b.disabled = false;
  });
  window._picklePlayerCount = null;
  document.getElementById('kiosk-confirm-panel').style.display = 'flex';
  document.getElementById('kiosk-pickle-prompt').style.display = '';
  document.getElementById('kiosk-confirm-name').textContent = `Hey, ${fname}!`;
  document.getElementById('kiosk-confirm-msg').textContent = 'Want to join the pickleball queue?';
  document.getElementById('kiosk-raffle-badge').style.display = 'none';
} 

function selectPicklePlayers(n, btn) {
  window._picklePlayerCount = n;
  document.querySelectorAll('.pickle-num-btn').forEach(b => {
    b.style.background = 'rgba(255,255,255,0.15)';
    b.style.borderColor = 'rgba(255,255,255,0.3)';
    b.style.color = 'white';
  });
  btn.style.background = '#f0c917';
  btn.style.borderColor = '#f0c917';
  btn.style.color = '#0a3d1f';
  setTimeout(() => {
    document.getElementById('kiosk-pickle-step1').style.display = 'none';
    document.getElementById('kiosk-pickle-step2').style.display = '';
    document.getElementById('pickle-phone').focus();
  }, 300);
}

  function submitPickleQueue() {
  const submitBtn = document.getElementById('pickle-submit-btn');
  if (submitBtn) { submitBtn.textContent = '⏳ Adding you...'; submitBtn.disabled = true; }
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev) return;
  if (!ev.pickleQueue) ev.pickleQueue = [];
  const rec = window._lastCheckinRecord || {};
  const phone = document.getElementById('pickle-phone').value.trim();
  if (!phone) { alert('Please enter a phone number.'); if (submitBtn) { submitBtn.textContent = 'JOIN THE QUEUE →'; submitBtn.disabled = false; } return; }
  const partySize = window._picklePlayerCount || 1;
  if (ev.pickleQueue.find(e => e.primaryName === rec.name)) {
    document.getElementById('kiosk-pickle-joined').textContent = "You're already in the queue!";
    document.getElementById('kiosk-pickle-joined').style.display = 'block';
    if (submitBtn) { submitBtn.textContent = 'JOIN THE QUEUE →'; submitBtn.disabled = false; }
    return;
  }
  ev.pickleQueue.push({
    id: Date.now(),
    name: rec.name || 'Guest',
    primaryName: rec.name,
    partySize,
    phone,
    joinedAt: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
    status: 'waiting'
  });
  saveDB();
  renderCourtQueue();
  const pos = ev.pickleQueue.filter(e => e.status === 'waiting').length;
  document.getElementById('kiosk-pickle-step2').style.display = 'none';
  document.getElementById('kiosk-pickle-step1').style.display = 'none';
  document.getElementById('kiosk-pickle-joined').textContent = `✅ You're #${pos} in the queue! We'll call you when a court opens.`;
  document.getElementById('kiosk-pickle-joined').style.display = 'block';
  if (submitBtn) { submitBtn.textContent = 'JOIN THE QUEUE →'; submitBtn.disabled = false; }
}

function renderCourtQueue() {
  if (!document.getElementById('cq-list')) return;
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev) return;
  if (!ev.pickleQueue) ev.pickleQueue = [];
  if (!ev.courts) ev.courts = [
    {id:1, status:'open', players:'', calledAt:null},
    {id:2, status:'open', players:'', calledAt:null}
  ];
  const queue = ev.pickleQueue;
  const waiting = queue.filter(e => e.status === 'waiting');
  const badge = document.getElementById('cq-waiting-badge');
  if (badge) badge.textContent = `${waiting.length} waiting`;

  [1,2].forEach(n => {
    const court = ev.courts[n-1];
    const isPlaying = court.status === 'playing';
    const statusEl = document.getElementById(`court-${n}-status`);
    const playersEl = document.getElementById(`court-${n}-players`);
    const callBtn   = document.getElementById(`court-${n}-call-btn`);
    const doneBtn   = document.getElementById(`court-${n}-done-btn`);
    const timerEl   = document.getElementById(`court-${n}-timer`);
    const cardEl    = document.getElementById(`court-${n}-card`);
    const fillBtn   = document.getElementById(`court-${n}-fill-btn`);
    if (!statusEl) return;

    if (isPlaying) {
      statusEl.textContent = 'Playing';
      statusEl.className = 'badge b-red';
      cardEl.style.borderColor = 'rgba(231,76,60,0.4)';
      cardEl.style.background  = 'rgba(231,76,60,0.05)';
      playersEl.innerHTML = `<strong style="color:var(--ink)">${court.players}</strong><div style="font-size:11px;color:var(--muted);margin-top:4px;">${court.playerCount || 0} of 4 players</div>`;
      callBtn.style.display = 'none';
      doneBtn.style.display = '';
      const spotsLeft = 4 - (court.playerCount || 0);
      if (fillBtn) { fillBtn.style.display = spotsLeft > 0 ? '' : 'none'; fillBtn.textContent = `➕ Fill (${spotsLeft} spots left)`; }
      if (court.calledAt) {
        const mins = Math.floor((Date.now() - court.calledAt) / 60000);
        timerEl.textContent = `⏱ On court ${mins}m`;
      }
    } else {
      statusEl.textContent = 'Open';
      statusEl.className = 'badge b-green';
      cardEl.style.borderColor = 'rgba(74,158,110,0.3)';
      cardEl.style.background  = 'rgba(74,158,110,0.08)';
      playersEl.textContent = waiting.length > 0
        ? `${waiting.length} group${waiting.length > 1 ? 's' : ''} waiting`
        : 'No one in queue';
      callBtn.style.display = '';
      doneBtn.style.display = 'none';
      if (fillBtn) fillBtn.style.display = 'none';
      timerEl.textContent = '';
    }
  });

  const listEl = document.getElementById('cq-list');
  if (!listEl) return;
  if (!waiting.length) {
    listEl.innerHTML = `<div class="empty" style="padding:24px"><div class="ei">🏓</div><p>No one in queue yet. Players join at the kiosk after check-in.</p></div>`;
    return;
  }
  listEl.innerHTML = waiting.map((entry, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="font-family:'barlow-semi-condensed',sans-serif;font-size:28px;color:var(--gold);min-width:36px;text-align:center">${i+1}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px">${entry.name}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Party of ${entry.partySize} · Joined ${entry.joinedAt}</div>
        ${entry.phone ? `<a href="tel:${entry.phone}" style="display:inline-flex;align-items:center;gap:5px;margin-top:4px;background:rgba(0,119,95,0.12);border:1px solid rgba(0,119,95,0.3);border-radius:6px;padding:4px 10px;font-size:12px;font-weight:700;color:#00775f;text-decoration:none;">📞 ${entry.phone}</a>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        ${entry.phone ? `<a href="sms:${entry.phone}?body=${encodeURIComponent(`Hi ${entry.name}, you have 5 minutes before your time starts. Head to the court now! 🏓`)}" style="display:inline-flex;align-items:center;gap:5px;background:#00775f;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;color:white;text-decoration:none;">💬 Text</a>` : ''}
        <button class="btn btn-danger btn-xs" onclick="removeFromQueue(${entry.id})">✕</button>
      </div>
    </div>`).join('');
}

function callNextGroup(courtNum) {
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev || !ev.pickleQueue) return;
  const next = ev.pickleQueue.find(e => e.status === 'waiting');
  if (!next) { alert('No one in the queue!'); return; }
  next.status = 'playing';
  next.courtNum = courtNum;
  if (!ev.courts) ev.courts = [
    {id:1, status:'open', players:'', calledAt:null},
    {id:2, status:'open', players:'', calledAt:null}
  ];
  ev.courts[courtNum-1] = {id: courtNum, status: 'playing', players: next.name, playerCount: next.partySize, calledAt: Date.now()};
  saveDB();
  renderCourtQueue();
  setTimeout(() => renderCourtQueue(), 60000);
}

function courtDone(courtNum) {
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev || !ev.courts) return;
  const playing = (ev.pickleQueue||[]).find(e => e.status === 'playing' && e.courtNum === courtNum);
  if (playing) playing.status = 'done';
  ev.courts[courtNum-1] = {id: courtNum, status: 'open', players: '', calledAt: null};
  saveDB();
  renderCourtQueue();
}
  function fillCourt(courtNum) {
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev || !ev.pickleQueue || !ev.courts) return;
  const court = ev.courts[courtNum-1];
  const spotsLeft = 4 - (court.playerCount || 0);
  if (spotsLeft <= 0) { alert('Court is already full!'); return; }

  const eligible = ev.pickleQueue.filter(e => e.status === 'waiting' && e.partySize <= spotsLeft);
  if (!eligible.length) { alert(`No groups in queue that fit — need ${spotsLeft} or fewer players.`); return; }

  const options = eligible.map((e, i) => `${i+1}. ${e.name} (Party of ${e.partySize})`).join('\n');
  const choice = prompt(`${spotsLeft} spot(s) left on Court ${courtNum}.\n\nChoose a group to fill in:\n\n${options}\n\nEnter number:`);
  if (!choice) return;

  const idx = parseInt(choice) - 1;
  if (isNaN(idx) || idx < 0 || idx >= eligible.length) { alert('Invalid choice.'); return; }

  const selected = eligible[idx];
  selected.status = 'playing';
  selected.courtNum = courtNum;
  court.players = court.players + ' + ' + selected.name;
  court.playerCount = (court.playerCount || 0) + selected.partySize;
  saveDB();
  renderCourtQueue();
}

function removeFromQueue(entryId) {
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev || !ev.pickleQueue) return;
  ev.pickleQueue = ev.pickleQueue.filter(e => e.id !== entryId);
  saveDB();
  renderCourtQueue();
}

function clearCourtQueue() {
  if (!confirm('Clear the entire court queue?')) return;
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev) return;
  ev.pickleQueue = [];
  ev.courts = [
    {id:1, status:'open', players:'', calledAt:null},
    {id:2, status:'open', players:'', calledAt:null}
  ];
  saveDB();
  renderCourtQueue();
}

// ══ SETTINGS ═════════════════════════════════════
function renderSettings() {
  renderTagList('team-tags', DB.teamMembers, 'team');
  renderTagList('category-tags', DB.categories, 'cat');
  renderTagList('status-tags', DB.statuses, 'stat');
  renderTagList('comms-tags', DB.comms, 'comms');
  const fu = DB.formUrls || {};
  const iEl = document.getElementById('set-interest-form-url');
  const aEl = document.getElementById('set-intake-form-url');
  if (iEl) {
    iEl.value = fu.interest || '';
    const ib = document.getElementById('open-interest-btn');
    if (ib) ib.style.display = fu.interest ? '' : 'none';
  }
  if (aEl) {
    aEl.value = fu.intake || '';
    const ab = document.getElementById('open-intake-btn');
    if (ab) ab.style.display = fu.intake ? '' : 'none';
  }
}

function renderTagList(containerId, arr, type) {
  const el = document.getElementById(containerId);
  el.innerHTML = arr.map((t,i) => `<div class="tag-item">${t}<button class="tag-rm" onclick="removeTag('${type}',${i})">✕</button></div>`).join('');
}

function removeTag(type, idx) {
  const maps = {team:'teamMembers', cat:'categories', stat:'statuses', comms:'comms'};
  DB[maps[type]].splice(idx, 1);
  saveDB(); renderSettings(); populateDropdowns();
}

function addTeamMember() { addTagGeneric('team-add-input','teamMembers','team-tags','team'); }
function addCategory()   { addTagGeneric('cat-add-input','categories','category-tags','cat'); }
function addStatus()     { addTagGeneric('status-add-input','statuses','status-tags','stat'); }
function addComms()      { addTagGeneric('comms-add-input','comms','comms-tags','comms'); }

function addTagGeneric(inputId, dbKey, containerId, type) {
  const val = document.getElementById(inputId).value.trim();
  if (!val) return;
  if (!DB[dbKey].includes(val)) { DB[dbKey].push(val); saveDB(); }
  document.getElementById(inputId).value = '';
  renderTagList(containerId, DB[dbKey], type);
  populateDropdowns();
}

function savePasswords() {
  const ap = document.getElementById('set-admin-pw').value.trim();
  const sp = document.getElementById('set-staff-pw').value.trim();
  if (ap) DB.passwords.admin = ap;
  if (sp) DB.passwords.staff = sp;
  saveDB();
  alert('✅ Passwords updated! Use them on next login.');
  document.getElementById('set-admin-pw').value = '';
  document.getElementById('set-staff-pw').value = '';
}

function saveFormUrls() {
  if (!DB.formUrls) DB.formUrls = {};
  DB.formUrls.interest = document.getElementById('set-interest-form-url').value.trim();
  DB.formUrls.intake   = document.getElementById('set-intake-form-url').value.trim();
  saveDB();
  const ib = document.getElementById('open-interest-btn');
  const ab = document.getElementById('open-intake-btn');
  if (ib) ib.style.display = DB.formUrls.interest ? '' : 'none';
  if (ab) ab.style.display = DB.formUrls.intake   ? '' : 'none';
  alert('✅ Form URLs saved!');
}

// ══ DROPDOWNS ════════════════════════════════════
function populateDropdowns() {
  const selectors = [
    {id:'ap-category',arr:DB.categories}, {id:'ep-category',arr:DB.categories},
    {id:'ap-status',arr:DB.statuses},     {id:'ep-status',arr:DB.statuses},
    {id:'ap-comms',arr:DB.comms},         {id:'ep-comms',arr:DB.comms},
    {id:'f-category',arr:DB.categories,blank:'All Categories'},
    {id:'f-status',arr:DB.statuses,blank:'All Statuses'}
  ];
  selectors.forEach(({id,arr,blank}) => {
    const el = document.getElementById(id); if(!el) return;
    const cur = el.value;
    el.innerHTML = (blank?`<option value="">${blank}</option>`:'<option value="">Select…</option>') + arr.map(v=>`<option value="${v}">${v}</option>`).join('');
    if (cur) el.value = cur;
  });
  ['ap-team-ref','ep-team-ref'].forEach(id => {
    const el = document.getElementById(id); if(!el) return;
    el.innerHTML = '<option value="">None</option>' + DB.teamMembers.map(t=>`<option value="${t}">${t}</option>`).join('');
  });
}

// ══ BADGES & HELPERS ═════════════════════════════
function attendBadge(v) {
  if(v==='yes')  return '<span class="badge b-green">Attending</span>';
  if(v==='maybe')return '<span class="badge b-gold">Maybe</span>';
  return '<span class="badge b-gray">Declined</span>';
}

// ══ CSV PARSER ═══════════════════════════════════
function parseCSV(text) {
  const rows = [];
  text.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const cols=[]; let cur='', inQ=false;
    for (let i=0;i<line.length;i++) {
      if (line[i]==='"') inQ=!inQ;
      else if (line[i]===','&&!inQ){cols.push(cur.trim());cur='';}
      else cur+=line[i];
    }
    cols.push(cur.trim()); rows.push(cols);
  });
  return rows;
}

// ══ EXPORT ═══════════════════════════════════════
function exportCSV(type) {
  let headers, rows, filename;
  if (type==='prospects') {
    headers=['Date Added','Full Name','First','Last','Email','Phone','Category','Status','Team Referral','VIP RAM Comms','Good Prospect?','Notes','Customizable Message'];
    rows=DB.prospects.map(p=>[p.dateAdded,p.name,p.fname||'',p.lname||'',p.email,p.phone,p.category,p.status,p.teamRef,p.comms,p.good==='yes'?'Yes':'',p.notes,p.customMsg]);
    filename='bryc-prospects.csv';
  } else if (type==='event-rsvps') {
    const ev=DB.events.find(e=>e.id===currentEventId);
    headers=['Name','Email','Phone','Role','Attending','Guests','Dietary','Date'];
    rows=(ev?.rsvps||[]).map(r=>[r.name,r.email,r.phone,r.role,r.attending,r.guests?.map(g=>g.name).join(';'),r.diet?.join(';'),r.date]);
    filename=`${ev?.name||'event'}-rsvps.csv`;
  } else if (type==='checkins') {
    const ev=DB.events.find(e=>e.id===currentEventId);
    headers=['Name','Type','Role','Guest','Both Commit','Raffle','Time'];
    rows=(ev?.checkins||[]).map(c=>[c.name,c.walkIn?'Walk-In':'RSVP',c.role,c.guestName,c.commitSelf&&c.commitGuest?'Yes':'No',c.raffleEntry?'Yes':'No',c.time]);
    filename='checkins.csv';
  }
  const csv=[headers,...rows].map(r=>r.map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=filename; a.click();
}

function exportAll() {
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(DB,null,2)],{type:'application/json'}));
  a.download='bryc-py27-backup.json'; a.click();
}

function restoreBackup() {
  const file=document.getElementById('restore-file').files[0];
  if(!file){alert('Please select a JSON backup file.');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!confirm('This will replace all current data. Continue?'))return;
      DB=data; saveDB(); closeModal('restore-modal');
      populateDropdowns(); renderAll();
      alert('✅ Data restored successfully!');
    }catch(err){alert('Invalid backup file.');}
  };
  reader.readAsText(file);
}

function confirmClearData() {
  if(prompt('Type DELETE to confirm clearing all data:')!=='DELETE')return;
  DB=JSON.parse(JSON.stringify(DEFAULT));
  saveDB(); populateDropdowns(); renderAll();
  alert('All data cleared.');
}

// ══ MODAL HELPERS ════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');});
});

// ══ TABLE FILTER ═════════════════════════════════
function filterTable(tbodyId, q) {
  document.querySelectorAll(`#${tbodyId} tr`).forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}

// ══ RENDER ALL ═══════════════════════════════════
function renderAll() {
  renderDashboard();
  renderProspects();
  renderEventCards();
  renderSettings();
  populateSheetSettings();
  try { refreshEventDetail(); } catch(e) {}
  try { renderCourtQueue(); } catch(e) {}
}

// ══ RSVP SHEET SYNC ══════════════════════════════
function saveRsvpSheetConfig() {
  const cfg = {
    sheetId: document.getElementById('rsvp-sheet-id').value.trim(),
    tabName:  document.getElementById('rsvp-sheet-tab').value.trim() || 'Form Responses 1',
  };
  if (!cfg.sheetId) {
    document.getElementById('rsvp-sheet-status').textContent = '⚠️ Sheet ID required.';
    return;
  }
  localStorage.setItem('bryc-rsvp-sheet', JSON.stringify(cfg));
  document.getElementById('rsvp-sheet-status').textContent = '✅ Saved!';
  setTimeout(() => document.getElementById('rsvp-sheet-status').textContent = '', 3000);
}

function getRsvpSheetConfig() {
  try { return JSON.parse(localStorage.getItem('bryc-rsvp-sheet') || '{}'); } catch(e) { return {}; }
}

function populateRsvpSheetSettings() {
  const cfg = getRsvpSheetConfig();
  const si = document.getElementById('rsvp-sheet-id');
  const st = document.getElementById('rsvp-sheet-tab');
  if (si && cfg.sheetId) si.value = cfg.sheetId;
  if (st && cfg.tabName)  st.value = cfg.tabName;
}

function mapRSVPRow_HappyHourBingo(row, headerIdx) {
  const g = i => i >= 0 ? (row[i]||'').trim() : '';
  const fname = g(headerIdx.fname);
  const lname = g(headerIdx.lname);
  const name  = [fname, lname].filter(Boolean).join(' ');
  if (!name) return null;

  const attendRaw = g(headerIdx.attend).toLowerCase();
  let attending = 'no';
  if (attendRaw.includes('yes')) attending = 'yes';
  else if (attendRaw.includes('maybe')) attending = 'maybe';

  const dietRaw = g(headerIdx.diet);
  const diet = dietRaw && dietRaw.toLowerCase() !== 'none'
    ? dietRaw.split(',').map(d => d.trim()).filter(Boolean)
    : [];

  return {
    id: Date.now() + Math.random(),
    fname, lname, name,
    email: g(headerIdx.email).toLowerCase(),
    role: g(headerIdx.role),
    attending,
    guests: [],
    diet,
    date: new Date().toLocaleDateString(),
    fromSheet: true
  };
}

function findColumnIndexes(headers, template) {
  const h = headers.map(x => x.toLowerCase().trim());
  const find = keyword => h.findIndex(x => x.includes(keyword.toLowerCase()));
  if (template === 'happy-hour-bingo') {
    return {
      email: find('email'),
      fname: find('first name'),
      lname: find('last name'),
      role: find('please choose an option'),
      attend: find('will you be attending'),
      diet: find('dietary'),
    };
  }
  // court-connections default
  return {
    ts: find('timestamp'),
    email: find('email'),
    fname: find('first name'),
    lname: find('last name'),
    fullName: find('full name'),
    role: find('community role'),
    status: find('rsvp status'),
    g1n: find('guest 1 name'),
    g1c: find('guest 1 contact'),
    g2n: find('guest 2 name'),
    g2c: find('guest 2 contact'),
    g3n: find('guest 3 name'),
    g3c: find('guest 3 contact'),
    diet: find('dietary restrictions'),
  };
}

async function syncRSVPSheet() {
  const ev = DB.events.find(e => e.id === currentEventId);
  if (!ev) { alert('No event selected.'); return; }
  const gsCfg = getSheetConfig();
  const btn = document.getElementById('rsvp-sheet-sync-btn');

  if (!ev.sheetId) {
    alert('This event does not have an RSVP Sheet ID set.\n\nClick ✏ Edit on this event and add the Sheet ID and Tab Name.');
    return;
  }
  if (!ev.formTemplate) {
    alert('This event does not have a Form Template selected.\n\nClick ✏ Edit and choose a template (Court Connections or Happy Hour Bingo).');
    return;
  }
  if (!gsCfg.clientId) {
    alert('Please set your OAuth Client ID in Settings → Google Sheets Sync first.');
    goPage('settings', document.getElementById('settings-btn'));
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing…'; }
  try {
    let token = gsGetToken();
    if (!token) token = await gsRequestToken(gsCfg.clientId);
    gsSetToken(token);

    const tab = ev.sheetTab || 'Form Responses 1';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${ev.sheetId}/values/${encodeURIComponent(tab)}`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 401) { gsClearToken(); throw new Error('Auth expired — please sync again.'); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rows = json.values || [];
    if (rows.length < 2) { alert('Sheet has no data rows.'); return; }

    const headers = rows[0];
    const headerIdx = findColumnIndexes(headers, ev.formTemplate);
    const existingNames = new Set((ev.rsvps || []).map(r => (r.name || '').toLowerCase()).filter(Boolean));
    let added = 0;

    rows.slice(1).forEach(cols => {
      let newRSVP = null;

      if (ev.formTemplate === 'happy-hour-bingo') {
        newRSVP = mapRSVPRow_HappyHourBingo(cols, headerIdx);
      } else {
        // Court Connections mapping
        const g = i => i >= 0 ? (cols[i]||'').trim() : '';
        const fname = g(headerIdx.fname);
        const lname  = g(headerIdx.lname);
        const name   = g(headerIdx.fullName) || [fname,lname].filter(Boolean).join(' ');
        const email  = g(headerIdx.email).toLowerCase();
        if (!name) return;
        const statusRaw = g(headerIdx.status).toLowerCase().trim();
        let attending = 'no';
        if (statusRaw.includes('not attending') || statusRaw.includes("can't make") || statusRaw.includes('cannot')) attending = 'no';
        else if (statusRaw.includes('maybe')) attending = 'maybe';
        else if (statusRaw === 'attending' || statusRaw.includes('yes')) attending = 'yes';
        const guests = [];
        [[headerIdx.g1n,headerIdx.g1c],[headerIdx.g2n,headerIdx.g2c],[headerIdx.g3n,headerIdx.g3c]].forEach(([ni,ci]) => {
          const gn = g(ni); if (!gn) return;
          guests.push({ name: gn, contact: g(ci) });
        });
        const diet = g(headerIdx.diet) ? g(headerIdx.diet).split(',').map(d=>d.trim()).filter(Boolean) : [];
        newRSVP = {
          id: Date.now() + Math.random(),
          fname, lname, name, email,
          role: g(headerIdx.role),
          attending, guests, diet,
          date: g(headerIdx.ts).split(' ')[0] || new Date().toLocaleDateString(),
          fromSheet: true
        };
      }

      if (!newRSVP) return;
      if (existingNames.has(newRSVP.name.toLowerCase())) return;
      ev.rsvps.push(newRSVP);
      existingNames.add(newRSVP.name.toLowerCase());
      added++;
    });

    saveDB();
    try { refreshEventDetail(); } catch(e) { console.warn('refresh error:', e); }
    alert(`✅ Sheet synced — ${added} new responses loaded (${ev.rsvps.length} total)`);
  } catch(err) {
    console.error('Sync error:', err);
    alert('Sync failed: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync RSVP Sheet'; }
  }
}
  
// ══ GOOGLE SHEETS SYNC ═══════════════════════════
const PROSPECT_FIELDS = [
  { key: 'dateAdded',  label: 'Date Added' },
  { key: 'category',   label: 'Category' },
  { key: 'name',       label: 'Full Name' },
  { key: 'fname',      label: 'First Name' },
  { key: 'lname',      label: 'Last Name' },
  { key: 'email',      label: 'Email' },
  { key: 'phone',      label: 'Phone' },
  { key: 'teamRef',    label: 'Team Referral' },
  { key: 'mentorRef',  label: 'Mentor Referral' },
  { key: 'good',       label: 'Good Prospect? (yes/no)' },
  { key: 'status',     label: 'Status' },
  { key: 'comms',      label: 'VIP RAM Comms' },
  { key: 'notes',      label: 'Date of Comms / Notes' },
  { key: 'customMsg',  label: 'Customizable Message' },
];

function getSheetConfig() {
  try { return JSON.parse(localStorage.getItem('bryc-sheets-config') || '{}'); } catch(e) { return {}; }
}
function saveSheetConfig() {
  const cfg = {
    clientId:   document.getElementById('gs-client-id').value.trim(),
    sheetId:    document.getElementById('gs-sheet-id').value.trim(),
    sheetName:  document.getElementById('gs-sheet-name').value.trim() || 'Sheet1',
    headerRow:  parseInt(document.getElementById('gs-header-row').value) || 1,
    columnMap:  getSheetConfig().columnMap || {},
  };
  if (!cfg.clientId || !cfg.sheetId) { gsSetStatus('⚠️ Client ID and Sheet ID are required.', 'red'); return; }
  localStorage.setItem('bryc-sheets-config', JSON.stringify(cfg));
  if (window._fb) { window._fb.setDoc(window._fb.SHEETS_DOC, cfg).catch(()=>{}); }
  gsSetStatus('✅ Config saved!', 'green');
  setTimeout(() => gsSetStatus(''), 3000);
}
function saveColumnMap() {
  const cfg = getSheetConfig();
  const map = {};
  PROSPECT_FIELDS.forEach(f => {
    const el = document.getElementById('gsmap-' + f.key);
    if (el && el.value) map[f.key] = el.value;
  });
  cfg.columnMap = map;
  localStorage.setItem('bryc-sheets-config', JSON.stringify(cfg));
  gsSetStatus('✅ Column map saved!', 'green');
  setTimeout(() => gsSetStatus(''), 3000);
}

function gsSetStatus(msg, color) {
  const el = document.getElementById('gs-status-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color === 'red' ? 'var(--danger)' : color === 'green' ? '#4caf50' : 'var(--muted)';
}

function populateSheetSettings() {
  const cfg = getSheetConfig();
  const ci = document.getElementById('gs-client-id');
  const si = document.getElementById('gs-sheet-id');
  const sn = document.getElementById('gs-sheet-name');
  const hr = document.getElementById('gs-header-row');
  if (ci && cfg.clientId) ci.value = cfg.clientId;
  if (si && cfg.sheetId)  si.value = cfg.sheetId;
  if (sn && cfg.sheetName) sn.value = cfg.sheetName;
  if (hr && cfg.headerRow) hr.value = cfg.headerRow;
  const sob = document.getElementById('gs-signout-btn');
  if (sob) sob.style.display = gsGetToken() ? '' : 'none';
  populateRsvpSheetSettings();
  // --------Returner Sheet_____________
  const retCfg = DB.returnerSheetConfig || {};
  const ri = document.getElementById('ret-sheet-id');
  const rt = document.getElementById('ret-sheet-tab');
  if (ri && retCfg.sheetId) ri.value = retCfg.sheetId;
  if (rt && retCfg.tab)     rt.value = retCfg.tab;
}

let _gsToken = null;
function gsGetToken() { return _gsToken || sessionStorage.getItem('gs-token'); }
function gsSetToken(t) { _gsToken = t; sessionStorage.setItem('gs-token', t); }
function gsClearToken() { _gsToken = null; sessionStorage.removeItem('gs-token'); }

function gsSignOut() {
  const token = gsGetToken();
  window.gapi_token = token;
  if (token) { fetch('https://oauth2.googleapis.com/revoke?token=' + token, { method: 'POST' }).catch(() => {}); }
  gsClearToken();
  gsSetStatus('Signed out of Google.', '');
  const sob = document.getElementById('gs-signout-btn');
  if (sob) sob.style.display = 'none';
}

async function handleSheetsSync() {
  const cfg = getSheetConfig();
  if (!cfg.clientId || !cfg.sheetId) {
    alert('Please configure your Google Sheet settings first.\n\nGo to Settings → Google Sheets Sync.');
    goPage('settings', document.getElementById('settings-btn'));
    return;
  }
  const btn = document.getElementById('sheets-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Connecting…'; }
  gsSetStatus('Connecting to Google…', '');
  try {
    let token = gsGetToken();
    if (!token) token = await gsRequestToken(cfg.clientId);
    gsSetToken(token);
    if (document.getElementById('gs-signout-btn')) document.getElementById('gs-signout-btn').style.display = '';
    if (btn) btn.textContent = '⏳ Fetching sheet…';
    gsSetStatus('Fetching sheet data…', '');
    const data = await gsFetchSheet(token, cfg);
    if (!data || data.length === 0) { gsSetStatus('⚠️ Sheet returned no data. Check your Sheet ID and tab name.', 'red'); return; }
    if (!cfg.columnMap || Object.keys(cfg.columnMap).length === 0) {
      gsShowColumnMapper(data[0], cfg);
      gsSetStatus('👆 Map your columns below, then click Save Column Map and sync again.', '');
      return;
    }
    const { added } = gsImportRows(data, cfg);
    renderProspects(); renderDashboard();
    const msg = `✅ Sync complete — ${DB.prospects.length} prospects loaded from sheet`;
    gsSetStatus(msg, 'green');
    alert(msg);
  } catch(err) {
    console.error('Google Sheets sync error:', err);
    if (err.message === 'REAUTH') { gsClearToken(); gsSetStatus('Session expired. Please sync again.', 'red'); }
    else { gsSetStatus('❌ ' + (err.message || 'Sync failed'), 'red'); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync Sheet'; }
  }
}

let _gisClient = null;
function gsRequestToken(clientId) {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.accounts) { reject(new Error('Google Identity Services not loaded.')); return; }
    _gisClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      callback: (response) => {
        if (response.error) reject(new Error(response.error_description || response.error));
        else resolve(response.access_token);
      },
      error_callback: (err) => reject(new Error(err.message || 'Google sign-in failed.'))
    });
    _gisClient.requestAccessToken({ prompt: 'consent' });
  });
}

async function gsAppendRowToTab(cfg, tabName, rowData) {
  if (!cfg.clientId || !cfg.sheetId) return;
  let token = gsGetToken();
  if (!token) { try { token = await gsRequestToken(cfg.clientId); gsSetToken(token); } catch(e) { return; } }
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${encodeURIComponent(tabName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [rowData] }) });
  } catch(e) { console.warn('Sheet append failed:', e); }
}

async function gsFetchSheet(token, cfg) {
  const sheetName = cfg.sheetName || 'Sheet1';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 401) throw new Error('REAUTH');
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || `HTTP ${res.status}`); }
  const json = await res.json();
  const rows = json.values || [];
  const headerRowIdx = (cfg.headerRow || 1) - 1;
  if (rows.length <= headerRowIdx) return [];
  return rows.slice(headerRowIdx);
}

async function gsWriteProspectToSheet(prospect, action = 'add') {
  const cfg = getSheetConfig();
  if (!cfg.clientId || !cfg.sheetId || !cfg.columnMap || Object.keys(cfg.columnMap).length === 0) return;
  let token = gsGetToken();
  if (!token) { try { token = await gsRequestToken(cfg.clientId); gsSetToken(token); } catch(e) { return; } }
  try {
    const data = await gsFetchSheet(token, cfg);
    if (!data || data.length === 0) return;
    const headers = data[0];
    const colMap = cfg.columnMap;
    function prospectToRow(p) {
  return headers.map(h => {
    const field = Object.entries(colMap).find(([k, v]) => v === h);
    if (!field) return '';
    const key = field[0];
    if (key === 'good') return p[key] === 'yes' ? 'Yes' : p[key] === 'no' ? 'No' : '';
    if (key === 'campus') return p.campus || '';
    if (key === 'days') return p.days || '';
    if (key === 'role1') return p.role1 || '';
    if (key === 'role2') return p.role2 || '';
    return p[key] || '';
  });
}
    const sheetName = cfg.sheetName || 'Sheet1';
    const headerRowNum = cfg.headerRow || 1;
    if (action === 'add') {
      const row = prospectToRow(prospect);
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      await fetch(appendUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [row] }) });
    } else if (action === 'update' || action === 'delete') {
      const emailColIdx = headers.indexOf(colMap['email']);
      const nameColIdx  = headers.indexOf(colMap['name'] || colMap['fname']);
      const dataRows = data.slice(1);
      let rowIndex = -1;
      dataRows.forEach((row, i) => {
        if (emailColIdx >= 0 && prospect.email && row[emailColIdx]?.toLowerCase() === prospect.email.toLowerCase()) rowIndex = i;
        else if (nameColIdx >= 0 && prospect.name && row[nameColIdx]?.toLowerCase() === prospect.name.toLowerCase()) rowIndex = i;
      });
      if (rowIndex === -1) {
        if (action === 'update') {
          const row = prospectToRow(prospect);
          const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
          await fetch(appendUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [row] }) });
        }
        return;
      }
      const sheetRow = rowIndex + headerRowNum + 1;
      const range = `${sheetName}!A${sheetRow}:${columnLetter(headers.length)}${sheetRow}`;
      if (action === 'update') {
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
        await fetch(updateUrl, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [prospectToRow(prospect)] }) });
      } else if (action === 'delete') {
        const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${encodeURIComponent(range)}:clear`;
        await fetch(clearUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
      }
    }
  } catch(e) { console.warn('Sheet write-back failed:', e); }
}

function columnLetter(n) {
  let s = '';
  while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function gsShowColumnMapper(headerRow, cfg) {
  const mapDiv = document.getElementById('gs-column-map');
  const grid = document.getElementById('gs-map-grid');
  if (!mapDiv || !grid) { goPage('settings', document.getElementById('settings-btn')); setTimeout(() => { populateSheetSettings(); gsShowColumnMapper(headerRow, cfg); }, 300); return; }
  mapDiv.style.display = '';
  const saved = cfg.columnMap || {};
  const cols = headerRow.filter(Boolean);
  grid.innerHTML = PROSPECT_FIELDS.map(f => `
    <div style="display:flex;flex-direction:column;gap:4px">
      <label style="font-size:11px;color:var(--muted);font-weight:600">${f.label}</label>
      <select id="gsmap-${f.key}" style="font-size:12px;padding:6px 8px;background:var(--card);color:var(--ink);border:1px solid var(--border);border-radius:6px">
        <option value="">— skip —</option>
        ${cols.map(c => `<option value="${c}" ${saved[f.key]===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>`).join('');
  PROSPECT_FIELDS.forEach(f => {
    if (saved[f.key]) return;
    const el = document.getElementById('gsmap-' + f.key); if (!el) return;
    const needle = f.label.toLowerCase().replace(/[^a-z0-9]/g,'');
    const match = cols.find(c => c.toLowerCase().replace(/[^a-z0-9]/g,'').includes(needle) || needle.includes(c.toLowerCase().replace(/[^a-z0-9]/g,'')));
    if (match) el.value = match;
  });
  mapDiv.scrollIntoView({ behavior: 'smooth' });
}

function gsImportRows(rows, cfg) {
  const headers = rows[0];
  const dataRows = rows.slice(1);
  const colMap = cfg.columnMap || {};
  const colIdx = {};
  PROSPECT_FIELDS.forEach(f => {
    if (colMap[f.key]) { const idx = headers.indexOf(colMap[f.key]); if (idx >= 0) colIdx[f.key] = idx; }
  });
  const sheetProspects = [];
  dataRows.forEach(row => {
    if (!row || row.every(c => !c)) return;
    const get = key => (colIdx[key] !== undefined ? (row[colIdx[key]] || '') : '');
    let fname = get('fname'); let lname = get('lname');
    let name = get('name') || [fname, lname].filter(Boolean).join(' ');
    if (!fname && name) { const parts = name.split(' '); fname = parts[0]; lname = parts.slice(1).join(' '); }
    if (!name && (fname || lname)) name = [fname, lname].filter(Boolean).join(' ');
    if (!name) return;
    const goodRaw = get('good').toLowerCase();
    const good = ['yes','y','true','1','✓','x'].includes(goodRaw) ? 'yes' : goodRaw ? 'no' : '';
    const existing = DB.prospects.find(p => 
  (p.email && get('email') && p.email.toLowerCase() === get('email').toLowerCase()) ||
  (p.name && name && p.name.toLowerCase() === name.toLowerCase())
);
sheetProspects.push({ 
  ...(existing || {}),
  name, fname, lname, 
  email: get('email'), 
  phone: get('phone'), 
  category: get('category'), 
  status: get('status'), 
  teamRef: get('teamRef'), 
  mentorRef: get('mentorRef'), 
  good, 
  comms: get('comms'), 
  notes: get('notes'), 
  customMsg: get('customMsg'), 
  dateAdded: get('dateAdded') || new Date().toLocaleDateString(),
  campus: get('campus') || existing?.campus || '',
  days: get('days') || existing?.days || '',
  role1: get('role1') || existing?.role1 || '',
  role2: get('role2') || existing?.role2 || ''
});
  });
  const sheetEmails = new Set(sheetProspects.map(p => p.email?.toLowerCase()).filter(Boolean));
  const sheetNames  = new Set(sheetProspects.map(p => p.name?.toLowerCase()).filter(Boolean));
  const appOnly = DB.prospects.filter(p => {
    const emailMatch = p.email && sheetEmails.has(p.email.toLowerCase());
    const nameMatch  = p.name  && sheetNames.has(p.name.toLowerCase());
    return !emailMatch && !nameMatch;
  });
  DB.prospects = [...sheetProspects, ...appOnly];
  saveDB();
  return { added: sheetProspects.length };
}

// ══ INIT ═════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('login-modal').classList.add('open');
  document.getElementById('app').style.display = 'none';
  document.querySelectorAll('.overlay').forEach(o=>{
    o.addEventListener('click',e=>{if(e.target===o && !o.id.includes('login'))o.classList.remove('open');});
  });
});
// ══════════════════════════════════════════
// RETURNING MENTORS
// ══════════════════════════════════════════

// Column name constants matching your Google Sheet headers
const RET_COLS = {
  firstName:  'First Name',
  lastName:   'Last Name',
  willReturn: 'Will you volunteer at BRYC next year?',
  roles:      'Which volunteer role interests you? (check all that apply)',
  campus:     'Which campus do you prefer?',
  days:       'Which days are you available? (check all that apply)'
};

// Make sure DB has returner data structure
function ensureReturners() {
  if (!DB.returners) DB.returners = [];
  if (!DB.returnerSheetConfig) DB.returnerSheetConfig = { sheetId: '', tab: 'Table1' };
}

// ── Render returner profile cards ──────────
function renderReturners() {
  ensureReturners();
  const search = (document.getElementById('returner-search')?.value || '').toLowerCase();
  const fStatus = document.getElementById('f-return-status')?.value || '';
  const fCampus = document.getElementById('f-return-campus')?.value || '';

  let list = DB.returners.filter(r => {
    const name = ((r.firstName || '') + ' ' + (r.lastName || '')).toLowerCase();
    if (search && !name.includes(search)) return false;
    if (fStatus && r.willReturn.replace(/[\u2018\u2019]/g, "'") !== fStatus.replace(/[\u2018\u2019]/g, "'")) return false;
    if (fCampus && r.campus !== fCampus) return false;
    return true;
  });

  // Stats
  const all = DB.returners;
  document.getElementById('ret-total').textContent = all.length;
  document.getElementById('ret-yes').textContent   = all.filter(r => r.willReturn === 'Yes!').length;
  document.getElementById('ret-maybe').textContent = all.filter(r => r.willReturn === "I\u2019d like to, but I\u2019m not sure.").length;
  document.getElementById('ret-no').textContent    = all.filter(r => r.willReturn && r.willReturn.startsWith('No')).length;
  document.getElementById('returner-total-label').textContent = all.length;
  document.getElementById('sb-returner-cnt').textContent = all.length;
document.getElementById('ret-pending').textContent = all.filter(r => r.willReturn === 'Survey Pending').length;	

  const grid = document.getElementById('returner-cards-grid');
  if (!grid) return;

  if (list.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="ei">🔄</div><p>No matching returners.</p></div>';
    return;
  }
	
 grid.innerHTML = list.map((r, i) => {
    const idx = DB.returners.indexOf(r);
    const name = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    const statusColor = returnerStatusColor(r.willReturn);
    const statusLabel = r.willReturn || '—';
    const roles = r.roles ? r.roles.split(',').map(s => s.trim()).filter(Boolean) : [];
    const days  = r.days  ? r.days.split(',').map(s => s.trim()).filter(Boolean) : [];
    const email = r.email || '';
    const phone = r.phone || '';
    return `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:transform .2s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''">
        <div style="height:4px;background:${statusColor};"></div>
        <div style="padding:16px 18px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div>
              <div style="font-family:'proxima-nova',sans-serif;font-size:16px;font-weight:700;color:var(--ink);">${name || '(No Name)'}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px;">${r.campus || '—'}</div>
            </div>
            <span style="display:inline-block;padding:3px 9px;border-radius:50px;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;background:${statusColor}22;color:${statusColor};white-space:nowrap;max-width:120px;text-align:center;line-height:1.4;">${shortReturnStatus(statusLabel)}</span>
          </div>
          ${roles.length ? `
          <div style="margin-bottom:10px;">
            <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Roles Interested In</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;">
              ${roles.map(role => `<span style="background:rgba(240,201,23,.12);color:var(--gold);padding:2px 8px;border-radius:50px;font-size:10px;font-weight:600;">${shortRoleName(role)}</span>`).join('')}
            </div>
          </div>` : ''}
          ${days.length ? `
          <div style="margin-bottom:10px;">
            <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Available Days</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;">
              ${days.map(d => `<span style="background:rgba(240,201,23,.08);color:var(--soft);padding:2px 8px;border-radius:50px;font-size:10px;">${d}</span>`).join('')}
            </div>
          </div>` : ''}
          <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="font-size:11px;color:var(--muted);">
              ${email ? `<div>✉ ${email}</div>` : '<div style="color:rgba(0,0,0,.3);">No email yet</div>'}
              ${phone ? `<div>📞 ${phone}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px;">
              ${email ? `<a href="https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}" target="_blank" class="btn btn-ghost btn-xs" title="Email ${name}">✉</a>` : ''}
              <button class="btn btn-gold btn-xs" onclick="openEditReturner(${idx})">✏ Edit</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function returnerStatusColor(status) {
  if (!status) return 'rgba(255,255,255,0.2)';
  if (status === 'Yes!') return '#2ecc71';
  if (status.includes("not sure")) return '#f0c917';
  if (status.startsWith('No')) return '#e74c3c';
  return 'rgba(255,255,255,0.2)';
}

function shortReturnStatus(status) {
  if (!status) return '—';
  if (status === 'Yes!') return '✅ Yes!';
  if (status.includes("not sure")) return '🤔 Maybe';
  if (status.includes("Baton Rouge")) return '🚫 Moving';
  if (status.includes("scheduling")) return '🚫 Scheduling';
  if (status.includes("not interested")) return '🚫 Not Interested';
  return status.slice(0, 22);
}

function shortRoleName(role) {
  if (role.includes('follow my Fellows')) return 'Follow Fellows';
  if (role.includes('Research Mentor'))   return 'Research Mentor';
  if (role.includes('Underclassmen'))     return 'Underclassmen LM';
  if (role.includes('Upperclassmen'))     return 'Upperclassmen LM';
  if (role.includes('Senior Mentor'))     return 'Senior Mentor';
  if (role.includes('Tutor'))             return 'Tutor';
  return role.slice(0, 20);
}

function clearReturnerFilters() {
  document.getElementById('returner-search').value = '';
  document.getElementById('f-return-status').value = '';
  document.getElementById('f-return-campus').value = '';
  renderReturners();
}

// ── Sync Returner Sheet (Google Sheets API) ─
async function syncReturnerSheet() {
  ensureReturners();
  const cfg = DB.returnerSheetConfig;
  const statusEl = document.getElementById('ret-sheet-status');

  if (!cfg.sheetId || !cfg.tab) {
    if (statusEl) statusEl.textContent = '⚠ Configure sheet ID and tab first.';
    alert('Please save a Returning Mentors Sheet ID and tab name in Settings first.');
    return;
  }

  // Re-use existing OAuth token from Google Sheets Sync
let token = gsGetToken();
if (!token) {
  const cfg2 = getSheetConfig();
  if (!cfg2.clientId) {
    if (statusEl) statusEl.textContent = '⚠ No OAuth Client ID. Add it in Settings → Google Sheets Sync first.';
    return;
  }
  try {
    if (statusEl) statusEl.textContent = '⏳ Signing in to Google…';
    token = await gsRequestToken(cfg2.clientId);
    gsSetToken(token);
  } catch(e) {
    if (statusEl) statusEl.textContent = '❌ Google sign-in failed. Try again.';
    return;
  }
}

  if (statusEl) statusEl.textContent = '⏳ Syncing…';

  try {
    const range = encodeURIComponent(`${cfg.tab}!A1:Z1000`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${range}`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (resp.status === 401) {
  gsClearToken();
  if (statusEl) statusEl.textContent = '⚠ Session expired — click Sync again to re-authenticate.';
  return;
}
if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const rows = data.values || [];
    if (rows.length < 2) { if (statusEl) statusEl.textContent = '⚠ Sheet empty or no data rows.'; return; }

    const headers = rows[0];
    const findCol = (label) => headers.findIndex(h => h.trim().toLowerCase().includes(label.toLowerCase()));

    const iFirst    = findCol('First Name');
    const iLast     = findCol('Last Name');
    const iReturn   = findCol('volunteer at BRYC');
    const iRoles    = findCol('volunteer role');
    const iCampus   = findCol('campus');
    const iDays     = findCol('days');

DB.returners = rows.slice(1).filter(r => r.length > 0 && (r[iFirst] || r[iLast])).map(r => {
  const firstName  = iFirst  >= 0 ? (r[iFirst]  || '').trim() : '';
  const lastName   = iLast   >= 0 ? (r[iLast]   || '').trim() : '';
  const existing = (DB.returners || []).find(e => 
    e.firstName?.toLowerCase() === firstName.toLowerCase() && 
    e.lastName?.toLowerCase() === lastName.toLowerCase()
  );
  return {
    ...(existing || {}),
    firstName,
    lastName,
    willReturn: iReturn >= 0 ? (r[iReturn] || '').trim() : '',
    roles:      iRoles  >= 0 ? (r[iRoles]  || '').trim() : '',
    campus:     iCampus >= 0 ? (r[iCampus] || '').trim() : '',
    days:       iDays   >= 0 ? (r[iDays]   || '').trim() : '',
    email:      existing?.email || '',
    phone:      existing?.phone || '',
  };
});

    await saveDB();
    if (statusEl) statusEl.textContent = `✅ Synced ${DB.returners.length} returners.`;
    renderReturners();
    renderOnboarding();
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = `❌ Error: ${err.message}`;
  }
}

// ── Save returner sheet config ──────────────
async function saveReturnerSheetConfig() {
  ensureReturners();
  DB.returnerSheetConfig = {
    sheetId: document.getElementById('ret-sheet-id')?.value?.trim() || '',
    tab: document.getElementById('ret-sheet-tab')?.value?.trim() || 'Table1',
  };
  await saveDB();
  document.getElementById('ret-sheet-status').textContent = '✅ Saved.';
  setTimeout(() => { const el = document.getElementById('ret-sheet-status'); if(el) el.textContent=''; }, 2500);
}

// Load saved returner config into Settings UI
function loadReturnerSheetConfigUI() {
  ensureReturners();
  const cfg = DB.returnerSheetConfig || {};
  const idEl = document.getElementById('ret-sheet-id');
  const tabEl = document.getElementById('ret-sheet-tab');
  if (idEl) idEl.value = cfg.sheetId || '';
  if (tabEl) tabEl.value = cfg.tab || 'Table1';
}


// ══════════════════════════════════════════
// ONBOARDING KANBAN
// ══════════════════════════════════════════

// Statuses from Prospects that belong in Onboarding
const OB_PROSPECT_STATUSES = [
  'Onboarding - Need BG Check',
  'Committed',
];

function renderOnboarding() {
  ensureReturners();

  // Gather prospects in onboarding statuses
  const prospects = (DB.prospects || []).filter(p =>
    OB_PROSPECT_STATUSES.some(s => (p.status || '').toLowerCase() === s.toLowerCase())
  );

  // Returners
  const returningYes   = (DB.returners || []).filter(r => r.willReturn === 'Yes!');
  const returningMaybe = (DB.returners || []).filter(r => 
  r.willReturn === "I\u2019d like to, but I\u2019m not sure." ||
  r.willReturn === 'Survey Pending' ||
  !r.willReturn
);

  // Also include prospects with "maybe" returner phrasing in their status (if you import them as prospects)
  const prospectMaybe = (DB.prospects || []).filter(p =>
    (p.status || '').toLowerCase().includes("not sure")
  );

  const bgCheck   = prospects.filter(p => p.status?.toLowerCase().includes('bg check') || p.status?.toLowerCase().includes('onboarding'));
  const committed = prospects.filter(p => p.status?.toLowerCase() === 'committed');
  const allMaybe  = [...returningMaybe, ...prospectMaybe];
  const allYes    = returningYes;

  // Stats
  const total = bgCheck.length + committed.length + allMaybe.length + allYes.length;
  document.getElementById('ob-total').textContent     = total;
  document.getElementById('ob-bg').textContent        = bgCheck.length;
  document.getElementById('ob-committed').textContent = committed.length;
  document.getElementById('ob-maybe').textContent     = allMaybe.length;

  document.getElementById('ob-col-maybe-cnt').textContent     = `${allMaybe.length} people`;
  document.getElementById('ob-col-bg-cnt').textContent        = `${bgCheck.length} people`;
  document.getElementById('ob-col-committed-cnt').textContent = `${committed.length} people`;
  document.getElementById('ob-col-returning-cnt').textContent = `${allYes.length} people`;

  // Render each column
  renderObColumn('ob-col-maybe',     allMaybe,  'maybe');
  renderObColumn('ob-col-bg',        bgCheck,   'prospect');
  renderObColumn('ob-col-committed', committed, 'prospect');
  renderObColumn('ob-col-returning', allYes,    'returner');
}

function renderObColumn(colId, people, type) {
  const col = document.getElementById(colId);
  if (!col) return;
  if (people.length === 0) {
    col.innerHTML = `<div style="text-align:center;padding:20px 12px;color:rgba(255,255,255,.18);font-size:12px;border:1px dashed rgba(255,255,255,.08);border-radius:10px;">Empty</div>`;
    return;
  }
  col.innerHTML = people.map(p => {
    if (type === 'returner' || (p.willReturn !== undefined)) {
      const idx = DB.returners.indexOf(p);
      return obReturnerCard(p, idx);
    }
    return obProspectCard(p);
  }).join('');
}

function obProspectCard(p) {
  const name = `${p.firstName || p.fname || p.first || ''} ${p.lastName || p.lname || p.last || ''}`.trim() || p.name || '(No Name)';
  const email    = p.email || '';
  const phone    = p.phone || '';
  const category = p.category || '';
  const campus   = p.campus || '';
  const days     = p.days ? p.days.split(',').map(s => s.trim()).filter(Boolean) : [];
  const roles    = [p.role1, p.role2].filter(Boolean);
  const shortRole = r => r.replace('Research Mentor','Research LM').replace('Learning Mentor','Learning LM').replace('Upperclassmen Mentor','Upperclassmen LM').replace('Senior Mentor','Senior LM').replace('Not comfortable with any other role','No 2nd choice');
  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;cursor:pointer;transition:all .15s;"
         onmouseenter="this.style.background='var(--card-h)'" onmouseleave="this.style.background='var(--card)'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
  <div style="font-weight:700;font-size:13px;color:var(--ink);">${name}</div>
  <div style="display:flex;gap:6px;align-items:center;">
    ${email ? `<a href="https://mail.google.com/mail/?view=cm&to${encodeURIComponent(email)}" target="_blank" class="btn btn-ghost btn-xs" onclick="event.stopPropagation()" title="${email}">✉</a>` : ''}
    <span style="font-size:9px;background:rgba(100,220,200,.12);color:#88ded0;padding:2px 7px;border-radius:50px;letter-spacing:.5px;font-weight:700;text-transform:uppercase;">Prospect</span>
  </div>
</div>
      ${category ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${category}</div>` : ''}
      ${campus ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">📍 ${campus}</div>` : ''}
      ${roles.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
          ${roles.map(r => `<span style="background:rgba(240,201,23,.1);color:var(--gold);padding:1px 6px;border-radius:50px;font-size:9px;font-weight:600;">${shortRole(r)}</span>`).join('')}
        </div>` : ''}
      ${days.length ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">📅 ${days.join(', ')}</div>` : ''}
      ${email ? `<div style="font-size:11px;color:var(--muted);">✉ ${email}</div>` : ''}
      ${phone ? `<div style="font-size:11px;color:var(--muted);">📞 ${phone}</div>` : ''}
    </div>`;
}

function openAddReturner() {
  document.getElementById('edit-returner-modal').dataset.idx = '-1';
  document.getElementById('edit-returner-name').textContent = 'Add Returner';
  document.getElementById('er-fname').value = '';
  document.getElementById('er-lname').value = '';
  document.getElementById('er-email').value = '';
  document.getElementById('er-phone').value = '';
  document.getElementById('er-will-return').value = 'Survey Pending';
  ['downtown','airline','unsure','gmeets'].forEach(c => {
    const el = document.getElementById(`er-campus-${c}`);
    if (el) el.checked = false;
  });
  ['mon','tue','wed','thu','na'].forEach(d => {
    const el = document.getElementById(`er-day-${d}`);
    if (el) el.checked = false;
  });
  openModal('edit-returner-modal');
}

function openEditReturner(idx) {
  const r = DB.returners[idx];
  if (!r) return;
  document.getElementById('edit-returner-modal').dataset.idx = idx;
  document.getElementById('edit-returner-name').textContent = `${r.firstName || ''} ${r.lastName || ''}`.trim() || 'Edit Returner';
  document.getElementById('er-fname').value = r.firstName || '';
  document.getElementById('er-lname').value = r.lastName || '';
  document.getElementById('er-email').value = r.email || '';
  document.getElementById('er-phone').value = r.phone || '';
  document.getElementById('er-will-return').value = r.willReturn || 'Survey Pending';
  ['downtown','airline','unsure','gmeets'].forEach(c => {
    const el = document.getElementById(`er-campus-${c}`);
    if (el) el.checked = (r.campus || '').toLowerCase().includes(c);
  });
  ['mon','tue','wed','thu','na'].forEach(d => {
    const map = {mon:'monday',tue:'tuesday',wed:'wednesday',thu:'thursday',na:'n/a'};
    const el = document.getElementById(`er-day-${d}`);
    if (el) el.checked = (r.days || '').toLowerCase().includes(map[d]);
  });
  openModal('edit-returner-modal');
}

function saveReturnerContact() {
  const idx = parseInt(document.getElementById('edit-returner-modal').dataset.idx);
  const fname = document.getElementById('er-fname').value.trim();
  const lname = document.getElementById('er-lname').value.trim();
  if (!fname) { alert('Please enter a first name.'); return; }
  const campus = [
    document.getElementById('er-campus-downtown')?.checked ? 'Downtown' : null,
    document.getElementById('er-campus-airline')?.checked ? 'Airline' : null,
    document.getElementById('er-campus-unsure')?.checked ? 'Unsure' : null,
    document.getElementById('er-campus-gmeets')?.checked ? 'Google Meets (Tutors)' : null,
  ].filter(Boolean).join(', ');
  const days = [
    document.getElementById('er-day-mon')?.checked ? 'Monday' : null,
    document.getElementById('er-day-tue')?.checked ? 'Tuesday' : null,
    document.getElementById('er-day-wed')?.checked ? 'Wednesday' : null,
    document.getElementById('er-day-thu')?.checked ? 'Thursday' : null,
    document.getElementById('er-day-na')?.checked ? 'N/A — Tutor' : null,
  ].filter(Boolean).join(', ');
  const record = {
    firstName: fname,
    lastName: lname,
    email: document.getElementById('er-email').value.trim(),
    phone: document.getElementById('er-phone').value.trim(),
    willReturn: document.getElementById('er-will-return').value,
    campus,
    days,
    roles: idx >= 0 ? (DB.returners[idx]?.roles || '') : '',
  };
  if (isNaN(idx) || idx === -1) {
    if (!DB.returners) DB.returners = [];
    DB.returners.push(record);
  } else {
    DB.returners[idx] = { ...DB.returners[idx], ...record };
  }
  saveDB();
  closeModal('edit-returner-modal');
  renderReturners();
  renderOnboarding();
}

function deleteReturner() {
  const idx = parseInt(document.getElementById('edit-returner-modal').dataset.idx);
  if (isNaN(idx) || idx === -1) return;
  const r = DB.returners[idx];
  if (!confirm(`Delete ${r.firstName} ${r.lastName}?`)) return;
  DB.returners.splice(idx, 1);
  saveDB();
  closeModal('edit-returner-modal');
  renderReturners();
  renderOnboarding();
}

function emailObColumn(colId) {
  const col = document.getElementById(colId);
  if (!col) return;
  const emails = [...col.querySelectorAll('[data-email]')]
    .map(el => el.dataset.email)
    .filter(e => e && e.includes('@'));
  if (!emails.length) { alert('No email addresses found in this column.'); return; }
  window.open(`https://mail.google.com/mail/?view=cm&to=angela@thebryc.org&bcc=${encodeURIComponent(emails.join(','))}`);
}
      
function obReturnerCard(r, idx) {
  const name   = `${r.firstName || ''} ${r.lastName || ''}`.trim() || '(No Name)';
  const roles  = r.roles ? r.roles.split(',').map(s => s.trim()).filter(Boolean) : [];
  const campus = r.campus || '';
  const days   = r.days ? r.days.split(',').map(s => s.trim()).filter(Boolean).slice(0,3) : [];
  const email  = r.email || '';
  const phone  = r.phone || '';
  const emailBtn = email
    ? `<a href="https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}" target="_blank" class="btn btn-ghost btn-xs" onclick="event.stopPropagation()" title="${email}">✉</a>`
    : `<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openEditReturner(${idx})" title="Add email">✉ Add</button>`;
  return `
    <div data-email="${email}" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;cursor:pointer;transition:all .15s;"
         onmouseenter="this.style.background='var(--card-h)'" onmouseleave="this.style.background='var(--card)'"
         onclick="openEditReturner(${idx})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="font-weight:700;font-size:13px;color:var(--ink);">${name}</div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${emailBtn}
          <span style="font-size:9px;background:rgba(100,149,255,.12);color:#88c4ff;padding:2px 7px;border-radius:50px;letter-spacing:.5px;font-weight:700;text-transform:uppercase;">Returner</span>
        </div>
      </div>
      ${campus ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">📍 ${campus}</div>` : ''}
      ${roles.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
          ${roles.slice(0,3).map(role => `<span style="background:rgba(240,201,23,.1);color:var(--gold);padding:1px 6px;border-radius:50px;font-size:9px;font-weight:600;">${shortRoleName(role)}</span>`).join('')}
        </div>` : ''}
      ${days.length ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">📅 ${days.join(', ')}</div>` : ''}
      ${email ? `<div style="font-size:11px;color:var(--muted);">✉ ${email}</div>` : ''}
      ${phone ? `<div style="font-size:11px;color:var(--muted);">📞 ${phone}</div>` : ''}
    </div>`;
}


// ══════════════════════════════════════════
// HOOK INTO EXISTING goPage() FOR RENDER CALLS
// ══════════════════════════════════════════

// Patch the existing goPage function to trigger renders for new pages
const _origGoPage = window.goPage;
window.goPage = function(page, el) {
  if (typeof _origGoPage === 'function') _origGoPage(page, el);

  if (page === 'returners') {
    loadReturnerSheetConfigUI();
    renderReturners();
  }
  if (page === 'onboarding') {
    renderOnboarding();
  }
  if (page === 'settings') {
    loadReturnerSheetConfigUI();
  }
};

// Also re-render onboarding whenever DB saves (prospects change)
const _origSaveDB = window.saveDB;
window.saveDB = async function() {
  const result = typeof _origSaveDB === 'function' ? await _origSaveDB() : null;
  // Refresh badge counts
  const cnt = (DB.returners || []).length;
  const badge = document.getElementById('sb-returner-cnt');
  if (badge) badge.textContent = cnt;
  return result;
};

// Expose functions globally
window.syncReturnerSheet      = syncReturnerSheet;
window.saveReturnerSheetConfig = saveReturnerSheetConfig;
window.renderReturners        = renderReturners;
window.renderOnboarding       = renderOnboarding;
async function syncOnboarding() {
  const btn = document.getElementById('ob-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing…'; }
  try {
    await handleSheetsSync();      // prospects sheet
    await syncReturnerSheet();     // returner survey sheet
    renderOnboarding();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync All'; }
  }
}
window.syncOnboarding = syncOnboarding;
window.clearReturnerFilters   = clearReturnerFilters;
