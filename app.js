/**
 * MindVault — app.js
 * Full application logic: Auth, Routine, Ideas, Goals, Voice, Search, UI, Data
 */

'use strict';
/* ═══════════════════════════════════════════════════════
   adding databsase 
═══════════════════════════════════════════════════════ */
import { supabase } from './supabase-client.js' 

/* ═══════════════════════════════════════════════════════
   CONSTANTS & CONFIG
═══════════════════════════════════════════════════════ */
const DB_KEY      = 'mindvault_v2';
const SESSION_KEY = 'mindvault_session';
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS        = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* ═══════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════ */
const Utils = {
  id: () => `${Date.now()}_${Math.random().toString(36).substr(2,6)}`,

  esc: (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>'),

  fmtDate: (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return `Today · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diff === 1) return `Yesterday · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diff < 7) return `${diff} days ago`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  },

  fmtDur: (s) => {
    s = Math.round(s || 0);
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  },

  isToday: (iso) => new Date(iso).toDateString() === new Date().toDateString(),

  isThisWeek: (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return d >= weekStart;
  },

  isRecent: (iso, days = 7) => {
    const diff = (Date.now() - new Date(iso)) / 86400000;
    return diff <= days;
  },

  deadlineStatus: (dl) => {
    if (!dl) return null;
    const diff = Math.ceil((new Date(dl) - new Date()) / 86400000);
    if (diff < 0) return { cls: 'dl-overdue', label: `Overdue by ${Math.abs(diff)}d`, icon: '⚠' };
    if (diff === 0) return { cls: 'dl-soon', label: 'Due today!', icon: '🔥' };
    if (diff <= 7) return { cls: 'dl-soon', label: `${diff}d left`, icon: '⏰' };
    return { cls: 'dl-ok', label: new Date(dl).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), icon: '🗓' };
  },

  deadlineHTML: (dl) => {
    const s = Utils.deadlineStatus(dl);
    if (!s) return '';
    return `<span class="deadline-badge ${s.cls}">${s.icon} ${s.label}</span>`;
  },

  greeting: (name) => {
    const h = new Date().getHours();
    const time = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return `${time}, ${name} ✦`;
  },

  todayLabel: () => {
    const d = new Date();
    return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  },

  categoryTagClass: (cat) => {
    const map = {
      'Morning':'tag-morning','Work':'tag-work','Evening':'tag-evening',
      'Health':'tag-health','Learning':'tag-learning','Personal':'tag-personal',
      'Other':'tag-other','Career':'tag-career','Finance':'tag-finance',
    };
    return map[cat] || 'tag-other';
  },

  statusTagClass: (s) => {
    const map = { 'Not Started':'tag-goal-ns','In Progress':'tag-goal-ip','Completed':'tag-goal-done','Paused':'tag-goal-pause' };
    return map[s] || 'tag-goal-ns';
  },

  statusSelectClass: (s) => {
    const map = { 'Not Started':'status-ns','In Progress':'status-ip','Completed':'status-done','Paused':'status-pause' };
    return map[s] || 'status-ns';
  },

  ideaStatusClass: (s) => {
    const map = { 'Draft':'tag-draft','Exploring':'tag-exploring','Planned':'tag-planned','Archived':'tag-archived' };
    return map[s] || 'tag-draft';
  },

  priorityTagClass: (p) => {
    const map = { 'high':'tag-high', 'normal':'tag-normal', 'low':'tag-low' };
    return map[p] || 'tag-normal';
  },

  voiceEntriesHTML: (voices, compact = false) => {
    if (!voices || !voices.length) return '';
    if (compact) return `<span class="idea-voice-indicator">🎙 ${voices.length} voice note${voices.length > 1 ? 's' : ''}</span>`;
    return `<div class="entry-voice-list">${voices.map(v => `
      <div class="entry-voice-item">
        <audio controls src="${v.url}"></audio>
        <span class="voice-dur">${Utils.fmtDur(v.dur)}</span>
      </div>`).join('')}</div>`;
  },

  el: (id) => document.getElementById(id),
  val: (id) => (Utils.el(id) || {}).value || '',
  setVal: (id, v) => { const e = Utils.el(id); if (e) e.value = v; },
};

/* ═══════════════════════════════════════════════════════
   DATABASE
═══════════════════════════════════════════════════════ */
const DB = {
  load: () => {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || { users: {}, data: {} }; }
    catch { return { users: {}, data: {} }; }
  },

  save: (db) => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); return true; }
    catch (e) { console.error('Save failed:', e); return false; }
  },

  getUser: (username) => {
    const db = DB.load();
    if (!db.data[username]) db.data[username] = { routines: [], ideas: [], goals: [] };
    return db.data[username];
  },

  saveUser: (username, data) => {
    const db = DB.load();
    db.data[username] = data;
    return DB.save(db);
  },
};

