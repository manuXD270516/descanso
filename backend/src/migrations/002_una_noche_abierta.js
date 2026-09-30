// La base garantiza que como máximo hay una noche abierta (feature 003, FR-019/FR-020).
// Es aditiva (expand): la versión anterior ya respetaba la regla en código.
// NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).
module.exports = {
  up(db) {
    const open = db.prepare('SELECT id, date FROM sleep_records WHERE wake_time IS NULL ORDER BY id').all();
    if (open.length > 1) {
      const list = open.map((n) => `id ${n.id} del ${n.date}`).join(', ');
      throw new Error(
        `Hay ${open.length} noches abiertas (${list}) y solo puede haber una. ` +
          'Cierra o borra las sobrantes con la versión anterior de la app (o con flyctl ssh console) y vuelve a desplegar. ' +
          'No se modificó ningún dato.',
      );
    }
    db.exec('CREATE UNIQUE INDEX ux_sleep_one_open ON sleep_records(wake_time IS NULL) WHERE wake_time IS NULL');
  },
};
