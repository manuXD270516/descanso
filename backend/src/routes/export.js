// Exportar mis datos (feature 004, US5): JSON versionado y un CSV por tipo de dato.
// Nunca incluye usuarios, contraseñas, sesiones ni el código de alta (FR-024).
const { Router } = require('express');
const db = require('../db');
const { HttpError } = require('../util');

const r = Router();

const QUERIES = {
  sleep_records: 'SELECT id, date, bedtime, wake_time, notes, created_at FROM sleep_records ORDER BY id',
  naps: 'SELECT id, date, start_time, end_time, notes, created_at FROM naps ORDER BY id',
  metrics: 'SELECT id, name, type, unit, min_value, max_value, color, sort_order, archived, created_at FROM metrics ORDER BY id',
  metric_entries: 'SELECT id, metric_id, date, value, created_at FROM metric_entries ORDER BY id',
};

// Un CSV por tipo, con cabeceras en español (aclaración del 2026-09-30)
const CSV = {
  noches: { table: 'sleep_records', headers: ['id', 'fecha_noche', 'hora_dormir', 'hora_despertar', 'notas', 'creado'] },
  siestas: { table: 'naps', headers: ['id', 'fecha', 'inicio', 'fin', 'notas', 'creado'] },
  metricas: { table: 'metrics', headers: ['id', 'nombre', 'tipo', 'unidad', 'minimo', 'maximo', 'color', 'orden', 'archivada', 'creado'] },
  valores: { table: 'metric_entries', headers: ['id', 'metrica_id', 'fecha', 'valor', 'creado'] },
};

const today = () => new Date().toISOString().slice(0, 10);

/** Campo CSV según RFC 4180: comillas si hay coma, comillas o salto de línea. */
function csvField(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

r.get('/export.json', (_req, res) => {
  const out = { format: 'descanso-export', version: 1, exported_at: new Date().toISOString() };
  for (const [key, sql] of Object.entries(QUERIES)) out[key] = db.prepare(sql).all();
  res.set('Content-Disposition', `attachment; filename="descanso-${today()}.json"`);
  res.json(out);
});

r.get('/export/:tipo.csv', (req, res) => {
  const def = CSV[req.params.tipo];
  if (!def) throw new HttpError(404, 'Tipo de exportación desconocido');
  const rows = db.prepare(QUERIES[def.table]).raw().all();
  const lines = [def.headers.join(','), ...rows.map((row) => row.map(csvField).join(','))];
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="descanso-${req.params.tipo}-${today()}.csv"`);
  res.send('﻿' + lines.join('\r\n') + '\r\n'); // BOM: Excel reconoce los acentos
});

module.exports = r;
