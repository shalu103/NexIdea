/**
 * MindVault — app.js  (Supabase Cloud Edition)
 * All data stored in Supabase — works for every user on every device
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   SUPABASE CLIENT — reads env vars set in Vercel
═══════════════════════════════════════════════════════ */
const SUPABASE_URL      = window.__SUPABASE_URL__;
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__;

// Initialize Supabase client (loaded via CDN in index.html)
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════ */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* ═══════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════ */
const Utils = {
  esc: (s) => String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>'),

  fmtDate: (iso) => {
    if (!iso) return '';
    const d    = new Date(iso);
    const now  = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return `Today · ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
    if (diff === 1) return `Yesterday · ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
    if (diff < 7)   return `${diff} days ago`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  },

  fmtDur: (s) => {
    s = Math.round(s || 0);
    return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  },

  isToday: (iso) => new Date(iso).toDateString() === new Date().toDateString(),

  isThisWeek: (iso) => {
    const d   = new Date(iso);
    const now = new Date();
    const ws  = new Date(now);
    ws.setDate(now.getDate() - now.getDay());
    ws.setHours(0,0,0,0);
    return d >= ws;
  },

  isRecent: (iso, days=7) => (Date.now() - new Date(iso)) / 86400000 <= days,

  deadlineInfo: (dl) => {
    if (!dl) return null;
    const diff = Math.ceil((new Date(dl) - new Date()) / 86400000);
    if (diff < 0)  return { cls:'dl-overdue', label:`Overdue by ${Math.abs(diff)}d`, icon:'⚠' };
    if (diff === 0) return { cls:'dl-soon',    label:'Due today!',                    icon:'🔥' };
    if (diff <= 7)  return { cls:'dl-soon',    label:`${diff}d left`,                 icon:'⏰' };
    return { cls:'dl-ok', label: new Date(dl).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}), icon:'🗓' };
  },

  deadlineHTML: (dl) => {
    const s = Utils.deadlineInfo(dl);
    return s ? `<span class="deadline-badge ${s.cls}">${s.icon} ${s.label}</span>` : '';
  },

  catTagCls: (c) => ({
    Morning:'tag-morning', Work:'tag-work', Evening:'tag-evening',
    Health:'tag-health', Learning:'tag-learning', Personal:'tag-personal',
    Career:'tag-career', Finance:'tag-finance', Other:'tag-other'
  }[c] || 'tag-other'),

  statusTagCls: (s) => ({
    'Not Started':'tag-goal-ns','In Progress':'tag-goal-ip',
    'Completed':'tag-goal-done','Paused':'tag-goal-pause'
  }[s] || 'tag-goal-ns'),

  statusSelCls: (s) => ({
    'Not Started':'status-ns','In Progress':'status-ip',
    'Completed':'status-done','Paused':'status-pause'
  }[s] || 'status-ns'),

  ideaStatusCls: (s) => ({
    Draft:'tag-draft', Exploring:'tag-exploring',
    Planned:'tag-planned', Archived:'tag-archived'
  }[s] || 'tag-draft'),

  priTagCls: (p) => ({high:'tag-high',normal:'tag-normal',low:'tag-low'}[p] || 'tag-normal'),

  greeting: (name) => {
    const h = new Date().getHours();
    return `${h<12?'Good morning':h<17?'Good afternoon':'Good evening'}, ${name} ✦`;
  },

  todayLabel: () => {
    const d = new Date();
    return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  },

  el:     (id) => document.getElementById(id),
  val:    (id) => (document.getElementById(id)||{}).value || '',
  setVal: (id, v) => { const e = document.getElementById(id); if(e) e.value = v; },

  showLoading: (containerId, msg='Loading...') => {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><span>${msg}</span></div>`;
  },
};

/* ═══════════════════════════════════════════════════════
   AUTH MODULE — Supabase Auth
═══════════════════════════════════════════════════════ */
const Auth = {
  user: null,
  profile: null,

  init: async () => {
    // Check existing session
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      Auth.user = session.user;
      await Auth._loadProfile();
      Auth._startApp();
    } else {
      Auth._showAuth();
    }

    // Listen for auth changes (login/logout from other tabs)
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        Auth.user = session.user;
        await Auth._loadProfile();
        Auth._startApp();
      } else if (event === 'SIGNED_OUT') {
        Auth.user    = null;
        Auth.profile = null;
        Auth._showAuth();
      }
    });
  },

  _loadProfile: async () => {
    const { data } = await sb
      .from('profiles')
      .select('*')
      .eq('id', Auth.user.id)
      .single();
    Auth.profile = data;
  },

  _showAuth: () => {
    Utils.el('splash').classList.add('fade-out');
    setTimeout(() => {
      Utils.el('splash').style.display = 'none';
      Utils.el('auth-screen').classList.remove('hidden');
    }, 400);
  },

  _startApp: () => {
    Utils.el('splash').classList.add('fade-out');
    Utils.el('auth-screen').classList.add('hidden');
    setTimeout(() => {
      Utils.el('splash').style.display = 'none';
      Utils.el('app').classList.remove('hidden');
      const name = Auth.profile?.full_name || Auth.user?.email?.split('@')[0] || 'User';
      UI.init(name);
      App.renderAll();
    }, 300);
  },

  switchTab: (tab) => {
    const isLogin = tab === 'login';
    Utils.el('login-panel').classList.toggle('active', isLogin);
    Utils.el('reg-panel').classList.toggle('active', !isLogin);
    Utils.el('tab-login-btn').classList.toggle('active', isLogin);
    Utils.el('tab-reg-btn').classList.toggle('active', !isLogin);
    setTimeout(() => Utils.el(isLogin ? 'login-user' : 'reg-name')?.focus(), 50);
  },

  togglePass: (fieldId, btn) => {
    const f = Utils.el(fieldId);
    if (!f) return;
    f.type = f.type === 'text' ? 'password' : 'text';
    btn.style.opacity = f.type === 'password' ? '0.5' : '1';
  },

  login: async () => {
    const email = Utils.val('login-user').trim();
    const pass  = Utils.val('login-pass');
    const msg   = Utils.el('login-msg');
    const btn   = Utils.el('login-btn');

    if (!email || !pass) { Auth._msg(msg, 'Please enter your email and password.'); return; }

    btn.classList.add('loading');
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    btn.classList.remove('loading');

    if (error) { Auth._msg(msg, error.message); return; }
    Auth._msg(msg, 'Signing in...', 'success');
  },

  register: async () => {
    const name  = Utils.val('reg-name').trim();
    const email = Utils.val('reg-user').trim();
    const pass  = Utils.val('reg-pass');
    const msg   = Utils.el('reg-msg');
    const btn   = Utils.el('reg-btn');

    if (!name || !email || !pass) { Auth._msg(msg, 'All fields are required.'); return; }
    if (pass.length < 6) { Auth._msg(msg, 'Password must be at least 6 characters.'); return; }

    btn.classList.add('loading');
    const { error } = await sb.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name } }
    });
    btn.classList.remove('loading');

    if (error) { Auth._msg(msg, error.message); return; }
    Auth._msg(msg, '✅ Account created! Check your email to confirm, then sign in.', 'success');
  },

  logout: async () => {
    Voice.stopAll();
    await sb.auth.signOut();
    Utils.el('app').classList.add('hidden');
    UI.showToast('Signed out successfully');
  },

  _msg: (el, text, type='error') => {
    el.textContent = text;
    el.className = `auth-msg ${type}`;
    if (type !== 'success') setTimeout(() => el.textContent = '', 4000);
  },
};

/* ═══════════════════════════════════════════════════════
   VOICE RECORDER MODULE (unchanged — browser API)
═══════════════════════════════════════════════════════ */
const Voice = {
  active:  {},
  timers:  {},
  elapsed: {},
  pending: { r:[], i:[], g:[] },

  toggle: async (s) => {
    if (Voice.active[s]) Voice.stop(s);
    else await Voice.start(s);
  },

  start: async (s) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const chunks = [];
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      });
      mr.ondataavailable = e => { if (e.data.size>0) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType });
        Voice.pending[s].push({ url: URL.createObjectURL(blob), dur: Voice.elapsed[s]||0 });
        Voice._renderPending(s);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(250);
      Voice.active[s] = mr;
      Voice._startTimer(s);
      Voice._setUI(s, true);
    } catch {
      UI.showToast('Microphone access denied', 'error');
    }
  },

  stop: (s) => {
    Voice.active[s]?.stop();
    delete Voice.active[s];
    Voice._stopTimer(s);
    Voice._setUI(s, false);
  },

  stopAll: () => Object.keys(Voice.active).forEach(s => Voice.stop(s)),

  removePending: (s, i) => {
    URL.revokeObjectURL(Voice.pending[s][i]?.url);
    Voice.pending[s].splice(i, 1);
    Voice._renderPending(s);
  },

  clearPending: (s) => {
    Voice.pending[s].forEach(v => URL.revokeObjectURL(v.url));
    Voice.pending[s] = [];
    Voice._renderPending(s);
  },

  getPending: (s) => Voice.pending[s].map(v => ({ url:v.url, dur:v.dur })),

  _startTimer: (s) => {
    Voice.elapsed[s] = 0;
    Voice.timers[s] = setInterval(() => {
      Voice.elapsed[s]++;
      const el = Utils.el(`rec-timer-${s}`);
      if (el) el.textContent = Utils.fmtDur(Voice.elapsed[s]);
    }, 1000);
  },

  _stopTimer: (s) => {
    clearInterval(Voice.timers[s]);
    const el = Utils.el(`rec-timer-${s}`);
    if (el) el.textContent = '0:00';
  },

  _setUI: (s, rec) => {
    const btn = Utils.el(`rec-btn-${s}`);
    const dot = Utils.el(`rec-dot-${s}`);
    const lbl = Utils.el(`rec-lbl-${s}`);
    if (btn) btn.classList.toggle('recording', rec);
    if (dot) dot.classList.toggle('active', rec);
    if (lbl) lbl.textContent = rec ? 'Stop Recording' : 'Start Recording';
  },

  _renderPending: (s) => {
    const c = Utils.el(`pv-${s}`);
    if (!c) return;
    c.innerHTML = Voice.pending[s].map((v,i) => `
      <div class="voice-entry-item">
        <audio controls src="${v.url}"></audio>
        <span class="voice-dur">${Utils.fmtDur(v.dur)}</span>
        <button class="voice-del" onclick="App.Voice.removePending('${s}',${i})">✕</button>
      </div>`).join('');
  },

  // Render saved voices from DB (stored as JSON array)
  savedHTML: (voices) => {
    if (!voices?.length) return '';
    return `<div class="entry-voice-list">
      ${voices.map(v => `
        <div class="entry-voice-item">
          <audio controls src="${v.url}" preload="metadata"></audio>
          <span class="voice-dur">${Utils.fmtDur(v.dur)}</span>
        </div>`).join('')}
    </div>`;
  },
};

/* ═══════════════════════════════════════════════════════
   ROUTINE MODULE — full Supabase CRUD
═══════════════════════════════════════════════════════ */
const Routine = {
  _cache: [],

  add: async () => {
    const text   = Utils.val('r-text').trim();
    const voices = Voice.getPending('r');
    if (!text && !voices.length) { UI.showToast('Enter a task or record a voice note'); return; }

    const btn = Utils.el('r-add-btn');
    if (btn) btn.disabled = true;

    const { data, error } = await sb.from('routines').insert({
      user_id:  Auth.user.id,
      text:     text || '🎙 Voice note',
      category: Utils.val('r-cat'),
      priority: Utils.val('r-priority'),
      time:     Utils.val('r-time') || null,
      done:     false,
      voices:   voices,           // stored as JSONB in Supabase
      date:     new Date().toISOString(),
    }).select().single();

    if (btn) btn.disabled = false;
    if (error) { UI.showToast('Error saving entry: ' + error.message, 'error'); return; }

    Routine._cache.unshift(data);
    Utils.setVal('r-text',''); Utils.setVal('r-time','');
    Voice.clearPending('r');
    Routine.render();
    UI.updateBadges();
    UI.showToast('Routine entry added ✓', 'success');
  },

  load: async () => {
    Utils.showLoading('routine-list', 'Loading routines...');
    const { data, error } = await sb
      .from('routines')
      .select('*')
      .eq('user_id', Auth.user.id)
      .order('date', { ascending: false });

    if (error) { UI.showToast('Could not load routines', 'error'); return; }
    Routine._cache = data || [];
    Routine.render();
  },

  toggle: async (id) => {
    const item = Routine._cache.find(r => r.id === id);
    if (!item) return;
    const newDone = !item.done;
    item.done = newDone; // optimistic update
    Routine.render();

    const { error } = await sb.from('routines').update({ done: newDone }).eq('id', id);
    if (error) {
      item.done = !newDone; // revert
      Routine.render();
      UI.showToast('Update failed', 'error');
    }
    UI.updateBadges();
  },

  delete: async (id) => {
    Routine._cache = Routine._cache.filter(r => r.id !== id); // optimistic
    Routine.render();

    const { error } = await sb.from('routines').delete().eq('id', id);
    if (error) {
      UI.showToast('Delete failed — please refresh', 'error');
      await Routine.load();
    } else {
      UI.showToast('Entry removed');
      UI.updateBadges();
    }
  },

  openEdit: (id) => {
    const r = Routine._cache.find(x => x.id === id);
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
            ${cats.map(c=>`<option ${r.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Priority</label>
          <select class="form-select" id="edit-r-priority">
            ${pris.map(p=>`<option value="${p}" ${(r.priority||'normal')===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Time</label>
          <input class="form-input" id="edit-r-time" type="time" value="${r.time||''}"/>
        </div>
      </div>`;
    UI._modalSaveFn = async () => {
      const updates = {
        text:     Utils.val('edit-r-text').trim() || r.text,
        category: Utils.val('edit-r-cat'),
        priority: Utils.val('edit-r-priority'),
        time:     Utils.val('edit-r-time') || null,
      };
      const { error } = await sb.from('routines').update(updates).eq('id', id);
      if (error) { UI.showToast('Update failed', 'error'); return; }
      Object.assign(r, updates);
      Routine.render();
      UI.showToast('Entry updated ✓', 'success');
      UI.closeModal();
    };
    UI.openModal();
  },

  render: () => {
    const filter = Utils.val('routine-filter') || 'today';
    let items = Routine._cache;
    if (filter === 'today') items = items.filter(r => Utils.isToday(r.date));
    else if (filter === 'week') items = items.filter(r => Utils.isThisWeek(r.date));

    // Progress bar
    const todayItems = Routine._cache.filter(r => Utils.isToday(r.date));
    const done = todayItems.filter(r => r.done).length;
    const pct  = todayItems.length > 0 ? Math.round(done/todayItems.length*100) : 0;
    if (Utils.el('routine-pct'))   Utils.el('routine-pct').textContent   = `${pct}%`;
    if (Utils.el('routine-bar'))   Utils.el('routine-bar').style.width   = `${pct}%`;
    if (Utils.el('routine-date-label')) Utils.el('routine-date-label').textContent = Utils.todayLabel();
    if (Utils.el('routine-stats')) Utils.el('routine-stats').innerHTML = `
      <span class="progress-stat"><strong>${done}</strong> done</span>
      <span class="progress-stat"><strong>${todayItems.length-done}</strong> remaining</span>
      <span class="progress-stat"><strong>${Routine._cache.length}</strong> total</span>`;

    const c = Utils.el('routine-list');
    if (!c) return;
    if (items.length === 0) {
      c.innerHTML = `<div class="empty-state">
        <span class="empty-icon">📋</span>
        <div class="empty-title">No entries yet</div>
        <div class="empty-sub">${filter==='today'?'Start logging your day above':'No entries for this period'}</div>
      </div>`; return;
    }

    // Group by date
    const groups = {};
    items.forEach(r => {
      const key = new Date(r.date).toDateString();
      (groups[key] = groups[key]||[]).push(r);
    });
    c.innerHTML = Object.entries(groups).map(([key, grp]) => {
      const isToday = key === new Date().toDateString();
      const d = grp.filter(r=>r.done).length;
      return `<div class="section-divider">${isToday?`Today — ${d}/${grp.length} done`:key}</div>`
           + grp.map(r => Routine._card(r)).join('');
    }).join('');
  },

  _card: (r) => {
    const voices = Array.isArray(r.voices) ? r.voices : [];
    return `
    <div class="entry-card ${r.done?'done-card':''} ${r.priority==='high'?'priority-high':r.priority==='low'?'priority-low':''}" id="entry-${r.id}">
      <div class="entry-row">
        <input type="checkbox" class="entry-check" ${r.done?'checked':''} onchange="App.Routine.toggle('${r.id}')"/>
        <div class="entry-body">
          <div class="entry-title ${r.done?'strikethrough':''}">${Utils.esc(r.text)}</div>
          <div class="entry-meta">
            <span class="tag ${Utils.catTagCls(r.category)}">${r.category}</span>
            ${r.priority&&r.priority!=='normal'?`<span class="tag ${Utils.priTagCls(r.priority)}">${r.priority}</span>`:''}
            ${r.time?`<span class="entry-date">⏰ ${r.time}</span>`:''}
            <span class="entry-date">${Utils.fmtDate(r.date)}</span>
          </div>
          ${voices.length?`
            <button class="entry-expand" onclick="UI_toggleExpand('${r.id}')">▼ voice note</button>
            <div class="entry-expanded-body" id="exp-${r.id}">${Voice.savedHTML(voices)}</div>`:''}
        </div>
        <div class="entry-actions">
          <button class="btn-icon" onclick="App.Routine.openEdit('${r.id}')">✏️</button>
          <button class="btn-icon danger" onclick="App.Routine.delete('${r.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
  },
};

/* ═══════════════════════════════════════════════════════
   IDEAS MODULE — full Supabase CRUD
═══════════════════════════════════════════════════════ */
const Ideas = {
  _cache: [],

  add: async () => {
    const title  = Utils.val('i-title').trim();
    const voices = Voice.getPending('i');
    if (!title && !voices.length) { UI.showToast('Enter an idea title or record a voice note'); return; }

    const { data, error } = await sb.from('ideas').insert({
      user_id:  Auth.user.id,
      title:    title || '🎙 Voice idea',
      body:     Utils.val('i-body').trim() || null,
      tag:      Utils.val('i-tag').trim() || 'General',
      status:   Utils.val('i-status'),
      voices:   voices,
      date:     new Date().toISOString(),
    }).select().single();

    if (error) { UI.showToast('Error saving idea: ' + error.message, 'error'); return; }

    Ideas._cache.unshift(data);
    Utils.setVal('i-title',''); Utils.setVal('i-body',''); Utils.setVal('i-tag','');
    Voice.clearPending('i');
    Ideas.render();
    Ideas._updateDatalist();
    UI.updateBadges();
    UI.showToast('Idea saved! 💡', 'success');
  },

  load: async () => {
    Utils.showLoading('ideas-list', 'Loading ideas...');
    const { data, error } = await sb
      .from('ideas')
      .select('*')
      .eq('user_id', Auth.user.id)
      .order('date', { ascending: false });

    if (error) { UI.showToast('Could not load ideas', 'error'); return; }
    Ideas._cache = data || [];
    Ideas.render();
    Ideas._updateDatalist();
  },

  delete: async (id) => {
    Ideas._cache = Ideas._cache.filter(x => x.id !== id);
    Ideas.render();
    const { error } = await sb.from('ideas').delete().eq('id', id);
    if (error) { UI.showToast('Delete failed', 'error'); await Ideas.load(); }
    else { UI.showToast('Idea removed'); UI.updateBadges(); }
  },

  openEdit: (id) => {
    const idea = Ideas._cache.find(x => x.id === id);
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
            ${statuses.map(s=>`<option ${idea.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-col">
        <label class="form-label">Details / Notes</label>
        <textarea class="form-textarea" id="edit-i-body" style="min-height:100px">${Utils.esc(idea.body||'')}</textarea>
      </div>`;
    UI._modalSaveFn = async () => {
      const updates = {
        title:  Utils.val('edit-i-title').trim() || idea.title,
        tag:    Utils.val('edit-i-tag').trim()   || 'General',
        status: Utils.val('edit-i-status'),
        body:   Utils.val('edit-i-body').trim()  || null,
      };
      const { error } = await sb.from('ideas').update(updates).eq('id', id);
      if (error) { UI.showToast('Update failed', 'error'); return; }
      Object.assign(idea, updates);
      Ideas.render();
      UI.showToast('Idea updated ✓', 'success');
      UI.closeModal();
    };
    UI.openModal();
  },

  render: () => {
    const filter = Utils.val('ideas-filter') || 'all';
    let items = Ideas._cache;
    if (filter === 'recent') items = items.filter(i => Utils.isRecent(i.date, 7));

    const c = Utils.el('ideas-list');
    if (!c) return;
    if (items.length === 0) {
      c.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <span class="empty-icon">💡</span>
        <div class="empty-title">No ideas yet</div>
        <div class="empty-sub">Every big thing starts as a draft</div>
      </div>`; return;
    }
    c.innerHTML = items.map(i => Ideas._card(i)).join('');
  },

  _card: (idea) => {
    const voices  = Array.isArray(idea.voices) ? idea.voices : [];
    const hasBody = idea.body && idea.body.length > 0;
    return `
    <div class="idea-card" id="idea-${idea.id}">
      <div class="idea-card-top">
        <div class="idea-card-title">${Utils.esc(idea.title)}</div>
        <div class="idea-card-actions">
          <button class="btn-icon" onclick="App.Ideas.openEdit('${idea.id}')">✏️</button>
          <button class="btn-icon danger" onclick="App.Ideas.delete('${idea.id}')">🗑️</button>
        </div>
      </div>
      ${hasBody?`<div class="idea-card-body" id="idea-body-${idea.id}">${Utils.esc(idea.body)}</div>`:''}
      ${(hasBody||voices.length)?`
        <div id="idea-voices-${idea.id}" style="display:none">${Voice.savedHTML(voices)}</div>
        <button class="entry-expand" style="margin-bottom:8px" onclick="Ideas_toggleExpand('${idea.id}')">▼ expand</button>`:''}
      <div class="idea-card-footer">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span class="tag tag-idea">${Utils.esc(idea.tag)}</span>
          <span class="tag ${Utils.ideaStatusCls(idea.status||'Draft')}">${idea.status||'Draft'}</span>
          ${voices.length?`<span class="idea-voice-indicator">🎙 ${voices.length}</span>`:''}
        </div>
        <span class="entry-date">${Utils.fmtDate(idea.date)}</span>
      </div>
    </div>`;
  },

  _updateDatalist: () => {
    const tags = [...new Set(Ideas._cache.map(i=>i.tag).filter(Boolean))];
    const dl = Utils.el('tags-datalist');
    if (dl) dl.innerHTML = tags.map(t=>`<option value="${Utils.esc(t)}">`).join('');
  },
};

window.Ideas_toggleExpand = (id) => {
  const body   = Utils.el(`idea-body-${id}`);
  const voices = Utils.el(`idea-voices-${id}`);
  const card   = Utils.el(`idea-${id}`);
  const btn    = card?.querySelector('.entry-expand');
  const open   = body && !body.classList.contains('expanded');
  if (body)   body.classList.toggle('expanded', open);
  if (voices) voices.style.display = open ? 'block' : 'none';
  if (btn)    btn.textContent = open ? '▲ collapse' : '▼ expand';
};

/* ═══════════════════════════════════════════════════════
   GOALS MODULE — full Supabase CRUD
═══════════════════════════════════════════════════════ */
const Goals = {
  _cache: [],

  add: async () => {
    const title  = Utils.val('g-title').trim();
    const voices = Voice.getPending('g');
    if (!title && !voices.length) { UI.showToast('Enter a goal title or record a voice note'); return; }

    const { data, error } = await sb.from('goals').insert({
      user_id:     Auth.user.id,
      title:       title || '🎙 Voice goal',
      description: Utils.val('g-desc').trim() || null,
      deadline:    Utils.val('g-deadline') || null,
      category:    Utils.val('g-cat'),
      status:      Utils.val('g-status'),
      voices:      voices,
      date:        new Date().toISOString(),
    }).select().single();

    if (error) { UI.showToast('Error saving goal: ' + error.message, 'error'); return; }

    Goals._cache.unshift(data);
    Utils.setVal('g-title',''); Utils.setVal('g-desc','');
    Utils.setVal('g-deadline',''); Utils.setVal('g-status','Not Started');
    Voice.clearPending('g');
    Goals.render();
    UI.updateBadges();
    UI.showToast('Goal added! 🎯', 'success');
  },

  load: async () => {
    Utils.showLoading('goals-list', 'Loading goals...');
    const { data, error } = await sb
      .from('goals')
      .select('*')
      .eq('user_id', Auth.user.id)
      .order('date', { ascending: false });

    if (error) { UI.showToast('Could not load goals', 'error'); return; }
    Goals._cache = data || [];
    Goals.render();
  },

  updateStatus: async (id, status) => {
    const g = Goals._cache.find(x => x.id === id);
    if (g) g.status = status;
    const { error } = await sb.from('goals').update({ status }).eq('id', id);
    if (error) { UI.showToast('Update failed', 'error'); await Goals.load(); return; }
    // Re-style the select inline
    const sel = document.querySelector(`#entry-${id} .status-select`);
    if (sel) sel.className = `status-select ${Utils.statusSelCls(status)}`;
    UI.updateBadges();
  },

  delete: async (id) => {
    Goals._cache = Goals._cache.filter(x => x.id !== id);
    Goals.render();
    const { error } = await sb.from('goals').delete().eq('id', id);
    if (error) { UI.showToast('Delete failed', 'error'); await Goals.load(); }
    else { UI.showToast('Goal removed'); UI.updateBadges(); }
  },

  openEdit: (id) => {
    const g = Goals._cache.find(x => x.id === id);
    if (!g) return;
    const statuses = ['Not Started','In Progress','Completed','Paused'];
    const cats     = ['Career','Health','Finance','Learning','Personal','Relationships','Other'];
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
            ${cats.map(c=>`<option ${g.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Status</label>
          <select class="form-select" id="edit-g-status">
            ${statuses.map(s=>`<option ${g.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Deadline</label>
          <input class="form-input" id="edit-g-deadline" type="date" value="${g.deadline||''}"/>
        </div>
      </div>
      <div class="form-col">
        <label class="form-label">Motivation / Plan</label>
        <textarea class="form-textarea" id="edit-g-desc" style="min-height:80px">${Utils.esc(g.description||'')}</textarea>
      </div>`;
    UI._modalSaveFn = async () => {
      const updates = {
        title:       Utils.val('edit-g-title').trim() || g.title,
        category:    Utils.val('edit-g-cat'),
        status:      Utils.val('edit-g-status'),
        deadline:    Utils.val('edit-g-deadline') || null,
        description: Utils.val('edit-g-desc').trim() || null,
      };
      const { error } = await sb.from('goals').update(updates).eq('id', id);
      if (error) { UI.showToast('Update failed', 'error'); return; }
      Object.assign(g, updates);
      Goals.render();
      UI.showToast('Goal updated ✓', 'success');
      UI.closeModal();
    };
    UI.openModal();
  },

  render: () => {
    const filter = Utils.val('goals-filter') || 'all';
    let items = Goals._cache;
    if (filter === 'active')    items = items.filter(g => g.status!=='Completed'&&g.status!=='Paused');
    if (filter === 'completed') items = items.filter(g => g.status === 'Completed');

    const c = Utils.el('goals-list');
    if (!c) return;
    if (items.length === 0) {
      c.innerHTML = `<div class="empty-state">
        <span class="empty-icon">🎯</span>
        <div class="empty-title">No goals yet</div>
        <div class="empty-sub">Where do you want to be in 90 days?</div>
      </div>`; return;
    }
    c.innerHTML = items.map(g => Goals._card(g)).join('');
  },

  _card: (g) => {
    const voices   = Array.isArray(g.voices) ? g.voices : [];
    const statuses = ['Not Started','In Progress','Completed','Paused'];
    const hasDetails = g.description || voices.length > 0;
    return `
    <div class="entry-card ${g.status==='Completed'?'done-card':''}" id="entry-${g.id}">
      <div class="entry-row">
        <div class="entry-body">
          <div class="entry-title ${g.status==='Completed'?'strikethrough':''}">${Utils.esc(g.title)}</div>
          <div class="entry-meta">
            <select class="status-select ${Utils.statusSelCls(g.status)}" onchange="App.Goals.updateStatus('${g.id}',this.value)">
              ${statuses.map(s=>`<option ${g.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <span class="tag ${Utils.catTagCls(g.category||'Other')}">${g.category||'Other'}</span>
            ${Utils.deadlineHTML(g.deadline)}
            <span class="entry-date">${Utils.fmtDate(g.date)}</span>
          </div>
          ${hasDetails?`
            <button class="entry-expand" onclick="UI_toggleExpand('${g.id}')">▼ view details</button>
            <div class="entry-expanded-body" id="exp-${g.id}">
              ${g.description?`<p style="margin-bottom:${voices.length?'10px':'0'}">${Utils.esc(g.description)}</p>`:''}
              ${Voice.savedHTML(voices)}
            </div>`:''}
        </div>
        <div class="entry-actions">
          <button class="btn-icon" onclick="App.Goals.openEdit('${g.id}')">✏️</button>
          <button class="btn-icon danger" onclick="App.Goals.delete('${g.id}')">🗑️</button>
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
    const routines = Routine._cache;
    const ideas    = Ideas._cache;
    const goals    = Goals._cache;

    const todayR = routines.filter(r => Utils.isToday(r.date));
    const doneR  = todayR.filter(r => r.done).length;
    const rPct   = todayR.length > 0 ? Math.round(doneR/todayR.length*100) : 0;
    const done   = goals.filter(g => g.status==='Completed').length;
    const ip     = goals.filter(g => g.status==='In Progress').length;
    const gPct   = goals.length > 0 ? Math.round(done/goals.length*100) : 0;

    const name = Auth.profile?.full_name || Auth.user?.email?.split('@')[0] || 'there';
    Utils.el('overview-greeting').textContent = Utils.greeting(name);

    Utils.el('overview-content').innerHTML = `
    <div class="stats-grid">
      <div class="stat-tile"><div class="stat-num" style="color:var(--accent)">${routines.length}</div><div class="stat-label">Total Entries</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--gold)">${ideas.length}</div><div class="stat-label">Draft Ideas</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--accent3)">${goals.length}</div><div class="stat-label">Goals Set</div></div>
      <div class="stat-tile"><div class="stat-num" style="color:var(--success)">${done}</div><div class="stat-label">Goals Done</div></div>
    </div>

    <div class="overview-card">
      <div class="overview-card-title">Today's Routine</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text2)">${doneR} of ${todayR.length} completed</span>
        <span style="font-family:var(--font-mono);font-size:16px;color:var(--accent);font-weight:500">${rPct}%</span>
      </div>
      <div class="progress-bar" style="margin-bottom:12px"><div class="progress-fill" style="width:${rPct}%"></div></div>
      ${todayR.length===0
        ? '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text3)">No entries today yet.</p>'
        : todayR.slice(0,5).map(r=>`
          <div class="overview-row">
            <span>${r.done?'✅':'⬜'}</span>
            <span style="flex:1;font-size:14px;${r.done?'text-decoration:line-through;color:var(--text3)':''}">${Utils.esc(r.text)}</span>
            <span class="tag ${Utils.catTagCls(r.category)}">${r.category}</span>
          </div>`).join('')}
    </div>

    <div class="overview-card">
      <div class="overview-card-title">Goals Progress</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text2)">${gPct}% complete · ${ip} in progress</span>
        <span style="font-family:var(--font-mono);font-size:16px;color:var(--success);font-weight:500">${done}/${goals.length}</span>
      </div>
      <div class="progress-bar" style="margin-bottom:12px"><div class="progress-fill" style="width:${gPct}%;background:linear-gradient(90deg,var(--success),var(--accent))"></div></div>
      ${goals.filter(g=>g.status==='In Progress').slice(0,4).map(g=>`
        <div class="overview-row">
          <span class="tag tag-goal-ip">Active</span>
          <span style="flex:1;font-size:14px">${Utils.esc(g.title)}</span>
          ${Utils.deadlineHTML(g.deadline)}
        </div>`).join('') || '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text3)">No goals in progress.</p>'}
    </div>

    <div class="overview-card">
      <div class="overview-card-title">Recent Ideas</div>
      ${ideas.length===0
        ? '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text3)">No ideas captured yet.</p>'
        : ideas.slice(0,5).map(i=>`
          <div class="overview-row">
            <span class="tag tag-idea">${Utils.esc(i.tag)}</span>
            <span style="flex:1;font-size:14px">${Utils.esc(i.title)}</span>
            <span class="entry-date">${Utils.fmtDate(i.date)}</span>
          </div>`).join('')}
    </div>`;
  },
};

/* ═══════════════════════════════════════════════════════
   SEARCH MODULE
═══════════════════════════════════════════════════════ */
const Search = {
  _t: null,

  query: (q) => {
    clearTimeout(Search._t);
    const clear = Utils.el('search-clear');
    if (!q.trim()) { Search.clear(); return; }
    if (clear) clear.classList.remove('hidden');
    Search._t = setTimeout(() => Search._run(q.trim().toLowerCase()), 200);
  },

  _run: (q) => {
    const rHits = Routine._cache.filter(r => r.text?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q));
    const iHits = Ideas._cache.filter(i   => i.title?.toLowerCase().includes(q) || i.body?.toLowerCase().includes(q) || i.tag?.toLowerCase().includes(q));
    const gHits = Goals._cache.filter(g   => g.title?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q));

    const total = rHits.length + iHits.length + gHits.length;
    const label = Utils.el('search-results-label');
    const body  = Utils.el('search-results-body');
    const res   = Utils.el('search-results');
    if (label) label.textContent = `${total} result${total!==1?'s':''} for "${q}"`;

    let html = '';
    if (rHits.length) {
      html += `<div class="section-divider">Routine (${rHits.length})</div>`;
      html += rHits.map(r=>`
        <div class="entry-card" style="margin-bottom:8px">
          <div class="entry-title">${Utils.esc(r.text)}</div>
          <div class="entry-meta"><span class="tag ${Utils.catTagCls(r.category)}">${r.category}</span><span class="entry-date">${Utils.fmtDate(r.date)}</span></div>
        </div>`).join('');
    }
    if (iHits.length) {
      html += `<div class="section-divider">Ideas (${iHits.length})</div>`;
      html += iHits.map(i=>`
        <div class="entry-card" style="margin-bottom:8px">
          <div class="entry-title">${Utils.esc(i.title)}</div>
          <div class="entry-meta"><span class="tag tag-idea">${Utils.esc(i.tag)}</span><span class="entry-date">${Utils.fmtDate(i.date)}</span></div>
          ${i.body?`<div style="font-size:12px;color:var(--text2);margin-top:4px">${Utils.esc(i.body.substring(0,100))}${i.body.length>100?'...':''}</div>`:''}
        </div>`).join('');
    }
    if (gHits.length) {
      html += `<div class="section-divider">Goals (${gHits.length})</div>`;
      html += gHits.map(g=>`
        <div class="entry-card" style="margin-bottom:8px">
          <div class="entry-title">${Utils.esc(g.title)}</div>
          <div class="entry-meta"><span class="tag ${Utils.statusTagCls(g.status)}">${g.status}</span>${Utils.deadlineHTML(g.deadline)}</div>
        </div>`).join('');
    }
    if (total === 0) html = `<div class="empty-state" style="padding:24px"><span class="empty-icon" style="font-size:28px">🔍</span><div class="empty-sub">No results for "${Utils.esc(q)}"</div></div>`;

    if (body) body.innerHTML = html;
    if (res)  res.classList.remove('hidden');
  },

  clear: () => {
    Utils.el('search-results')?.classList.add('hidden');
    const si = Utils.el('global-search');
    if (si) si.value = '';
    Utils.el('search-clear')?.classList.add('hidden');
  },
};

/* ═══════════════════════════════════════════════════════
   DATA EXPORT / CLEAR
═══════════════════════════════════════════════════════ */
const Data = {
  exportAll: () => {
    const now = new Date();
    const ds  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const name = Auth.profile?.full_name || Auth.user?.email || 'User';

    let txt = `MINDVAULT EXPORT — ${name}\nExported: ${now.toLocaleString()}\n${'═'.repeat(60)}\n\n`;
    txt += `ROUTINES (${Routine._cache.length})\n${'-'.repeat(40)}\n`;
    Routine._cache.forEach(r => {
      txt += `[${r.done?'✓':' '}] ${r.text}\n    ${r.category} | ${new Date(r.date).toLocaleString()}\n\n`;
    });
    txt += `\nIDEAS (${Ideas._cache.length})\n${'-'.repeat(40)}\n`;
    Ideas._cache.forEach(i => {
      txt += `💡 ${i.title} [${i.tag}] [${i.status}]\n`;
      if (i.body) txt += `   ${i.body.replace(/\n/g,'\n   ')}\n`;
      txt += `   ${new Date(i.date).toLocaleString()}\n\n`;
    });
    txt += `\nGOALS (${Goals._cache.length})\n${'-'.repeat(40)}\n`;
    Goals._cache.forEach(g => {
      txt += `🎯 ${g.title} [${g.status}]\n`;
      if (g.description) txt += `   ${g.description.replace(/\n/g,'\n   ')}\n`;
      if (g.deadline) txt += `   Deadline: ${g.deadline}\n`;
      txt += `   ${new Date(g.date).toLocaleString()}\n\n`;
    });

    const a = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([txt],{type:'text/plain'}));
    a.download = `mindvault-${ds}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    UI.showToast('Data exported ⬇', 'success');
  },

  clearConfirm: () => {
    Utils.el('modal-title').textContent = '⚠ Clear All My Data';
    Utils.el('modal-body').innerHTML = `
      <p style="color:var(--text2);margin-bottom:16px;line-height:1.6">
        This will permanently delete <strong style="color:var(--danger)">all your routines, ideas, and goals</strong> from the cloud. This cannot be undone.
      </p>`;
    UI._modalSaveFn = async () => {
      const uid = Auth.user.id;
      await sb.from('routines').delete().eq('user_id', uid);
      await sb.from('ideas').delete().eq('user_id', uid);
      await sb.from('goals').delete().eq('user_id', uid);
      Routine._cache = []; Ideas._cache = []; Goals._cache = [];
      App.renderAll();
      UI.showToast('All data cleared', 'error');
      UI.closeModal();
    };
    Utils.el('modal-save').innerHTML = '<span>Yes, Delete Everything</span>';
    Utils.el('modal-save').style.background = 'var(--danger)';
    UI.openModal();
  },
};

/* ═══════════════════════════════════════════════════════
   UI MODULE
═══════════════════════════════════════════════════════ */
const UI = {
  currentTab:  'routine',
  _modalSaveFn: null,
  _theme:      'dark',
  _toastTimer: null,

  init: (name) => {
    Utils.el('nav-username').textContent  = name;
    Utils.el('nav-avatar').textContent    = name.charAt(0).toUpperCase();
    Utils.el('sb-avatar').textContent     = name.charAt(0).toUpperCase();
    Utils.el('sb-name').textContent       = name;
    Utils.el('routine-date-label').textContent = Utils.todayLabel();

    UI._theme = localStorage.getItem('mv_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', UI._theme);
    Utils.el('theme-btn').textContent = UI._theme==='dark' ? '🌙' : '☀️';

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape')                 { UI.closeModal(); Search.clear(); }
      if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); Utils.el('global-search')?.focus(); }
    });
  },

  switchTab: (name) => {
    if (UI.currentTab === name) { UI.closeSidebar(); return; }
    UI.closeSidebar();
    Search.clear();
    UI.currentTab = name;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    Utils.el(`tab-${name}`)?.classList.remove('hidden');
    document.querySelectorAll('.sb-item').forEach(b  => b.classList.toggle('active', b.dataset.tab===name));
    document.querySelectorAll('.mob-tab').forEach(b  => b.classList.toggle('active', b.dataset.tab===name));
    if (name === 'overview') Overview.render();
  },

  toggleSidebar: () => {
    const sb      = Utils.el('sidebar');
    const overlay = Utils.el('sidebar-overlay');
    const open    = sb.classList.toggle('open');
    overlay.classList.toggle('visible', open);
    document.body.style.overflow = open ? 'hidden' : '';
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
    Utils.el('theme-btn').textContent = UI._theme==='dark' ? '🌙' : '☀️';
  },

  toggleCard: (id) => {
    const card = Utils.el(id);
    if (!card) return;
    const body = card.querySelector('.card-body');
    const btn  = card.querySelector('.card-collapse');
    const col  = body?.classList.toggle('collapsed');
    if (btn) btn.textContent = col ? '+' : '−';
  },

  openModal: () => {
    Utils.el('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => Utils.el('modal')?.querySelector('input,textarea,select')?.focus(), 100);
  },

  closeModal: () => {
    Utils.el('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
    UI._modalSaveFn = null;
    Utils.el('modal-save').innerHTML = '<span>Save Changes</span>';
    Utils.el('modal-save').style.background = '';
  },

  saveModal: () => { if (UI._modalSaveFn) UI._modalSaveFn(); },

  updateBadges: () => {
    const pending = Routine._cache.filter(r => Utils.isToday(r.date) && !r.done).length;
    const active  = Goals._cache.filter(g => g.status==='In Progress').length;
    const rb = Utils.el('sb-routine-badge');
    const gb = Utils.el('sb-goals-badge');
    if (rb) rb.textContent = pending > 0 ? pending : '';
    if (gb) gb.textContent = active  > 0 ? active  : '';
  },

  showToast: (msg, type='default') => {
    const t = Utils.el('toast');
    t.textContent = msg;
    t.className = `toast ${type!=='default'?type:''} show`;
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  },
};

/* Global helpers for inline HTML onclick */
window.UI_toggleExpand = (id) => {
  const body = Utils.el(`exp-${id}`);
  const card = Utils.el(`entry-${id}`);
  const btn  = card?.querySelector('.entry-expand');
  if (!body) return;
  const open = body.classList.toggle('open');
  if (btn) btn.textContent = open ? '▲ hide details' : '▼ view details';
};

/* ═══════════════════════════════════════════════════════
   MAIN APP — load all data in parallel
═══════════════════════════════════════════════════════ */
const App = {
  Auth, Voice, Routine, Ideas, Goals, Overview, Search, UI, Data,

  renderAll: async () => {
    // Load all 3 tables from Supabase in parallel for speed
    await Promise.all([
      Routine.load(),
      Ideas.load(),
      Goals.load(),
    ]);
    UI.updateBadges();
  },

  init: () => Auth.init(),
};

window.App = App;
window.UI  = UI;

document.addEventListener('DOMContentLoaded', App.init);
