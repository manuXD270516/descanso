// Disparador en proceso de los avisos (feature 013, research R1): un tick inmediato al arrancar (recupera
// lo que siga en ventana tras un despliegue) y otro cada 30 s. Si un tick sigue en curso, el siguiente
// se salta; un tick que falla se registra y no detiene el disparador.
const DEFAULT_INTERVAL_MS = 30_000;

let active = 0; // disparadores en marcha (la salud de administración lo consulta)
const isRunning = () => active > 0;

/**
 * @param {() => Promise<void>} tick
 * @param {{ intervalMs?: number }} [opts]
 * @returns {{ stop: () => void }}
 */
function startWaker(tick, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  let running = false;
  let stopped = false;

  async function run() {
    if (running || stopped) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error(`Disparador de avisos: el tick falló: ${err.message}`);
    } finally {
      running = false;
    }
  }

  active++;
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.(); // no retiene el proceso al cerrar

  return {
    stop() {
      if (!stopped) active--;
      stopped = true;
      clearInterval(timer);
    },
  };
}

module.exports = { startWaker, isRunning, DEFAULT_INTERVAL_MS };
