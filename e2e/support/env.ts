/** Puerto del servidor compartido (solo lectura); los tests que escriben levantan el suyo. */
export const SHARED_PORT = Number(process.env.E2E_PORT ?? 3100);
export const SHARED_URL = `http://127.0.0.1:${SHARED_PORT}`;

/** Zona horaria fija de los tests: -04:00 todo el año (sin horario de verano). */
export const TIMEZONE = 'America/La_Paz';
export const OFFSET = '-04:00';

/**
 * Credenciales de prueba de la feature 004. Solo existen en los servidores efímeros de la e2e
 * (bases temporales en localhost); no son credenciales reales de ningún entorno.
 */
export const SETUP_TOKEN = 'e2e-codigo-de-alta';
export const OWNER_EMAIL = 'propietario@descanso.test';
export const OWNER_PASSWORD = 'una frase de prueba larga';
/** Versión de la política de privacidad (feature 008); igual que backend/src/policy.js. */
export const POLICY_VERSION = '2026-10-01';
/** Segunda persona de prueba (feature 008). */
export const GUEST_EMAIL = 'invitada@descanso.test';
export const GUEST_PASSWORD = 'otra frase de prueba larga';
