const { test } = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('./helpers');

// Meta-test de esquema (feature 008, SC-002, constitución v2.0.0): toda tabla con datos pertenece a
// un usuario o está clasificada aquí con su justificación. Una tabla nueva sin clasificar falla.
const SYSTEM = new Set(['schema_migrations', 'auth_setup', 'sqlite_sequence']);
const IDENTITY = new Set(['users']);
const CHILD = {
  metric_entries: 'pertenece al usuario a través de metrics.user_id (FK ON DELETE CASCADE)',
  invites: 'creada por el propietario (created_by) y usada por un usuario (used_by), ambas FK a users',
  schedule_days: 'pertenece al usuario a través de schedule_versions.user_id (FK ON DELETE CASCADE) (feature 010)',
};

test('toda tabla tiene user_id o está clasificada (sistema, identidad o hija justificada)', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
  const unclassified = tables.filter((t) => {
    if (SYSTEM.has(t) || IDENTITY.has(t) || CHILD[t]) return false;
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    return !cols.includes('user_id');
  });
  assert.deepEqual(unclassified, [], `tablas sin user_id ni clasificación: ${unclassified.join(', ')}`);
});

test('las columnas user_id son NOT NULL y referencian users con borrado en cascada', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const t of tables) {
    const col = db.prepare(`PRAGMA table_info(${t})`).all().find((c) => c.name === 'user_id');
    if (!col) continue;
    assert.equal(col.notnull + (col.pk ? 1 : 0) > 0, true, `${t}.user_id debe ser NOT NULL`);
    const fk = db.prepare(`PRAGMA foreign_key_list(${t})`).all().find((f) => f.from === 'user_id');
    assert.ok(fk && fk.table === 'users' && fk.on_delete === 'CASCADE', `${t}.user_id → users ON DELETE CASCADE`);
  }
});

test('las hijas justificadas realmente cuelgan de su padre con cascada', () => {
  const fk = db.prepare('PRAGMA foreign_key_list(metric_entries)').all().find((f) => f.from === 'metric_id');
  assert.equal(fk.table, 'metrics');
  assert.equal(fk.on_delete, 'CASCADE');
  const days = db.prepare('PRAGMA foreign_key_list(schedule_days)').all().find((f) => f.from === 'version_id');
  assert.equal(days.table, 'schedule_versions');
  assert.equal(days.on_delete, 'CASCADE');
  const inv = db.prepare('PRAGMA foreign_key_list(invites)').all();
  assert.ok(inv.some((f) => f.from === 'used_by' && f.table === 'users' && f.on_delete === 'CASCADE'));
});
