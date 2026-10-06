// assets/js/api.js — Production-Safe API Client & Utilities
const _rawCustomApi = (typeof window !== 'undefined' && window.__OCF_API_URL__)
  ? String(window.__OCF_API_URL__).trim().replace(/\/+$/, '')
  : null;

const API = _rawCustomApi
  ? (_rawCustomApi.endsWith('/api') ? _rawCustomApi : `${_rawCustomApi}/api`)
  : (typeof window !== 'undefined' && window.location.port === '5000'
      ? '/api'
      : (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? `${window.location.protocol}//${window.location.hostname}:5000/api`
          : '/api'));

// ── MEDIA URL RESOLVER ──
const API_HOST = API.replace(/\/api\/?$/, '');

function getMediaUrl(path) {
  if (!path) return '';
  if (typeof path !== 'string') return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  return `${API_HOST}${path.startsWith('/') ? '' : '/'}${path}`;
}

// ── GLOBAL XSS PROTECTION HELPER ──
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── API HELPER ──
async function api(path, opts = {}) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof S !== 'undefined' && S.token) headers['Authorization'] = `Bearer ${S.token}`;
    const res = await fetch(API + path, { headers, ...opts });
    return await res.json();
  } catch { return null; }
}