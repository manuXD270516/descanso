const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('./helpers');

test('GET /api/health indica que el servicio está operativo (FR-029)', async () => {
  const res = await api.get('/api/health').expect(200);
  assert.equal(res.body.ok, true);
  assert.ok(!Number.isNaN(Date.parse(res.body.time)));
});
