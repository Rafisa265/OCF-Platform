// test_upload.js — Integration tests for POST /api/admin/upload
// Run from: backend/  (node test_upload.js)
require('dotenv').config();
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const app   = require('./server');

const BASE = 'http://localhost:5001';  // isolated port so it does not clash

// ── Tiny in-memory test images ──────────────────────────────────────────────
// 1×1 JPEG
const JPEG_BUF = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc000110800010001030122003f003f00ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc40000ffc0001102000101040304020706030101000000000102030405060708090a0bffda000c03010002110311003f00ffd9',
  'hex'
);
// 1×1 PNG
const PNG_BUF  = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478016360f8cfc00000000200018e21bc330000000049454e44ae426082',
  'hex'
);
// 1×1 WebP
const WEBP_BUF = Buffer.from(
  '52494646240000005745425056503801180000003000000000000000000000000000fef8fe',
  'hex'
);
// Fake PDF masquerading as image
const FAKE_BUF = Buffer.from('%PDF-1.4 fake content that is not an image');

// ── HTTP multipart helper ────────────────────────────────────────────────────
function multipartRequest(url, token, buf, mimetype, filename) {
  return new Promise((resolve) => {
    const boundary = '----OCFTestBoundary' + Date.now();
    const bodyParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
      buf,
      `\r\n--${boundary}--\r\n`
    ];
    const body = Buffer.concat(bodyParts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', e => resolve({ status: 0, body: { error: e.message } }));
    req.write(body);
    req.end();
  });
}

function jsonRequest(url, method, body, token) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', e => resolve({ status: 0, body: { error: e.message } }));
    req.write(payload);
    req.end();
  });
}

async function getToken(email, password) {
  const r = await jsonRequest(`${BASE}/api/auth/login`, 'POST', { email, password });
  return r.body?.token || null;
}

// ── Test runner ──────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function assert(name, condition, detail = '') {
  if (condition) { console.log(`  ✅ PASS: ${name}`); passed++; }
  else           { console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

async function run() {
  const server = app.listen(5001);
  await new Promise(r => setTimeout(r, 800)); // let DB init

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔐 POST /api/admin/upload — Security & Functionality Tests');
  console.log('═══════════════════════════════════════════════════════\n');

  const adminToken = await getToken(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  assert('Admin login succeeded', !!adminToken);

  // Register a regular customer
  const ts = Date.now();
  await jsonRequest(`${BASE}/api/auth/register`, 'POST', { name: 'Test User', email: `upload_test_${ts}@ocf.com`, password: 'Password123!' });
  const customerToken = await getToken(`upload_test_${ts}@ocf.com`, 'Password123!');
  assert('Customer login succeeded', !!customerToken);

  console.log('\n── Authentication & Authorization ───────────────────');

  let r = await multipartRequest(`${BASE}/api/admin/upload`, null, JPEG_BUF, 'image/jpeg', 'test.jpg');
  assert('Unauthenticated request → 401', r.status === 401, `got ${r.status}`);

  r = await multipartRequest(`${BASE}/api/admin/upload`, customerToken, JPEG_BUF, 'image/jpeg', 'test.jpg');
  assert('Authenticated non-admin → 403', r.status === 403, `got ${r.status}`);

  console.log('\n── Valid file uploads ────────────────────────────────');

  r = await multipartRequest(`${BASE}/api/admin/upload`, adminToken, JPEG_BUF, 'image/jpeg', 'product.jpg');
  assert('JPEG upload → 201', r.status === 201, `got ${r.status}`);
  assert('JPEG response has url', r.body?.url?.startsWith('/uploads/'), `url=${r.body?.url}`);
  assert('JPEG filename has .jpg ext', r.body?.filename?.endsWith('.jpg'), `filename=${r.body?.filename}`);
  assert('JPEG original filename NOT exposed', !r.body?.url?.includes('product.jpg'), `url=${r.body?.url}`);
  const jpegFile = r.body?.filename;

  r = await multipartRequest(`${BASE}/api/admin/upload`, adminToken, PNG_BUF, 'image/png', 'product.png');
  assert('PNG upload → 201', r.status === 201, `got ${r.status}`);
  assert('PNG response has url', r.body?.url?.startsWith('/uploads/'), `url=${r.body?.url}`);

  r = await multipartRequest(`${BASE}/api/admin/upload`, adminToken, WEBP_BUF, 'image/webp', 'product.webp');
  assert('WebP upload → 201', r.status === 201, `got ${r.status}`);
  assert('WebP response has url', r.body?.url?.startsWith('/uploads/'), `url=${r.body?.url}`);

  console.log('\n── Invalid file types ────────────────────────────────');

  r = await multipartRequest(`${BASE}/api/admin/upload`, adminToken, FAKE_BUF, 'application/pdf', 'malicious.pdf');
  assert('PDF (wrong MIME) → rejected (4xx)', r.status >= 400 && r.status < 500, `got ${r.status}`);

  // Disguised: claim to be JPEG but magic bytes are fake/PDF
  r = await multipartRequest(`${BASE}/api/admin/upload`, adminToken, FAKE_BUF, 'image/jpeg', 'evil.jpg');
  assert('Fake JPEG (wrong magic bytes) → rejected', r.status === 415, `got ${r.status}`);

  console.log('\n── File size limit ───────────────────────────────────');

  const bigBuf = Buffer.concat([JPEG_BUF, Buffer.alloc(6 * 1024 * 1024)]); // ~6 MB
  r = await multipartRequest(`${BASE}/api/admin/upload`, adminToken, bigBuf, 'image/jpeg', 'huge.jpg');
  assert('File > 5 MB → 413', r.status === 413, `got ${r.status}`);

  console.log('\n── No file provided ──────────────────────────────────');

  r = await multipartRequest(`${BASE}/api/admin/upload`, adminToken, Buffer.alloc(0), 'image/jpeg', '');
  // empty body will either 400 (no file) or 415 (bad magic) — both correct
  assert('Empty upload → 4xx', r.status >= 400 && r.status < 500, `got ${r.status}`);

  console.log('\n── File accessibility ────────────────────────────────');
  if (jpegFile) {
    const accessUrl = `${BASE}/uploads/${jpegFile}`;
    const ok = await new Promise(resolve => {
      http.get(accessUrl, res => resolve(res.statusCode === 200)).on('error', () => resolve(false));
    });
    assert(`Uploaded file accessible at /uploads/${jpegFile}`, ok);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed / ${failed} failed`);
  if (!failed) console.log('🎉 ALL UPLOAD TESTS PASSED!');
  else console.log('⚠️  Some tests failed — review above.');
  console.log('═══════════════════════════════════════════════════════\n');

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
