/**
 * Política de privacidad de Descanso (feature 008, US6). Su versión debe coincidir con
 * backend/src/policy.js (lo comprueba un test). Si cambia el contenido de forma material, se
 * cambian ambas versiones.
 */
export const POLICY_VERSION = '2026-10-01';

/** Texto honesto sobre el acceso técnico de quien opera el servidor (FR-006). */
export const OPERATOR_NOTICE =
  'Nadie ve tus datos desde la app. Quien administra el servidor tiene acceso técnico a la base y a los respaldos, y se compromete a no usarlo.';

export const POLICY_SECTIONS: { title: string; text: string }[] = [
  {
    title: 'Qué datos guardamos',
    text:
      'Tu nombre visible, tu email, tu zona horaria y tu objetivo de sueño; las noches y siestas que registras ' +
      '(horas de dormir y despertar, notas) y los valores de tus métricas. Son datos de salud: los tratamos con especial cuidado.',
  },
  {
    title: 'Para qué',
    text: 'Solo para mostrarte tu propio historial, tus resúmenes y tus métricas. No se venden, no se comparten y no se usan para publicidad.',
  },
  { title: 'Quién puede verlos', text: OPERATOR_NOTICE },
  {
    title: 'Tus derechos',
    text:
      'Puedes exportar todos tus datos (JSON o CSV) desde el menú Cuenta, y borrar tu cuenta cuando quieras desde tu perfil. ' +
      'Al borrarla, tus datos desaparecen de la app al momento.',
  },
  {
    title: 'Respaldos',
    text:
      'Se hace una copia cifrada de la base cada día y se conserva 14 días. Si borras tu cuenta, tus datos desaparecen ' +
      'también de los respaldos en un máximo de 14 días.',
  },
  {
    title: 'Consentimiento',
    text:
      'Al registrarte aceptas este tratamiento de forma explícita. Si vives en la Unión Europea, se aplica el RGPD (art. 9, ' +
      'datos de salud); puedes retirar tu consentimiento borrando tu cuenta.',
  },
];
