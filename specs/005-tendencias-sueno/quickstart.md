# Quickstart: validar la feature 005

## 1. Puertas automáticas

```bash
cd backend && npm test && npm run lint
cd frontend && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build
cd e2e && npm test
```

Incluyen:
- `analytics.test.js` (funciones puras con fixtures: huecos, medianoche, neto, regularidad, ciclos);
- `dashboard.test.js` (contrato, 400, aislamiento);
- `migrations-006-007.test.js` (contracción sin pérdidas, objetivo 7 h);
- compatibilidad con 008;
- e2e `tendencias.spec.ts` (datos sembrados, tablas alternativas y contraste).

## 2. Compatibilidad con la versión anterior

Imagen de master (008) sobre una base migrada por 005: entrar, registrar una noche, invitar y ver el
perfil sin errores (`compat008` del ensayo de 008, adaptado).

## 3. Manual en local

1. Entra y verás la **bienvenida**: elige "7 h 30 (5 ciclos)" o "Saltar".
2. Siembra datos con noches y siestas de 30 días (con huecos) y abre **Tendencias**:
   - los días sin registro aparecen como "sin dato"; la noche abierta, como "en curso";
   - "Días con tus horas objetivo: X de Y" y "Te faltan … en los últimos 14 días (N días registrados)";
   - cambia el periodo a 7 y a 90 días;
   - "Editar objetivo": atajos de ciclos y 13 h → mensaje de error.
3. "Regularidad" con menos de 7 noches → "Aún no hay datos suficientes".
4. Con lector de pantalla (o el árbol de accesibilidad): cada gráfico tiene descripción y
   "Ver como tabla"; también la cinta de Noche.

## 4. Producción

`flyctl logs` → `[migraciones] aplicadas: 6, 7`. El propietario ve la bienvenida tras su alta.
