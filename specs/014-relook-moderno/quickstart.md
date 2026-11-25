# Quickstart: validar la feature 014

## 1. Puertas automáticas

```bash
# backend (CSP, fecha de la noche, aislamiento de dos usuarios, términos prohibidos)
cd backend && npm ci && npm run lint && npm test

# frontend
cd ../frontend && npm ci && npm run lint
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build
node ../scripts/check-styles.mjs     # CSS ≤ 10 kB / 3 kB gzip, sin colores literales ni px en font-size

# e2e (axe en ambos temas, 200 %, 44 px, sin terceros, diálogo propio)
cd ../e2e && npm ci && npm run typecheck && npx playwright test
```

## 2. Presupuestos (anotar en el PR)

| Recurso | Límite | Master (2026-11-25) | 014 |
|---------|--------|---------------------|-----|
| `styles-*.css` crudo / gzip | 10 kB / 3 kB | 2,79 kB / 1,13 kB | |
| Fuente `woff2` | 60 kB | externa (Google Fonts) | |
| JS inicial transferido | master + 5 kB | 108,03 kB | |

## 3. Lighthouse (manual, SC-001)

En Chrome DevTools → Lighthouse → modo móvil → solo "Accesibilidad", contra `npm start` del backend con
el build servido (o el despliegue de prueba). Para cada vista (Noche, Tendencias, Siestas, Métricas, Mi
perfil) y cada tema (DevTools → Rendering → `prefers-color-scheme`): puntuación ≥ 95. Anotar las diez
cifras en el PR.

## 4. Revisión visual (manual, sin capturas en CI)

- Capturas de las cuatro pestañas en claro y oscuro a 375 px; adjuntarlas al PR (sin datos reales: usar
  datos sintéticos del seed de e2e).
- Comprobar: no hay blanco puro en claro; el aviso "No es un dispositivo médico" se ve en Noche,
  Tendencias y Siestas; "Sin dato" se distingue por forma; ningún color sugiere "bien/mal".

## 5. Android real

- Chrome en Android, Ajustes → Pantalla → Tamaño de fuente al máximo: el texto de la app crece y no hay
  scroll horizontal.
- Tema del sistema claro y oscuro: la app y la barra del navegador cambian.
- Borrar una siesta de prueba: el gesto atrás cierra el diálogo sin borrar.
- Accesibilidad → "Quitar animaciones": cambiar de pestaña es instantáneo.

## 6. Despliegue

Sin migraciones ni secretos nuevos. Tras desplegar, comprobar en DevTools → Red que no hay peticiones a
`fonts.googleapis.com` ni `fonts.gstatic.com` y que la CSP de la respuesta ya no las incluye.
