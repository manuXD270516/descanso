const app = require('./app');
const { storageStatus } = require('./storage');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sleep tracker API escuchando en http://localhost:${PORT}`);
  storageStatus(); // avisa en el log si el volumen supera el 70 %
});
