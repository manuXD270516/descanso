# Feature 007 – Importar mi sueño del reloj por archivo (REM medido)

> **Condicionada**: se especifica solo si la respuesta a P2 indica un Apple Watch u otro dispositivo que exporte archivos. Antes del plan hay que hacer un spike técnico.

Quiero ver mis fases de sueño reales (REM, ligero, profundo y despierto), medidas por mi reloj, junto a las noches que anoto. La app es web y no puede leer Apple Health directamente, así que importo el archivo de exportación.

## Historias

### Importar la exportación de Apple Health (P1)

- Subo el `export.zip` tal como lo genera la app Salud.
- Una guía con capturas me explica cómo obtenerlo.
- Veo una barra de progreso.
- Antes de confirmar veo un resumen, por ejemplo "Encontramos 212 noches, 180 con fases. ¿Importar?".
- Si reimporto el mismo archivo, no se crea ninguna noche duplicada.

### Muestras convertidas en noches (P1)

- Las muestras fragmentadas del iPhone y del Watch se agrupan en sesiones.
- Las muestras de distintas fuentes se deduplican; si coinciden, prevalece el Watch.
- La fecha de la noche es el día en que me acosté, en mi hora local.
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

- Sincronización automática por OAuth (feature 009).
- Apps nativas.
- Frecuencia cardiaca y HRV.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

Diseño de referencia: `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 007, matriz de factibilidad, E6, X11, X12, V-10 a V-13). Depende de las features 003 y 004.

### Spike previo al plan

- Prueba de concepto con un `export.zip` real de 1 GB o más.
- Nombrar y justificar en Complexity Tracking las librerías de descompresión y de XML en streaming.
- Entidades y DTD desactivadas.
- Fijar un tamaño máximo aceptado.
- **Criterio de salida**: si la prueba de concepto no procesa 1 GB en Chromium dentro del límite de memoria, 007 se reduce a CSV genérico o se aplaza, y se decide antes de especificar.

### Procesamiento en el navegador

- Se hace en un Web Worker con `File.stream()`.
- El servidor solo recibe sesiones en JSON, en lotes de 5 MB o menos.
  - Motivo: la máquina tiene 256 MB y el export puede superar 1 GB.
- Criterios de memoria:
  - El heap del worker queda por debajo de 300 MB en Chromium, medido con Playwright/CDP.
  - Prueba manual en Safari iOS con 1 GB.
  - Si falla en iOS, la guía indica que se use un ordenador.

### Esquema

- Tablas `import_batches`, `sleep_sessions` y `sleep_stages` (por tramos), según el esquema unificado.
- `sleep_records.source`.
- Idempotencia con `UNIQUE(user_id, source, external_id)` más el sha256 del lote.
- La duración diaria se sigue leyendo solo de `sleep_records`.
- Validador ISO estricto que acepte el formato de Apple `2024-01-01 23:10:00 -0300`.

### Antes del plan

- Aplicar la enmienda MINOR del principio II: el borrado a petición del usuario no es DROP.
