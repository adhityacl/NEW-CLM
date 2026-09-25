/**
 * Demo-dataset login accounts are removed completely (production boot, empty-workspace reset).
 * Run: npx tsx --test tests/demoAccounts.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { DEMO_ACCOUNT_EMAILS, removeDemoAccounts } from '../src/server/demoAccounts';

function authDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE "user" (id TEXT PRIMARY KEY, email TEXT);
    CREATE TABLE session (id TEXT, userId TEXT);
    CREATE TABLE account (id TEXT, userId TEXT);
    CREATE TABLE member (id TEXT, userId TEXT);
    CREATE TABLE teamMember (id TEXT, userId TEXT);
  `);
  const add = (id: string, email: string) => {
    db.prepare(`INSERT INTO "user" VALUES (?, ?)`).run(id, email);
    for (const t of ['session', 'account', 'member', 'teamMember']) db.prepare(`INSERT INTO ${t} VALUES (?, ?)`).run(`${t}-${id}`, id);
  };
  add('admin', 'admin@silegal.com');
  add('real', 'owner@company.com');
  add('usr-demo-sg-legal', 'Legal.SG@example.com');
  add('usr-demo-id-fin', 'finance.id@example.com');
  return db;
}

const count = (db: Database.Database, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;

test('the six demo dataset accounts are the ones targeted', () => {
  assert.equal(DEMO_ACCOUNT_EMAILS.size, 6);
  for (const email of DEMO_ACCOUNT_EMAILS) assert.ok(email.endsWith('@example.com'), email);
});

test('removes demo logins with their sessions, credentials and memberships; keeps everyone else', () => {
  const db = authDb();
  const allowedUsers = [
    { id: 'admin', email: 'admin@silegal.com' },
    { id: 'real', email: 'owner@company.com' },
    { id: 'usr-demo-sg-legal', email: 'legal.sg@example.com' },
    { id: 'usr-demo-jp-legal', email: 'legal.jp@example.com' },
  ];
  const result = removeDemoAccounts(db, allowedUsers);
  assert.equal(result.removed, 2, 'case-insensitive email match');
  assert.deepEqual(result.allowedUsers.map((u) => u.id), ['admin', 'real']);
  assert.deepEqual((db.prepare(`SELECT id FROM "user" ORDER BY id`).all() as { id: string }[]).map((r) => r.id), ['admin', 'real']);
  for (const table of ['session', 'account', 'member', 'teamMember']) assert.equal(count(db, table), 2, table);
  assert.equal(removeDemoAccounts(db, result.allowedUsers).removed, 0, 'idempotent');
});

test('never removes the acting user', () => {
  const db = authDb();
  const result = removeDemoAccounts(db, [{ id: 'usr-demo-id-fin', email: 'finance.id@example.com' }], 'usr-demo-id-fin');
  assert.equal(result.removed, 1);
  assert.deepEqual(result.allowedUsers.map((u) => u.id), ['usr-demo-id-fin']);
  assert.ok(db.prepare(`SELECT 1 FROM "user" WHERE id = 'usr-demo-id-fin'`).get());
});
