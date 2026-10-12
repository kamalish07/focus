// Supabase Authentication & Real-time Cloud Sync for Focus.
// Allows users to create an account with username & password,
// and sync focus sessions, categories, and settings across laptop & mobile.
import { data, replaceAll, saveSoon, on, emit } from './store.js';
import { SUPABASE_URL as DEF_URL, SUPABASE_ANON_KEY as DEF_KEY } from './config.js';

const KEY_URL = 'focus.supabase.url';
const KEY_KEY = 'focus.supabase.key';
const KEY_SESSION = 'focus.supabase.session';

let syncState = 'idle'; // idle | syncing | synced | error | offline
let lastSyncTime = 0;
let lastError = '';
let syncTimer = 0;

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
  // Refresh if expiring within 2 minutes
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
    return { email: trimmed, username: trimmed.split('@')[0] };
  }
  return { email: `${trimmed.toLowerCase()}@focus.app`, username: trimmed };
}

export async function signUp(identity, password) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('Supabase project URL and anon key are required');
  const { email, username } = normalizeIdentity(identity);

  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      data: { username },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description || body.msg || body.message || 'Failed to create account');

  if (body.access_token) {
    const sess = {
      ...body,
      expires_at: Date.now() + (body.expires_in || 3600) * 1000,
    };
    saveSession(sess);
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
  if (!res.ok) throw new Error(body.error_description || body.msg || body.message || 'Invalid username or password');

  const sess = {
    ...body,
    expires_at: Date.now() + (body.expires_in || 3600) * 1000,
  };
  saveSession(sess);
  sync({ silent: true });
  return { user: body.user, session: sess };
}

export async function signOut() {
  const sess = getStoredSession();
  const { url, key } = getSupabaseConfig();
  if (sess && url && key) {
    fetch(`${url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${sess.access_token}` },
    }).catch(() => {});
  }
  saveSession(null);
  syncState = 'idle';
  lastError = '';
  emit('sync-status');
}

export function mergeUserData(local, cloud) {
  if (!cloud) return local;

  // 1. Sessions: Union by id, keeping latest edited or recorded
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
      const localTime = s.editedAt || s.start || 0;
      const existingTime = existing.editedAt || existing.start || 0;
      if (localTime >= existingTime) sessionMap.set(s.id, s);
    }
  }
  const mergedSessions = Array.from(sessionMap.values()).sort((a, b) => (a.start || 0) - (b.start || 0));

  // 2. Categories: Union by id
  const catMap = new Map();
  for (const c of cloud.cats || []) {
    if (c && c.id) catMap.set(c.id, c);
  }
  for (const c of local.cats || []) {
    if (c && c.id && !catMap.has(c.id)) catMap.set(c.id, c);
  }
  const mergedCats = Array.from(catMap.values());

  // 3. Settings: overlay cloud settings on top of local
  const mergedSettings = { ...local.settings, ...(cloud.settings || {}) };

  return {
    ...local,
    sessions: mergedSessions,
    cats: mergedCats.length ? mergedCats : local.cats,
    settings: mergedSettings,
  };
}

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
    // 1. Fetch remote data from user_data table
    const getRes = await fetch(`${url}/rest/v1/user_data?select=*`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${sess.access_token}`,
      },
    });

    if (!getRes.ok) {
      const err = await getRes.json().catch(() => ({}));
      throw new Error(err.message || `Database error (${getRes.status})`);
    }

    const rows = await getRes.json();
    const cloudRow = rows && rows[0];

    // 2. Merge local and cloud data
    const merged = mergeUserData(data, cloudRow);
    replaceAll(merged);

    // 3. Push merged data back to cloud
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
        settings: merged.settings,
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
  };
}

export function scheduleAutoSync() {
  if (!currentUser()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    sync({ silent: true });
  }, 4000);
}

export function initAutoSync() {
  on('change', () => scheduleAutoSync());
  window.addEventListener('online', () => sync({ silent: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser()) sync({ silent: true });
  });
  if (currentUser()) {
    setTimeout(() => sync({ silent: true }), 1000);
  }
}
