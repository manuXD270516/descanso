# Propuesta D: wearables (borrador ReAct v0; verificado el 2026-09-29)

## 1. Resumen y recomendación

Como la app es solo web, no puede usar Apple HealthKit, Google Health Connect ni Samsung Health: los tres exigen una app nativa. Garmin tampoco sirve, porque su API es solo para uso empresarial.

Sí son viables, mediante OAuth, REST y webhooks: Oura, Polar, Withings, WHOOP y Google Health API (sucesora de Fitbit).

La API antigua de Fitbit deja de funcionar el 30-sep-2026 y Google Fit está deprecado.

**Fases propuestas:**
- **F0 (MVP, válido con un solo usuario):** importar el `export.xml` de Apple Health y, después, un CSV genérico.
- **F1:** conectar por OAuth el proveedor del dispositivo real del usuario (Oura como referencia: hipnograma cada 5 min, webhooks y 10 usuarios sin aprobación).
- **F2:** Polar, Withings, WHOOP y Google Health (este último con 100 usuarios como máximo sin verificación).
- **Descartado:** agregadores, que cuestan entre 299 y 499 USD al mes.

## 2. Matriz

| Plataforma | Fases de sueño | Acceso web | Requisitos y coste | Veredicto |
|------------|----------------|------------|--------------------|-----------|
| HealthKit | REM, Core, Deep, awake, inBed | No, solo en el dispositivo | App iOS, 99 USD/año | API: no viable. Importar `export.xml`: viable |
| Health Connect | Sí | No, SDK de Android | App nativa | No viable |
| Google Fit REST | Sí | Deprecado en 2026 | — | No viable |
| Fitbit Web API (antigua) | Sí | Se apaga el 30-sep-2026 (un blog, sin confirmar, habla del 30-oct) | — | No viable |
| **Google Health API** | Light, Deep, REM, Awake; webhooks | OAuth + REST | Sin verificar ≤ 100 usuarios; con más, CASA de 500 a 4.500 USD/año | Condicionado |
| Garmin | Sí | Sí | Solo uso empresarial | No viable para uso personal |
| **Oura v2** | `sleep_phase_5_min` | OAuth2 + webhooks | 10 usuarios sin aprobación; PAT deprecados desde dic-2025; gratis | **Viable** |
| **Polar AccessLink v3** | Fases | OAuth2 + webhooks HMAC | Registrar la app; gratis | **Viable** |
| **Withings** | Resumen de sueño v2 (light, deep, REM) | OAuth + notificaciones | Cuenta de desarrollador; gratis | **Viable** |
| **WHOOP v2** | Solo totales por fase, sin hipnograma | OAuth2 + webhooks v2 | Sandbox de 10 usuarios; gratis | **Viable** |
| Samsung | Sí | No, solo socios | — | No viable |
| Zepp (Xiaomi/Amazfit) | En su app | Sin API pública oficial verificada | — | No viable de forma directa |
| Agregadores (Terra, Rook, Sahha, Thryve) | Normalizan los datos | Sí | 299 a 499 USD/mes o más | No viable por coste |
| Open Wearables | Normaliza | Autoalojado (MIT) | Servicio aparte (choca con el principio V) | Solo como referencia |

## 3. Historias

- **P1: Importar Apple Health (M).**
  - Procesar en streaming un archivo de 200 MB con menos de 256 MB de RAM.
  - Asignar la fecha de la noche según el principio III.
  - Reimportar el mismo archivo no crea duplicados.
- **P1: Reconciliar con las noches manuales (M).**
  - Si una noche importada se solapa al menos un 50 % con una manual, el usuario elige conservar, reemplazar o fusionar.
  - La noche manual nunca se sobrescribe por defecto.
- **P2: Conectar Oura, u otro dispositivo principal, por OAuth (L; incluye la infraestructura).**
  - Tras el consentimiento, las últimas 30 noches con fases llegan en menos de 60 s.
  - Las noches nuevas aparecen en menos de 15 min, aunque la máquina estuviera parada.
  - Los tokens se guardan cifrados y se renuevan solos.
- **P2: Desconectar y borrar (S).**
  - Se revoca el token en el proveedor y se borran los tokens locales.
  - Los datos importados de esa fuente se pueden borrar aparte.
- **P3: Proveedores adicionales como adaptadores (S–M cada uno).**
- **P3: Estado de sincronización (S):** última sincronización, error y botón para reintentar.

## 4. Requisitos funcionales

