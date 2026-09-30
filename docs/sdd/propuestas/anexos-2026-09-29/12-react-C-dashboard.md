# Propuesta C: métricas y dashboard (borrador ReAct v0)

## 1. Resumen y recomendación

Con los datos que ya existen se pueden calcular: duración, siestas, regularidad (DE y un SRI aproximado), tendencias y la relación entre el sueño y las métricas del día.

Faltan dos datos nuevos:
- el **objetivo de sueño**, necesario para la deuda y el cumplimiento;
- los **días laborables y libres**, necesarios para el jetlag social.

**Recomendación:**
- una pestaña "Tendencias" que calcula todo en el backend (`backend/src/analytics.js`, funciones puras);
- gráficos con **SVG propio en Angular**, sin librería (4 componentes en `shared/charts/`);
- correlaciones exploratorias, con n mínima y el aviso "correlación ≠ causa".

## 2. Historias

- **P1 US1 — Tendencia de duración frente al objetivo** (rangos 7, 30 y 90 días; M)
  - Gráfico de líneas con una banda para el objetivo, que por defecto es 7 h (CDC, adultos de 18 a 60 años).
  - Los huecos son "sin dato", no 0.
  - Porcentaje de cumplimiento = noches ≥ objetivo / noches registradas.
  - Cada gráfico lleva una tabla alternativa que se puede desplegar.
- **P1 US2 — Deuda de sueño a 14 días** (M)
  - Fórmula: Σ max(0, objetivo − (sueño + siestas)), en minutos.
  - Tests con casos que cruzan la medianoche.
  - Objetivo editable entre 4 y 12 h y guardado en el servidor.
- **P2 US3 — Regularidad** (M)
  - DE circular de la hora de dormir, de despertar y del punto medio. Requiere ≥ 7 noches; con menos, "datos insuficientes".
  - SRI de 0 a 100, con épocas de 1 minuto, sobre ≥ 7 pares de días.
- **P2 US4 — Sueño ↔ métricas** (L)
  - Para métricas de número o escala: ρ de Spearman, n e IC 95 %, emparejando la noche D−1 con el día D. No se muestra nada con n < 10.
  - Para métricas sí/no: horas medias en los días "sí" frente a los días "no", con n ≥ 5 por grupo.
  - Las métricas de texto se excluyen.
  - Aviso visible de que no implica causalidad.
- **P3 US5 — Jetlag social y mapa de calor semanal** (S–M)
  - Jetlag social = |punto medio en días libres − punto medio en días laborables|; días laborables por defecto de lunes a viernes; requiere ≥ 2 noches de cada tipo.
  - Mapa de calor con leyenda en texto, no solo por color.

## 3. Requisitos funcionales

- **FR-01** Los rangos terminan en la fecha de la noche de hoy.
- **FR-02** Las agregaciones se hacen en el backend.
- **FR-03** Tabla `settings` (`sleep_goal_min`, `workdays`) creada mediante migración; depende de DT-01.
- **FR-04** Estadística circular con `% 1440` (corrige DT-21).
- **FR-05** Desfase configurable, por defecto 1.
- **FR-06** n mínima e IC con la transformación z de Fisher.
- **FR-07** Cada gráfico es un `<figure>` con su `<figcaption>`, tabla alternativa y el principio WAI; respeta `prefers-reduced-motion` y contraste AA.
- **FR-08** Si hay varias noches en la misma fecha, se suman (DT-11).
- **FR-09** Se validan `from` y `to` (DT-02 y DT-03).

**Fuera de alcance:** fases y REM, wearables, multiusuario, puntuaciones propietarias o médicas, predicción, regresión multivariante y notificaciones.

## 4. Catálogo de métricas

| Métrica | Datos | ¿Disponible hoy? | Fuente |
|---------|-------|------------------|--------|
| Duración | sleep_records | Sí | — |
| Total en 24 h (con siestas) | sleep_records + naps | Sí | — |
| Cumplimiento | + objetivo | No (se puede usar 7 h por defecto) | CDC |
| Deuda | + objetivo | Parcial | Van Dongen 2003: 6 h durante 14 días ≈ hasta 2 noches sin dormir, sin percibirlo |
| DE circular | sleep_records | Sí, con ≥ 7 noches | Fischer 2021 |
| SRI | + siestas | Aproximado, sin despertares | Phillips 2017, Fischer 2021 |
| Jetlag social | + días laborables | No | Wittmann/Roenneberg 2006 |
| Tendencia | media móvil de 7 días | Sí | — |
| Spearman | metric_entries | Sí | Holbert: n≈29 para r = 0,5 con 80 % de potencia |
| Diferencia sí/no | metric_entries | Sí (ojo con DT-08) | — |
| Fases | — | No | Otra área |