/* ═══════════════════════════════════════════════════════
   AUTH MODULE
═══════════════════════════════════════════════════════ */
const Auth = {
  currentUser: null,
  currentName: null,

  init: () => {
    Auth.renderExistingUsers();
    // keyboard shortcuts
    ['login-user','login-pass','reg-name','reg-user','reg-pass'].forEach(id => {
      const el = Utils.el(id);
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') Auth._handleEnter(id); });
    });
    // auto login
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const db = DB.load();
      if (db.users[saved]) {
        Auth._startSession(saved, db.users[saved].name);
        return;
      }
    }
    Utils.el('splash').classList.add('fade-out');
    setTimeout(() => {
      Utils.el('splash').style.display = 'none';
      Utils.el('auth-screen').classList.remove('hidden');
    }, 500);
  },

  _handleEnter: (fieldId) => {
    if (fieldId === 'login-pass') Auth.login();
    else if (fieldId === 'reg-pass') Auth.register();
  },

  switchTab: (tab) => {
    const isLogin = tab === 'login';
    Utils.el('login-panel').classList.toggle('active', isLogin);
    Utils.el('reg-panel').classList.toggle('active', !isLogin);
    Utils.el('tab-login-btn').classList.toggle('active', isLogin);
    Utils.el('tab-reg-btn').classList.toggle('active', !isLogin);
    setTimeout(() => Utils.el(isLogin ? 'login-user' : 'reg-name').focus(), 50);
  },

  togglePass: (fieldId, btn) => {
    const field = Utils.el(fieldId);
    if (!field) return;
    const isText = field.type === 'text';
    field.type = isText ? 'password' : 'text';
    btn.style.opacity = isText ? '0.5' : '1';
  },

  login: () => {
    const username = Utils.val('login-user').trim().toLowerCase();
    const pass = Utils.val('login-pass');
    const msg = Utils.el('login-msg');
    const btn = Utils.el('login-btn');

    if (!username || !pass) { Auth._showMsg(msg, 'Please enter your username and password.'); return; }

    const db = DB.load();
    if (!db.users[username]) { Auth._showMsg(msg, 'Account not found. Please register first.'); return; }
    if (db.users[username].password !== btoa(pass)) { Auth._showMsg(msg, 'Incorrect password. Please try again.'); return; }

    btn.classList.add('loading');
    setTimeout(() => {
      btn.classList.remove('loading');
      Auth._startSession(username, db.users[username].name);
    }, 400);
  },

  register: () => {
    const name = Utils.val('reg-name').trim();
    const username = Utils.val('reg-user').trim().toLowerCase();
    const pass = Utils.val('reg-pass');
    const msg = Utils.el('reg-msg');
    const btn = Utils.el('reg-btn');

    if (!name || !username || !pass) { Auth._showMsg(msg, 'All fields are required.'); return; }
    if (username.length < 3) { Auth._showMsg(msg, 'Username must be at least 3 characters.'); return; }
    if (!/^[a-z0-9_]+$/.test(username)) { Auth._showMsg(msg, 'Username: only letters, numbers, underscore.'); return; }
    if (pass.length < 4) { Auth._showMsg(msg, 'Password must be at least 4 characters.'); return; }

    const db = DB.load();
    if (db.users[username]) { Auth._showMsg(msg, 'That username is already taken.'); return; }

    db.users[username] = { name, password: btoa(pass), created: new Date().toISOString() };
    DB.save(db);

    btn.classList.add('loading');
    setTimeout(() => {
      btn.classList.remove('loading');
      Auth._startSession(username, name);
      UI.showToast(`Account created! Welcome, ${name} 🎉`, 'success');
    }, 400);
  },

  logout: () => {
    Voice.stopAll();
    Auth.currentUser = null;
    Auth.currentName = null;
    sessionStorage.removeItem(SESSION_KEY);
    Utils.el('app').classList.add('hidden');
    Utils.el('auth-screen').classList.remove('hidden');
    Utils.el('login-pass').value = '';
    Utils.el('login-msg').textContent = '';
    Auth.renderExistingUsers();
    UI.showToast('Signed out successfully');
  },

  _startSession: (username, name) => {
    Auth.currentUser = username;
    Auth.currentName = name;
    sessionStorage.setItem(SESSION_KEY, username);

    // Splash → App
    Utils.el('splash').classList.add('fade-out');
    Utils.el('auth-screen').classList.add('hidden');
    setTimeout(() => {
      Utils.el('splash').style.display = 'none';
      Utils.el('app').classList.remove('hidden');
      UI.init(name, username);
      App.renderAll();
    }, 300);
  },

  _showMsg: (el, msg, type = 'error') => {
    el.textContent = msg;
    el.className = `auth-msg ${type}`;
    setTimeout(() => { el.textContent = ''; }, 3500);
  },

  renderExistingUsers: () => {
    const db = DB.load();
    const users = Object.keys(db.users);
    const section = Utils.el('quick-access');
    const list = Utils.el('quick-users');
    if (users.length === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    list.innerHTML = users.map(u => {
      const initials = (db.users[u].name || u).charAt(0).toUpperCase();
      return `<span class="user-chip" onclick="App.Auth.quickLogin('${u}')">
        <span class="user-chip-avatar">${initials}</span>
        ${Utils.esc(db.users[u].name || u)}
      </span>`;
    }).join('');
  },

  quickLogin: (username) => {
    Utils.setVal('login-user', username);
    Auth.switchTab('login');
    setTimeout(() => Utils.el('login-pass').focus(), 60);
  },
};

/* ═══════════════════════════════════════════════════════
   VOICE RECORDER MODULE
═══════════════════════════════════════════════════════ */
const Voice = {
  // section -> recorder state
  active: {},   // section -> MediaRecorder
  timers: {},   // section -> interval id
  elapsed: {},  // section -> seconds
  pending: {    // section -> [{url, dur, blob}]
    r: [], i: [], g: []
  },

  toggle: async (section) => {
    if (Voice.active[section]) {
      Voice.stop(section);
    } else {
      await Voice.start(section);
    }
  },

  start: async (section) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const chunks = [];
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType });
        const url = URL.createObjectURL(blob);
        Voice.pending[section].push({ url, dur: Voice.elapsed[section] || 0, blob });
        Voice._renderPending(section);
        stream.getTracks().forEach(t => t.stop());
      };

      mr.start(250);
      Voice.active[section] = mr;
      Voice._startTimer(section);
      Voice._setUI(section, true);
    } catch (e) {
      UI.showToast('Microphone access denied — please allow mic permissions', 'error');
    }
  },

  stop: (section) => {
    if (Voice.active[section]) {
      Voice.active[section].stop();
      delete Voice.active[section];
    }
    Voice._stopTimer(section);
    Voice._setUI(section, false);
  },

  stopAll: () => Object.keys(Voice.active).forEach(s => Voice.stop(s)),

  removePending: (section, idx) => {
    if (Voice.pending[section][idx]) {
      URL.revokeObjectURL(Voice.pending[section][idx].url);
      Voice.pending[section].splice(idx, 1);
    }
    Voice._renderPending(section);
  },

  clearPending: (section) => {
    Voice.pending[section].forEach(v => URL.revokeObjectURL(v.url));
    Voice.pending[section] = [];
    Voice._renderPending(section);
  },

  getPending: (section) => Voice.pending[section].map(v => ({ url: v.url, dur: v.dur })),

  _startTimer: (section) => {
    Voice.elapsed[section] = 0;
    Voice.timers[section] = setInterval(() => {
      Voice.elapsed[section]++;
      const el = Utils.el(`rec-timer-${section}`);
      if (el) el.textContent = Utils.fmtDur(Voice.elapsed[section]);
    }, 1000);
  },

  _stopTimer: (section) => {
    clearInterval(Voice.timers[section]);
    const el = Utils.el(`rec-timer-${section}`);
    if (el) el.textContent = '0:00';
  },

  _setUI: (section, recording) => {
    const btn = Utils.el(`rec-btn-${section}`);
    const dot = Utils.el(`rec-dot-${section}`);
    const lbl = Utils.el(`rec-lbl-${section}`);
    if (!btn) return;
    btn.classList.toggle('recording', recording);
    if (dot) dot.classList.toggle('active', recording);
    if (lbl) lbl.textContent = recording ? 'Stop Recording' : 'Start Recording';
  },

  _renderPending: (section) => {
    const container = Utils.el(`pv-${section}`);
    if (!container) return;
    container.innerHTML = Voice.pending[section].map((v, i) => `
      <div class="voice-entry-item">
        <audio controls src="${v.url}" preload="metadata"></audio>
        <span class="voice-dur">${Utils.fmtDur(v.dur)}</span>
        <button class="voice-del" onclick="App.Voice.removePending('${section}',${i})" title="Remove">✕</button>
      </div>`).join('');
  },
};

