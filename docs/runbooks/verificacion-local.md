# Runbook · Verificación local y datos de prueba bajo demanda

**Para qué**: comprobar en tu máquina, antes de fusionar o desplegar, que Tendencias (005) se
comporta como se espera, y tener datos realistas para revisarla a mano.
**Script**: [`scripts/smoke-local.mjs`](../../scripts/smoke-local.mjs) (Node 22, sin dependencias
extra; funciona igual en Windows y Linux). `node scripts/smoke-local.mjs help` lista las opciones.

> Todo ocurre en `tmp/smoke/` (ignorado por git) con la cuenta de pruebas de
> `e2e/support/env.ts`. El sembrado **se niega a escribir fuera de localhost**.

## 1. Verificación automática (2 min)

```bash
node scripts/smoke-local.mjs run
```

Arranca un servidor con una base nueva, aplica las migraciones, da de alta al propietario de
pruebas, siembra 30 días y recorre el quickstart §3 por API.

**Resultado esperado**: `[migraciones] aplicadas: 1, 2, 3, 4, 5, 6, 7`, todas las líneas con `✔`,
`Todo correcto` y código de salida 0. Si una falla, la línea `✘` dice qué y con qué valor; el
servidor se para solo.

| Paso | Qué comprueba | Esperado |
|------|---------------|----------|
| 1 | Bienvenida | Cuenta nueva con `onboarded=false`; 13 h → 400; elegir 7 h 30 → objetivo 450 y bienvenida vista |
| 2 | Tendencias | 7/30/90 filas; días "sin dato" con total `null` (nunca 0); hoy "en curso"; "X de Y" coherente; pendiente 14 días; 3 atajos de ciclos entre 4 y 12 h; editar a 13 h → 400, con un atajo → 200 |
| 3 | Regularidad | Con ≥ 7 noches trae media y ±min; en un periodo sin noches, `null` ("Aún no hay datos suficientes") |
| Borde | Periodo | `days=14` → 400 "El periodo debe ser 7, 30 o 90 días" |

El paso 4 del quickstart (descripción y "Ver como tabla" de cada gráfico, contraste y sin rojo ni
verde) lo cubre la e2e `e2e/tests/tendencias.spec.ts`.

Opciones útiles: `--port 3996` si el 3995 está ocupado, `--days 90`, `--seed 7` (otros datos, igual
de reproducibles), `--tz -05:00`.

## 2. Revisión a mano en el navegador

```bash
node scripts/smoke-local.mjs serve --build --fresh
```

1. Abre la URL que imprime (por defecto `http://localhost:3995`) y entra con la cuenta de pruebas.
   Con `--fresh`, la primera entrada muestra **la bienvenida**: elige un atajo o "Saltar (7 h)".
2. Pestaña **Tendencias**: 3 indicadores, barras con la banda del objetivo, huecos punteados ("sin
   dato"), periodo 7/30/90, "Editar objetivo" (atajos, 13 h → error) y "Regularidad".
3. Pestaña **Noche**: la cinta tiene descripción en frases y "Ver como tabla".
4. `Ctrl+C` para parar. Sin `--fresh`, la base se conserva para la próxima vez.

`--build` compila el frontend (hace falta la primera vez o tras cambiarlo). `--no-seed` arranca
vacío. `--open-night` deja la noche de hoy abierta.

## 3. Sembrar datos bajo demanda

Con el servidor en marcha (paso 2), desde otra terminal:

```bash
node scripts/smoke-local.mjs seed --days 90 --metrics --open-night
```

- Añade noches (fecha de noche = día en que te acuestas), siestas cada `--nap-every` días, huecos
  cada `--gap-every` días y, con `--metrics`, valores de "Calidad del sueño".
- **No duplica**: los días que ya tienen noche se saltan (`skipped`). Repetirlo es seguro.
- Otra cuenta: `--email … --password …` (debe existir; el propietario se da de alta solo con el
  código `--token` del servidor local).
- Otro servidor local: `--url http://localhost:4000`. Un host remoto se rechaza.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| `El servidor no respondió en 30 s (¿puerto … ocupado?)` | Otro proceso en el puerto | `--port 3996` o cierra el otro servidor |
| `Entrar: 401` en `seed` | La base tiene otra contraseña o el propietario no es el de pruebas | `serve --fresh` o pasa `--email/--password` |
| `! No hay build del frontend` | Falta `frontend/dist` | Añade `--build` |
| Una línea `✘` en `run` | Regresión en la API de 005 | Corre `cd backend && npm test`, y revisa el detalle de la línea |

## Runbooks relacionados

- Producción: alta del propietario o código de alta perdido → [`recuperar-acceso.md`](recuperar-acceso.md).
- Una migración deja la base mal → [`rollback-migracion.md`](rollback-migracion.md).
- Restaurar un respaldo cifrado → [`restaurar-respaldo.md`](restaurar-respaldo.md).
