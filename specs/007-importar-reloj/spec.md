# Feature Specification: Importar mi sueño del reloj por archivo (fases medidas)

**Feature Branch**: `007-importar-reloj`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: `docs/sdd/features/007-importar-reloj.md`. Quiero ver mis fases de sueño
reales (REM, ligero, profundo y despierto), medidas por mi pulsera o reloj, junto a las noches que
anoto. La app es web y no puede leer Huawei Health ni Apple Health directamente, así que importo el
archivo de exportación. El usuario usa una **Huawei Band 7** con Huawei Health en Android (respuesta a
P2, 2026-09-29): la importación de Huawei es P1 y la de Apple Health, P2. Depende de 003 y 004; rige
el principio VIII de la constitución v2.2.0 (origen declarado, consentimiento por fuente con
revocación y elección de borrar sus datos, lenguaje no clínico, "sin dato" ≠ 0), el principio II
(borrado a petición del dueño, con confirmación) y el aislamiento multiusuario (lo ajeno → 404).

## Requisito previo: spike con una exportación real

El plan de 007 **queda bloqueado** hasta hacer una prueba de concepto con la **exportación real de
Huawei Health del usuario** (Huawei Band 7, TruSleep 2.0). El spike debe confirmar:

- que la exportación contiene las fases de sueño (claves `PROFESSIONAL_SLEEP_*`: ligero, profundo,
  REM, despierto y siesta) en un formato legible;
- si las marcas de tiempo vienen en milisegundos o en segundos;
- cuánto se repiten los tramos entre archivos de la misma exportación;
- si el hueco de 30 min entre tramos separa bien una sesión de otra (ver FR-012).

**La exportación real nunca entra en el repositorio** (ni en commits, ni en fixtures, ni en
registros): las pruebas usan datos sintéticos o anonimizados, con un ejemplo por versión conocida del
formato.

**Criterio de salida**: si con la exportación real no se pueden obtener noches con fases, 007 se
reduce a Apple Health y CSV (US4 y US6, más US2, US3 y US5 aplicadas a esas fuentes) y se informa al
usuario antes de seguir con el plan. La parte de Apple tiene su propio criterio de salida (procesar
una exportación de 1 GB o más en el navegador); si falla, solo cae US4.

## Glosario

- **Fuente**: el origen de un dato importado: **Huawei Health**, **Apple Health** u **Otro dispositivo
  (CSV)**. El consentimiento, la preferencia de borrado y el borrado se gestionan por fuente.
- **Tramo**: un intervalo con una sola fase (ligero, profundo, REM o despierto), con inicio y fin.
- **Sesión del reloj**: tramos de una misma fuente agrupados en un sueño continuo (FR-012). Su hora
  de acostarse es el inicio del primer tramo y su hora de levantarse, el fin del último.
- **Tiempo dormido** de una sesión: la suma de ligero + profundo + REM. **Tiempo en cama**: de la hora
  de acostarse a la de levantarse de la sesión.
- **Fecha de la noche**: la misma regla que las noches anotadas (principio III: el día en que la
  persona se acuesta, en su hora local).
