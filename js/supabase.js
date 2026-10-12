// Supabase Authentication & Real-time Cloud Sync for Focus.
// Allows users to create an account with username & password,
// and sync focus sessions, categories, and settings instantly across laptop & mobile.
import { data, replaceAll, resetAll, save, saveSoon, on, emit } from './store.js';
import { SUPABASE_URL as DEF_URL, SUPABASE_ANON_KEY as DEF_KEY } from './config.js';

const KEY_URL = 'focus.supabase.url';
const KEY_KEY = 'focus.supabase.key';
const KEY_SESSION = 'focus.supabase.session';

const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

let syncState = 'idle'; // idle | syncing | synced | error | offline
let lastSyncTime = 0;
let lastError = '';
let syncTimer = 0;

let ws = null;
let heartbeatTimer = 0;
let reconnectTimer = 0;
let refId = 1;
let isRemoteUpdate = false;
let realtimeConnected = false;

export function getSupabaseConfig() {
  const url = (localStorage.getItem(KEY_URL) || DEF_URL || '').trim().replace(/\/+$/, '');
  const key = (localStorage.getItem(KEY_KEY) || DEF_KEY || '').trim();
  return { url, key };
}

export function setSupabaseConfig(url, key) {
  if (url) localStorage.setItem(KEY_URL, url.trim().replace(/\/+$/, ''));
  else localStorage.removeItem(KEY_URL);
  if (key) localStorage.setItem(KEY_KEY, key.trim());
  else localStorage.removeItem(KEY_KEY);
  emit('sync-status');
}

export function isConfigured() {
  const { url, key } = getSupabaseConfig();
  return !!url && !!key;
}

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(KEY_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(sess) {
  if (sess) localStorage.setItem(KEY_SESSION, JSON.stringify(sess));
  else localStorage.removeItem(KEY_SESSION);
  emit('sync-status');
}

export function currentUser() {
  const s = getStoredSession();
  if (!s || !s.user) return null;
  const meta = s.user.user_metadata || {};
  const email = s.user.email || '';
  const username = meta.username || (email.includes('@focus.app') ? email.split('@')[0] : email);
  return { id: s.user.id, email, username };
}

async function refreshSessionIfNeeded(sess) {
  if (!sess || !sess.refresh_token) return null;
  const now = Date.now();
  if (sess.expires_at && sess.expires_at > now + 120000) return sess;
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return sess;

  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sess.refresh_token }),
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) saveSession(null);
      return null;
    }
    const data = await res.json();
    const updated = {
      ...data,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    };
    saveSession(updated);
    return updated;
  } catch {
    return sess;
  }
}

function normalizeIdentity(identity) {
  const trimmed = identity.trim();
  if (trimmed.includes('@')) {
    return { email: trimmed.toLowerCase(), username: trimmed.split('@')[0] };
  }
  return { email: `${trimmed.toLowerCase()}@focus.app`, username: trimmed };
}

/* ---------- Supabase Realtime WebSocket (Instant Live Sync) ---------- */

export function connectRealtime() {
  const user = currentUser();
  const { url, key } = getSupabaseConfig();
  if (!user || !url || !key) return;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);

  const ref = url.replace(/^https?:\/\//, '').split('.')[0];
  const wsUrl = `wss://${ref}.supabase.co/realtime/v1/websocket?apikey=${key}&vsn=1.0.0`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    realtimeConnected = true;
    refId = 1;
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(refId++) }));
      }
    }, 25000);

    const topic = `realtime:focus_${user.id}`;
    ws.send(JSON.stringify({
      topic,
      event: 'phx_join',
      payload: { config: { broadcast: { self: false } } },
      ref: String(refId++),
    }));
    emit('sync-status');
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'broadcast') {
        const payload = msg.payload?.payload || msg.payload;
        if (payload) handleRealtimeBroadcast(payload);
      }
    } catch {}
  };

  ws.onclose = () => {
    realtimeConnected = false;
    clearInterval(heartbeatTimer);
    scheduleReconnect();
    emit('sync-status');
  };

  ws.onerror = () => {
    realtimeConnected = false;
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  if (currentUser()) {
    reconnectTimer = setTimeout(connectRealtime, 2500);
  }
}

export function disconnectRealtime() {
  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
  realtimeConnected = false;
}

