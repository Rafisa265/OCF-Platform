'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  cleanupStagingClient,
  connectStagingClient,
  validateContiguousPrefixes,
  listMigrations,
  validateMigrationHistory,
  validateTrackingTable
} = require('./migrate-staging');
const { StagingGuardError, createStagingClient } = require('./staging-db');

function expectGuardFailure(action, message) {
  assert.throws(action, error => error instanceof Error && error.message.includes(message));
}

const migrationFiles = [
  '001_initial_schema.sql',
  '002_checkout_idempotency.sql',
  '003_multilingual_catalog.sql'
];

function verifyStagingConnectionGuard() {
  const originalValues = {
    OCF_STAGING_ONLY: process.env.OCF_STAGING_ONLY,
    OCF_STAGING_DATABASE_URL: process.env.OCF_STAGING_DATABASE_URL,
    OCF_STAGING_ALLOWED_DATABASE_HOST: process.env.OCF_STAGING_ALLOWED_DATABASE_HOST,
    OCF_STAGING_ALLOWED_DATABASE_NAME: process.env.OCF_STAGING_ALLOWED_DATABASE_NAME
  };

  try {
    process.env.OCF_STAGING_ONLY = 'YES';
    process.env.OCF_STAGING_DATABASE_URL =
      'postgresql://local-test:placeholder@ep-small-violet-b5aitvum.c-7.us-east-2.aws.neon.tech/neondb?sslmode=verify-full';
    process.env.OCF_STAGING_ALLOWED_DATABASE_HOST = 'ep-small-violet-b5aitvum.c-7.us-east-2.aws.neon.tech';
    process.env.OCF_STAGING_ALLOWED_DATABASE_NAME = 'neondb';
    assert.doesNotThrow(() => createStagingClient());

    process.env.OCF_STAGING_DATABASE_URL =
      'postgresql://local-test:placeholder@ep-small-violet-b5aitvum-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=verify-full';
    process.env.OCF_STAGING_ALLOWED_DATABASE_HOST =
      'ep-small-violet-b5aitvum-pooler.c-7.us-east-2.aws.neon.tech';
    assert.throws(
      () => createStagingClient(),
      error => error instanceof StagingGuardError && error.message.includes('Direct endpoint')
    );
  } finally {
    for (const [name, value] of Object.entries(originalValues)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

verifyStagingConnectionGuard();

function verifyMigrationFiles() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ocf-staging-migrations-'));
  const createFixture = (name, files) => {
    const fixtureDirectory = path.join(temporaryDirectory, name);
    fs.mkdirSync(fixtureDirectory);
    for (const file of files) {
      fs.writeFileSync(path.join(fixtureDirectory, file), '');
    }
    return fixtureDirectory;
  };

  try {
    const validDirectory = createFixture('valid', [
      '003_multilingual_catalog.sql',
      '001_initial_schema.sql',
      '002_checkout_idempotency.sql'
    ]);
    assert.deepEqual(listMigrations(validDirectory), migrationFiles);

    expectGuardFailure(
      () => listMigrations(createFixture('malformed', ['1_initial_schema.sql'])),
      'Invalid or duplicate'
    );
    expectGuardFailure(
      () => listMigrations(createFixture('duplicate-prefix', [
        '001_initial_schema.sql',
        '001_initial_schema_copy.sql'
      ])),
      'Invalid or duplicate'
    );
    expectGuardFailure(
      () => listMigrations(createFixture('missing-prefix', [
        '001_initial_schema.sql',
        '003_multilingual_catalog.sql'
      ])),
      'prefix 002 is missing'
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

verifyMigrationFiles();

assert.doesNotThrow(() => validateContiguousPrefixes(['001', '002', '003']));
assert.doesNotThrow(() => validateContiguousPrefixes(['008']));
expectGuardFailure(
  () => validateContiguousPrefixes(['001', '003']),
  'prefix 002 is missing'
);

assert.deepEqual(
  [...validateMigrationHistory(migrationFiles, [
    { version: '001', name: '001_initial_schema.sql' },
    { version: '002', name: '002_checkout_idempotency.sql' }
  ])],
  ['001', '002']
);
expectGuardFailure(
  () => validateMigrationHistory(migrationFiles, [
    { version: '001', name: '001_initial_schema.sql' },
    { version: '001', name: '001_initial_schema.sql' }
  ]),
  'duplicate version'
);
expectGuardFailure(
  () => validateMigrationHistory(migrationFiles, [
    { version: '004', name: '004_unknown.sql' }
  ]),
  'unknown version'
);
expectGuardFailure(
  () => validateMigrationHistory(migrationFiles, [
    { version: '001', name: '001_wrong_name.sql' }
  ]),
  'does not match'
);
expectGuardFailure(
  () => validateMigrationHistory(migrationFiles, [
    { version: '002', name: '002_checkout_idempotency.sql' }
  ]),
  'has a gap'
);
expectGuardFailure(
  () => validateMigrationHistory(migrationFiles, [
    { version: '1', name: '001_initial_schema.sql' }
  ]),
  'invalid version'
);
expectGuardFailure(
  () => validateMigrationHistory(migrationFiles, [
    { version: 1, name: '001_initial_schema.sql' }
  ]),
  'invalid version'
);

const validColumns = [
  { column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: "nextval('schema_migrations_id_seq'::regclass)" },
  { column_name: 'version', data_type: 'character varying', character_maximum_length: 255, is_nullable: 'NO', column_default: null },
  { column_name: 'name', data_type: 'character varying', character_maximum_length: 255, is_nullable: 'NO', column_default: null },
  { column_name: 'applied_at', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: 'now()' }
];
const validConstraints = [
  { constraint_type: 'PRIMARY KEY', table_schema: 'public', table_name: 'schema_migrations', columns: ['id'] },
  { constraint_type: 'UNIQUE', table_schema: 'public', table_name: 'schema_migrations', columns: ['version'] }
];

assert.doesNotThrow(() => validateTrackingTable(validColumns, validConstraints));
expectGuardFailure(
  () => validateTrackingTable(validColumns.slice(1), validConstraints),
  'incompatible column set'
);
expectGuardFailure(
  () => validateTrackingTable(validColumns, [{ constraint_type: 'PRIMARY KEY', columns: ['id'] }]),
  'unexpected or ambiguous constraints'
);
expectGuardFailure(
  () => validateTrackingTable(validColumns, [
    validConstraints[0],
    { ...validConstraints[1], table_name: 'other_table' }
  ]),
  'unexpected or ambiguous constraints'
);
expectGuardFailure(
  () => validateTrackingTable(validColumns, [
    ...validConstraints,
    { constraint_type: 'CHECK', table_schema: 'public', table_name: 'schema_migrations', columns: [null] }
  ]),
  'unexpected or ambiguous constraints'
);

async function verifyCleanup() {
  const events = [];
  const noLockClient = {
    query: async () => events.push('query'),
    end: async () => events.push('end')
  };
  assert.deepEqual(await cleanupStagingClient(noLockClient, false), []);
  assert.deepEqual(events, ['end']);

  events.length = 0;
  const lockClient = {
    query: async () => events.push('unlock'),
    end: async () => events.push('end')
  };
  assert.deepEqual(await cleanupStagingClient(lockClient, true), []);
  assert.deepEqual(events, ['unlock', 'end']);

  events.length = 0;
  const failingUnlockClient = {
    query: async () => {
      events.push('unlock');
      throw new Error('connection details must not escape');
    },
    end: async () => events.push('end')
  };
  assert.deepEqual(
    await cleanupStagingClient(failingUnlockClient, true),
    ['Could not confirm release of the staging migration advisory lock.']
  );
  assert.deepEqual(events, ['unlock', 'end']);

  events.length = 0;
  const failedConnectClient = {
    connect: async () => {
      events.push('connect');
      throw new Error('connection details must not escape');
    },
    end: async () => events.push('end')
  };
  assert.deepEqual(await connectStagingClient(failedConnectClient), {
    connected: false,
    cleanupFailures: []
  });
  assert.deepEqual(events, ['connect', 'end']);
}

verifyCleanup().then(() => {
  console.log('Staging migration validation and cleanup checks passed.');
}).catch(error => {
  console.error(error);
  console.error('Staging migration validation and cleanup checks failed.');
  process.exitCode = 1;
});