- **Noche anotada**: una noche registrada a mano ("Anotado por ti", 006; puede llevar "Anotado
  después", 010).
- **Noche "Del reloj"**: una noche creada a partir de una sesión del reloj, sin noche anotada que la
  solape.
- **Solape**: una noche anotada cerrada y una sesión del reloj se solapan si sus intervalos de tiempo
  comparten al menos 1 minuto.
- **Noche principal**: entre una noche anotada y la sesión vinculada, la que aporta la duración, las
  horas y lo que cuentan Tendencias, el horario y la racha. La otra se conserva, nunca se suma dos
  veces.
- **Preferencia de conciliación**: ajuste global "Usar el reloj" o "Usar mis noches anotadas".
- **Lote de importación**: un archivo importado, con su fuente, fecha, huella del archivo y
  recuentos.

## Clarifications

### Session 2026-10-05

- Q: Cuando una noche anotada se solapa con una sesión del reloj, ¿qué preferencia rige por defecto? →
  A: **Se pregunta en la primera importación con coincidencias**, con "Usar el reloj" preseleccionado;
  después se cambia en Ajustes (FR-019).
- Q: Una noche cuya principal es una sesión del reloj, ¿cuenta para la racha de 011? → A: **Cuenta como
  una noche registrada**, evaluada con las horas de acostarse y levantarse de la sesión; solo desde la
  activación de la racha (FR-024).
- Q: Una noche con un despertar largo (≥ 30 min) que queda en dos sesiones con la misma fecha, ¿cómo se
  guarda? → A: **Una sola noche**, con el hueco mostrado como "sin dato" (ni despierto ni 0) (FR-012).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar la exportación de Huawei Health (Priority: P1)

Como usuario de una Huawei Band, pido mis datos a Huawei siguiendo una guía, subo el ZIP cifrado que
me envían, escribo la contraseña que elegí y, tras ver un resumen, importo mis noches con fases y mis
siestas. El archivo se descifra en mi navegador: la contraseña nunca llega al servidor.

**Why this priority**: es el dispositivo real del usuario y la única vía viable para ver fases
medidas; sin esta historia la feature no aporta valor.

**Independent Test**: con una exportación sintética de Huawei cifrada con la contraseña "prueba"
(3 noches con fases y 1 siesta): dar el consentimiento para Huawei Health, subir el ZIP, escribir una
contraseña errónea → "La contraseña no es correcta" y nada importado; escribir "prueba" → resumen
"Encontramos 3 noches con fases y 1 siesta. ¿Importar?"; confirmar → las 3 noches aparecen con
"Del reloj" y la siesta en Siestas; volver a importar el mismo ZIP → "No hay datos nuevos" y siguen
siendo 3 noches.

**Acceptance Scenarios**:

1. **Given** que abro "Importar del reloj" por primera vez, **When** elijo Huawei Health, **Then** veo
   una guía con capturas: Huawei Health → Yo → Centro de privacidad → Solicitar datos → Salud, con el
   aviso de que Huawei puede tardar hasta 7 días en enviarlos y de que el enlace caduca a los 21 días.
2. **Given** que nunca importé de Huawei Health, **When** voy a subir el archivo, **Then** antes debo
   dar mi consentimiento explícito para esa fuente, que explica qué datos se leen (solo sueño y
   siestas), que el resto del archivo no sale de mi navegador, que puedo revocarlo y que la app no es
   un dispositivo médico.
3. **Given** el consentimiento dado, **When** subo el ZIP y escribo la contraseña, **Then** el archivo
   se descifra en mi navegador; la contraseña no se envía al servidor ni se guarda en ningún sitio, y
   solo los datos de sueño y siestas salen del navegador.
4. **Given** una contraseña incorrecta, **When** intento abrir el archivo, **Then** veo un error claro
   ("La contraseña no es correcta"), puedo reintentar y no se importa nada.
5. **Given** un archivo legible, **When** termina la lectura, **Then** veo un resumen antes de
   confirmar, por ejemplo "Encontramos 94 noches con fases y 12 siestas. ¿Importar?", con el rango de
   fechas y, si las hay, cuántas ya estaban importadas y cuántas se solapan con noches anotadas.
6. **Given** el resumen, **When** pulso "Cancelar", **Then** no se guarda nada.
7. **Given** el resumen, **When** confirmo, **Then** se guardan las noches con sus tramos (ligero,
   profundo, REM, despierto) y las siestas de la pulsera como siestas, todo con el origen "Del reloj"
   y la fuente Huawei Health; las siestas no suman a la noche.
8. **Given** una exportación nueva que se solapa con una ya importada, **When** la importo, **Then**
   no se duplica ninguna noche, siesta ni tramo; el resumen cuenta solo lo nuevo.
9. **Given** un archivo con un formato que no se reconoce (Huawei cambió el formato, faltan los datos
   de sueño o no es una exportación de Huawei), **When** termina la lectura, **Then** veo "Formato de
   Huawei no reconocido" y no se importa nada, ni a medias.
10. **Given** un fallo de red o un cierre de la pestaña a mitad de la importación, **When** vuelvo,
    **Then** o se guardó todo el lote o nada; reintentar no duplica datos.
11. **Given** un teléfono Android con Chrome, **When** importo mi exportación real, **Then** la
    interfaz sigue respondiendo y veo el progreso.

---

### User Story 2 - Muestras convertidas en noches (Priority: P1)

Como usuario, los tramos sueltos del archivo se convierten en noches coherentes: sin repetidos, con
la fecha de la noche correcta en mi hora local y con un límite explicado para las noches de viaje.

**Why this priority**: sin sesiones bien formadas y sin duplicados, las noches importadas serían
falsas (dobles, partidas o asignadas al día equivocado), y eso contradice el principio III.

**Independent Test**: exportación sintética con los mismos tramos repetidos en 2 archivos, una noche
de 23:30 a 7:00 con un despertar de 10 min, otra que empieza a las 0:20 y otra que cruza el cambio de
hora de otoño, con la zona horaria del perfil en America/Santiago → resultado: 3 noches, sin tramos
repetidos; la de 0:20 lleva la fecha del día anterior según la regla de la noche; la del cambio de
hora tiene la duración real (no ±60 min de más o de menos); la pantalla de importación explica que
se usó la zona horaria actual.

**Acceptance Scenarios**:

1. **Given** tramos idénticos (misma fase, inicio y fin) en varios archivos, **When** se importan,
   **Then** cuentan una sola vez.
2. **Given** tramos contiguos de una misma fuente con huecos de menos de 30 min, **When** se forman
   las sesiones, **Then** pertenecen a la misma sesión; un hueco de 30 min o más empieza otra.
3. **Given** una sesión cuya hora de acostarse es antes de medianoche y otra después (por ejemplo,
   23:50 y 0:20), **When** se asigna la fecha de la noche, **Then** se aplica la misma regla que a las
   noches anotadas (principio III), con pruebas explícitas en ambos casos.
4. **Given** una sesión que cruza un cambio de hora oficial, **When** se importa, **Then** sus horas
   son las locales correctas y su duración es la real.
5. **Given** que Huawei no guarda la zona horaria, **When** importo, **Then** las horas se interpretan
   con la zona horaria actual de mi perfil y la pantalla lo explica: "Las noches de viaje se asignan
   con tu zona horaria actual; puedes corregirlas a mano".
6. **Given** una noche "Del reloj" desplazada por un viaje, **When** corrijo sus horas a mano, **Then**
   la corrección se guarda, la noche indica que la corregí y una reimportación no la deshace.
7. **Given** una exportación de Apple Health con muestras fragmentadas del iPhone y del Watch,
   **When** se importan (US4), **Then** se agrupan en sesiones con la misma regla y, donde dos
   dispositivos cubren el mismo tiempo, prevalece el Watch.

---

### User Story 3 - Conciliar con mis noches anotadas (Priority: P1)

Como usuario que ya anota sus noches, elijo si mandan los datos del reloj o mis noches anotadas; lo
que anoté a mano nunca se borra ni se sobrescribe y ninguna noche cuenta dos veces.

**Why this priority**: sin conciliación, cada noche anotada y su sesión del reloj sumarían el doble
en Tendencias, el horario y la racha, o se perderían datos escritos por el usuario.

**Independent Test**: 5 noches anotadas; importar una exportación con 7 sesiones, 4 de ellas
solapadas con noches anotadas → un solo aviso "4 noches importadas coinciden con noches que anotaste"
con la preferencia; con "Usar el reloj": 8 noches en total (4 vinculadas, cuya duración viene del
reloj, 1 anotada sin sesión y 3 "Del reloj"), ninguna duplicada en Tendencias; cambiar a "Usar mis
noches anotadas" → las 4 vinculadas muestran otra vez las horas anotadas, sin perder sus fases;
comprobar que las 5 noches anotadas conservan exactamente sus datos originales.

**Acceptance Scenarios**:

1. **Given** una importación con sesiones que se solapan con noches anotadas, **When** veo el
   resumen, **Then** hay **un único aviso agrupado** con el número de coincidencias y la preferencia
   de conciliación, no un aviso por noche.
2. **Given** la preferencia "Usar el reloj", **When** una sesión se solapa con una noche anotada,
   **Then** la noche anotada se conserva intacta y queda vinculada a la sesión, que pasa a ser la
   principal y aporta la duración y las horas.
3. **Given** la preferencia "Usar mis noches anotadas", **When** una sesión se solapa con una noche
   anotada, **Then** la noche anotada es la principal; la sesión queda vinculada y sus fases se ven
   en esa noche con el origen "Del reloj".
4. **Given** noches vinculadas, **When** cambio la preferencia, **Then** todas cambian de noche
   principal a la vez, sin modificar ni borrar ningún dato, y Tendencias, el horario y la racha se
   recalculan.
5. **Given** una sesión sin noche anotada que la solape, **When** se importa, **Then** crea una noche
   con el origen "Del reloj".
6. **Given** una sesión que se solapa con dos noches anotadas (una noche partida), **When** se
   concilia, **Then** queda vinculada a las dos, se aplica la preferencia y el tiempo no se cuenta
   dos veces.
7. **Given** cualquier día de Tendencias, **When** se calcula su sueño, **Then** cada noche cuenta
   una sola vez, por su noche principal.
8. **Given** una noche anotada aún abierta (sin "Ya desperté"), **When** importo una sesión que la
   solapa, **Then** la noche abierta no se cierra ni se modifica; se concilia cuando la cierre.

---

### User Story 4 - Importar la exportación de Apple Health (Priority: P2)

Como usuario de Apple Watch, subo el `export.zip` tal como lo genera la app Salud y lo importo con el
mismo flujo que Huawei: guía, consentimiento, progreso, resumen y confirmación.

**Why this priority**: amplía la feature a otro dispositivo habitual, pero el usuario actual usa
Huawei.

**Independent Test**: `export.zip` sintético con 3 noches (2 con fases, 1 solo "en cama/dormido") →
barra de progreso; resumen "Encontramos 3 noches, 2 con fases. ¿Importar?"; confirmar → 3 noches "Del
reloj" (la que no tiene fases se ve sin fases, no con fases vacías ni a 0); reimportar el mismo archivo
→ "No hay datos nuevos".

**Acceptance Scenarios**:

1. **Given** que elijo Apple Health, **When** abro la importación, **Then** veo una guía con capturas
   para obtener el `export.zip` desde la app Salud y, si estoy en iPhone y el archivo es muy grande, la
   recomendación de usar un ordenador.
2. **Given** el consentimiento para Apple Health, **When** subo el `export.zip`, **Then** veo una barra
   de progreso mientras se lee, y solo los datos de sueño salen del navegador.
3. **Given** el archivo leído, **When** veo el resumen, **Then** dice, por ejemplo, "Encontramos 212
   noches, 180 con fases. ¿Importar?".
4. **Given** el mismo archivo ya importado, **When** lo reimporto, **Then** no se crea ninguna noche
   duplicada.
5. **Given** noches que Apple solo registra como "dormido" sin fases, **When** se importan, **Then**
   aparecen como noches "Del reloj" con su duración y la indicación "sin fases", nunca con fases a 0.
6. **Given** un archivo que no es una exportación de Apple Health o está dañado, **When** se lee,
   **Then** veo "Formato de Apple Health no reconocido" y no se importa nada.

---

### User Story 5 - Tus fases de la noche (Priority: P2)

Como usuario, en cada noche con fases y en la sección "Fases" de Tendencias veo un gráfico de 4
carriles (despierto, REM, ligero, profundo) con una tabla equivalente, los minutos y el porcentaje de
cada fase, y un aviso honesto sobre los límites de los relojes.

**Why this priority**: es el objetivo visible de la feature, pero depende de tener datos importados
(US1–US3).

**Independent Test**: noche sintética con 60 min de ligero, 90 de profundo, 80 de REM y 20 de
despierto → gráfico de 4 carriles y tabla con "Ligero 60 min · 26 %", "Profundo 90 min · 39 %", "REM
80 min · 35 %" sobre 230 min dormidos, y "Despierto 20 min" aparte; la suma coincide con el tiempo
dormido ±1 min; el aviso sobre el tiempo despierto y "No es un dispositivo médico" están visibles;
la sección "Fases" sin datos importados muestra "Importa tus datos →".

**Acceptance Scenarios**:

1. **Given** una noche con fases, **When** la abro, **Then** veo un gráfico de 4 carriles a lo largo
   de la noche y una tabla equivalente, accesible sin depender del color ni del gráfico.
2. **Given** la misma noche, **When** veo la tabla, **Then** cada fase muestra sus minutos y su
   porcentaje; los porcentajes de ligero, profundo y REM se calculan sobre el tiempo dormido y el
   tiempo despierto se muestra en minutos aparte.
3. **Given** cualquier noche con fases, **When** se comprueba, **Then** ligero + profundo + REM
   coincide con el tiempo dormido con un margen de 1 minuto, y las 4 fases suman el tiempo en cama de
   la sesión con el mismo margen.
4. **Given** la vista de fases, **When** la veo, **Then** hay un aviso de que los relojes suelen
   subestimar el tiempo despierto, la insignia "Del reloj" y la frase "No es un dispositivo médico".
5. **Given** que la importación existe y no tengo datos importados, **When** abro "Fases" en
   Tendencias, **Then** veo "Importa tus datos →" (006, FR-012), que lleva a "Importar del reloj".
6. **Given** noches sin fases (anotadas, o de Apple sin fases), **When** las veo, **Then** no aparece
   ningún gráfico ni porcentaje de fases, ni estimado ni a 0.
7. **Given** cualquier texto de la vista, **When** se ejecuta la prueba de términos prohibidos,
   **Then** pasa: no hay lenguaje clínico, no se puntúa la noche y las fases no se califican como
   buenas o malas.

---

### User Story 6 - Otros dispositivos y borrado por fuente (Priority: P2)

Como usuario de otro dispositivo, importo un CSV genérico con inicio, fin y fase. Y para cualquier
fuente, puedo revocar mi consentimiento y borrar todo lo que importé de ella.

**Why this priority**: abre la feature a cualquier dispositivo y cumple el principio VIII
(revocación por fuente con elección de borrar); no es necesario para el primer uso con Huawei.

**Independent Test**: CSV con cabecera `inicio,fin,fase` y 12 filas de 2 noches → resumen "Encontramos
2 noches con fases. ¿Importar?" → 2 noches "Del reloj" de la fuente "Otro dispositivo (CSV)"; CSV con
una fila de fase "siesta" desconocida → error con el número de fila y nada importado; en Cuenta →
"Fuentes de datos", Huawei Health → "Revocar y borrar sus datos" → confirmación con recuentos → 0
noches, siestas y tramos de Huawei; las noches anotadas y las de CSV siguen intactas.

**Acceptance Scenarios**:

1. **Given** un CSV con las columnas inicio, fin y fase (ligero, profundo, REM, despierto) y horas con
   zona horaria, **When** lo importo, **Then** se forman sesiones con las reglas de US2 y se sigue el
   mismo flujo de consentimiento, resumen y confirmación.
2. **Given** un CSV con filas inválidas (hora sin zona horaria, fin anterior al inicio, fase
   desconocida), **When** lo leo, **Then** veo los errores con su número de fila (los primeros 10) y
   no se importa nada.
3. **Given** la plantilla del CSV, **When** abro la guía, **Then** puedo descargar un ejemplo con el
   formato esperado.
4. **Given** una fuente con datos importados, **When** abro Cuenta → "Fuentes de datos", **Then** veo
   cada fuente con la fecha del consentimiento, la última importación y cuántas noches, siestas y
   tramos tiene.
5. **Given** una fuente, **When** pulso "Borrar todo lo importado de esta fuente", **Then** veo una
   confirmación con los recuentos y, al confirmar, se borran solo las noches, siestas, tramos y lotes
   de esa fuente y de mi usuario.
6. **Given** una fuente, **When** revoco el consentimiento, **Then** elijo entre "Conservar los datos
   importados" y "Borrar los datos importados"; en ambos casos no puedo volver a importar de esa
   fuente sin dar de nuevo el consentimiento.
7. **Given** noches anotadas vinculadas a sesiones de la fuente borrada, **When** se borra, **Then** las
   noches anotadas siguen intactas y vuelven a ser las principales.

---

### Edge Cases

- **Archivo vacío o sin noches**: el resumen dice "No encontramos noches en este archivo" y no hay
  nada que confirmar.
- **Reimportar el mismo archivo** (misma huella): "Este archivo ya está importado; no hay datos
  nuevos". Reimportar una exportación nueva solo añade lo nuevo.
- **Formato desconocido o versión nueva de Huawei**: "Formato de Huawei no reconocido"; nada a
  medias. Las marcas de tiempo en segundos o milisegundos se distinguen sin intervención del usuario.
- **Contraseña incorrecta** o ZIP no cifrado cuando se esperaba cifrado: error claro, nada importado.
- **Archivo mayor que el máximo aceptado**: se rechaza antes de leerlo, con el tamaño máximo en el
  mensaje.
- **Tramos solapados entre sí dentro de una misma fuente** (no idénticos): no se cuentan dos veces; el
  tiempo solapado se asigna a una sola fase, y la suma sigue cumpliendo el margen de 1 min.
- **Tramos con fin anterior al inicio o de duración 0**: se descartan y se cuentan en el resumen como
  "ignorados".
- **Sesión de más de 24 h**: se rechaza como dato inválido y se cuenta como ignorada.
- **Sesión solo de "despierto"**: no crea noche.
- **Noches con fases parciales** (tramos sin fase conocida): la parte sin fase se muestra como "sin
  fase", nunca como 0 ni repartida entre fases.
- **Siesta de la pulsera solapada con una siesta anotada**: la anotada se conserva y prevalece; el
  tiempo no se cuenta dos veces.
- **Siesta de la pulsera solapada con una noche**: se importa como siesta, no suma a la noche.
- **Apple sin siestas**: Apple no distingue siestas; sus sesiones se importan como noches.
- **Cambio de hora oficial y medianoche**: pruebas explícitas antes y después de medianoche y en los
  dos cambios de hora del año (principio III).
- **Cambio de zona horaria del perfil después de importar**: las noches ya importadas no se mueven;
  solo afecta a importaciones futuras.
- **Noche "Del reloj" borrada a mano**: se borra; si reimporto un archivo que la contiene, vuelve como
  nueva y el resumen la cuenta.
- **Noche "Del reloj" corregida a mano**: la corrección se conserva en reimportaciones y la noche
  indica "Corregida por ti".
- **Dos fuentes que cubren la misma noche** (Huawei y CSV): se vinculan como una sola noche; prevalece
  la fuente importada primero y la otra queda vinculada sin sumar.
- **Importación en iPhone** con un archivo grande que no cabe en memoria: mensaje claro y recomendación
  de usar un ordenador; nada a medias.
- **Pestaña cerrada o red caída durante la importación**: el lote se guarda entero o nada; reintentar
  no duplica.
- **Exportar mis datos y borrar la cuenta**: la exportación incluye fuentes, consentimientos, lotes,
  sesiones, tramos y la preferencia; borrar la cuenta lo borra todo.
- **Dos usuarios**: las fuentes, lotes, sesiones y tramos de uno nunca son visibles ni borrables por
  el otro (404).

## Requirements *(mandatory)*

### Functional Requirements

**Consentimiento y privacidad**

- **FR-001**: Antes de la primera importación de cada fuente, la app MUST pedir un consentimiento
  explícito que diga qué datos se leen (solo sueño y siestas), que el resto del archivo no sale del
  navegador, que se puede revocar y que la app no es un dispositivo médico. Sin consentimiento vigente
  MUST NOT poder importarse de esa fuente.
- **FR-002**: El archivo MUST leerse y, si está cifrado, descifrarse en el navegador. La contraseña
  MUST NOT enviarse al servidor ni guardarse (ni en el navegador ni en registros).
- **FR-003**: Del archivo MUST salir del navegador solo la información de sueño y siestas necesaria
  (sesiones, tramos y siestas); el resto del contenido MUST NOT enviarse.
- **FR-004**: La exportación real del usuario MUST NOT entrar en el repositorio; las pruebas MUST usar
  datos sintéticos o anonimizados, con al menos un ejemplo por versión conocida de cada formato.

**Importación (US1, US4, US6)**

- **FR-005**: La app MUST ofrecer, por fuente, una guía con capturas para obtener el archivo; la de
  Huawei MUST indicar la ruta (Yo → Centro de privacidad → Solicitar datos → Salud), que Huawei puede
  tardar hasta 7 días y que el enlace caduca a los 21 días.
- **FR-006**: La app MUST aceptar el ZIP cifrado de Huawei Health, el `export.zip` de Apple Health y un
  CSV con las columnas inicio, fin y fase (horas ISO 8601 con zona horaria; fases ligero, profundo,
  REM y despierto), con una plantilla descargable.
- **FR-007**: Una contraseña incorrecta, un formato no reconocido o un CSV con filas inválidas MUST
  mostrar un error claro ("La contraseña no es correcta", "Formato de Huawei no reconocido", "Formato
  de Apple Health no reconocido" o los errores con número de fila) y MUST NOT importar nada.
- **FR-008**: Un archivo mayor que el tamaño máximo aceptado (fijado en el plan tras el spike; al menos
  1 GB para Apple Health) MUST rechazarse antes de leerlo, con el máximo en el mensaje.
- **FR-009**: Durante la lectura MUST mostrarse el progreso y la interfaz MUST seguir respondiendo;
  se MUST poder cancelar sin guardar nada.
- **FR-010**: Antes de guardar, MUST mostrarse un resumen con las noches encontradas, cuántas con
  fases, las siestas, el rango de fechas, lo ya importado, lo ignorado y las coincidencias con noches
  anotadas; solo al confirmar se guarda.
- **FR-011**: Cada lote MUST guardarse de forma atómica (todo o nada) y ser idempotente: reimportar el
  mismo archivo o una exportación solapada MUST NOT duplicar noches, siestas ni tramos.

**Sesiones y fechas (US2)**

- **FR-012**: Los tramos idénticos (misma fase, inicio y fin) MUST contarse una vez. Los tramos de una
  fuente MUST agruparse en una sesión mientras los huecos entre ellos sean menores de 30 min (umbral
  que confirma el spike); un hueco de 30 min o más empieza otra sesión. Si una noche con un despertar
  largo (≥ 30 min sin tramos) queda en dos sesiones con la misma fecha de la noche, MUST unirse en una
  sola noche y el hueco MUST mostrarse como "sin dato" (nunca como despierto ni como 0).
- **FR-013**: Donde dos dispositivos de Apple cubran el mismo tiempo, MUST prevalecer el Watch.
- **FR-014**: La fecha de la noche de cada sesión MUST seguir la regla del principio III en hora local,
  con pruebas explícitas antes y después de medianoche y en los cambios de hora.
- **FR-015**: Las horas de Huawei (sin zona horaria) MUST interpretarse con la zona horaria actual del
  perfil, calculando el desfase en cada instante; la pantalla de importación MUST explicarlo ("Las
  noches de viaje se asignan con tu zona horaria actual; puedes corregirlas a mano").
- **FR-016**: Las siestas de Huawei MUST importarse como siestas con el origen "Del reloj" y MUST NOT
  sumar a la noche. Una siesta importada que solape una siesta anotada MUST NOT contarse dos veces; la
  anotada prevalece.
- **FR-017**: Una noche "Del reloj" MUST poder corregirse y borrarse a mano; la corrección MUST
  conservarse en reimportaciones y mostrarse como "Corregida por ti".

**Conciliación (US3)**

- **FR-018**: Lo anotado a mano MUST NOT borrarse ni sobrescribirse por una importación, un cambio de
  preferencia ni un borrado por fuente.
- **FR-019**: La app MUST ofrecer una preferencia global "Usar el reloj" / "Usar mis noches
  anotadas", modificable en Ajustes y en el aviso de coincidencias. Mientras no se haya elegido, la
  primera importación con coincidencias MUST preguntarla (con "Usar el reloj" preseleccionado) antes de
  confirmar.
- **FR-020**: Una sesión que solape una noche anotada cerrada MUST vincularse a ella; la preferencia
  decide cuál es la principal y cambiarla MUST cambiar todas las vinculadas a la vez. Una sesión sin
  noche anotada que la solape MUST crear una noche "Del reloj". Una noche anotada abierta MUST NOT
  modificarse; se concilia al cerrarla.
- **FR-021**: Las coincidencias de una importación MUST mostrarse en **un único aviso agrupado**.
- **FR-022**: Cada noche MUST contarse una sola vez (por su noche principal) en Tendencias, el horario
  y la racha; la duración diaria MUST NOT sumar una noche anotada y su sesión vinculada.

**Relación con 010 y 011**

- **FR-023**: Una noche "Del reloj" (o una vinculada cuya principal es la sesión) MUST NOT marcarse
  nunca "Anotado después" ni "hora propuesta"; esas marcas son solo de noches anotadas y se conservan
  en ellas.
- **FR-024**: En la racha de 011, una noche cuya principal es una sesión del reloj MUST contar como una
  noche registrada, evaluada con las horas de acostarse y levantarse de la sesión, y solo desde la
  activación de la racha (importar noches anteriores no desbloquea logros).

**Fases (US5)**

- **FR-025**: Cada noche con fases MUST mostrar un gráfico de 4 carriles (despierto, REM, ligero,
  profundo) y una tabla equivalente, accesible y sin depender solo del color.
- **FR-026**: La tabla MUST mostrar los minutos y el porcentaje de cada fase dormida sobre el tiempo
  dormido, y el tiempo despierto en minutos; ligero + profundo + REM MUST coincidir con el tiempo
  dormido ±1 min, y las 4 fases con el tiempo en cama ±1 min. La parte sin fase conocida MUST
  mostrarse como "sin fase", nunca como 0.
- **FR-027**: La vista de fases MUST mostrar la insignia "Del reloj", "No es un dispositivo médico" y un
  aviso de que los relojes suelen subestimar el tiempo despierto. MUST NOT puntuar la noche ni
  calificar las fases, y sus textos MUST pasar la prueba de términos prohibidos de 006 (incluida la
  forma prohibida de expresar el porcentaje de REM; se usa "REM 80 min · 35 %").
- **FR-028**: La sección "Fases" de Tendencias MUST mostrar las fases importadas y, sin datos
  importados, "Importa tus datos →" (006, FR-012). La app MUST NOT estimar fases (006, FR-013).
- **FR-029**: Toda noche y siesta importada MUST mostrar el origen "Del reloj" (006); en bloques con
  orígenes mezclados, cada fila lleva el suyo.

**Fuentes y borrado (US6)**

- **FR-030**: Cuenta → "Fuentes de datos" MUST listar cada fuente con la fecha del consentimiento, la
  última importación y los recuentos de noches, siestas y tramos.
- **FR-031**: El usuario MUST poder borrar todo lo importado de una fuente tras una confirmación
  explícita con los recuentos; MUST borrarse solo lo de esa fuente y ese usuario, y quedar probado
  (principio II).
- **FR-032**: Revocar el consentimiento de una fuente MUST ofrecer "Conservar los datos importados" o
  "Borrar los datos importados"; tras revocar, MUST NOT poder importarse de ella sin un consentimiento
  nuevo.

**Datos y aislamiento**

- **FR-033**: Fuentes, consentimientos, lotes, sesiones, tramos y la preferencia de conciliación MUST
  incluirse en la exportación de datos y borrarse con la cuenta.
- **FR-034**: Todas las rutas nuevas MUST filtrar por usuario (lo ajeno → 404) y entrar en la suite de
  aislamiento de dos usuarios; el esquema solo crece (migración aditiva).

### Key Entities *(include if feature involves data)*

- **Fuente con consentimiento** (por persona): fuente (Huawei Health, Apple Health, Otro dispositivo
  CSV), fecha del consentimiento, fecha de revocación si la hay.
- **Lote de importación** (por persona): fuente, fecha, huella del archivo (para detectar el mismo
  archivo), recuentos de lo importado, ignorado y coincidente.
- **Sesión del reloj** (por persona): fuente, identificador estable derivado del contenido (para no
  duplicar), lote, hora de acostarse y de levantarse con zona horaria, fecha de la noche, si tiene
  fases, si fue corregida a mano, y la noche anotada vinculada si la hay.
- **Tramo de fase** (de una sesión): fase (despierto, ligero, profundo, REM o sin fase), inicio y fin;
  se borra con su sesión.
- **Noche** (existente, 003): gana el origen "Del reloj" y la fuente cuando nace de una sesión.
- **Siesta** (existente, 005): gana el origen "Del reloj" y la fuente cuando viene de la pulsera.
- **Preferencia de conciliación** (por persona): "Usar el reloj" o "Usar mis noches anotadas".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El usuario importa su exportación real de Huawei Health en su teléfono Android, desde
  que tiene el archivo hasta ver sus noches con fases, en menos de 5 minutos y sin que la interfaz deje
  de responder.
- **SC-002**: Reimportar el mismo archivo o una exportación solapada crea 0 noches, siestas o tramos
  duplicados (pruebas con datos repetidos entre archivos y entre lotes).
- **SC-003**: 0 caracteres de la contraseña y 0 datos ajenos al sueño llegan al servidor (verificado
  inspeccionando lo enviado durante una importación de prueba).
- **SC-004**: Pruebas de propiedades sobre historiales al azar: ninguna noche anotada cambia ni
  desaparece tras importar, cambiar la preferencia o borrar una fuente; ningún día de Tendencias
  cuenta dos veces el mismo tiempo.
- **SC-005**: En el 100 % de las noches con fases, ligero + profundo + REM coincide con el tiempo
  dormido ±1 min.
- **SC-006**: La fecha de la noche es correcta en el 100 % de los casos de prueba antes y después de
  medianoche y en los dos cambios de hora del año.
- **SC-007**: Un archivo erróneo (contraseña, formato o filas inválidas) deja 0 datos guardados.
- **SC-008**: Tras borrar una fuente quedan 0 datos de esa fuente y el 100 % de los de otras fuentes y
  de las noches anotadas.
- **SC-009**: Las coincidencias de una importación generan exactamente 1 aviso, sea cual sea su número.
- **SC-010**: 0 textos de la feature con términos prohibidos (prueba automática de 006).
- **SC-011**: La suite de aislamiento de dos usuarios cubre el 100 % de las rutas nuevas.
- **SC-012**: Si la parte de Apple sigue adelante tras su spike, una exportación de 1 GB se importa en
  un navegador de escritorio sin errores de memoria.

## Assumptions

- **Spike previo**: el plan depende del spike con la exportación real de Huawei (sección "Requisito
  previo"); si falla, 007 se reduce a Apple/CSV y se informa al usuario.
- **Valor por defecto de la conciliación (FR-019)** — decidido en la aclaración del 2026-10-05: **preguntar en la primera
  importación con coincidencias**, con "Usar el reloj" preseleccionado (es el objetivo de la feature:
  medido frente a recordado) y cambiable en Ajustes. Mientras no haya coincidencias, la preferencia no
  importa.
- **Racha de 011 (FR-024)** — decidido en la aclaración del 2026-10-05: una noche cuya principal es una sesión del reloj
  **cuenta como una noche registrada**, evaluada con sus horas de acostarse y levantarse (son horas
  medidas, más fiables que las anotadas). Acostarse y levantarse a tu hora sigue siendo una conducta
  controlable; saltarse un registro no puede mejorarla, porque la ausencia de sesión es "sin registro"
  como siempre. Solo cuenta desde la noche de activación de la racha; importar noches antiguas no
  desbloquea logros retroactivos anteriores a esa activación.
- **Despertar largo (FR-012)** — decidido en la aclaración del 2026-10-05: **unir en una sola noche** las sesiones con la
  misma fecha de la noche, con el hueco como "sin dato" (no despierto ni 0), para no crear dos noches
  en un día; la duración de la noche es el tiempo dormido de ambas.
- **Tamaño máximo**: se fija en el plan tras los spikes; al menos 1 GB para Apple Health. La exportación
  de Huawei suele ser mucho menor.
- **Zona horaria**: las importaciones de Huawei usan la zona horaria del perfil (008) en el momento de
  importar; Apple y CSV traen la suya.
- **Fuentes simultáneas**: si dos fuentes importadas cubren la misma noche, prevalece la importada
  primero; es un caso raro para una app personal.
- **Siestas**: solo Huawei distingue siestas; la siesta anotada siempre prevalece sobre la importada,
  sea cual sea la preferencia (la preferencia es de noches).
- **010**: el horario y "¿Ya despertaste?" siguen funcionando con noches anotadas; una importación no
  cierra noches abiertas. Las noches "Del reloj" nunca llevan "Anotado después" ni "hora propuesta".
- **Fases y principio VIII**: las fases importadas son mediciones del dispositivo, no de la app, y se
  muestran como tales; no se premian ni se puntúan (011 no las usa).
- **Dispositivos**: el flujo de Huawei debe funcionar en Chrome para Android; en iPhone, si un archivo
  no cabe en memoria, la guía recomienda un ordenador.
- **Fuera de alcance**: sincronización automática (Health Sync → Google Health API, opción de 009);
  la API oficial de HUAWEI Health Kit; apps nativas; frecuencia cardiaca y variabilidad cardiaca.
- La enmienda MINOR del principio II (borrado a petición del dueño) ya está aplicada (constitución
  v2.0.0).
