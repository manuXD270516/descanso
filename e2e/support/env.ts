/** Puerto del servidor compartido (solo lectura); los tests que escriben levantan el suyo. */
export const SHARED_PORT = Number(process.env.E2E_PORT ?? 3100);
export const SHARED_URL = `http://127.0.0.1:${SHARED_PORT}`;

/** Zona horaria fija de los tests: -04:00 todo el año (sin horario de verano). */
export const TIMEZONE = 'America/La_Paz';
export const OFFSET = '-04:00';
