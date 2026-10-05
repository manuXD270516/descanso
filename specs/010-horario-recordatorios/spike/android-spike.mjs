// Spike de 010 en el emulador de Android: utilidades de adb para importar los archivos de prueba,
// inspeccionar el proveedor de calendario (CalendarContract) y guardar evidencias.
//
// Uso (con el emulador arrancado):
//   node android-spike.mjs shot <nombre>          captura de pantalla → evidence/<nombre>.png
//   node android-spike.mjs ui <nombre>            jerarquía de la UI → evidence/<nombre>.xml
//   node android-spike.mjs events <nombre>        eventos del proveedor → evidence/<nombre>.txt (y por pantalla)
//   node android-spike.mjs push <archivo.ics>     copia el archivo a /sdcard/Download/
//   node android-spike.mjs alarms <nombre>        alarmas de calendario programadas (dumpsys)
//   node android-spike.mjs notif <nombre>         notificaciones activas (dumpsys notification)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = join(HERE, 'evidence');
mkdirSync(EVIDENCE, { recursive: true });
const ADB = join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const adb = (...args) => execFileSync(ADB, args, { maxBuffer: 64 * 1024 * 1024 });
const sh = (cmd) => adb('shell', cmd).toString('utf8');

const [command, arg] = process.argv.slice(2);
const save = (name, content) => {
  const file = join(EVIDENCE, name);
  writeFileSync(file, content);
  return file;
};

switch (command) {
  case 'shot':
    console.log(save(`${arg}.png`, adb('exec-out', 'screencap', '-p')));
    break;
  case 'ui':
    sh('uiautomator dump /sdcard/ui.xml');
    console.log(save(`${arg}.xml`, adb('exec-out', 'cat', '/sdcard/ui.xml')));
    break;
  case 'push':
    adb('push', arg, `/sdcard/Download/${basename(arg)}`);
    console.log(`/sdcard/Download/${basename(arg)}`);
    break;
  case 'events': {
    const out = sh(
      'content query --uri content://com.android.calendar/events --projection _id:calendar_id:title:dtstart:rrule:deleted:uid2445:eventStatus:hasAlarm',
    );
    const rows = out.split('\n').filter((l) => l.startsWith('Row:'));
    const live = rows.filter((r) => !/deleted=1/.test(r));
    const text = `${new Date().toISOString()}\nfilas: ${rows.length}, no borradas: ${live.length}\n${out}`;
    save(`${arg}.txt`, text);
    console.log(text);
    break;
  }
  case 'alarms': {
    const out = sh('dumpsys alarm');
    const lines = out.split('\n').filter((l) => /etar|calendar/i.test(l));
    console.log(save(`${arg}.txt`, lines.join('\n')));
    console.log(lines.slice(0, 20).join('\n'));
    break;
  }
  case 'notif': {
    const out = sh('dumpsys notification --noredact');
    const blocks = out.split(/\n(?=\s+NotificationRecord)/).filter((b) => /etar|calendar/i.test(b));
    console.log(save(`${arg}.txt`, blocks.join('\n')));
    console.log(blocks.map((b) => b.split('\n').filter((l) => /pkg=|android\.title|android\.text|when=/.test(l)).join('\n')).join('\n---\n'));
    break;
  }
  case 'tap': {
    // Toca el primer elemento cuyo text o content-desc contiene `arg` (sin distinguir mayúsculas)
    sh('uiautomator dump /sdcard/ui.xml');
    const xml = adb('exec-out', 'cat', '/sdcard/ui.xml').toString('utf8');
    const nodes = [...xml.matchAll(/<node [^>]*>/g)].map((m) => m[0]);
    const needle = arg.toLowerCase();
    const node = nodes.find((n) => {
      const t = (n.match(/ text="([^"]*)"/)?.[1] ?? '').toLowerCase();
      const d = (n.match(/content-desc="([^"]*)"/)?.[1] ?? '').toLowerCase();
      return t.includes(needle) || d.includes(needle);
    });
    if (!node) {
      console.error(`No encontrado: ${arg}`);
      process.exit(1);
    }
    const [, x1, y1, x2, y2] = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).map(Number);
    sh(`input tap ${Math.round((x1 + x2) / 2)} ${Math.round((y1 + y2) / 2)}`);
    console.log(`tap "${arg}" en ${Math.round((x1 + x2) / 2)},${Math.round((y1 + y2) / 2)}`);
    break;
  }
  case 'texts': {
    sh('uiautomator dump /sdcard/ui.xml');
    const xml = adb('exec-out', 'cat', '/sdcard/ui.xml').toString('utf8');
    const texts = [...xml.matchAll(/(?: text|content-desc)="([^"]+)"/g)].map((m) => m[1]);
    console.log([...new Set(texts)].join(' | '));
    break;
  }
  default:
    console.log('Comandos: shot | ui | push | events | alarms | notif | tap <texto> | texts');
}
