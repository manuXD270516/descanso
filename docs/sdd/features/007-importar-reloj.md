# Feature 007 – Importar mi sueño del reloj por archivo (REM medido)

> **Condición cumplida** (P2, 2026-09-29): el usuario usa un **Huawei Band** con Huawei Health en Android. La importación de Huawei es la historia P1; la de Apple Health pasa a P2. Antes del plan hay que hacer un spike técnico con una **exportación real de Huawei del usuario**.

Quiero ver mis fases de sueño reales (REM, ligero, profundo y despierto), medidas por mi pulsera o reloj, junto a las noches que anoto. La app es web y no puede leer Huawei Health ni Apple Health directamente, así que importo el archivo de exportación.

## Historias

### Importar la exportación de Huawei Health (P1)

- Una guía con capturas me explica cómo pedir mis datos: Huawei Health → Yo → Centro de privacidad → Solicitar datos → Salud.
  - Avisa de que Huawei puede tardar hasta 7 días en enviarlos y de que el enlace caduca a los 21 días.
- Subo el ZIP que me envía Huawei y escribo la contraseña que elegí al pedirlo.
  - El archivo se descifra **en mi navegador**: la contraseña nunca llega al servidor ni se guarda.
  - Si la contraseña es incorrecta, veo un error claro y no se importa nada.
- Se leen mis noches y fases (ligero, profundo, REM, despierto). Las siestas registradas por la pulsera se importan como siestas.
- Antes de confirmar veo un resumen, por ejemplo "Encontramos 94 noches con fases y 12 siestas. ¿Importar?".
- Si reimporto una exportación nueva que se solapa con la anterior, no se duplica ninguna noche ni ninguna fase.
- Si Huawei cambió el formato y no se reconocen los datos, veo "formato de Huawei no reconocido" y no se importa nada a medias.

### Importar la exportación de Apple Health (P2)

- Subo el `export.zip` tal como lo genera la app Salud.
- Una guía con capturas me explica cómo obtenerlo.
- Veo una barra de progreso.
- Antes de confirmar veo un resumen, por ejemplo "Encontramos 212 noches, 180 con fases. ¿Importar?".
- Si reimporto el mismo archivo, no se crea ninguna noche duplicada.

### Muestras convertidas en noches (P1)

- Los tramos de Huawei vienen repetidos entre archivos: se deduplican por tipo, inicio y fin.
- Las muestras fragmentadas del iPhone y del Watch se agrupan en sesiones.
- Las muestras de distintas fuentes se deduplican; si coinciden, prevalece el Watch.
- La fecha de la noche es el día en que me acosté, en mi hora local.
- Límite conocido, que se me explica: Huawei no guarda la zona horaria, así que las noches importadas se asignan con **mi zona horaria actual**. Una noche de viaje en otra zona puede quedar desplazada, y puedo corregirla a mano.
- Esto se prueba con casos antes y después de la medianoche y en cambios de horario.

### Conciliar con mis noches anotadas (P1)

- Elijo una preferencia global: "usar el reloj" o "usar mis noches anotadas".
- Veo un único aviso agrupado cuando hay solapes, no uno por noche.
- Lo que anoté a mano nunca se borra ni se sobrescribe. Con "usar el reloj", la noche anotada se conserva y queda vinculada a la sesión del reloj, que pasa a ser la principal y aporta la duración. Si cambio la preferencia, la noche anotada vuelve a ser la principal.
- Una sesión sin noche anotada crea una noche marcada "Del reloj".

### Tus fases de la noche (P2)

- Veo un gráfico de 4 carriles con una tabla equivalente.
- Veo los minutos y el porcentaje de cada fase.
- La suma de las fases coincide con el tiempo dormido, con un margen de 1 minuto.
- Un aviso indica que los relojes suelen subestimar el tiempo despierto.

### Otros dispositivos y borrado (P2)

- Importo un CSV genérico con inicio, fin y fase.
- Puedo borrar todo lo importado de una fuente.

## Fuera de alcance

- Sincronización automática. Para Huawei, la única vía sería la app de pago Health Sync → Google Health API, que queda como opción de la feature 009, tras un spike.
- La API oficial HUAWEI Health Kit REST: exige una app publicada en AppGallery o ser empresa con capital ≥ 1 M CNY.
- Apps nativas.
- Frecuencia cardiaca y HRV.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

