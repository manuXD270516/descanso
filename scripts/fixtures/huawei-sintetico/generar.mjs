// Genera una exportación SINTÉTICA mínima con la forma que documentan fuentes públicas para la
// exportación de Huawei Health (carpeta "Health detail data & description", JSON con registros que
// llevan "samplePoints" con claves PROFESSIONAL_SLEEP_*, marcas de tiempo en milisegundos).
// No es una exportación real: las fechas, los dispositivos y los valores son inventados.
// Contenido: 3 noches con fases (ligero, profundo, REM, despierto), 1 siesta, un registro ajeno
// al sueño, y tramos repetidos entre los 2 archivos de datos.
//
// Uso: node scripts/fixtures/huawei-sintetico/generar.mjs <carpeta-destino>
//   (el test la usa en una carpeta temporal; no se versionan datos generados)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN = 60_000;

// Tres noches y una siesta, en fechas inventadas (UTC). Devuelve los tramos con su fase.
function tramosDeNoche(inicioMs, minutosPorFase) {
  const tramos = [];
  let t = inicioMs;
  for (const [fase, min] of minutosPorFase) {
    tramos.push({ key: `PROFESSIONAL_SLEEP_${fase}`, startTime: t, endTime: t + min * MIN, value: '1' });
    t += min * MIN;
  }
  return tramos;
}

export function generar(destino) {
  const raiz = resolve(destino);
  const dir = join(raiz, 'Health detail data & description');
  mkdirSync(dir, { recursive: true });

  const ciclo = [['LIGHT', 40], ['DEEP', 50], ['LIGHT', 30], ['REM', 25], ['AWAKE', 5], ['LIGHT', 60], ['DEEP', 30], ['REM', 40]];
  const noche1 = tramosDeNoche(Date.UTC(2031, 2, 4, 23, 10), ciclo);
  const noche2 = tramosDeNoche(Date.UTC(2031, 2, 5, 23, 40), ciclo.slice(1));
  const noche3 = tramosDeNoche(Date.UTC(2031, 2, 6, 22, 55), ciclo);
  const siesta = [{ key: 'PROFESSIONAL_SLEEP_NAP', startTime: Date.UTC(2031, 2, 5, 14, 0), endTime: Date.UTC(2031, 2, 5, 14, 35), value: '1' }];

  const registro = (tramos) => ({
    deviceCode: 'DISPOSITIVO-SINTETICO',
    type: 'SLEEP_RECORD',
    startTime: tramos[0].startTime,
    endTime: tramos[tramos.length - 1].endTime,
    samplePoints: tramos,
  });
  const pasos = { deviceCode: 'DISPOSITIVO-SINTETICO', type: 'STEPS', startTime: Date.UTC(2031, 2, 5, 9, 0), endTime: Date.UTC(2031, 2, 5, 9, 30), samplePoints: [{ key: 'STEP_COUNT', value: '1234' }] };

  // Archivo 1: noches 1 y 2, la siesta y un registro ajeno. Archivo 2: noche 2 repetida,
  // noche 3, y la siesta repetida (los tramos repetidos son idénticos, como en una exportación real).
  writeFileSync(join(dir, 'Health detail data & description.json'), JSON.stringify([registro(noche1), registro(noche2), registro(siesta), pasos]));
  writeFileSync(join(dir, 'Health detail data & description 2.json'), JSON.stringify([registro(noche2), registro(noche3), registro(siesta)]));
  // Un archivo ajeno y un CSV sin sueño, para comprobar la tolerancia.
  writeFileSync(join(raiz, 'Personal information.json'), JSON.stringify({ nombre: 'Persona Sintetica', idioma: 'es' }));
  writeFileSync(join(raiz, 'Otros.csv'), 'metrica,valor\npasos,10\n');

  return {
    raiz,
    // Para que el test compruebe que ninguna marca de tiempo ni fecha sale en el informe.
    marcas: [...noche1, ...noche2, ...noche3, ...siesta].flatMap((t) => [t.startTime, t.endTime]),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destino = process.argv[2];
  if (!destino) {
    process.stderr.write('Uso: node scripts/fixtures/huawei-sintetico/generar.mjs <carpeta-destino>\n');
    process.exit(2);
  }
  generar(destino);
  process.stdout.write(`Exportación sintética creada en ${resolve(destino)}\n`);
}
