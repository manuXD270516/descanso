// Prueba del spike de Huawei Health sobre una exportación sintética (feature 007, requisito previo).
// Uso: node --test scripts/spike-huawei.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { generar } from './fixtures/huawei-sintetico/generar.mjs';

const SPIKE = fileURLToPath(new URL('./spike-huawei.mjs', import.meta.url));

describe('spike-huawei sobre la exportación sintética', () => {
  let tmp;
  let datos;
  let salida;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), 'spike-huawei-'));
    datos = generar(join(tmp, 'exportacion'));
    salida = spawnSync(process.execPath, [SPIKE, datos.raiz], { encoding: 'utf8' });
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  it('termina bien y detecta las fases, los milisegundos y la repetición', () => {
    assert.equal(salida.status, 0, salida.stderr);
    const out = salida.stdout;
    for (const fase of ['ligero', 'profundo', 'rem', 'despierto', 'siesta']) {
      assert.match(out, new RegExp(`^  ${fase}: [1-9]`, 'm'), `fase ${fase}`);
    }
    assert.match(out, /PROFESSIONAL_SLEEP_DEEP/);
    assert.match(out, /Escala detectada: milisegundos$/m);
    assert.match(out, /Tramos únicos presentes en más de un archivo: [1-9]/);
    assert.match(out, /Umbral 30 min: 3 sesiones/);
    assert.match(out, /¿Se pueden obtener noches con fases\? SÍ/);
  });

  it('no imprime ninguna marca de tiempo, fecha, hora ni identificador de la fixture', () => {
    const out = salida.stdout;
    for (const m of datos.marcas) {
      assert.ok(!out.includes(String(m)), `aparece la marca ${m}`);
      assert.ok(!out.includes(new Date(m).toISOString().slice(0, 10)), 'aparece una fecha ISO');
    }
    assert.doesNotMatch(out, /\d{9,}/);
    assert.doesNotMatch(out, /\d{4}-\d{2}-\d{2}/);
    assert.doesNotMatch(out, /\b\d{1,2}:\d{2}\b/);
    assert.doesNotMatch(out, /2031/);
    assert.doesNotMatch(out, /DISPOSITIVO-SINTETICO|Persona Sintetica/);
  });

  it('con --salida guarda el informe en el archivo y no lo repite en la consola', () => {
    const archivo = join(tmp, 'informe.txt');
    const r = spawnSync(process.execPath, [SPIKE, datos.raiz, '--salida', archivo], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /Veredicto/);
    assert.match(readFileSync(archivo, 'utf8'), /Veredicto del criterio de salida/);
  });

  it('sin carpeta o con una carpeta inexistente falla con código 2', () => {
    assert.equal(spawnSync(process.execPath, [SPIKE], { encoding: 'utf8' }).status, 2);
    assert.equal(spawnSync(process.execPath, [SPIKE, join(tmp, 'no-existe')], { encoding: 'utf8' }).status, 2);
  });

  it('con una carpeta sin sueño el veredicto es NO', () => {
    const vacia = join(tmp, 'sin-sueno');
    generar(vacia);
    for (const f of ['Health detail data & description.json', 'Health detail data & description 2.json']) {
      rmSync(join(vacia, 'Health detail data & description', f));
    }
    const r = spawnSync(process.execPath, [SPIKE, vacia], { encoding: 'utf8' });
    assert.match(r.stdout, /¿Se pueden obtener noches con fases\? NO/);
  });
});
