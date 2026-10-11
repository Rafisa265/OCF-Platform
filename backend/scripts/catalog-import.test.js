'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const catalog = require('../migrations/catalog_data.json');
const {
  buildConnectionConfig,
  categorySlugFor,
  resolveMode,
  run,
  validateCatalog
} = require('./import-production-catalog');

function configEnv(overrides = {}) {
  return {
    OCF_CATALOG_IMPORT_DATABASE_URL: 'postgresql://test:secret@db.example.com:5432/ocf?sslmode=verify-full',
    OCF_CATALOG_IMPORT_ALLOWED_DATABASE_HOST: 'db.example.com',
    OCF_CATALOG_IMPORT_ALLOWED_DATABASE_NAME: 'ocf',
    ...overrides
  };
}

function mockClient(initialCounts = { categories: '0', products: '0' }) {
  const statements = [];
  let countQuery = 0;
  let categoryId = 0;
  const client = {
    statements,
    async connect() {},
    async query(sql, params = []) {
      statements.push(sql.trim());
      const placeholders = [...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
      assert.equal(params.length, Math.max(0, ...placeholders));
      if (sql.includes('SELECT COUNT(*)::text FROM categories')) {
        countQuery++;
        if (countQuery === 1) return { rows: [initialCounts] };
        return { rows: [{ categories: '5', products: '32' }] };
      }
      if (sql.startsWith('INSERT INTO categories')) {
        categoryId++;
        return { rows: [{ id: categoryId }] };
      }
      return { rows: [] };
    },
    async end() {}
  };
  return client;
}

test('tracked catalog validates and maps every product to an existing import category', () => {
  assert.equal(validateCatalog(), undefined);
  assert.equal(catalog.PRODUCTS.length, 32);
  for (const product of catalog.PRODUCTS) {
    assert.ok(categorySlugFor(product));
  }
});

test('catalog validation rejects duplicate product IDs', () => {
  assert.throws(
    () => validateCatalog([catalog.PRODUCTS[0], catalog.PRODUCTS[0]]),
    /invalid or duplicate product/
  );
});

test('catalog import defaults to dry-run and requires explicit approval to apply', () => {
  assert.equal(resolveMode(configEnv()), 'dry-run');
  assert.throws(
    () => resolveMode(configEnv({ OCF_CATALOG_IMPORT_MODE: 'apply' })),
    /OCF_CATALOG_IMPORT_APPROVED=YES/
  );
  assert.equal(resolveMode(configEnv({
    OCF_CATALOG_IMPORT_MODE: 'apply',
    OCF_CATALOG_IMPORT_APPROVED: 'YES'
  })), 'apply');
});

test('catalog connection requires independent host and database allowlists', () => {
  const config = buildConnectionConfig(configEnv());
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.throws(
    () => buildConnectionConfig(configEnv({
      OCF_CATALOG_IMPORT_ALLOWED_DATABASE_HOST: 'other.example.com'
    })),
    /hostname does not match/
  );
  assert.throws(
    () => buildConnectionConfig(configEnv({
      OCF_CATALOG_IMPORT_ALLOWED_DATABASE_NAME: 'other'
    })),
    /name does not match/
  );
});

test('catalog import rejects connection-string target overrides', () => {
  assert.throws(
    () => buildConnectionConfig(configEnv({
      OCF_CATALOG_IMPORT_DATABASE_URL:
        'postgresql://test:secret@db.example.com:5432/ocf?host=other.example.com'
    })),
    /must not override/
  );
});

test('dry-run validates the empty target and always rolls back without inserts', async () => {
  const client = mockClient();
  const previousExitCode = process.exitCode;
  try {
    await run(configEnv(), () => client);
    assert.ok(client.statements.some(sql => sql === 'ROLLBACK'));
    assert.ok(!client.statements.some(sql => sql.startsWith('INSERT INTO')));
    assert.ok(!client.statements.some(sql => sql === 'COMMIT'));
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('approved import inserts only categories and products in one transaction', async () => {
  const client = mockClient();
  const previousExitCode = process.exitCode;
  try {
    await run(configEnv({
      OCF_CATALOG_IMPORT_MODE: 'apply',
      OCF_CATALOG_IMPORT_APPROVED: 'YES'
    }), () => client);
    const inserts = client.statements.filter(sql => sql.startsWith('INSERT INTO'));
    assert.equal(inserts.filter(sql => sql.startsWith('INSERT INTO categories')).length, 5);
    assert.equal(inserts.filter(sql => sql.startsWith('INSERT INTO products')).length, 32);
    assert.ok(inserts.every(sql => sql.startsWith('INSERT INTO categories') || sql.startsWith('INSERT INTO products')));
    assert.ok(client.statements.includes('COMMIT'));
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('import refuses a nonempty catalog before any insert', async () => {
  const client = mockClient({ categories: '1', products: '0' });
  const previousExitCode = process.exitCode;
  try {
    await run(configEnv({
      OCF_CATALOG_IMPORT_MODE: 'apply',
      OCF_CATALOG_IMPORT_APPROVED: 'YES'
    }), () => client);
    assert.ok(client.statements.includes('ROLLBACK'));
    assert.ok(!client.statements.some(sql => sql.startsWith('INSERT INTO')));
    assert.ok(!client.statements.includes('COMMIT'));
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }
});
