# Quickstart: validar la feature 006

## 1. Puertas automáticas

```bash
cd backend && npm test && npm run lint
cd frontend && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build
cd e2e && npm test
```

Incluyen:
- `migrations-008.test.js`: columnas nuevas con sus valores por defecto, CHECK, idempotencia y sin
  pérdida de noches;
- `compat-previous-006.test.js`: el código de 005 sobre el esquema nuevo;
- `diary.test.js`: respuestas de la tarjeta por `PUT /api/sleep/:id`, 400, `null` borra, ajenas → 404;
- `me.test.js`: ajustes de ciclo y sus rangos;
- `forbidden-terms.test.js`: ningún término de `docs/sdd/terminos-prohibidos.txt` en la interfaz;
- exportación con las columnas nuevas, y aislamiento con las respuestas;
- specs de frontend: `wakeWindows` (medianoche y cambio de offset con zona fija), insignias,
  `blockOrigin`, aviso de noche abierta, tarjeta y sección "Fases" con y sin importación;
- e2e `diario-ciclos.spec.ts`.

## 2. Compatibilidad con la versión anterior

Imagen de master (005) sobre una base migrada por 006: entrar, registrar y cerrar una noche, editar
el perfil y exportar sin errores (el ensayo `compat005-docker.js` de 005, adaptado).

## 3. Verificación local

```bash
node scripts/smoke-local.mjs run    # incluye las comprobaciones de 006 (T026)
node scripts/smoke-local.mjs serve --build --fresh
```

Ver [`docs/runbooks/verificacion-local.md`](../../docs/runbooks/verificacion-local.md). A mano:

1. Noche: bajo "¿Hora de dormir?" hay 3 ventanas con la insignia "Estimado" y el texto "estimación,
   no medición…". Cambia la hora a 23:00: con 90/15 se ven 5:15, 6:45 y 8:15 (± 15 min) y
   "mañana".
2. "Ajustar" → ciclo 100, dormirte 20 → las ventanas cambian; recarga → se conservan. Ciclo 120 →
   error con el rango.
3. Tendencias → "Editar objetivo": los atajos usan ciclos de 100 min.
4. "Me voy a dormir" → "Ya desperté" (1 toque cada uno) → aparece "¿Cómo fue la noche?": elige
   "15–30" y "1–2"; edita la noche y cambia o borra una respuesta; exporta el CSV de noches.
5. Siembra una noche abierta hace 15 h (`seed --open-night` con la hora ajustada) → al abrir:
   "¿Olvidaste marcar que despertaste?" con hora de dormir + objetivo.
6. En Noche, Tendencias y Siestas se ve "No es un dispositivo médico" y la insignia "Anotado por
   ti" en las cabeceras; en Métricas y Cuenta no hay aviso.
7. Tendencias → "Fases": "Descanso aún no importa datos de relojes", sin gráficos.
