/**
 * Enlaces de invitación y de recuperación (feature 008). El token va en el fragmento de la URL
 * (#invitacion=… / #restablecer=…), que el navegador nunca envía al servidor. Se lee una vez al
 * arrancar y se borra de la barra de direcciones para que no quede en el historial.
 */
export interface LinkTokens {
  invite: string | null;
  reset: string | null;
}

export function readLinkTokens(loc: Location = window.location, hist: History = window.history): LinkTokens {
  const params = new URLSearchParams(loc.hash.replace(/^#/, ''));
  const tokens = { invite: params.get('invitacion'), reset: params.get('restablecer') };
  if (tokens.invite || tokens.reset) hist.replaceState(null, '', loc.pathname + loc.search);
  return tokens;
}

/** Enlace completo para compartir, a partir de un token. */
export function linkFor(kind: 'invitacion' | 'restablecer', token: string, origin: string = window.location.origin): string {
  return `${origin}/#${kind}=${token}`;
}
