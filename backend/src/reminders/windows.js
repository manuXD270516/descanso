// Ventana de descarte por tipo de aviso, en minutos (feature 013, research R2 y R5): pasada la ventana
// el aviso ya no tiene sentido y no se envía. Es también el TTL del envío, para que un aviso que no
// se entrega a tiempo caduque en el servicio de push y nunca aparezca tarde.
const WINDOW_MIN = { prepare: 10, bedtime: 10, wake_check: 60 };
const TEST_TTL_S = 60; // el aviso de prueba caduca en un minuto

const KINDS = Object.keys(WINDOW_MIN);
const ttlSeconds = (kind) => (kind === 'test' ? TEST_TTL_S : WINDOW_MIN[kind] * 60);

module.exports = { WINDOW_MIN, TEST_TTL_S, KINDS, ttlSeconds };
