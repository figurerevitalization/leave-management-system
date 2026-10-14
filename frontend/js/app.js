/* LeaveDesk SPA – vanilla JS */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const API = (window.API_URL || '').replace(/\/$/, '') + '/api';
  const ROLE_LABEL = {
    employee: 'Employee', level1: 'Approver – Level 1', level2: 'Approver – Level 2',
    level3: 'Approver – Level 3', admin: 'Administrator',
  };
  const LEVEL_TITLE = { 1: 'Level 1', 2: 'Level 2', 3: 'Level 3 (Final)' };
  const TYPES = { casual: 'Casual', sick: 'Sick', earned: 'Earned', unpaid: 'Unpaid' };
  const TYPE_INFO = {
    casual: ['🏖️', 'Personal time off'], sick: ['🤒', 'Health & recovery'],
    earned: ['🎯', 'Planned vacation'], unpaid: ['💼', 'Without pay'],
  };

  const ICONS = {
    home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    plus: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    check: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14l-3-3"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    layers: '<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    x: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };
  const ico = (n) => `<svg viewBox="0 0 24 24" class="ico">${ICONS[n]}</svg>`;
  const NAV_ICON = { dashboard: 'home', apply: 'plus', mine: 'file', approvals: 'check', calendar: 'cal', users: 'users', all: 'layers', profile: 'user' };

  let token = null;
  try { token = localStorage.getItem('ld_token'); } catch {}
  let me = null;
  let pendingCount = 0;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const level = () => (/^level(\d)$/.exec(me?.role) || [])[1] * 1 || 0;
  const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const range = (l) => (l.from === l.to ? fmt(l.from) : `${fmt(l.from)} → ${fmt(l.to)}`);
  const todayStr = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const avatar = (n, cls = '') => `<div class="avatar sm c${(String(n || '').length % 4) + 1} ${cls}">${esc(initials(n))}</div>`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.className = 'toast'), 3400);
  }

  async function api(path, opts = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw new Error('Cannot reach the server. Check your connection or API URL.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token && !path.startsWith('/auth/login')) { logout(); throw new Error(data.error || 'Session expired'); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // Wrap an async action: disable button, toast errors
  async function act(btn, fn) {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
  }

  /* ---------- Modal ---------- */
  // Lock the page behind an open menu or popup so touch-scrolling can't move it
  const syncLock = () => document.body.classList.toggle('lock',
    !$('#modal').classList.contains('hidden') || $('#sidebar').classList.contains('open'));
  function modal(html) {
    $('#modal-card').innerHTML = html;
    $('#modal').classList.remove('hidden');
    $('#modal-card').scrollTop = 0;
    syncLock();
    return $('#modal-card');
  }
  const closeModal = () => { $('#modal').classList.add('hidden'); syncLock(); };
  $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function confirmBox(title, msg, okLabel, danger = true) {
    return new Promise((resolve) => {
      const m = modal(`<h3>${esc(title)}</h3><p class="sub">${msg}</p>
        <div class="modal-actions"><button class="btn" id="c-no">Go back</button><button class="btn ${danger ? 'danger' : 'primary'}" id="c-yes">${esc(okLabel)}</button></div>`);
      const done = (v) => { closeModal(); resolve(v); };
      m.querySelector('#c-no').onclick = () => done(false);
      m.querySelector('#c-yes').onclick = () => done(true);
      m.querySelector('#c-no').focus();
    });
  }

  /* ---------- Auth ---------- */
  function logout() {
    token = null; me = null; pendingCount = 0;
    try { localStorage.removeItem('ld_token'); } catch {}
    closeModal();
    $('#app-view').classList.add('hidden');
    $('#login-view').classList.remove('hidden');
  }
  $('#logout').onclick = logout;

  $('#pw-toggle').onclick = (e) => {
    const i = $('#login-form').password;
    i.type = i.type === 'password' ? 'text' : 'password';
    e.target.textContent = i.type === 'password' ? 'Show' : 'Hide';
  };

  // Quick-fill chips for demo accounts, only when running locally
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    const demo = [['Admin', 'admin@company.com', 'Admin@123'], ['Employee', 'employee@company.com', 'Pass@1234'],
      ['Level 1', 'lead@company.com', 'Pass@1234'], ['Level 2', 'hr@company.com', 'Pass@1234'], ['Level 3', 'director@company.com', 'Pass@1234']];
    $('#demo-box').classList.remove('hidden');
    $('#demo-chips').innerHTML = demo.map(([l, e, p]) => `<button type="button" data-e="${e}" data-p="${p}">${l}</button>`).join('');
    $('#demo-chips').onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const f = $('#login-form');
      f.email.value = b.dataset.e; f.password.value = b.dataset.p;
    };
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button[type=submit]');
    $('#login-error').textContent = '';
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
      token = d.token;
      try { localStorage.setItem('ld_token', token); } catch {}
      f.reset();
      await start();
    } catch (err) { $('#login-error').textContent = err.message; }
    btn.disabled = false; btn.textContent = 'Sign in';
  });

  /* ---------- Navigation ---------- */
  function navItems() {
    const items = [['dashboard', 'Dashboard'], ['apply', 'Apply for Leave'], ['mine', 'My Leaves']];
    if (level()) items.push(['approvals', 'Approvals']);
    items.push(['calendar', 'Team Calendar']);
    if (me.role === 'admin') items.push(['users', 'Manage Users'], ['all', 'All Leaves']);
    items.push(['profile', 'My Profile']);
    return items;
  }

  const TITLES = { dashboard: 'Dashboard', apply: 'Apply for Leave', mine: 'My Leaves', approvals: 'Approvals', calendar: 'Team Calendar', users: 'Manage Users', all: 'All Leave Requests', profile: 'My Profile' };
  const SUBS = {
    dashboard: () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    apply: () => 'Submit a new request for approval',
    mine: () => 'Track every request you have made',
    approvals: () => `Decisions for ${LEVEL_TITLE[level()]}`,
    calendar: () => 'See who is away and when',
    users: () => 'Add, edit or remove people',
    all: () => 'Every request across the organisation',
    profile: () => 'Your account and security',
  };
  const PAGES = {};
  let current = 'dashboard';

  function renderNav() {
    $('#nav').innerHTML = navItems().map(([k, label], i) =>
      `${k === 'users' ? '<div class="nav-sep">Admin</div>' : ''}<a data-p="${k}" class="${k === current ? 'active' : ''}">${ico(NAV_ICON[k])}<span class="lbl">${label}</span>${k === 'approvals' && pendingCount ? `<span class="count">${pendingCount}</span>` : ''}</a>`).join('');
  }
  $('#nav').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) { location.hash = a.dataset.p; closeSidebar(); }
  });
  const closeSidebar = () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); syncLock(); };
  $('#menu-btn').onclick = () => { $('#sidebar').classList.toggle('open'); $('#scrim').classList.toggle('show', $('#sidebar').classList.contains('open')); syncLock(); };
  window.addEventListener('resize', () => { if (innerWidth > 900) closeSidebar(); });
  $('#scrim').onclick = closeSidebar;

  const skeleton = (n = 3) => Array.from({ length: n }, () => '<div class="skel"></div>').join('');

  async function route() {
    if (!me) return;
    const p = (location.hash || '#dashboard').slice(1);
    current = PAGES[p] && navItems().some(([k]) => k === p) ? p : 'dashboard';
    closeSidebar();
    $('#bell-panel').classList.add('hidden');
    $('#page-title').textContent = TITLES[current];
    $('#page-sub').textContent = SUBS[current]();
    renderNav();
    const page = $('#page');
    page.innerHTML = skeleton();
    window.scrollTo(0, 0);
    try { await PAGES[current](page); } catch (e) { page.innerHTML = `<div class="card error">${esc(e.message)}</div>`; }
    refreshPending();
  }
  window.addEventListener('hashchange', route);

  async function refreshPending() {
    if (!level()) return;
    try {
      const d = await api('/leaves/pending');
      if (d.leaves.length !== pendingCount) { pendingCount = d.leaves.length; renderNav(); }
    } catch {}
  }

  /* ---------- Notifications ---------- */
  async function loadNotifs() {
    try {
      const d = await api('/notifications');
      const c = $('#bell-count');
      c.textContent = d.unread;
      c.classList.toggle('hidden', !d.unread);
      $('#bell-panel').innerHTML = '<div class="bp-head">Notifications</div>' + (d.items.length
        ? d.items.map((n) => `<div class="n ${n.read ? '' : 'unread'}"><div>${esc(n.message)}<small>${new Date(n.createdAt).toLocaleString()}</small></div></div>`).join('')
        : '<div class="empty">You are all caught up 🎉</div>');
    } catch {}
  }
  $('#bell').onclick = async (e) => {
    e.stopPropagation();
    const p = $('#bell-panel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) {
      await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
      $('#bell-count').classList.add('hidden');
      setTimeout(loadNotifs, 2500);
    }
  };
  document.addEventListener('click', (e) => { if (!e.target.closest('.bell-wrap')) $('#bell-panel').classList.add('hidden'); });
  setInterval(() => { if (me) { loadNotifs(); refreshPending(); } }, 45000);

  /* ---------- Shared pieces ---------- */
  const pill = (s) => `<span class="pill ${s}">${s}</span>`;
  const empty = (icon, title, text, btn = '') =>
    `<div class="card empty-state"><div class="ei">${ico(icon)}</div><b>${title}</b>${text}${btn}</div>`;
  const stat = (cls, icon, v, l) => `<div class="stat ${cls}"><div class="ic">${ico(icon)}</div><div><div class="v">${v}</div><div class="l">${l}</div></div></div>`;

  function stepper(l) {
    return `<div class="stepper">${l.approvals.map((a) => {
      let cls = a.status;
      if (a.status === 'pending' && l.status === 'pending' && l.currentLevel === a.level) cls = 'current';
      if (a.status === 'pending' && l.status !== 'pending') cls = 'idle';
      const icon = a.status === 'approved' ? '✓' : a.status === 'rejected' ? '✕' : a.level;
      const sub = a.status === 'pending' ? (cls === 'current' ? 'Awaiting decision' : l.status === 'pending' ? 'Waiting' : '—') : `${esc(a.byName)}`;
      return `<div class="step ${cls}"><div class="dot">${icon}</div><b>${LEVEL_TITLE[a.level]}</b>${sub}${a.comment ? `<div class="cm">“${esc(a.comment)}”</div>` : ''}</div>`;
    }).join('')}</div>`;
  }

  function leaveCard(l, opts = {}) {
    const cancellable = l.status === 'pending' || (l.status === 'approved' && l.from > todayStr());
    const deletable = l.status === 'cancelled' || l.status === 'rejected' || (l.status === 'approved' && l.to < todayStr());
    return `<div class="leave-item ${l.status}">
      ${opts.who ? `<div class="leave-person">${avatar(l.user?.name)}<div><span class="who">${esc(l.user?.name || 'Deleted user')}</span><br><span class="muted small">${esc(l.user?.department || '')}</span></div></div>` : ''}
      <div class="leave-head">
        <div><span class="pill type">${TYPE_INFO[l.type][0]} ${TYPES[l.type]}${l.halfDay ? ' · half day' : ''}</span>
          <div class="when">${range(l)} <span>· ${plural(l.days, 'working day')}</span></div></div>
        <div>${pill(l.status)}</div></div>
      <div class="leave-reason">${esc(l.reason)}</div>
      ${stepper(l)}
      ${opts.actions || (opts.cancel !== false && cancellable ? `<div class="leave-foot"><span class="muted small">Applied ${new Date(l.createdAt).toLocaleDateString()}</span><button class="btn sm outline-danger" data-cancel="${l._id}">Cancel request</button></div>` : '')}${!opts.actions && opts.cancel !== false && deletable ? `<div class="leave-foot"><span class="muted small">Applied ${new Date(l.createdAt).toLocaleDateString()}</span><button class="btn sm" data-delete="${l._id}">Delete record</button></div>` : ''}
    </div>`;
  }

  function bindLeaveActions(el) {
    el.querySelectorAll('[data-delete]').forEach((b) => (b.onclick = () => deleteRecords(b, b.dataset.delete)));
    el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox('Cancel this request?', 'The request will be withdrawn and approvers will no longer see it.', 'Yes, cancel it'))) return;
      act(b, async () => { await api(`/leaves/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('Leave request cancelled'); route(); });
    }));
  }

  async function deleteRecords(btn, id) {
    const one = !!id;
    if (!(await confirmBox(one ? 'Delete this record?' : 'Clear all past records?',
      one ? 'It will be removed permanently and will no longer appear in your history or in approval histories.'
        : 'All your cancelled, rejected and finished approved requests will be removed permanently. Pending and upcoming leave is kept.',
      one ? 'Delete' : 'Clear all'))) return;
    act(btn, async () => {
      const d = await api(one ? `/leaves/${id}` : '/leaves/mine/finished', { method: 'DELETE' });
      toast(one ? 'Record deleted' : `${plural(d.deleted, 'record')} cleared`);
      route();
    });
  }

  /* ---------- Pages ---------- */
  PAGES.dashboard = async (el) => {
    const [{ leaves }, stats] = await Promise.all([api('/leaves/mine'), me.role === 'admin' ? api('/admin/stats') : null]);
    const count = (s) => leaves.filter((l) => l.status === s).length;
    const year = String(new Date().getFullYear());
    const daysTaken = leaves.filter((l) => l.status === 'approved' && l.from.startsWith(year)).reduce((a, l) => a + l.days, 0);
    const upcoming = leaves.filter((l) => l.status === 'approved' && l.to >= todayStr()).sort((a, b) => a.from.localeCompare(b.from))[0];
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const action = level() && pendingCount
      ? `<a class="btn light" href="#approvals">${ico('check')} Review ${pendingCount} pending</a>` : `<a class="btn light" href="#apply">${ico('plus')} Apply for leave</a>`;
    let html = `<div class="hero"><div class="t"><h3>${greet}, ${esc(me.name.split(' ')[0])} 👋</h3>
      <p>${level() && pendingCount ? `${plural(pendingCount, 'request')} waiting for your decision.` : upcoming ? `Your next leave starts on ${fmt(upcoming.from)}.` : 'Plan your time off — it only takes a minute.'}</p></div>${action}</div>
      <div class="cards">
        ${stat('', 'clock', count('pending'), 'In approval')}
        ${stat('green', 'check', count('approved'), 'Approved')}
        ${stat('red', 'x', count('rejected'), 'Rejected')}
        ${stat('navy', 'sun', daysTaken, `Days taken in ${year}`)}
      </div>`;
    if (me.role === 'admin') {
      const s = stats;
      const n = (k) => s.byStatus.find((x) => x._id === k)?.n || 0;
      html += `<div class="card"><h3>Organisation overview</h3><div class="cards" style="margin:0">
        ${stat('', 'users', s.users, 'Active users')}${stat('', 'clock', n('pending'), 'In approval')}
        ${stat('green', 'check', n('approved'), 'Approved')}${stat('red', 'x', n('rejected'), 'Rejected')}</div></div>`;
    }
    html += `<div class="card"><h3><span class="grow">Recent requests</span>${leaves.length > 3 ? '<a href="#mine" class="small">View all →</a>' : ''}</h3>${leaves.length
      ? leaves.slice(0, 3).map((l) => leaveCard(l)).join('')
      : `<div class="empty-state"><div class="ei">${ico('inbox')}</div><b>No requests yet</b>Your leave requests will show up here.<br><a class="btn primary" href="#apply">Apply now</a></div>`}</div>`;
    el.innerHTML = html;
    bindLeaveActions(el);
  };

  PAGES.apply = async (el) => {
    el.innerHTML = `<div class="apply-layout"><form id="apply-form" class="card" novalidate>
      <h3>New leave request</h3>
      <label style="margin:0">Leave type</label>
      <div class="type-grid">${Object.entries(TYPES).map(([k, v], i) => `<label class="type-tile"><input type="radio" name="type" value="${k}" ${i === 0 ? 'checked' : ''}><div><span class="em">${TYPE_INFO[k][0]}</span><b>${v}</b><small>${TYPE_INFO[k][1]}</small></div></label>`).join('')}</div>
      <div class="grid2">
        <label>From<input type="date" name="from" min="${todayStr()}" required></label>
        <label>To<input type="date" name="to" min="${todayStr()}" required></label>
      </div>
      <label class="check"><input type="checkbox" name="halfDay"> Half day (single date only)</label>
      <div id="preview" class="days-preview hidden"></div>
      <label>Reason<textarea name="reason" maxlength="500" required placeholder="Briefly explain the reason for your leave"></textarea><span class="hint" id="rc">0 / 500</span></label>
      <div class="error" id="apply-error" role="alert"></div>
      <button class="btn primary lg" type="submit">Submit for approval</button>
    </form>
    <div class="card"><h3>How approval works</h3><ul class="flow-list">
      <li><span class="n">1</span><div><b>Level 1 – Team Lead</b><span class="muted small">Reviews first</span></div></li>
      <li><span class="n">2</span><div><b>Level 2 – HR</b><span class="muted small">Reviews after Level 1</span></div></li>
      <li><span class="n">3</span><div><b>Level 3 – Director</b><span class="muted small">Final decision</span></div></li>
      <li><span class="n">✓</span><div><b>Approved</b><span class="muted small">Only when all three approve. You are notified at every step.</span></div></li></ul>
      <p class="muted small" style="margin-bottom:0">Saturdays and Sundays are not counted as leave days.</p></div></div>`;
    const f = $('#apply-form');
    const preview = $('#preview');
    const update = () => {
      if (f.halfDay.checked && f.from.value) f.to.value = f.from.value;
      f.to.disabled = f.halfDay.checked;
      if (f.from.value) f.to.min = f.from.value;
      if (f.from.value && f.to.value && f.to.value < f.from.value) f.to.value = f.from.value;
      if (!f.from.value || !f.to.value) return preview.classList.add('hidden');
      let n = 0;
      for (let d = new Date(f.from.value + 'T00:00:00'); d <= new Date(f.to.value + 'T00:00:00'); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++;
      if (f.halfDay.checked && n) n = 0.5;
      preview.classList.remove('hidden');
      preview.classList.toggle('warn', n === 0);
      preview.innerHTML = n ? `<span>${fmt(f.from.value)}${f.from.value !== f.to.value ? ' → ' + fmt(f.to.value) : ''}</span><span><big>${n}</big> working day${n === 1 ? '' : 's'}</span>`
        : 'That range only covers a weekend — pick at least one weekday.';
    };
    ['from', 'to', 'halfDay'].forEach((n) => f[n].addEventListener('change', update));
    f.reason.addEventListener('input', () => ($('#rc').textContent = `${f.reason.value.length} / 500`));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('#apply-error');
      err.textContent = '';
      if (!f.from.value || !f.to.value) return (err.textContent = 'Please choose the dates.');
      if (!f.reason.value.trim()) return (err.textContent = 'Please add a reason.');
      act(f.querySelector('button[type=submit]'), async () => {
        try {
          await api('/leaves', { method: 'POST', body: { type: f.type.value, from: f.from.value, to: f.halfDay.checked ? f.from.value : f.to.value, halfDay: f.halfDay.checked, reason: f.reason.value } });
        } catch (er) { err.textContent = er.message; return; }
        toast('Request submitted — Level 1 has been notified');
        location.hash = 'mine';
      });
    });
  };

  // Filter tabs with counts. Calls onChange(key) and returns the HTML.
  const filterTabs = (items, active, counts) => `<div class="tabs">${items.map(([k, l]) =>
    `<div class="tab ${k === active ? 'active' : ''}" data-f="${k}">${l}<span class="c">${counts[k] ?? 0}</span></div>`).join('')}</div>`;

  PAGES.mine = async (el) => {
    const { leaves } = await api('/leaves/mine');
    if (!leaves.length) {
      el.innerHTML = empty('inbox', 'No leave requests yet', 'When you apply, you can follow each approval step here.<br>', '<a class="btn primary" href="#apply">Apply for leave</a>');
      return;
    }
    let filter = 'all';
    const counts = { all: leaves.length };
    leaves.forEach((l) => (counts[l.status] = (counts[l.status] || 0) + 1));
    const tabs = [['all', 'All'], ['pending', 'In approval'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']];
    const draw = () => {
      const list = leaves.filter((l) => filter === 'all' || l.status === filter);
      const finishedCount = leaves.filter((l) => l.status === 'cancelled' || l.status === 'rejected' || (l.status === 'approved' && l.to < todayStr())).length;
      el.innerHTML = (finishedCount ? `<div class="toolbar"><span class="muted small" style="flex:1;min-width:180px">${plural(finishedCount, 'past record')} you can clear to keep your history tidy.</span><button class="btn sm outline-danger" id="clear-all">Clear all past records</button></div>` : '')
        + filterTabs(tabs, filter, counts) + (list.length ? list.map((l) => leaveCard(l)).join('') : empty('inbox', 'Nothing here', 'No requests with this status.'));
      el.querySelectorAll('.tab').forEach((t) => (t.onclick = () => { filter = t.dataset.f; draw(); }));
      $('#clear-all')?.addEventListener('click', (e) => deleteRecords(e.currentTarget));
      bindLeaveActions(el);
    };
    draw();
  };

  PAGES.approvals = async (el) => {
    let tab = 'pending';
    const draw = async () => {
      const box = $('#ap-body');
      box.innerHTML = skeleton(2);
      if (tab === 'pending') {
        const { leaves } = await api('/leaves/pending');
        pendingCount = leaves.length; renderNav();
        $('#t-pending .c').textContent = leaves.length;
        $('#t-pending .c').classList.toggle('alert', leaves.length > 0);
        box.innerHTML = leaves.length ? leaves.map((l) => leaveCard(l, {
          who: true,
          actions: `<div class="leave-foot"><span class="muted small">Applied ${new Date(l.createdAt).toLocaleDateString()}</span><div class="row-actions"><button class="btn danger sm" data-d="reject" data-id="${l._id}">Reject</button><button class="btn primary sm" data-d="approve" data-id="${l._id}">Approve</button></div></div>`,
        })).join('')
          : empty('check', 'All caught up', 'Nothing is waiting for your decision right now.');
        box.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => decide(b.dataset.id, b.dataset.d, draw)));
      } else {
        const { leaves } = await api('/leaves/history');
        box.innerHTML = leaves.length ? leaves.map((l) => leaveCard(l, { who: true, cancel: false })).join('') : empty('file', 'No decisions yet', 'Requests you approve or reject will be listed here.');
      }
    };
    el.innerHTML = `<div class="tabs"><div class="tab active" id="t-pending" data-t="pending">Awaiting me<span class="c ${pendingCount ? 'alert' : ''}">${pendingCount}</span></div><div class="tab" data-t="history">My decisions</div></div><div id="ap-body"></div>`;
    el.querySelectorAll('.tab').forEach((t) => (t.onclick = () => {
      tab = t.dataset.t;
      el.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      draw();
    }));
    draw();
  };

  function decide(id, action, after) {
    const approve = action === 'approve';
    const m = modal(`<h3>${approve ? 'Approve this request?' : 'Reject this request?'}</h3>
      <p class="sub">${approve ? 'It will move on to the next level (or be fully approved if you are the final approver).' : 'The employee will be notified and the request will end here.'}</p>
      <label>${approve ? 'Comment (optional)' : 'Reason for rejection (required)'}<textarea id="d-comment" maxlength="300" placeholder="${approve ? 'Add a note for the employee…' : 'Tell the employee why…'}"></textarea></label>
      <div class="error" id="d-err"></div>
      <div class="modal-actions"><button class="btn" id="d-cancel">Back</button><button class="btn ${approve ? 'primary' : 'danger'}" id="d-ok">${approve ? 'Approve' : 'Reject'}</button></div>`);
    m.querySelector('#d-comment').focus();
    m.querySelector('#d-cancel').onclick = closeModal;
    m.querySelector('#d-ok').onclick = (e) => {
      const comment = m.querySelector('#d-comment').value;
      if (!approve && !comment.trim()) return (m.querySelector('#d-err').textContent = 'Please give a reason for the rejection.');
      act(e.target, async () => {
        await api(`/leaves/${id}/decision`, { method: 'POST', body: { action, comment } });
        closeModal();
        toast(approve ? 'Request approved' : 'Request rejected');
        await after();
        refreshPending();
      });
    };
  }

  PAGES.calendar = async (el) => {
    let m = todayStr().slice(0, 7);
    const shift = (n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const draw = async () => {
      const { leaves } = await api('/leaves/calendar?month=' + m);
      const [y, mo] = m.split('-').map(Number);
      const first = new Date(y, mo - 1, 1), days = new Date(y, mo, 0).getDate();
      let cells = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="h">${d}</div>`).join('');
      for (let i = 0; i < first.getDay(); i++) cells += '<div class="d off"></div>';
      for (let d = 1; d <= days; d++) {
        const ds = `${m}-${String(d).padStart(2, '0')}`;
        const wk = new Date(y, mo - 1, d).getDay() % 6 === 0;
        const chips = leaves.filter((l) => l.from <= ds && l.to >= ds)
          .map((l) => `<div class="chip ${l.status}" title="${esc(l.name)} – ${TYPES[l.type]} (${l.status})">${esc(l.name)}</div>`).join('');
        cells += `<div class="d ${wk ? 'weekend' : ''} ${ds === todayStr() ? 'today' : ''}" data-day="${ds}"><span class="n">${d}</span>${chips}</div>`;
      }
      $('#cal-wrap').innerHTML = `<div class="cal-nav"><button class="btn sm" id="prev" aria-label="Previous month">‹</button><h3>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><button class="btn sm" id="next" aria-label="Next month">›</button><button class="btn sm" id="today">Today</button></div>
        <div class="cal">${cells}</div><div class="legend"><span><i></i>Approved</span><span><i class="p"></i>In approval</span></div><div class="day-detail" id="day-detail"></div>`;
      const showDay = (ds) => {
        const list = leaves.filter((l) => l.from <= ds && l.to >= ds);
        $('#cal-wrap').querySelectorAll('.d.sel').forEach((x) => x.classList.remove('sel'));
        $(`#cal-wrap [data-day="${ds}"]`)?.classList.add('sel');
        $('#day-detail').innerHTML = `<h4>${fmt(ds)}</h4>` + (list.length
          ? list.map((l) => `<div class="day-row">${avatar(l.name)}<div class="grow"><b>${esc(l.name)}</b><br><span class="muted small">${TYPES[l.type]}${l.halfDay ? ' · half day' : ''} · ${range(l)}</span></div>${pill(l.status)}</div>`).join('')
          : '<div class="muted">Nobody is on leave this day.</div>');
      };
      $('#cal-wrap').querySelectorAll('[data-day]').forEach((c) => (c.onclick = () => showDay(c.dataset.day)));
      showDay(m === todayStr().slice(0, 7) ? todayStr() : `${m}-01`);
      $('#prev').onclick = () => { shift(-1); draw(); };
      $('#next').onclick = () => { shift(1); draw(); };
      $('#today').onclick = () => { m = todayStr().slice(0, 7); draw(); };
    };
    el.innerHTML = '<div class="card" id="cal-wrap"></div>';
    draw();
  };

  PAGES.users = async (el) => {
    const { users } = await api('/admin/users');
    let q = '', role = '';
    el.innerHTML = `<div class="toolbar"><input id="u-q" type="search" placeholder="Search name, email or department…"><select id="u-role"><option value="">All roles</option>${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><span class="grow"></span><button class="btn primary" id="add-user">+ Add user</button></div><div id="u-body"></div>`;
    const draw = () => {
      const list = users.filter((u) => (!role || u.role === role) && (`${u.name} ${u.email} ${u.department}`.toLowerCase().includes(q)));
      $('#u-body').innerHTML = list.length ? `<div class="card table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Department</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((u) => `<tr><td><div class="cell-user">${avatar(u.name)}<div><b>${esc(u.name)}</b>${u._id === me._id ? ' <span class="muted small">(you)</span>' : ''}<br><span class="muted small">${esc(u.email)}</span></div></div></td>
        <td><span class="pill role ${u.role}">${ROLE_LABEL[u.role]}</span></td><td>${esc(u.department)}<br><span class="muted small">${esc(u.designation)}</span></td>
        <td>${u.active ? '<span class="pill approved">active</span>' : '<span class="pill cancelled">inactive</span>'}</td>
        <td><div class="row-actions"><button class="btn sm" data-edit="${u._id}">Edit</button>${u._id === me._id ? '' : `<button class="btn sm outline-danger" data-del="${u._id}">Delete</button>`}</div></td></tr>`).join('')}</tbody></table></div>`
        : empty('users', 'No users found', 'Try a different search.');
      $('#u-body').querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
        const u = users.find((x) => x._id === b.dataset.del);
        if (!(await confirmBox(`Delete ${u.name}?`, `This permanently deletes the account <b>and all their leave requests</b>. It cannot be undone.<br><br>To keep their history, choose <b>Edit</b> and untick “Account active” instead.`, 'Delete permanently'))) return;
        act(b, async () => { await api(`/admin/users/${u._id}`, { method: 'DELETE' }); toast('User deleted'); route(); });
      }));
      $('#u-body').querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => userForm(users.find((u) => u._id === b.dataset.edit))));
    };
    $('#u-q').oninput = (e) => { q = e.target.value.toLowerCase().trim(); draw(); };
    $('#u-role').onchange = (e) => { role = e.target.value; draw(); };
    $('#add-user').onclick = () => userForm();
    draw();
  };

  function userForm(u) {
    const edit = !!u;
    const m = modal(`<h3>${edit ? 'Edit user' : 'Add a new user'}</h3><p class="sub">${edit ? esc(u.email) : 'They will be asked to change the temporary password on first login.'}</p><form id="uf">
      <label>Full name<input name="name" required value="${esc(u?.name)}"></label>
      ${edit ? '' : '<label>Email<input type="email" name="email" required></label>'}
      <div class="grid2"><label>Role<select name="role">${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${u?.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Department<input name="department" value="${esc(u?.department || '')}"></label></div>
      <label>Designation<input name="designation" value="${esc(u?.designation || '')}"></label>
      <label>${edit ? 'Reset password' : 'Temporary password'}<input type="text" name="password" ${edit ? '' : 'required'} minlength="8" autocomplete="off" placeholder="${edit ? 'Leave blank to keep the current one' : 'At least 8 characters'}"></label>
      ${edit ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Account active (can log in)</label>` : ''}
      <div class="error" id="uf-err"></div>
      <div class="modal-actions"><button type="button" class="btn" id="uf-cancel">Cancel</button><button class="btn primary">${edit ? 'Save changes' : 'Create user'}</button></div></form>`);
    m.querySelector('[name=name]').focus();
    m.querySelector('#uf-cancel').onclick = closeModal;
    m.querySelector('#uf').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const body = { name: f.name.value, role: f.role.value, department: f.department.value, designation: f.designation.value };
      if (f.password.value) body.password = f.password.value;
      if (edit) body.active = f.active.checked;
      else body.email = f.email.value;
      act(f.querySelector('.primary'), async () => {
        try { await api(edit ? `/admin/users/${u._id}` : '/admin/users', { method: edit ? 'PUT' : 'POST', body }); }
        catch (err) { $('#uf-err').textContent = err.message; return; }
        closeModal(); toast(edit ? 'Changes saved' : 'User created'); route();
      });
    };
  }

  PAGES.all = async (el) => {
    const { leaves } = await api('/admin/leaves');
    let status = 'all', q = '';
    const counts = { all: leaves.length };
    leaves.forEach((l) => (counts[l.status] = (counts[l.status] || 0) + 1));
    const tabs = [['all', 'All'], ['pending', 'In approval'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']];
    el.innerHTML = '<div class="toolbar"><input id="a-q" type="search" placeholder="Search by employee name…"></div><div id="a-tabs"></div><div id="a-body"></div>';
    const draw = () => {
      $('#a-tabs').innerHTML = filterTabs(tabs, status, counts);
      $('#a-tabs').querySelectorAll('.tab').forEach((t) => (t.onclick = () => { status = t.dataset.f; draw(); }));
      const list = leaves.filter((l) => (status === 'all' || l.status === status) && (l.user?.name || '').toLowerCase().includes(q));
      $('#a-body').innerHTML = list.length ? list.map((l) => leaveCard(l, { who: true, cancel: false })).join('') : empty('inbox', 'No requests found', 'Try another filter or search.');
    };
    $('#a-q').oninput = (e) => { q = e.target.value.toLowerCase().trim(); draw(); };
    draw();
  };

  PAGES.profile = async (el) => {
    const { user } = await api('/auth/me');
    me = user;
    el.innerHTML = `${me.mustChangePassword ? '<div class="card" style="border-color:var(--red);background:#fff5f5"><b style="color:var(--red)">Please set a new password.</b> Your administrator gave you a temporary one.</div>' : ''}
    <div class="card"><div class="cell-user"><div class="avatar c1" style="width:60px;height:60px;font-size:20px">${esc(initials(me.name))}</div>
      <div><h3 style="margin:0">${esc(me.name)}</h3><div class="muted">${esc(me.email)}</div><div style="margin-top:6px"><span class="pill role ${me.role}">${ROLE_LABEL[me.role]}</span> <span class="muted small">${esc(me.department)}${me.designation ? ' · ' + esc(me.designation) : ''}</span></div></div></div></div>
    <form id="pw" class="card" style="max-width:480px"><h3>Change password</h3>
      <label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
      <label>New password<input type="password" name="next" required minlength="8" autocomplete="new-password"><span class="hint">At least 8 characters</span></label>
      <div class="error" id="pw-err"></div><button class="btn primary">Update password</button></form>`;
    $('#pw').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      act(f.querySelector('button'), async () => {
        try { await api('/auth/change-password', { method: 'POST', body: { current: f.current.value, next: f.next.value } }); }
        catch (err) { $('#pw-err').textContent = err.message; return; }
        f.reset(); $('#pw-err').textContent = ''; toast('Password updated'); route();
      });
    };
  };

  /* ---------- Boot ---------- */
  async function start() {
    try {
      me = (await api('/auth/me')).user;
    } catch {
      $('#login-view').classList.remove('hidden');
      return;
    }
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    $('#me-name').textContent = me.name;
    $('#me-role').textContent = ROLE_LABEL[me.role];
    $('#me-avatar').textContent = initials(me.name);
    pendingCount = 0;
    if (me.mustChangePassword) history.replaceState(null, '', '#profile');
    else if (!location.hash) history.replaceState(null, '', '#dashboard');
    loadNotifs();
    route();
  }

  if (token) start(); else $('#login-view').classList.remove('hidden');
})();