function handleRealtimeBroadcast(payload) {
  if (!payload || payload.clientId === CLIENT_ID) return;

  if (payload.runners || payload.type === 'live_runner') {
    isRemoteUpdate = true;
    try {
      if (payload.runners) {
        for (const m of ['stopwatch', 'timer', 'pomodoro']) {
          const remote = payload.runners[m];
          if (!remote) continue;
          const local = data.runners[m];
          if (!local || (remote.touched || 0) >= (local.touched || 0) || remote.runStart != null) {
            data.runners[m] = { ...data.runners[m], ...remote, mode: m };
          }
        }
      }
      if (payload.cat && payload.cat !== data.settings.cat) {
        data.settings.cat = payload.cat;
      }
      if (payload.sessions && Array.isArray(payload.sessions)) {
        for (const s of payload.sessions) {
          if (!s || !s.id) continue;
          const idx = data.sessions.findIndex((x) => x.id === s.id);
          if (idx >= 0) data.sessions[idx] = s;
          else data.sessions.push(s);
        }
      }
      save();
      emit('runner');
      emit('change');
    } finally {
      isRemoteUpdate = false;
    }
  } else if (payload.data || payload.type === 'data_sync') {
    isRemoteUpdate = true;
    try {
      const syncData = payload.data || payload;
      if (syncData && (syncData.sessions || syncData.cats || syncData.settings)) {
        const cloudRunners = syncData.runners || syncData.settings?._runners || null;
        const merged = mergeUserData(data, {
          settings: syncData.settings,
          cats: syncData.cats,
          sessions: syncData.sessions,
          runners: cloudRunners,
        });
        replaceAll(merged);
        emit('change');
        emit('runner');
        emit('settings');
      }
    } finally {
      isRemoteUpdate = false;
    }
  }
}

export function broadcastLiveRunner() {
  if (isRemoteUpdate) return;
  const user = currentUser();
  if (!user || !ws || ws.readyState !== WebSocket.OPEN) return;

  const topic = `realtime:focus_${user.id}`;
  const runningSession = data.sessions.find((s) => s.run != null);
  const activeSessions = runningSession ? [runningSession] : data.sessions.slice(-3);

  ws.send(JSON.stringify({
    topic,
    event: 'broadcast',
    payload: {
      type: 'broadcast',
      event: 'runner_event',
      payload: {
        clientId: CLIENT_ID,
        type: 'live_runner',
        runners: data.runners,
        cat: data.settings.cat,
        sessions: activeSessions,
        sentAt: Date.now(),
      },
    },
    ref: String(refId++),
  }));
}

export function broadcastDataSync(fullData) {
  if (isRemoteUpdate) return;
  const user = currentUser();
  if (!user || !ws || ws.readyState !== WebSocket.OPEN) return;

  const topic = `realtime:focus_${user.id}`;
  ws.send(JSON.stringify({
    topic,
    event: 'broadcast',
    payload: {
      type: 'broadcast',
      event: 'data_event',
      payload: {
        clientId: CLIENT_ID,
        type: 'data_sync',
        data: {
          settings: fullData.settings,
          cats: fullData.cats,
          sessions: fullData.sessions,
          runners: fullData.runners || data.runners,
        },
        sentAt: Date.now(),
      },
    },
    ref: String(refId++),
  }));
}

/* ---------- Cloud Data Pull & Merge ---------- */

