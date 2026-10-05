# Quickstart: validar la feature 011

## 1. Puertas automáticas

```bash
cd backend && npm test && npm run lint
cd frontend && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build
cd e2e && npm test
```

Incluyen:
- `migrations-010.test.js` y `compat-previous-011.test.js` (código de 010 sobre el esquema nuevo);
- `streak-engine.test.js`: reglas de [`data-model.md`](data-model.md) (tabla de estados), asignación de
  noches después de medianoche, margen, tolerancia y corte, pausa, "Anotado después", propiedades de
  SC-001 con semilla y rendimiento de 3.650 noches (SC-002);
- `streak.test.js`: `GET /api/streak` sin efectos y sin cálculo con la racha desactivada, ajustes,
  trinquete del récord, del total y de los logros al cerrar o editar una noche, logro visto (contrato en
  [`contracts/openapi-delta.yaml`](contracts/openapi-delta.yaml));
- `isolation.test.js`, `schema-isolation.test.js`, `export.test.js` y `delete-account.test.js`
  ampliados;
- `forbidden-terms.test.js` con las palabras de culpa de 011;
- specs de frontend: textos de `core/streak.ts`, línea tras "Ya desperté", panel de Tendencias, tarjeta
  con `role="status"` y movimiento reducido, oferta, ajustes y ausencia de la racha en la pantalla de
  acostarse y en el aviso;
- e2e `rachas.spec.ts`.

## 2. Rendimiento del cálculo

```bash
cd backend && node --test --test-name-pattern="3.650" test/streak-engine.test.js
```

Mediana de 5 ejecuciones < 20 ms (SC-002).

## 3. Verificación local y manual

```bash
node scripts/smoke-local.mjs run          # regresión de lo existente
node scripts/smoke-local.mjs serve --build --fresh
```

Horario de 23:00 a 7:00 todos los días; las noches se siembran con fechas relativas a hoy (el servidor
usa su reloj real para el trinquete).

1. Con 3 noches cerradas, "Ya desperté" → tarjeta "¿Quieres llevar una racha de constancia?";
   "Ahora no" → no vuelve; Cuenta → Mi horario → activarla.
2. Noche de 23:10 a 7:10 → tras "Ya desperté": "Día 1 de constancia ★". En Noche, sin noche abierta,
   ningún rastro de la racha.
3. Noche de 0:15 a 7:00 → estrella apagada en Tendencias → Constancia, con "Te acostaste a las 0:15
   (fuera de tu horario)", sin rojo.
4. Sembrar 6 días cumplidos y cerrar el séptimo → tarjeta "Constelación de 7 días" con "tu hora de
   levantarte varió solo ±X min"; descartarla → no vuelve; editar una de esas noches → la constelación
   sigue en la colección.
5. Pausa desde hoy sin registrar → estrella "En pausa"; la racha no se corta.
6. Desactivar la racha → nada de la racha en Noche ni en Tendencias; reactivarla → el récord sigue.