Diseño de referencia: `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 007, matriz de factibilidad, E6, X11, X12, V-10 a V-13). Depende de las features 003 y 004.

### Spike previo al plan

- **Modelo confirmado por el usuario (2026-09-29)**: **Huawei Band 7** ("HUAWEI Band 7-8F0" es su nombre Bluetooth), con Huawei Health; no es Honor. Registra fases con REM (TruSleep 2.0).
- **Huawei (P1)**: prueba de concepto con una exportación real del usuario.
  - **La exportación real nunca se sube al repositorio.** Los fixtures de prueba son sintéticos o anonimizados, y hay uno por versión del formato para detectar cambios de Huawei.
  - Descifrar el ZIP AES en el navegador con una librería justificada en Complexity Tracking (zip.js admite AES-256).
  - Confirmar que existen las claves `PROFESSIONAL_SLEEP_SHALLOW/DEEP/DREAM/WAKE/NOON` en `Health detail data & description/*.json` → `samplePoints`.
  - Confirmar si las marcas de tiempo vienen en milisegundos o en segundos.
  - Medir la duplicación entre archivos.
  - Criterio de salida: si el formato real no permite obtener noches con fases, 007 se reduce a Apple/CSV y se informa al usuario antes de especificar.
- **Apple (P2)**: prueba de concepto con un `export.zip` real de 1 GB o más.
- Nombrar y justificar en Complexity Tracking las librerías de descompresión y de XML en streaming.
- Entidades y DTD desactivadas.
- Fijar un tamaño máximo aceptado.
- **Criterio de salida de Apple**: si la prueba de concepto no procesa 1 GB en Chromium dentro del límite de memoria, **solo cae la historia de Apple (P2)**. Huawei y CSV siguen adelante.

### Procesamiento en el navegador

- Se hace en un Web Worker con `File.stream()`.
- El servidor solo recibe sesiones en JSON, en lotes de 5 MB o menos.
  - Motivo: la máquina tiene 256 MB y el export puede superar 1 GB.
- Criterios de memoria:
  - **Huawei (P1)**: descifrar e importar la exportación real del usuario en **Chrome para Android**, con el heap por debajo de 300 MB y sin bloquear la interfaz.
  - El heap del worker queda por debajo de 300 MB en Chromium, medido con Playwright/CDP.
  - Prueba manual en Safari iOS con 1 GB.
  - Si falla en iOS, la guía indica que se use un ordenador.

### Esquema

- Tablas `import_batches`, `sleep_sessions` y `sleep_stages` (por tramos), según el esquema unificado.
- **Hora local de Huawei.** Los `samplePoints` traen epoch sin offset:
  - el offset se calcula con `Intl`, en cada instante, a partir de la zona horaria del perfil (feature 008);
  - con esa hora local se aplica la regla III de fecha de la noche;
  - límite documentado: "las noches de viaje se asignan con tu zona actual";
  - tests de la regla III: antes y después de medianoche, y cambio de hora (DST).
- **Sesiones y duplicados de Huawei.**
  - Una sesión = tramos contiguos con huecos de menos de 30 min. El spike confirma el umbral.
  - `external_id` = sha256(tipo, inicio, fin).
- Correspondencia de fases de Huawei: `SHALLOW`→light, `DEEP`→deep, `DREAM`→rem, `WAKE`→awake. `NOON`→siesta (`naps.source='huawei'`), que no suma a la noche.
- `source='huawei'` o `'apple'` en `sleep_sessions`, `sleep_records` y `naps`.
- `sleep_records.source`.
- Idempotencia con `UNIQUE(user_id, source, external_id)` más el sha256 del lote.
- La duración diaria se sigue leyendo solo de `sleep_records`.
- Validador ISO estricto que acepte el formato de Apple `2024-01-01 23:10:00 -0300`.

### Antes del plan

- La enmienda MINOR del principio II (el borrado a petición no es DROP) ya se habrá aplicado antes de 008.

### Privacidad y aislamiento

- Solo los tipos `PROFESSIONAL_SLEEP_*` salen del navegador; el resto del archivo nunca se envía.
- Sus rutas usan la capa `repo/` con `userId` (feature 008) y se añaden a la suite de aislamiento de dos usuarios de 008.