export async function pullCloudData(sess) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key || !sess) return null;

  try {
    const res = await fetch(`${url}/rest/v1/user_data?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${sess.access_token}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (rows && rows.length > 0 && rows[0]) {
      const row = rows[0];
      isRemoteUpdate = true;
      try {
        const merged = mergeUserData(data, {
          settings: row.settings || {},
          cats: row.cats || [],
          sessions: row.sessions || [],
          runners: row.settings?._runners || row.runners || null,
        });
        replaceAll(merged);
        emit('change');
        emit('runner');
        emit('settings');
      } finally {
        isRemoteUpdate = false;
      }
      return row;
    }
  } catch (e) {
    console.warn('Pull cloud data failed:', e);
  }
  return null;
}

function sessionLatestTime(s) {
  if (!s) return 0;
  let t = s.editedAt || s.start || 0;
  if (s.segs && s.segs.length) {
    for (const seg of s.segs) {
      if (seg && seg[1] && seg[1] > t) t = seg[1];
    }
  }
  return t;
}

function pickNewerSession(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aLatest = sessionLatestTime(a);
  const bLatest = sessionLatestTime(b);

  const aRunning = a.run != null;
  const bRunning = b.run != null;

  if (aRunning && !bRunning) {
    return bLatest >= a.run ? b : a;
  }
  if (!aRunning && bRunning) {
    return aLatest >= b.run ? a : b;
  }
  if (aRunning && bRunning) {
    return (a.run || 0) >= (b.run || 0) ? a : b;
  }
  const aEd = a.editedAt || aLatest;
  const bEd = b.editedAt || bLatest;
  return aEd >= bEd ? a : b;
}

export function mergeUserData(local, cloud) {
  if (!cloud) return local;

  const sessionMap = new Map();
  for (const s of cloud.sessions || []) {
    if (s && s.id) sessionMap.set(s.id, s);
  }
  for (const s of local.sessions || []) {
    if (!s || !s.id) continue;
    if (!sessionMap.has(s.id)) {
      sessionMap.set(s.id, s);
    } else {
      const existing = sessionMap.get(s.id);
      sessionMap.set(s.id, pickNewerSession(s, existing));
    }
  }
  const mergedSessions = Array.from(sessionMap.values()).sort((a, b) => (a.start || 0) - (b.start || 0));

  const catMap = new Map();
  for (const c of cloud.cats || []) {
    if (c && c.id) catMap.set(c.id, c);
  }
  for (const c of local.cats || []) {
    if (c && c.id && !catMap.has(c.id)) catMap.set(c.id, c);
  }
  const mergedCats = Array.from(catMap.values());

  const cloudSettings = { ...(cloud.settings || {}) };
  const cloudRunners = cloud.runners || cloudSettings._runners || null;
  delete cloudSettings._runners;
  const mergedSettings = { ...local.settings, ...cloudSettings };
  delete mergedSettings._runners;

  const mergedRunners = {};
  const MODES = ['stopwatch', 'timer', 'pomodoro'];
  for (const m of MODES) {
    const lr = local.runners?.[m];
    const cr = cloudRunners?.[m];
    if (lr && !cr) {
      mergedRunners[m] = lr;
    } else if (!lr && cr) {
      mergedRunners[m] = cr;
    } else if (lr && cr) {
      const lTouch = lr.touched || 0;
      const cTouch = cr.touched || 0;
      if (cTouch > lTouch) {
        mergedRunners[m] = cr;
      } else if (lTouch > cTouch) {
        mergedRunners[m] = lr;
      } else {
        mergedRunners[m] = (cr.runStart != null && lr.runStart == null) ? cr : lr;
      }
    } else {
      mergedRunners[m] = local.runners?.[m] || null;
    }
  }

  return {
    ...local,
    sessions: mergedSessions,
    cats: mergedCats.length ? mergedCats : local.cats,
    settings: mergedSettings,
    runners: mergedRunners,
  };
}

/* ---------- Authentication ---------- */

export async function signUp(identity, password) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('Supabase project URL and anon key are required');
  const { email, username } = normalizeIdentity(identity);

  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { username } }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error_description || body.msg || body.message || '';
    if (msg.toLowerCase().includes('already registered')) {
      throw new Error('This username is already taken. Please switch to Sign In.');
    }
    throw new Error(msg || 'Failed to create account');
  }

  if (body.access_token) {
    const sess = {
      ...body,
      expires_at: Date.now() + (body.expires_in || 3600) * 1000,
    };
    saveSession(sess);
    connectRealtime();
    sync({ silent: true });
    return { user: body.user, session: sess, autoLoggedIn: true };
  }
  return { user: body.user || body, session: null, autoLoggedIn: false };
}

export async function signIn(identity, password) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('Supabase project URL and anon key are required');
  const { email } = normalizeIdentity(identity);

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error_description || body.msg || body.message || '';
    if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
      throw new Error('Incorrect username or password. Check spelling or create a new ID.');
    }
    throw new Error(msg || 'Invalid username or password');
  }

  const sess = {
    ...body,
    expires_at: Date.now() + (body.expires_in || 3600) * 1000,
  };
  saveSession(sess);

  // Load account data fresh from cloud so we never stick with previous user's data
  const cloudRow = await pullCloudData(sess);
  if (!cloudRow) {
    await sync({ silent: true });
  }

  connectRealtime();
  emit('sync-status');
  return { user: body.user, session: sess };
}

export async function signOut() {
  disconnectRealtime();
  const sess = getStoredSession();
  const { url, key } = getSupabaseConfig();
  if (sess && url && key) {
    fetch(`${url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${sess.access_token}` },
    }).catch(() => {});
  }
  saveSession(null);
  resetAll();
  syncState = 'idle';
  lastError = '';
  emit('sync-status');
  emit('change');
  emit('runner');
  emit('settings');
}

/* ---------- Cloud Database Sync ---------- */

export async function sync(options = {}) {
  let sess = getStoredSession();
  if (!sess) {
    syncState = 'idle';
    emit('sync-status');
    return { ok: false, reason: 'not_logged_in' };
  }

  sess = await refreshSessionIfNeeded(sess);
  if (!sess) {
    syncState = 'error';
    lastError = 'Session expired, please sign in again';
    emit('sync-status');
    return { ok: false, reason: 'session_expired' };
  }

  const { url, key } = getSupabaseConfig();
  if (!url || !key) return { ok: false, reason: 'not_configured' };

  syncState = 'syncing';
  emit('sync-status');

  try {
    const getRes = await fetch(`${url}/rest/v1/user_data?select=*`, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${sess.access_token}` },
    });

    if (!getRes.ok) {
      const err = await getRes.json().catch(() => ({}));
      throw new Error(err.message || `Database error (${getRes.status})`);
    }

    const rows = await getRes.json();
    const cloudRow = rows && rows[0];

    isRemoteUpdate = true;
    let merged;
    try {
      merged = mergeUserData(data, {
        settings: cloudRow?.settings || {},
        cats: cloudRow?.cats || [],
        sessions: cloudRow?.sessions || [],
        runners: cloudRow?.settings?._runners || cloudRow?.runners || null,
      });
      replaceAll(merged);
    } finally {
      isRemoteUpdate = false;
    }

    const postRes = await fetch(`${url}/rest/v1/user_data`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${sess.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: sess.user.id,
        settings: { ...merged.settings, _runners: merged.runners },
        cats: merged.cats,
        sessions: merged.sessions,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!postRes.ok) {
      const err = await postRes.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to save to cloud');
    }

    syncState = 'synced';
    lastSyncTime = Date.now();
    lastError = '';
    emit('sync-status');
    return { ok: true, lastSyncTime };
  } catch (e) {
    if (!navigator.onLine) {
      syncState = 'offline';
      lastError = 'Offline - will sync when reconnected';
    } else {
      syncState = 'error';
      lastError = e.message || 'Sync failed';
    }
    emit('sync-status');
    return { ok: false, error: lastError };
  }
}