- **FR-01:** Importar `export.xml` y un CSV genérico.
- **FR-02:** Modelo común con `sleep_sessions` (source, external_id, inicio y fin ISO con offset, fecha de la noche) y `sleep_stages` (awake, light, deep, rem, unknown).
- **FR-03:** Idempotencia con `UNIQUE(user_id, source, external_id)`, más un hash de contenido para los archivos.
- **FR-04:** OAuth con `state` y PKCE, y renovación automática del token.
- **FR-05:** Tokens cifrados con AES-256-GCM usando `TOKEN_ENC_KEY`, guardada como secreto de Fly.
- **FR-06:** Webhooks que verifican la firma, responden con 2xx en menos de 1 s y encolan el trabajo.
- **FR-07:** Recuperación al arrancar o al abrir la app: pull desde el último cursor menos 48 h.
- **FR-08:** Reintentos con backoff ante 429 y 5xx, respetando `Retry-After`.
- **FR-09:** Consentimiento por fuente, revocación y borrado.

**Fuera de alcance:** apps nativas; Garmin, Samsung y Zepp de forma directa; agregadores; escribir en el proveedor; frecuencia cardiaca y HRV intradía.

## 5. Arquitectura

- **Rutas en Express:** `/api/integrations/:provider/connect|callback|disconnect`, `/api/webhooks/:provider` (responde 202) y `/api/import/apple-health` (en streaming, con un parser SAX).
- **Adaptadores:** `providers/*.js` con `fetchNights(cursor) → CommonNight[]`.
- **Procesamiento:** un `syncWorker` dentro del mismo proceso.
- **Tablas nuevas:** `user_connections` (tokens cifrados, cursor, estado) y `sync_jobs`.

Los webhooks despiertan la máquina de Fly a través del proxy si `auto_start_machines = true`, con el retraso de un arranque en frío. Para cubrirlo: confirmación rápida, pull de recuperación, idempotencia y, como opción, `auto_stop_machines = "suspend"`.

**Reconciliación:** cuando hay solapamiento, la noche queda en `pending_review`. La fecha se calcula con el offset local.

## 6. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Deprecaciones de API (alta probabilidad) | Adaptadores, tests de contrato con fixtures y revisión trimestral |
| Límites de usuarios sin aprobación | Suficientes para uso personal |
| Coste de CASA | Mantener Google en 100 usuarios como máximo |
| Webhook perdido | Confirmación rápida, recuperación e idempotencia |
| Fuga de tokens | Cifrado, secretos y scopes mínimos |
| Duplicados | Restricción `UNIQUE` y tests de zona horaria |
| XML muy grande | Procesamiento en streaming y límite de tamaño |
| Términos de servicio de cada proveedor | Revisión y una política de privacidad publicada (WHOOP y Google la exigen) |

## 7. Dependencias

- **Multiusuario:** bloquea F1; F0 funciona con un solo usuario.
- **Fases del sueño (REM):** hay que acordar juntos la tabla `sleep_stages`.
- **Dashboard:** consume las fases y la fuente de cada noche.
- **Deuda técnica:** DT-01 (migraciones) es previa; faltan las columnas `source` y `user_id`.

## 8. Estimación y preguntas

- **Estimación:** importar Apple M, reconciliar M, Oura L, desconectar S, cada proveedor más S–M, estado S.

**Preguntas abiertas:**
1. ¿Qué dispositivo usa el usuario?
2. ¿Habrá más usuarios que el autor?
3. En un conflicto, ¿gana la noche manual o la del dispositivo?

## 9. Enmiendas propuestas

- **Principios I y VI:** permitir dependencias mínimas justificadas (parser XML, cliente OAuth).
- **Principio II:** exigir migraciones y la columna `source`.
- **Principio V:** secretos de integración solo en Fly y tokens cifrados.
- **Nuevo principio VIII, "Datos de salud de terceros".**
- **Alcance:** revisar la restricción de un solo usuario.

## Fuentes

**Abiertas:** Google Fit, Google Health (about, app-verification, sleep), el blog sobre la migración de Fitbit (no oficial), Health Connect (guía y sleep-sessions), HealthKit y HKCategoryValueSleepAnalysis, Garmin (Health API y FAQ), Oura, WHOOP (intro, app-approval, api), Polar AccessLink, Withings, Samsung, precios de Terra, autostop de Fly.

**Solo en resultados de búsqueda (sin abrir):** detalle y sandbox de Oura, fases de Garmin, campos de Withings, precios de Rook y Sahha, Open Wearables, Zepp.
