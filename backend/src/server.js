const app = require('./app');
const db = require('./db');
const { storageStatus } = require('./storage');
const { bootstrap } = require('./auth/bootstrap');

bootstrap(db); // si OWNER_SETUP_TOKEN cambió, reabre el alta del propietario (feature 004)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sleep tracker API escuchando en http://localhost:${PORT}`);
  storageStatus(); // avisa en el log si el volumen supera el 70 %
});