export function getSyncStatus() {
  return {
    state: syncState,
    lastSync: lastSyncTime,
    error: lastError,
    user: currentUser(),
    configured: isConfigured(),
    realtime: realtimeConnected,
  };
}

export function scheduleAutoSync() {
  if (!currentUser() || isRemoteUpdate) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    sync({ silent: true });
  }, 400);
}

export function initAutoSync() {
  // Live broadcast on runner updates
  on('runner', () => {
    if (!isRemoteUpdate && currentUser()) {
      broadcastLiveRunner();
    }
  });

  // Broadcast data changes & sync
  on('change', () => {
    if (!isRemoteUpdate && currentUser()) {
      broadcastLiveRunner();
      broadcastDataSync({
        settings: data.settings,
        cats: data.cats,
        sessions: data.sessions,
        runners: data.runners,
      });
      scheduleAutoSync();
    }
  });

  // Fast background polling fallback so devices are always in sync even if WebSockets sleep
  setInterval(() => {
    if (!document.hidden && currentUser() && !isRemoteUpdate) {
      sync({ silent: true });
    }
  }, 2500);

  window.addEventListener('online', () => {
    connectRealtime();
    sync({ silent: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser()) {
      connectRealtime();
      sync({ silent: true });
    }
  });

  if (currentUser()) {
    connectRealtime();
    setTimeout(() => sync({ silent: true }), 400);
  }
}
