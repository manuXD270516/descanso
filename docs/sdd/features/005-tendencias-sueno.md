# Feature 005 – Tendencias y sueño pendiente (dashboard)

Quiero entender mi descanso a lo largo del tiempo: si duermo las horas que quiero, cuánto sueño llevo acumulado sin dormir y si soy regular. Todo explicado con palabras y sin jerga.

## Historias

- **(P1) Horas dormidas frente a mi objetivo.**
  - Veo un gráfico de los últimos 7, 30 o 90 días con una banda que marca mi objetivo (7 h por defecto).
  - Veo el indicador "Noches con tus horas objetivo: X de Y".
  - Puedo editar el objetivo desde el propio gráfico, entre 4 y 12 h. Un valor fuera de rango da 400 y un mensaje en español.
  - Cuenta como sueño de un día la noche más las siestas de esa fecha. Si hay varias noches con la misma fecha, se suman.
  - Un día sin registro aparece como "sin dato", nunca como 0.
  - La noche que aún no he cerrado aparece como "en curso".
- **(P1) Sueño pendiente de los últimos 14 días.**
  - Veo cuánto me falta respecto a mi objetivo, por ejemplo "Te faltan 3 h 20 min esta quincena".
  - Solo cuenta las noches registradas y dice cuántas cubre.
- **(P2) Regularidad en palabras.**
  - Veo cuánto varía mi hora de dormir y la de despertar, por ejemplo "±40 min".
  - Con menos de 7 noches veo "Aún no hay datos suficientes".
- **(P2) Bienvenida.** La primera vez, una pantalla opcional me pregunta cuántas horas quiero dormir. Si la salto, el objetivo queda en 7 h.
- **(P2) Gráficos accesibles.**
  - Cada gráfico, incluida la cinta de 14 noches actual, tiene una descripción y una tabla alternativa.
  - El texto tenue cumple un contraste de 4,5:1 o más.

## Presentación

- Arriba, solo 3 indicadores: media, objetivo cumplido y sueño pendiente.
- La regularidad va en una sección plegable.
- Sin siglas, sin colores rojo o verde para juzgar y sin puntuaciones.

## Fuera de alcance

- Relación entre el sueño y mis métricas.
- Diferencia entre semana y fin de semana.
- Mapa de calor.
- Índice de regularidad SRI.
- Predicciones.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

Diseño de referencia: `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 005, V-07, X8, X9, UX-04 a UX-06, UX-13). Depende de la 003 y de la 004, que crea `user_settings`.

**Backend**
- Las agregaciones viven en `backend/src/analytics.js` como funciones puras.
- La duración se lee solo de `sleep_records`.
- La estadística circular se normaliza con `% 1440`.
- Endpoints:
  - `GET /api/dashboard?days=7|30|90&to=YYYY-MM-DD`: el cliente envía `to` = la fecha de la noche de hoy.
  - `GET /api/settings` y `PUT /api/settings`.

**Frontend**
- Gráficos en SVG propio, con componentes standalone en `frontend/src/app/shared/charts/`, sin librería (principio I).

**Pruebas**
- 23:30 y 00:30 deben dar una media de 0.
- Los huecos no cuentan como 0.
- Deuda y desviación circular con fixtures.
- Contrato del endpoint.
- E2E de la pestaña con datos sembrados.
