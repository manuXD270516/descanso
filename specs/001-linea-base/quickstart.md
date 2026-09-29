# Quickstart: validar la línea base

Guía para comprobar que la feature 001 está completa. Referencias: [spec](./spec.md),
[contrato](./contracts/openapi.yaml), [modelo de datos](./data-model.md).

## Requisitos

- Node.js 22 LTS y npm.
- Chrome o Chromium, para las pruebas de componente con Karma en modo headless.

## 1. Instalar

```bash
cd backend && npm ci
cd ../frontend && npm ci
```

## 2. Puertas de calidad (principio IV)

```bash
cd backend && npm run lint && npm test
cd frontend && npm run lint && npx ng test --watch=false --browsers=ChromeHeadless
cd frontend && npx ng build
```

**Resultado esperado**: 0 errores de lint, todas las pruebas en verde y el build de producción
sin errores.

Las pruebas deben cubrir, como mínimo:

| Área | Qué se comprueba | Referencia |
|------|------------------|------------|
| Fecha de noche | ≥ 3 casos: 23:40 → mismo día; 00:30 → ese día; offsets distintos | FR-004, SC-003 |
| Noche abierta única | POST sin despertar con otra abierta → 409; PUT con `wake_time: null` con otra abierta → 409 | FR-003 |
| Cierre de noche | wake ≤ bedtime → 400; sin noche abierta → 404 | US1 |
| Resumen | media 7 h / 8 h → 450 min; media circular 23:30 / 00:30 → 0 | US4 |
| Métricas | 3 métricas iniciales; escala inválida → 400; `Mínimo 0`; upsert por día; borrado en cascada | US5 |
| Persistencia | datos presentes tras reabrir la misma base | US6 |

## 3. Comprobación manual de extremo a extremo

```bash
cd frontend && npx ng build
cd ../backend && DB_PATH=./data/quickstart.db npm start
```

Abrir http://localhost:3000:

1. **Noche**: pulsar "Me voy a dormir" y verificar "Te acostaste a las HH:MM". Pulsar
   "Ya desperté" y verificar que aparece el registro con su duración.
2. **Noche abierta única**: con una noche abierta, ejecutar
   `curl -X POST localhost:3000/api/sleep -H 'Content-Type: application/json' -d '{"date":"2026-09-01","bedtime":"2026-09-01T23:00:00+00:00"}'`
   y esperar un **409** con un mensaje en español.
3. **Siestas**: guardar la siesta propuesta (30 min) y ver "1 siesta · 30 min" en el grupo de
   hoy.
4. **Métricas**: pulsar 4 en "Calidad del sueño" y verlo en la columna de hoy del historial;
   archivar la métrica y restaurarla.
5. **Persistencia**: detener el servidor (Ctrl+C), volver a arrancarlo con el mismo `DB_PATH`
   y recargar: los datos siguen ahí.
6. **Salud**: `curl localhost:3000/api/health` → `{"ok":true,...}`.

Al terminar, borrar `backend/data/quickstart.db*`.