## 5. Diseño

- **Cabecera:** radiogroup para elegir 7, 30 o 90 días.
- **KPIs:** media, porcentaje de cumplimiento, deuda, DE del punto medio y SRI.
- **Gráficos:**
  - líneas apiladas con banda;
  - barras de déficit + deuda acumulada;
  - reutilizar la cinta ya existente + tarjeta de DE y SRI;
  - mapa de calor semana × día;
  - dispersión horas × métrica;
  - barras sí/no.

**Contrato propuesto:**

```text
GET /api/dashboard?days=7|30|90&to=YYYY-MM-DD
  → { range, goal_min, workdays,
      nights: [ { date, sleep_min, nap_min, total_min, bedtime_min, wake_min,
                  midpoint_min, deficit_min, is_workday } ],
      kpis: { nights, avg_total_min, goal_hit_pct, debt_min,
              sd_bedtime_min, sd_wake_min, sd_mid_min, sri | null,
              social_jetlag_min | null, insufficient: [...] },
      weekly: [ ... ] }

GET /api/insights/correlations?days=30|90&lag=1
  → [ { metric_id, method: spearman | mean_diff, n, rho, ci95,
        mean_yes_min, mean_no_min, status: ok | insufficient } ]

GET /api/settings
PUT /api/settings
```

**Rendimiento:** menos de 300 filas en 90 días; una consulta por tabla y cálculo en JS. No hace falta caché.

**Gráficos:** uPlot pesa unos 48 KB y usa Canvas, sin semántica accesible. El SVG propio con `@for` + `computed` es suficiente para este volumen.

## 6. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Correlaciones falsas (n pequeña, múltiples comparaciones, autocorrelación) | n ≥ 10 para mostrar, n ≥ 30 para etiquetar la fuerza, IC, BH o aviso, lenguaje no causal |
| Día mal asignado (desfase, zona horaria DT-10) | Tests |
| Huecos contados como 0 | "Sin dato" y mostrar la cobertura |
| SRI sesgado | Etiqueta "aproximado"; priorizar la DE |
| DT-08 | Corregir antes de US4 |
| DT-07 | Ignorar lo que no se pueda parsear |
| Sobrecarga en móvil | KPIs primero, gráficos colapsables |
| Deriva de alcance | Fuera de alcance explícito |

## 7. Dependencias

- **Multiusuario:** `settings` y las consultas llevan `user_id`; `analytics.js` recibe filas.
- **Wearables:** aportarían despertares (SRI real) y fases; `nights[]` es extensible.
- **Deuda técnica a cerrar:** DT-01, DT-02, DT-03, DT-08, DT-10, DT-11 y DT-21. `circularAvg` pasa a un módulo compartido.

## 8. Estimación y preguntas

| Historia | Talla |
|----------|-------|
| US1 | M |
| US2 | M |
| US3 | M |
| US4 | L |
| US5 | S–M |

**Preguntas abiertas:**
1. ¿"Calidad" y "Energía" se registran con la fecha de la mañana (desfase 1) o con la de la noche (desfase 0)?
2. ¿El objetivo incluye las siestas?
3. ¿Días laborables fijos o marcados noche a noche?

## 9. Enmiendas propuestas a la constitución

- **Principio I (MINOR):** gráficos en SVG propio; una librería solo con justificación.
- **Principio VII (MINOR):** toda visualización tiene alternativa en texto o tabla y no depende solo del color.
- **Nuevo, "Honestidad estadística" (MINOR):** n visible, IC, lenguaje no causal y "sin dato" ≠ 0.
- **Principio III (PATCH):** dejar definido el emparejamiento noche → día.

## Fuentes

**Abiertas:** CDC sleep; SLEEP 2021 (Fischer); Van Dongen 2003 (resumen); Wikipedia "Social jetlag"; uPlot; WAI complex images; Holbert.

**Solo en snippet:** SRI de Phillips 2017.

**Bloqueadas o sin acceso:** PMC (CAPTCHA), eLife, PDF de la AASM.
