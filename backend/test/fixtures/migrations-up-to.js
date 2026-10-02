// Carpeta temporal con las migraciones hasta una versión (incluida). Sirve para que las pruebas de
// compatibilidad de una feature comprueben el esquema de SU momento: la versión anterior solo
// tiene que funcionar sobre el esquema de la versión siguiente, no sobre los posteriores
// (expand/contract: cada contracción ocurre cuando la versión vieja ya no es desplegable).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'src', 'migrations');

function migrationsUpTo(version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `descanso-mig-${version}-`));
  for (const f of fs.readdirSync(SRC).filter((f) => Number(f.slice(0, 3)) <= version)) {
    fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
  }
  return dir;
}

module.exports = { migrationsUpTo };
