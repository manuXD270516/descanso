# Propuesta B — Fases del sueño / REM (borrador ReAct v0)

## 1. Resumen y recomendación

Sin sensores no se pueden medir las fases del sueño. Lo que se puede ofrecer con honestidad sin ellos es:

- un **diario de sueño** (latencia, despertares, WASO);
- una **estimación teórica de ciclos**, presentada como estimación.

Los wearables detectan bien si duermes o no (sensibilidad > 90 %), pero clasifican las fases solo de forma moderada (κ 0,2–0,65) y subestiman el tiempo despierto.

**Recomendación**: construir primero el nivel (a):
- diario al estilo *Consensus Sleep Diary*;
- eficiencia calculada a partir del diario;
- calculadora de ciclos.

La tabla `sleep_stages` se diseña ahora, pero se implementa junto con los wearables.

## 2. Historias de usuario

- **P1 — Diario nocturno.** Al cerrar la noche se registran, todos opcionales:
  - latencia percibida (SOL);
  - número de despertares;
  - tiempo despierto durante la noche (WASO);
  - hora de levantarse.

  Criterios:
  - un valor fuera de rango devuelve 400 (latencia > 720, o SOL + WASO > TIB);
  - se muestran TST y eficiencia redondeados a 1 min y 1 %;
  - si falta un dato se muestra "—", no 0.
- **P1 — Descargo y etiquetado.**
  - Cada dato lleva una insignia: *Registrado*, *Estimado* o *Importado (fuente)*.
  - El aviso "No es un dispositivo médico" está siempre visible.
  - Ningún texto nombra trastornos ni umbrales clínicos; un test de snapshot comprueba una lista de palabras prohibidas.
- **P2 — Calculadora de ciclos.** A partir de la hora de acostarse, propone despertares tras 4, 5 y 6 ciclos.
  - Latencia configurable (por defecto 15 min) y duración del ciclo configurable (por defecto 90, entre 70 y 120).
  - Cada sugerencia es una ventana de ±15 min con la etiqueta "estimación, no medición".
  - La función es pura y tiene tests con cruce de medianoche y cambio de offset.
- **P2 — Hipnograma importado** (depende de los wearables).
  - SVG propio con 4 carriles y una tabla equivalente accesible.
  - Minutos y % por fase; su suma coincide con TST ± 1 min.
  - Si hay varias fuentes, se muestra una principal, que el usuario puede cambiar.
- **P3 — Tendencias por fase.**
  - Medias móviles de 7 y 30 días de %REM, %profundo y eficiencia, siempre de una misma fuente.
  - Aviso de que las diferencias de menos de 15 min no son fiables.

## 3. Requisitos funcionales

- **FR-01**: los campos del diario son columnas nulables en `sleep_records`.
- **FR-02**: las métricas derivadas se calculan al leer, nunca se guardan.
- **FR-03**: la calculadora vive solo en el frontend y no persiste nada.
- **FR-04**: `sleep_stages` con fuente, `UNIQUE(source, external_id)`.
- **FR-05**: la `night_date` de lo importado se recalcula con la regla III (en Fitbit, `dateOfSleep` es la fecha de fin).
- **FR-06**: conciliación con la noche manual por solapamiento ≥ 50 %.
- **FR-07**: hipnograma con `figure`, `figcaption` y tabla.
- **FR-08**: descargo e insignias obligatorios.

**Fuera de alcance**:
- detectar fases con el micrófono o el acelerómetro;
- alarma inteligente;
- cribado de apnea o insomnio;
- fusionar fases de varias fuentes época a época;
- puntuaciones propietarias.

## 4. Evidencia científica

| Estudio | Hallazgo |
|---------|----------|
| Robbins 2024 (Sensors, n=35, financiado por Oura) | 4 fases: Oura 76 %, Fitbit 71 %, Apple 75 % (κ 0,65, 0,55, 0,60). Apple −43 min de sueño profundo y +45 min de ligero |
| Schyvens 2025 (SLEEP Adv, 6 dispositivos, n=62) | κ 0,21–0,53; especificidad para vigilia 29–52 %; todos subestiman la vigilia (−12 a −40 min) |
| Chinoy 2021 (SLEEP, 7 dispositivos) | Sensibilidad ≥ 0,93; especificidad para vigilia 0,18–0,54; peor en noches alteradas |

