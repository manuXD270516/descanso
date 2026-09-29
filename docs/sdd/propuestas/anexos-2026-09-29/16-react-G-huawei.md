# Propuesta G: factibilidad de Huawei Band + Huawei Health (ReAct, verificado el 2026-09-29)

Motivo: respuesta P2 del usuario ("Huawei Band Pro 7", Android). Huawei no estaba en la matriz original.

## Resumen y veredicto

Se pueden obtener **las horas y las fases** de sueño (ligero, profundo, REM, despierto) y también las **siestas**.

La vía práctica es la **exportación de datos de Huawei**: un ZIP cifrado con AES y una contraseña que elige el usuario, con JSON dentro. Se importa en el navegador y encaja en la **feature 007**.

Tipos de datos del export: `samplePoints` con `PROFESSIONAL_SLEEP_SHALLOW/DEEP/DREAM/WAKE/NOON`.

**Modelo**: no existe un "Band Pro 7". Lo más probable es un **Huawei Band 7** (TruSleep 2.0 con REM); también podría ser una Band 6 Pro. Las Band 8/9/10 y Watch Fit se comportan igual. Si fuera una **Honor** Band 7, la app sería Honor Health y nada de esto aplica.

## Rutas

| Ruta | Sueño / fases | Desde web | Requisitos | Coste | Fiabilidad | Veredicto |
|------|---------------|-----------|------------|-------|------------|-----------|
| **Exportación "Solicitar datos"** (Centro de privacidad del HUAWEI ID) | Sí (fases + siestas) | Sí: archivo procesado en el navegador | ZIP AES con contraseña. Llega en minutos o hasta 7 días; el enlace caduca a los 21 días | 0 $ | Media: formato no documentado (ingeniería inversa), cambió en 2025, tramos duplicados | **Viable (007)** |
| Health Sync (Android) → Google Health → Google Health API | Sí (*fases solo en snippet*) | Sí (OAuth de 009) | Health Kit activado; país del HUAWEI ID compatible; licencia de Health Sync | Prueba de 1 semana, luego pago; Google gratis hasta 100 usuarios | Media-baja: 3 eslabones | **Condicionado (009)** |
| HUAWEI Health Kit REST | Sí | Técnicamente | Individual: app publicada en AppGallery. Empresa: capital ≥ 1 M CNY. Revisión de 15+15 días hábiles; 100 usuarios en pruebas | 0 $ | — | **No viable** |
| Health Connect | Solo vía Health Sync | No: solo en el dispositivo | App nativa | — | — | No viable |
| Strava / Google Fit | Strava no incluye sueño; Fit está deprecado | — | — | — | — | No viable |
| Agregadores (Terra, Spike, Thryve, FitnessSyncer) | Sí | Sí | Contrato | De pago | — | Descartado |

## Recomendación

- **Principal**: añadir a 007 la historia "Importar la exportación de Huawei Health" (P1 para este usuario). Esfuerzo: M dentro de 007. Sirve para ponerse al día cada semana o cada mes.
- **Secundaria (opcional, 009)**: Google Health API como proveedor, con Health Sync como puente. Antes hay que confirmar con un spike que Google devuelve el sueño escrito por apps de terceros.

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Huawei cambia el formato o el cifrado sin aviso | Detectar el formato y abortar limpio |
| El archivo contiene datos sensibles | Todo en el navegador; la contraseña no se envía ni se registra |
| La disponibilidad depende del país | No recomendar cuentas alternativas |
| La cadena de Health Sync tiene 3 puntos de fallo y coste | Ruta solo opcional |
| La precisión de las fases es moderada | Ya reflejado en la matriz |

## Preguntas abiertas

1. ¿En qué país está registrado el HUAWEI ID y cuál es el modelo exacto (Ajustes → Acerca de)?
2. ¿Te basta importar cada semana o cada mes, o necesitas sincronización diaria?

## Fuentes

**Abiertas**:
- **Huawei Developers**: REST overview, auth example, access process, qualifications, data model, página de Huawei Health. Algunas se leyeron vía la API JSON del portal.
- **Soporte Huawei**: artículos en-us00746223, en-us15759715 y en-us15963854.
- **GitHub**: TomSkywalker/Huawei-Health-Raw-Export-Tools (código de 2026-08), CTHRU/Hitrava, Huawei-TCX-Converter #19, huawei-health-to-health-connect, huawei-health-mcp y zip.js.
- **Health Sync**: FAQ y ficha de Google Play (sep-2026).
- **Otros**: FitMesh 2026, FitnessSyncer y Android Authority.

**Solo snippet**: XDA, Medium, T3, Terra y Spike, "fases en Google Health" y el cierre de la API de Fitbit.
