process.env.APP_VERSION = 'abc123';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('./helpers');

test('GET /api/health expone la versión desplegada (FR-018)', async () => {
  const res = await api.get('/api/health').expect(200);
  assert.equal(res.body.version, 'abc123');
});
