// web-push 4 es solo ESM: `require` devuelve un objeto de módulo inmutable. Esta copia plana permite
// que los tests sustituyan `sendNotification` sin enviar nada a la red.
module.exports = { ...require('web-push') };
