const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { POLICY_VERSION } = require('../src/policy');

// La política que ve el usuario (frontend) y la que exige el registro (backend) son la misma versión.
test('POLICY_VERSION coincide entre backend/src/policy.js y frontend/src/app/core/privacy.ts', () => {
  const ts = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'app', 'core', 'privacy.ts'), 'utf8');
  const m = ts.match(/export const POLICY_VERSION = '([^']+)'/);
  assert.ok(m, 'privacy.ts declara POLICY_VERSION');
  assert.equal(m[1], POLICY_VERSION);
});