- Dos personas que puntúan polisomnografía coinciden en torno al 83 %.
- El ciclo dura entre 70 y 110 min; los 90 min vienen de Kleitman. La mediana de 96 min en *Sleep Health* 2023 solo se leyó en un resultado de búsqueda.
- La AASM (Khosla 2018) indica que estos dispositivos no diagnostican.
- La guía *general wellness* de la FDA de enero de 2026 (análisis de Covington) excluye mencionar enfermedades, umbrales diagnósticos, precisión "clínica" y alertas que guíen acciones médicas.
- La ortosomnia (Jahrami 2023, Baron 2017) desaconseja puntuaciones y gamificación.
- Formatos de importación:
  - Fitbit: `levels.data` cada 30 s y `shortData` para despertares ≤ 3 min.
  - HealthKit: `inBed`, `awake`, `asleepCore`, `asleepDeep` y `asleepREM` (`core` = ligero).
- La WAI pide describir imágenes complejas (descripción corta, larga y tabla).

## 5. Datos y fórmulas

Requisito previo: el sistema de migraciones.

- **Migración A**: `sleep_records` + `sol_min`, `awakenings`, `waso_min`, `out_of_bed_time` (≥ `wake_time`).
- **Migración B**:
  - `stage_imports`: id, source, external_id, night_date, start_time, end_time, sleep_record_id nulable, is_primary, imported_at; `UNIQUE(source, external_id)`.
  - `sleep_stages`: import_id con CASCADE, stage ∈ {awake, light, deep, rem, unknown}, start_time, end_time.

Fórmulas:

| Medida | Cálculo |
|--------|---------|
| TIB | out_of_bed (o wake) − bedtime |
| TST (diario) | TIB − SOL − WASO − (out_of_bed − wake) |
| TST (fases) | Σ (light + deep + rem) |
| Eficiencia | TST / TIB × 100 |
| Latencia (fases) | primera época de sueño − inicio |
| WASO (fases) | Σ vigilia entre la primera y la última época de sueño |
| %fase | fase / TST |
| Ciclos | despertar_n = bedtime + SOL + n·L |

## 6. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Tomar una estimación por una medición | Insignias; no guardar fases estimadas |
| Riesgo regulatorio | Descargo, test de palabras prohibidas, sin alertas médicas |
| Ortosomnia | Sin puntuación; fases ocultables |
| Fecha de la noche distinta según el proveedor | Recalcular y tests con medianoche y cambio de hora |
| Duplicados o conflictos entre fuentes | UNIQUE + fuente principal |
| Mezclar fuentes en las tendencias | Filtrar por fuente |
| No hay migraciones | Crear el sistema de migraciones antes |

## 7. Dependencias

- **Wearables**: aportan el nivel (b).
- **Dashboard**: consume TST, eficiencia y %fase, y reutiliza los SVG.
- **Multiusuario**: añade `user_id`.
- **Migraciones**: bloquean todo lo anterior.

## 8. Estimación y preguntas

| Historia | Talla |
|----------|-------|
| Diario | M (incluye las migraciones) |
| Descargo | S |
| Calculadora | S |
| Hipnograma | L |
| Tendencias | M |

Preguntas abiertas:
1. ¿El diario va en columnas fijas o como métricas configurables?
2. ¿Qué wearable usa el usuario?
3. ¿Distinguir el despertar final de la hora de levantarse?

## 9. Enmiendas propuestas

- **VIII "Honestidad de datos / no clínico"** (MINOR).
- **III**: la fecha de la noche de los datos importados sigue la regla local (PATCH/MINOR).
- **II**: `schema_migrations` explícito.
- **Alcance**: revisar el "mono-usuario".

## Fuentes (abiertas)

- **Validación de wearables**: Chinoy 2021 (OUP), Robbins 2024 (PMC), Schyvens 2025 (OUP), Sleep Review.
- **Ciclos**: Wikipedia, "Sleep cycle".
- **Regulación y salud**: AASM, Covington sobre la FDA 2026, Dovepress (ortosomnia).
- **Formatos**: Fitbit sleep log, Apple `asleepCore`.
- **Accesibilidad**: WAI, "Complex images".