/* ═══════════════════════════════════════════════════════
   ROUTINE MODULE
═══════════════════════════════════════════════════════ */
const Routine = {
  add: () => {
    const text = Utils.val('r-text').trim();
    const voices = Voice.getPending('r');
    if (!text && !voices.length) {
      UI.showToast('Please enter a task or record a voice note');
      return;
    }
    const d = DB.getUser(Auth.currentUser);
    d.routines.unshift({
      id: Utils.id(),
      text: text || '🎙 Voice note',
      category: Utils.val('r-cat'),
      time: Utils.val('r-time'),
      priority: Utils.val('r-priority'),
      date: new Date().toISOString(),
      done: false,
      voices,
    });
    DB.saveUser(Auth.currentUser, d);
    Utils.setVal('r-text', ''); Utils.setVal('r-time', '');
    Voice.clearPending('r');
    Routine.render();
    UI.updateBadges();
    UI.showToast('Routine entry added ✓', 'success');
  },

  toggle: (id) => {
    const d = DB.getUser(Auth.currentUser);
    const r = d.routines.find(x => x.id === id);
    if (r) r.done = !r.done;
    DB.saveUser(Auth.currentUser, d);
    Routine.render();
    UI.updateBadges();
  },

  delete: (id) => {
    const d = DB.getUser(Auth.currentUser);
    d.routines = d.routines.filter(x => x.id !== id);
    DB.saveUser(Auth.currentUser, d);
    Routine.render();
    UI.updateBadges();
    UI.showToast('Entry removed');
  },

  openEdit: (id) => {
    const d = DB.getUser(Auth.currentUser);
    const r = d.routines.find(x => x.id === id);
    if (!r) return;
    const cats = ['Morning','Work','Evening','Health','Learning','Personal','Other'];
    const pris = ['normal','high','low'];
    Utils.el('modal-title').textContent = 'Edit Routine Entry';
    Utils.el('modal-body').innerHTML = `
      <div class="form-col" style="margin-bottom:14px">
        <label class="form-label">Task / Activity</label>
        <input class="form-input" id="edit-r-text" value="${Utils.esc(r.text)}"/>
      </div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Category</label>
          <select class="form-select" id="edit-r-cat">
            ${cats.map(c => `<option ${r.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Priority</label>
          <select class="form-select" id="edit-r-priority">
            ${pris.map(p => `<option value="${p}" ${r.priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Time</label>
          <input class="form-input" id="edit-r-time" type="time" value="${r.time||''}"/>
        </div>
      </div>`;
    UI._modalSaveFn = () => {
      r.text = Utils.val('edit-r-text').trim() || r.text;
      r.category = Utils.val('edit-r-cat');
      r.priority = Utils.val('edit-r-priority');
      r.time = Utils.val('edit-r-time');
      DB.saveUser(Auth.currentUser, d);
      Routine.render();
      UI.showToast('Entry updated ✓', 'success');
      UI.closeModal();
    };
    UI.openModal();
  },

  render: () => {
    const d = DB.getUser(Auth.currentUser);
    const filter = Utils.val('routine-filter') || 'today';
    let items = d.routines;
    if (filter === 'today') items = items.filter(r => Utils.isToday(r.date));
    else if (filter === 'week') items = items.filter(r => Utils.isThisWeek(r.date));

    // Progress
    const todayItems = d.routines.filter(r => Utils.isToday(r.date));
    const done = todayItems.filter(r => r.done).length;
    const pct = todayItems.length > 0 ? Math.round(done / todayItems.length * 100) : 0;
    Utils.el('routine-pct').textContent = `${pct}%`;
    Utils.el('routine-bar').style.width = `${pct}%`;
    Utils.el('routine-date-label').textContent = Utils.todayLabel();
    Utils.el('routine-stats').innerHTML = `
      <span class="progress-stat"><strong>${done}</strong> done</span>
      <span class="progress-stat"><strong>${todayItems.length - done}</strong> remaining</span>
      <span class="progress-stat"><strong>${d.routines.length}</strong> total entries</span>`;

    const container = Utils.el('routine-list');
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <span class="empty-icon">📋</span>
        <div class="empty-title">No entries yet</div>
        <div class="empty-sub">Add your first routine entry above</div>
      </div>`;
      return;
    }

    // Group by day
    const groups = {};
    items.forEach(r => {
      const key = new Date(r.date).toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    let html = '';
    Object.entries(groups).forEach(([dateKey, group]) => {
      const isToday = dateKey === new Date().toDateString();
      const doneCount = group.filter(r => r.done).length;
      const label = isToday ? `Today — ${doneCount}/${group.length} done` : dateKey;
      html += `<div class="section-divider">${label}</div>`;
      html += group.map(r => Routine._cardHTML(r)).join('');
    });
    container.innerHTML = html;
  },

  _cardHTML: (r) => {
    const catCls = Utils.categoryTagClass(r.category);
    const priCls = Utils.priorityTagClass(r.priority || 'normal');
    const voices = r.voices || [];
    const hasDetails = voices.length > 0;
    return `
    <div class="entry-card ${r.done ? 'done-card' : ''} ${r.priority === 'high' ? 'priority-high' : r.priority === 'low' ? 'priority-low' : ''}" id="entry-${r.id}">
      <div class="entry-row">
        <input type="checkbox" class="entry-check" ${r.done ? 'checked' : ''} onchange="App.Routine.toggle('${r.id}')"/>
        <div class="entry-body">
          <div class="entry-title ${r.done ? 'strikethrough' : ''}">${Utils.esc(r.text)}</div>
          <div class="entry-meta">
            <span class="tag ${catCls}">${r.category}</span>
            ${r.priority && r.priority !== 'normal' ? `<span class="tag ${priCls}">${r.priority}</span>` : ''}
            ${r.time ? `<span class="entry-date">⏰ ${r.time}</span>` : ''}
            <span class="entry-date">${Utils.fmtDate(r.date)}</span>
          </div>
          ${hasDetails ? `
            <button class="entry-expand" onclick="UI_toggleExpand('${r.id}')">▼ voice note</button>
            <div class="entry-expanded-body" id="exp-${r.id}">${Utils.voiceEntriesHTML(voices)}</div>
          ` : ''}
        </div>
        <div class="entry-actions">
          <button class="btn-icon" onclick="App.Routine.openEdit('${r.id}')" title="Edit">✏️</button>
          <button class="btn-icon danger" onclick="App.Routine.delete('${r.id}')" title="Delete">🗑️</button>
        </div>
      </div>
    </div>`;
  },
};

/* ═══════════════════════════════════════════════════════
   IDEAS MODULE
═══════════════════════════════════════════════════════ */
const Ideas = {
  add: () => {
    const title = Utils.val('i-title').trim();
    const voices = Voice.getPending('i');
    if (!title && !voices.length) {
      UI.showToast('Please enter an idea title or record a voice note');
      return;
    }
    const d = DB.getUser(Auth.currentUser);
    d.ideas.unshift({
      id: Utils.id(),
      title: title || '🎙 Voice idea',
      body: Utils.val('i-body').trim(),
      tag: Utils.val('i-tag').trim() || 'General',
      status: Utils.val('i-status'),
      date: new Date().toISOString(),
      voices,
    });
    DB.saveUser(Auth.currentUser, d);
    Utils.setVal('i-title', ''); Utils.setVal('i-body', ''); Utils.setVal('i-tag', '');
    Voice.clearPending('i');
    Ideas.render();
    Ideas._updateTagsDatalist();
    UI.updateBadges();
    UI.showToast('Idea saved! 💡', 'success');
  },

  delete: (id) => {
    const d = DB.getUser(Auth.currentUser);
    d.ideas = d.ideas.filter(x => x.id !== id);
    DB.saveUser(Auth.currentUser, d);
    Ideas.render();
    UI.updateBadges();
    UI.showToast('Idea removed');
  },

  openEdit: (id) => {
    const d = DB.getUser(Auth.currentUser);
    const idea = d.ideas.find(x => x.id === id);
    if (!idea) return;
    const statuses = ['Draft','Exploring','Planned','Archived'];
    Utils.el('modal-title').textContent = 'Edit Idea';
    Utils.el('modal-body').innerHTML = `
      <div class="form-col" style="margin-bottom:14px">
        <label class="form-label">Idea Title</label>
        <input class="form-input" id="edit-i-title" value="${Utils.esc(idea.title)}"/>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div class="form-col">
          <label class="form-label">Tag</label>
          <input class="form-input" id="edit-i-tag" value="${Utils.esc(idea.tag)}"/>
        </div>
        <div class="form-col">
          <label class="form-label">Status</label>
          <select class="form-select" id="edit-i-status">
            ${statuses.map(s => `<option ${idea.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-col">
        <label class="form-label">Details / Notes</label>
        <textarea class="form-textarea" id="edit-i-body" style="min-height:100px">${Utils.esc(idea.body)}</textarea>
      </div>`;
    UI._modalSaveFn = () => {
      idea.title = Utils.val('edit-i-title').trim() || idea.title;
      idea.tag = Utils.val('edit-i-tag').trim() || 'General';
      idea.status = Utils.val('edit-i-status');
      idea.body = Utils.val('edit-i-body').trim();
      DB.saveUser(Auth.currentUser, d);
      Ideas.render();
      UI.showToast('Idea updated ✓', 'success');
      UI.closeModal();
    };
    UI.openModal();
  },

  render: () => {
    const d = DB.getUser(Auth.currentUser);
    const filter = Utils.val('ideas-filter') || 'all';
    let items = d.ideas;
    if (filter === 'recent') items = items.filter(i => Utils.isRecent(i.date, 7));

    const container = Utils.el('ideas-list');
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <span class="empty-icon">💡</span>
        <div class="empty-title">No ideas yet</div>
        <div class="empty-sub">Every big thing starts as a draft</div>
      </div>`;
      return;
    }
    container.innerHTML = items.map(idea => Ideas._cardHTML(idea)).join('');
  },

  _cardHTML: (idea) => {
    const statusCls = Utils.ideaStatusClass(idea.status || 'Draft');
    const hasVoice = (idea.voices || []).length > 0;
    const hasBody = idea.body && idea.body.length > 0;
    const preview = idea.body ? idea.body.substring(0, 120) + (idea.body.length > 120 ? '...' : '') : '';
    return `
    <div class="idea-card" id="idea-${idea.id}">
      <div class="idea-card-top">
        <div class="idea-card-title">${Utils.esc(idea.title)}</div>
        <div class="idea-card-actions">
          <button class="btn-icon" onclick="App.Ideas.openEdit('${idea.id}')" title="Edit">✏️</button>
          <button class="btn-icon danger" onclick="App.Ideas.delete('${idea.id}')" title="Delete">🗑️</button>
        </div>
      </div>
      ${preview ? `<div class="idea-card-body" id="idea-body-${idea.id}">${Utils.esc(idea.body)}</div>` : ''}
      ${(hasBody || hasVoice) ? `
        <div class="idea-card-voice" id="idea-voices-${idea.id}" style="display:none">
          ${Utils.voiceEntriesHTML(idea.voices)}
        </div>
        <button class="entry-expand" style="margin-bottom:8px" onclick="Ideas_toggleExpand('${idea.id}')">▼ expand</button>
      ` : ''}
      <div class="idea-card-footer">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span class="tag tag-idea">${Utils.esc(idea.tag)}</span>
          <span class="tag ${statusCls}">${idea.status || 'Draft'}</span>
          ${hasVoice ? `<span class="idea-voice-indicator">🎙 ${idea.voices.length}</span>` : ''}
        </div>
        <span class="entry-date">${Utils.fmtDate(idea.date)}</span>
      </div>
    </div>`;
  },

  _updateTagsDatalist: () => {
    const d = DB.getUser(Auth.currentUser);
    const tags = [...new Set(d.ideas.map(i => i.tag).filter(Boolean))];
    const dl = Utils.el('tags-datalist');
    if (dl) dl.innerHTML = tags.map(t => `<option value="${Utils.esc(t)}">`).join('');
  },
};

// Global expand for idea cards (called from inline onclick)
window.Ideas_toggleExpand = (id) => {
  const body = Utils.el(`idea-body-${id}`);
  const voices = Utils.el(`idea-voices-${id}`);
  const card = Utils.el(`idea-${id}`);
  const btn = card ? card.querySelector('.entry-expand') : null;
  const isExpanded = body && !body.classList.contains('expanded');
  if (body) body.classList.toggle('expanded', isExpanded);
  if (voices) voices.style.display = isExpanded ? 'block' : 'none';
  if (btn) btn.textContent = isExpanded ? '▲ collapse' : '▼ expand';
};

/* ═══════════════════════════════════════════════════════
   GOALS MODULE
═══════════════════════════════════════════════════════ */
const Goals = {
  add: () => {
    const title = Utils.val('g-title').trim();
    const voices = Voice.getPending('g');
    if (!title && !voices.length) {
      UI.showToast('Please enter a goal title or record a voice note');
      return;
    }
    const d = DB.getUser(Auth.currentUser);
    d.goals.unshift({
      id: Utils.id(),
      title: title || '🎙 Voice goal',
      desc: Utils.val('g-desc').trim(),
      deadline: Utils.val('g-deadline'),
      category: Utils.val('g-cat'),
      status: Utils.val('g-status'),
      date: new Date().toISOString(),
      voices,
    });
    DB.saveUser(Auth.currentUser, d);
    Utils.setVal('g-title', ''); Utils.setVal('g-desc', '');
    Utils.setVal('g-deadline', ''); Utils.setVal('g-status', 'Not Started');
    Voice.clearPending('g');
    Goals.render();
    UI.updateBadges();
    UI.showToast('Goal added! 🎯', 'success');
  },

  updateStatus: (id, status) => {
    const d = DB.getUser(Auth.currentUser);
    const g = d.goals.find(x => x.id === id);
    if (g) g.status = status;
    DB.saveUser(Auth.currentUser, d);
    // Re-style the select
    const sel = document.querySelector(`#entry-${id} .status-select`);
    if (sel) {
      sel.className = `status-select ${Utils.statusSelectClass(status)}`;
    }
    UI.updateBadges();
  },

  delete: (id) => {
    const d = DB.getUser(Auth.currentUser);
    d.goals = d.goals.filter(x => x.id !== id);
    DB.saveUser(Auth.currentUser, d);
    Goals.render();
    UI.updateBadges();
    UI.showToast('Goal removed');
  },

  openEdit: (id) => {
    const d = DB.getUser(Auth.currentUser);
    const g = d.goals.find(x => x.id === id);
    if (!g) return;
    const statuses = ['Not Started','In Progress','Completed','Paused'];
    const cats = ['Career','Health','Finance','Learning','Personal','Relationships','Other'];
    Utils.el('modal-title').textContent = 'Edit Goal';
    Utils.el('modal-body').innerHTML = `
      <div class="form-col" style="margin-bottom:14px">
        <label class="form-label">Goal Title</label>
        <input class="form-input" id="edit-g-title" value="${Utils.esc(g.title)}"/>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div class="form-col">
          <label class="form-label">Category</label>
          <select class="form-select" id="edit-g-cat">
            ${cats.map(c => `<option ${g.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Status</label>
          <select class="form-select" id="edit-g-status">
            ${statuses.map(s => `<option ${g.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Deadline</label>
          <input class="form-input" id="edit-g-deadline" type="date" value="${g.deadline||''}"/>
        </div>
      </div>
      <div class="form-col">
        <label class="form-label">Motivation / Plan</label>
        <textarea class="form-textarea" id="edit-g-desc" style="min-height:80px">${Utils.esc(g.desc)}</textarea>
      </div>`;
    UI._modalSaveFn = () => {
      g.title = Utils.val('edit-g-title').trim() || g.title;
      g.category = Utils.val('edit-g-cat');
      g.status = Utils.val('edit-g-status');
      g.deadline = Utils.val('edit-g-deadline');
      g.desc = Utils.val('edit-g-desc').trim();
      DB.saveUser(Auth.currentUser, d);
      Goals.render();
      UI.showToast('Goal updated ✓', 'success');
      UI.closeModal();
    };
    UI.openModal();
  },

  render: () => {
    const d = DB.getUser(Auth.currentUser);
    const filter = Utils.val('goals-filter') || 'all';
    let items = d.goals;
    if (filter === 'active') items = items.filter(g => g.status !== 'Completed' && g.status !== 'Paused');
    else if (filter === 'completed') items = items.filter(g => g.status === 'Completed');

    const container = Utils.el('goals-list');
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <span class="empty-icon">🎯</span>
        <div class="empty-title">No goals yet</div>
        <div class="empty-sub">Where do you want to be in 90 days?</div>
      </div>`;
      return;
    }
    container.innerHTML = items.map(g => Goals._cardHTML(g)).join('');
  },

  _cardHTML: (g) => {
    const statusCls = Utils.statusTagClass(g.status);
    const selCls = Utils.statusSelectClass(g.status);
    const catCls = Utils.categoryTagClass(g.category || 'Other');
    const voices = g.voices || [];
    const hasDetails = g.desc || voices.length > 0;
    const statuses = ['Not Started','In Progress','Completed','Paused'];
    return `
    <div class="entry-card ${g.status === 'Completed' ? 'done-card' : ''}" id="entry-${g.id}">
      <div class="entry-row">
        <div class="entry-body">
          <div class="entry-title ${g.status==='Completed'?'strikethrough':''}">${Utils.esc(g.title)}</div>
          <div class="entry-meta">
            <select class="status-select ${selCls}" onchange="App.Goals.updateStatus('${g.id}',this.value)">
              ${statuses.map(s=>`<option ${g.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <span class="tag ${catCls}">${g.category || 'Other'}</span>
            ${Utils.deadlineHTML(g.deadline)}
            <span class="entry-date">${Utils.fmtDate(g.date)}</span>
          </div>
          ${hasDetails ? `
            <button class="entry-expand" onclick="UI_toggleExpand('${g.id}')">▼ view details</button>
            <div class="entry-expanded-body" id="exp-${g.id}">
              ${g.desc ? `<p style="margin-bottom:${voices.length?'10px':'0'}">${Utils.esc(g.desc)}</p>` : ''}
              ${Utils.voiceEntriesHTML(voices)}
            </div>
          ` : ''}
        </div>
        <div class="entry-actions">
          <button class="btn-icon" onclick="App.Goals.openEdit('${g.id}')" title="Edit">✏️</button>
          <button class="btn-icon danger" onclick="App.Goals.delete('${g.id}')" title="Delete">🗑️</button>
        </div>
      </div>
    </div>`;
  },
};

/* ═══════════════════════════════════════════════════════
   OVERVIEW MODULE
═══════════════════════════════════════════════════════ */
const Overview = {
  render: () => {
    const d = DB.getUser(Auth.currentUser);

    // Stats
    const todayR = d.routines.filter(r => Utils.isToday(r.date));
    const doneR = todayR.filter(r => r.done).length;
    const goals = d.goals;
    const done = goals.filter(g => g.status === 'Completed').length;
    const ip = goals.filter(g => g.status === 'In Progress').length;
    const pct = goals.length > 0 ? Math.round(done / goals.length * 100) : 0;

    Utils.el('overview-greeting').textContent = Utils.greeting(Auth.currentName || Auth.currentUser);

    Utils.el('stats-grid') && (Utils.el('stats-grid').innerHTML = `
      <div class="stat-tile"><div class="stat-num" style="color:var(--accent)">${d.routines.length}</div><div class="stat-label">Total Entries</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--gold)">${d.ideas.length}</div><div class="stat-label">Draft Ideas</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--accent3)">${goals.length}</div><div class="stat-label">Goals Set</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--success)">${done}</div><div class="stat-label">Goals Done</div></div>
    `);

    let html = `<div class="stats-grid" id="stats-grid"></div>`;

    // Today card
    const rPct = todayR.length > 0 ? Math.round(doneR / todayR.length * 100) : 0;
    html += `
    <div class="overview-card">
      <div class="overview-card-title">Today's Routine</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text2)">${doneR} of ${todayR.length} completed</span>
        <span style="font-family:var(--font-mono);font-size:16px;color:var(--accent);font-weight:500">${rPct}%</span>
      </div>
      <div class="progress-bar" style="margin-bottom:12px"><div class="progress-fill" style="width:${rPct}%"></div></div>
      ${todayR.length === 0
        ? `<p style="font-family:var(--font-mono);font-size:12px;color:var(--text3)">No entries today yet.</p>`
        : todayR.slice(0, 5).map(r => `
          <div class="overview-row">
            <span>${r.done ? '✅' : '⬜'}</span>
            <span style="flex:1;font-size:14px;${r.done?'text-decoration:line-through;color:var(--text3)':''}">${Utils.esc(r.text)}</span>
            <span class="tag ${Utils.categoryTagClass(r.category)}">${r.category}</span>
          </div>`).join('')
      }
    </div>`;

    // Goals progress
    html += `
    <div class="overview-card">
      <div class="overview-card-title">Goals Progress</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text2)">${pct}% complete · ${ip} in progress</span>
        <span style="font-family:var(--font-mono);font-size:16px;color:var(--success);font-weight:500">${done}/${goals.length}</span>
      </div>
      <div class="progress-bar" style="margin-bottom:12px"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--success),var(--accent))"></div></div>
      ${goals.filter(g => g.status === 'In Progress').slice(0, 4).map(g => `
        <div class="overview-row">
          <span class="tag tag-goal-ip">Active</span>
          <span style="flex:1;font-size:14px">${Utils.esc(g.title)}</span>
          ${Utils.deadlineHTML(g.deadline)}
        </div>`).join('') || '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text3)">No goals in progress.</p>'}
    </div>`;

    // Recent ideas
    html += `
    <div class="overview-card">
      <div class="overview-card-title">Recent Ideas</div>
      ${d.ideas.length === 0
        ? `<p style="font-family:var(--font-mono);font-size:12px;color:var(--text3)">No ideas captured yet.</p>`
        : d.ideas.slice(0, 5).map(i => `
          <div class="overview-row">
            <span class="tag tag-idea">${Utils.esc(i.tag)}</span>
            <span style="flex:1;font-size:14px">${Utils.esc(i.title)}</span>
            <span class="entry-date">${Utils.fmtDate(i.date)}</span>
          </div>`).join('')
      }
    </div>`;

    Utils.el('overview-content').innerHTML = html;
    // Now render stats into newly created stats-grid
    const sg = Utils.el('stats-grid');
    if (sg) sg.innerHTML = `
      <div class="stat-tile"><div class="stat-num" style="color:var(--accent)">${d.routines.length}</div><div class="stat-label">Total Entries</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--gold)">${d.ideas.length}</div><div class="stat-label">Draft Ideas</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--accent3)">${goals.length}</div><div class="stat-label">Goals Set</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--success)">${done}</div><div class="stat-label">Goals Done</div></div>
    `;
  },
};

/* ═══════════════════════════════════════════════════════
   SEARCH MODULE
═══════════════════════════════════════════════════════ */
const Search = {
  _timer: null,

  query: (q) => {
    clearTimeout(Search._timer);
    const clear = Utils.el('search-clear');
    const results = Utils.el('search-results');
    if (!q.trim()) { Search.clear(); return; }
    if (clear) clear.classList.remove('hidden');
    Search._timer = setTimeout(() => Search._run(q.trim().toLowerCase()), 200);
  },

  _run: (q) => {
    const d = DB.getUser(Auth.currentUser);
    const results = Utils.el('search-results');
    const body = Utils.el('search-results-body');
    const label = Utils.el('search-results-label');

    const routineHits = d.routines.filter(r => r.text.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    const ideaHits = d.ideas.filter(i => i.title.toLowerCase().includes(q) || (i.body || '').toLowerCase().includes(q) || i.tag.toLowerCase().includes(q));
    const goalHits = d.goals.filter(g => g.title.toLowerCase().includes(q) || (g.desc || '').toLowerCase().includes(q));

    const total = routineHits.length + ideaHits.length + goalHits.length;
    if (label) label.textContent = `${total} result${total !== 1 ? 's' : ''} for "${q}"`;

    let html = '';
    if (routineHits.length) {
      html += `<div class="section-divider">Routine (${routineHits.length})</div>`;
      html += routineHits.map(r => `
        <div class="entry-card" style="margin-bottom:8px">
          <div class="entry-title">${Utils.esc(r.text)}</div>
          <div class="entry-meta"><span class="tag ${Utils.categoryTagClass(r.category)}">${r.category}</span><span class="entry-date">${Utils.fmtDate(r.date)}</span></div>
        </div>`).join('');
    }
    if (ideaHits.length) {
      html += `<div class="section-divider">Ideas (${ideaHits.length})</div>`;
      html += ideaHits.map(i => `
        <div class="entry-card" style="margin-bottom:8px">
          <div class="entry-title">${Utils.esc(i.title)}</div>
          <div class="entry-meta"><span class="tag tag-idea">${Utils.esc(i.tag)}</span><span class="entry-date">${Utils.fmtDate(i.date)}</span></div>
          ${i.body ? `<div class="entry-desc" style="font-size:12px;color:var(--text2);margin-top:4px">${Utils.esc(i.body.substring(0,100))}${i.body.length>100?'...':''}</div>` : ''}
        </div>`).join('');
    }
    if (goalHits.length) {
      html += `<div class="section-divider">Goals (${goalHits.length})</div>`;
      html += goalHits.map(g => `
        <div class="entry-card" style="margin-bottom:8px">
          <div class="entry-title">${Utils.esc(g.title)}</div>
          <div class="entry-meta"><span class="tag ${Utils.statusTagClass(g.status)}">${g.status}</span>${Utils.deadlineHTML(g.deadline)}</div>
        </div>`).join('');
    }
    if (total === 0) {
      html = `<div class="empty-state" style="padding:24px"><span class="empty-icon" style="font-size:28px">🔍</span><div class="empty-sub">No results found for "${Utils.esc(q)}"</div></div>`;
    }
    body.innerHTML = html;
    results.classList.remove('hidden');
  },

  clear: () => {
    const results = Utils.el('search-results');
    const searchInput = Utils.el('global-search');
    const clear = Utils.el('search-clear');
    if (results) results.classList.add('hidden');
    if (searchInput) searchInput.value = '';
    if (clear) clear.classList.add('hidden');
  },
};

/* ═══════════════════════════════════════════════════════
   UI MODULE
═══════════════════════════════════════════════════════ */
const UI = {
  currentTab: 'routine',
  _modalSaveFn: null,
  _theme: 'dark',

  init: (name, username) => {
    Utils.el('nav-username').textContent = name || username;
    Utils.el('nav-avatar').textContent = (name || username).charAt(0).toUpperCase();
    Utils.el('sb-avatar').textContent = (name || username).charAt(0).toUpperCase();
    Utils.el('sb-name').textContent = name || username;
    // Set initial date
    Utils.el('routine-date-label') && (Utils.el('routine-date-label').textContent = Utils.todayLabel());
    // Load theme
    UI._theme = localStorage.getItem('mv_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', UI._theme);
    Utils.el('theme-btn').textContent = UI._theme === 'dark' ? '🌙' : '☀️';
    // Keyboard shortcuts
    document.addEventListener('keydown', UI._handleKeys);
  },

  _handleKeys: (e) => {
    if (e.key === 'Escape') {
      UI.closeModal();
      Search.clear();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      Utils.el('global-search').focus();
    }
  },

  switchTab: (name) => {
    if (UI.currentTab === name) return;
    // Close sidebar on mobile
    UI.closeSidebar();
    Search.clear();
    UI.currentTab = name;

    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    const panel = Utils.el(`tab-${name}`);
    if (panel) panel.classList.remove('hidden');

    document.querySelectorAll('.sb-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.mob-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));

    if (name === 'overview') Overview.render();
  },

  toggleSidebar: () => {
    const sb = Utils.el('sidebar');
    const overlay = Utils.el('sidebar-overlay');
    const isOpen = sb.classList.contains('open');
    sb.classList.toggle('open', !isOpen);
    overlay.classList.toggle('visible', !isOpen);
    document.body.style.overflow = isOpen ? '' : 'hidden';
  },

  closeSidebar: () => {
    Utils.el('sidebar').classList.remove('open');
    Utils.el('sidebar-overlay').classList.remove('visible');
    document.body.style.overflow = '';
  },

  toggleTheme: () => {
    UI._theme = UI._theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', UI._theme);
    localStorage.setItem('mv_theme', UI._theme);
    Utils.el('theme-btn').textContent = UI._theme === 'dark' ? '🌙' : '☀️';
  },

  toggleCard: (cardId) => {
    const card = Utils.el(cardId);
    if (!card) return;
    const body = card.querySelector('.card-body');
    const btn = card.querySelector('.card-collapse');
    if (!body) return;
    const collapsed = body.classList.toggle('collapsed');
    if (btn) btn.textContent = collapsed ? '+' : '−';
  },

  openModal: () => {
    Utils.el('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const first = Utils.el('modal').querySelector('input, textarea, select'); if (first) first.focus(); }, 100);
  },

  closeModal: () => {
    Utils.el('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
    UI._modalSaveFn = null;
  },

  saveModal: () => {
    if (UI._modalSaveFn) UI._modalSaveFn();
  },

  updateBadges: () => {
    const d = DB.getUser(Auth.currentUser);
    const todayPending = d.routines.filter(r => Utils.isToday(r.date) && !r.done).length;
    const activeGoals = d.goals.filter(g => g.status === 'In Progress').length;

    ['routine', 'ideas', 'goals'].forEach(section => {
      const badge = Utils.el(`sb-${section}-badge`);
      if (!badge) return;
      let count = 0;
      if (section === 'routine') count = todayPending;
      if (section === 'goals') count = activeGoals;
      badge.textContent = count > 0 ? count : '';
    });
  },

  showToast: (msg, type = 'default') => {
    const t = Utils.el('toast');
    t.textContent = msg;
    t.className = `toast ${type !== 'default' ? type : ''} show`;
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  },
};

// Global helpers called from inline HTML
window.UI_toggleExpand = (id) => {
  const body = Utils.el(`exp-${id}`);
  const card = Utils.el(`entry-${id}`);
  const btn = card ? card.querySelector('.entry-expand') : null;
  if (!body) return;
  const open = body.classList.toggle('open');
  if (btn) btn.textContent = open ? '▲ hide details' : '▼ view details';
};

/* ═══════════════════════════════════════════════════════
   DATA MODULE (export / clear)
═══════════════════════════════════════════════════════ */
const Data = {
  exportAll: () => {
    const d = DB.getUser(Auth.currentUser);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    let txt = `MINDVAULT EXPORT — ${Auth.currentName || Auth.currentUser}\n`;
    txt += `Exported: ${now.toLocaleString()}\n`;
    txt += `${'═'.repeat(60)}\n\n`;

    txt += `DAILY ROUTINE (${d.routines.length} entries)\n${'-'.repeat(40)}\n`;
    d.routines.forEach(r => {
      txt += `[${r.done ? '✓' : ' '}] ${r.text}\n`;
      txt += `    Category: ${r.category} | Date: ${new Date(r.date).toLocaleString()}\n\n`;
    });

    txt += `\nDRAFT IDEAS (${d.ideas.length} ideas)\n${'-'.repeat(40)}\n`;
    d.ideas.forEach(i => {
      txt += `💡 ${i.title} [${i.tag}] [${i.status}]\n`;
      if (i.body) txt += `   ${i.body.replace(/\n/g, '\n   ')}\n`;
      txt += `   Date: ${new Date(i.date).toLocaleString()}\n\n`;
    });

    txt += `\nGOALS (${d.goals.length} goals)\n${'-'.repeat(40)}\n`;
    d.goals.forEach(g => {
      txt += `🎯 ${g.title} [${g.status}]\n`;
      if (g.desc) txt += `   ${g.desc.replace(/\n/g, '\n   ')}\n`;
      if (g.deadline) txt += `   Deadline: ${g.deadline}\n`;
      txt += `   Added: ${new Date(g.date).toLocaleString()}\n\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mindvault-export-${dateStr}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    UI.showToast('Data exported successfully ⬇', 'success');
  },

  clearConfirm: () => {
    Utils.el('modal-title').textContent = '⚠ Clear All Data';
    Utils.el('modal-body').innerHTML = `
      <p style="color:var(--text2);margin-bottom:16px;line-height:1.6">
        This will permanently delete <strong style="color:var(--danger)">all your routines, ideas, and goals</strong>.
        This cannot be undone.
      </p>
      <p style="font-family:var(--font-mono);font-size:12px;color:var(--text3)">
        Consider exporting your data first using the export button.
      </p>`;
    UI._modalSaveFn = () => {
      const db = DB.load();
      db.data[Auth.currentUser] = { routines: [], ideas: [], goals: [] };
      DB.save(db);
      App.renderAll();
      UI.showToast('All data cleared', 'error');
      UI.closeModal();
    };
    Utils.el('modal-save').innerHTML = '<span>Yes, Clear Everything</span>';
    Utils.el('modal-save').style.background = 'var(--danger)';
    UI.openModal();
    Utils.el('modal-overlay').addEventListener('click', () => {
      Utils.el('modal-save').innerHTML = '<span>Save Changes</span>';
      Utils.el('modal-save').style.background = '';
    }, { once: true });
  },
};

/* ═══════════════════════════════════════════════════════
   MAIN APP NAMESPACE
═══════════════════════════════════════════════════════ */
const App = {
  Auth, Voice, Routine, Ideas, Goals, Overview, Search, UI, Data,

  renderAll: () => {
    Routine.render();
    Ideas.render();
    Ideas._updateTagsDatalist();
    Goals.render();
    UI.updateBadges();
  },

  init: () => {
    Auth.init();
  },
};

// Expose globally for inline handlers
window.App = App;
window.UI = UI;

// Boot
document.addEventListener('DOMContentLoaded', App.init);
