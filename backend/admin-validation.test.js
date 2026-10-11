'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { normalizeOptionalText, parseProductPrice } = require('./input-validation');

test('optional text treats missing and blank values consistently', () => {
  assert.equal(normalizeOptionalText(undefined), null);
  assert.equal(normalizeOptionalText(null), null);
  assert.equal(normalizeOptionalText(''), null);
  assert.equal(normalizeOptionalText('   '), null);
  assert.equal(normalizeOptionalText(' Afaan Oromoo '), 'Afaan Oromoo');
  assert.equal(normalizeOptionalText(12), undefined);
});

test('product prices accept finite non-negative numeric values', () => {
  assert.equal(parseProductPrice(0), 0);
  assert.equal(parseProductPrice('0'), 0);
  assert.equal(parseProductPrice(' 12.50 '), 12.5);
  assert.equal(parseProductPrice('.5'), 0.5);
  assert.equal(parseProductPrice('1e3'), 1000);
});

test('product prices reject missing, blank, invalid, negative, and non-finite values', () => {
  for (const value of [
    undefined, null, '', '   ', 'not-a-number', '1.2.3', '-1', '-1e2',
    Infinity, -Infinity, NaN, 'Infinity', '-Infinity', 'NaN',
    10000000000
  ]) {
    assert.equal(parseProductPrice(value), null, `expected ${String(value)} to be rejected`);
  }
});

test('database-mutating integration tests fail before startup if admin credentials are missing', () => {
  for (const script of [
    'test_product_delete.js',
    'full_stack_test.js',
    'smoke_test.js',
    'test_security_audit.js'
  ]) {
    const scriptPath = path.join(__dirname, script);
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: __dirname,
      encoding: 'utf8',
      env: { ...process.env, ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }
    });
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1, `${script} should exit before startup`);
    assert.match(output, /ADMIN_EMAIL and ADMIN_PASSWORD are required/);
    assert.doesNotMatch(output, /password\s*[:=]/i);
  }
});
