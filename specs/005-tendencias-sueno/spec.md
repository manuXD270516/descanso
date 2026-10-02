# Feature Specification: Tendencias y sueño pendiente (dashboard)

**Feature Branch**: `005-tendencias-sueno`

**Created**: 2026-10-02

**Status**: Draft

**Input**: User description: `docs/sdd/features/005-tendencias-sueno.md`. Entender mi descanso a lo
largo del tiempo: si duermo las horas que quiero, cuánto sueño llevo pendiente y si soy regular,
con palabras y sin jerga. Cada usuario ve solo sus datos (constitución v2.0.0).

## Clarifications

### Session 2026-10-02

- Q: ¿Cuál es el objetivo de sueño por defecto, si 005 dice 7 h y 008 ya desplegó 8 h? → A: **7 h**
  por defecto, configurable, y **adaptado a los ciclos de sueño**: al editarlo se sugieren
  duraciones de ciclos completos.
- Q: ¿Cómo se adapta el objetivo a los ciclos? → A: Se **sugieren** atajos de ciclos completos
  (4 ciclos → 6 h, 5 → 7 h 30, 6 → 9 h, con ciclos de 90 min) y se dice a cuántos ciclos equivale el
  objetivo; el objetivo nunca cambia solo. Cuando exista la feature 006, las sugerencias usarán la
  duración de ciclo estimada de cada persona.
- Q: ¿Cómo se calcula el "sueño pendiente" de 14 días? → A: **Neto**: objetivo × días registrados −
  total dormido en esos días; dormir de más un día compensa otro.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Horas dormidas frente a mi objetivo (Priority: P1)

Como usuario, veo un gráfico de mis últimos 7, 30 o 90 días con mi objetivo marcado y cuántos días
lo alcancé, para saber si duermo lo que quiero.

**Why this priority**: es la pregunta principal del dashboard y la base del resto de indicadores.

**Independent Test**: con noches y siestas sembradas en 30 días (con huecos y una noche abierta),
abrir Tendencias → el gráfico muestra cada día con su total, los huecos como "sin dato", la noche
abierta como "en curso" y el indicador "Días con tus horas objetivo: X de Y" coincide con el cálculo.

**Acceptance Scenarios**:

1. **Given** datos de los últimos 30 días, **When** abro Tendencias, **Then** veo 30 días con las
   horas dormidas de cada uno y una banda que marca mi objetivo.
2. **Given** un día con una noche y dos siestas, **When** se calcula, **Then** su sueño es la suma de
   las tres; con dos noches en la misma fecha, se suman las dos.
3. **Given** un día sin ningún registro, **When** se dibuja, **Then** aparece como "sin dato" (nunca
   como 0) y no cuenta en las medias.
4. **Given** una noche todavía abierta, **When** se dibuja su día, **Then** aparece como "en curso" y
   no cuenta hasta cerrarse.
5. **Given** mi objetivo, **When** veo el indicador, **Then** dice "Días con tus horas objetivo: X de
   Y", donde Y son los días con dato y X los que llegan al objetivo.
6. **Given** el selector de periodo, **When** elijo 7, 30 o 90 días, **Then** todo se recalcula para
   ese periodo.
7. **Given** el gráfico, **When** edito mi objetivo desde él (entre 4 y 12 h), **Then** se guarda y
   todo se recalcula; fuera de rango veo un mensaje en español y no se guarda.

---

### User Story 2 - Sueño pendiente de los últimos 14 días (Priority: P1)

Como usuario, veo cuánto sueño me falta (o me sobra) respecto a mi objetivo en los últimos 14 días,
y cuántos días cubre el cálculo.

**Why this priority**: resume en una frase si estoy durmiendo lo suficiente últimamente.

**Independent Test**: con 8 días registrados en los últimos 14 y un objetivo de 7 h, el texto dice
"Te faltan …" o "Llevas … de más" con la cifra neta exacta y "(8 días registrados)".

**Acceptance Scenarios**:

1. **Given** días registrados en los últimos 14, **When** se calcula, **Then** el pendiente es
   objetivo × días registrados − total dormido en esos días (neto: dormir de más compensa).
2. **Given** un pendiente positivo, **When** se muestra, **Then** dice "Te faltan 3 h 20 min en los
   últimos 14 días (8 días registrados)".
3. **Given** un pendiente negativo o cero, **When** se muestra, **Then** dice "No tienes sueño
   pendiente en los últimos 14 días" y, si sobra, cuánto.
4. **Given** ningún día registrado en 14 días, **When** se muestra, **Then** dice "Aún no hay datos en
   los últimos 14 días".

---

### User Story 3 - Regularidad en palabras (Priority: P2)

Como usuario, veo cuánto varía mi hora de dormir y la de despertar, en una sección plegable.

**Why this priority**: la regularidad importa para descansar, pero es un detalle secundario.

**Independent Test**: con 10 noches cuyas horas de dormir varían ±40 min, la sección dice "Tu hora
de dormir varía ±40 min"; con 6 noches dice "Aún no hay datos suficientes".

**Acceptance Scenarios**:

1. **Given** al menos 7 noches cerradas en el periodo, **When** abro "Regularidad", **Then** veo la
   variación de la hora de dormir y de la de despertar en minutos (por ejemplo "±40 min") y la hora
   media de cada una.
2. **Given** horas a ambos lados de la medianoche (23:30 y 00:30), **When** se calculan, **Then** la
   media es 00:00 y la variación es pequeña (cálculo circular).
3. **Given** menos de 7 noches cerradas, **When** abro "Regularidad", **Then** veo "Aún no hay datos
   suficientes".

---

### User Story 4 - Mi objetivo, adaptado a los ciclos (Priority: P2)

Como usuario, al fijar mi objetivo veo a cuántos ciclos de sueño equivale y puedo elegir con un
toque una duración de ciclos completos.

**Why this priority**: ayuda a elegir un objetivo con sentido; no bloquea el dashboard.

**Independent Test**: con objetivo 7 h, el editor dice "≈ 4,7 ciclos de 90 min" y ofrece 6 h (4),
7 h 30 (5) y 9 h (6); tocar "7 h 30" guarda 450 min.

**Acceptance Scenarios**:

1. **Given** el editor de objetivo, **When** lo abro, **Then** veo mi objetivo, a cuántos ciclos de
   90 minutos equivale (con un decimal) y atajos de ciclos completos dentro de 4–12 h.
2. **Given** un atajo, **When** lo elijo, **Then** el objetivo pasa a ese valor (p. ej. 5 ciclos →
   7 h 30) y se guarda.
3. **Given** el texto de ayuda, **When** se lee, **Then** aclara que la duración de los ciclos es
   aproximada y varía entre personas.
4. **Given** una cuenta que nunca cambió su objetivo, **When** se aplica esta feature, **Then** su
   objetivo es 7 h; una cuenta que sí lo cambió conserva su valor.

---

### User Story 5 - Bienvenida (Priority: P2)

Como usuario nuevo, la primera vez que entro una pantalla opcional me pregunta cuántas horas quiero
dormir; si la salto, mi objetivo queda en 7 h.

**Why this priority**: personaliza el dashboard desde el principio; es opcional.

**Independent Test**: un usuario sin bienvenida vista entra → ve la bienvenida; la salta → no vuelve
a verla y su objetivo es 7 h; otro usuario elige 7 h 30 → queda guardado.

**Acceptance Scenarios**:

1. **Given** un usuario que nunca vio la bienvenida, **When** entra, **Then** ve "¿Cuántas horas
   quieres dormir?" con los atajos de ciclos y la opción "Saltar".
2. **Given** la bienvenida, **When** elige un objetivo o la salta, **Then** no vuelve a aparecer en
   ningún dispositivo.
3. **Given** cada usuario, **When** entra por primera vez, **Then** ve su propia bienvenida
   (independiente de los demás).

---

### User Story 6 - Gráficos accesibles (Priority: P2)

Como usuario con lector de pantalla o baja visión, cada gráfico tiene una descripción y una tabla
alternativa, y el texto tenue se lee bien.

**Why this priority**: principio VII; sin esto los gráficos excluyen a parte de los usuarios.

**Independent Test**: con lector de pantalla, cada gráfico (incluida la cinta de 14 noches de Noche)
anuncia su descripción y ofrece una tabla con los mismos datos; el texto tenue mide ≥ 4,5:1.

**Acceptance Scenarios**:

1. **Given** cualquier gráfico, **When** se recorre con lector de pantalla, **Then** tiene un nombre
   y una descripción con el resumen, y una tabla alternativa con los mismos datos.
2. **Given** la cinta de 14 noches de la pestaña Noche, **When** se recorre, **Then** también tiene
   descripción y tabla alternativa.
3. **Given** el texto tenue de la app, **When** se mide su contraste sobre el fondo, **Then** es
   ≥ 4,5:1.
4. **Given** el dashboard, **When** se muestra, **Then** no usa rojo ni verde para juzgar ni
   puntuaciones, y no tiene siglas.

---

### Edge Cases

- **Periodo sin ningún dato**: los indicadores dicen "sin datos" y el gráfico muestra todos los días
  como "sin dato".
- **Día solo con siestas**: cuenta como día con dato (su sueño son las siestas).
- **Noche que cruza el cambio de horario**: la duración sale de las horas con su desfase (correcta).
- **Noche muy larga** (> 16 h): se dibuja recortada al alto del gráfico y la tabla muestra el valor real.
- **Zona horaria del cliente**: el cliente envía la fecha de la noche de hoy; el servidor no adivina
  "hoy".
- **Fecha `to` futura o inválida**: 400.
- **Objetivo en el límite** (4 h, 12 h): válido.
- **Usuario con muchas noches el mismo día** (siesta larga registrada como noche): se suman.

## Requirements *(mandatory)*

### Functional Requirements

**Dashboard (US1, US2)**

- **FR-001**: El sistema MUST mostrar, para 7, 30 o 90 días que terminan en la fecha de la noche de
  hoy del usuario, el sueño de cada día = noches + siestas con esa fecha.
- **FR-002**: Un día sin registros MUST representarse como "sin dato" y excluirse de medias y
  recuentos; una noche abierta MUST representarse como "en curso" y no contar hasta cerrarse.
- **FR-003**: Arriba MUST mostrarse solo 3 indicadores: media diaria, días con el objetivo (X de Y) y
  sueño pendiente de 14 días.
- **FR-004**: El sueño pendiente MUST calcularse en neto sobre los días registrados de los últimos 14
  días y decir cuántos días cubre.
- **FR-005**: Todo cálculo MUST usar solo los datos del usuario de la sesión.

**Regularidad (US3)**

- **FR-006**: Con al menos 7 noches cerradas en el periodo, MUST mostrarse la variación (desviación
  circular, en minutos) y la media circular de la hora de dormir y de la de despertar; con menos,
  "Aún no hay datos suficientes".

**Objetivo y ciclos (US4)**

- **FR-007**: El objetivo por defecto MUST ser 7 h; MUST poder editarse entre 4 y 12 h desde el
  dashboard y desde el perfil, con 400 y mensaje en español fuera de rango.
- **FR-008**: Las cuentas que nunca cambiaron su objetivo MUST pasar a 7 h; las que lo cambiaron
  MUST conservarlo.
- **FR-009**: El editor MUST mostrar a cuántos ciclos de 90 minutos equivale el objetivo y atajos de
  ciclos completos dentro de 4–12 h, con una nota de que la duración de los ciclos es aproximada.

**Bienvenida (US5)**

- **FR-010**: Cada usuario MUST ver una única vez una bienvenida opcional para fijar el objetivo; al
  saltarla o completarla, MUST quedar registrada para no repetirse.

**Accesibilidad (US6)**

- **FR-011**: Cada gráfico (dashboard y cinta de 14 noches) MUST tener nombre, descripción y una
  tabla alternativa con los mismos datos.
- **FR-012**: El texto tenue MUST tener un contraste ≥ 4,5:1 con su fondo.
- **FR-013**: El dashboard MUST NOT usar rojo o verde para juzgar, puntuaciones ni siglas.

**Esquema**

- **FR-014**: Las filas de noches, siestas y métricas MUST exigir siempre un usuario explícito
  (contracción de expand/contract pendiente desde 004), sin perder ni alterar ninguna fila.

### Key Entities

- **Día de sueño** (calculado): fecha, minutos de noches, minutos de siestas, total, estado (con dato,
  sin dato, en curso).
- **Preferencias del usuario** (existente): objetivo de sueño; se añaden si el objetivo lo eligió el
  usuario y si ya vio la bienvenida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con 90 días de datos, el dashboard responde en menos de 300 ms en el servidor.
- **SC-002**: Los huecos nunca cuentan como 0 (verificado con fixtures con huecos).
- **SC-003**: 23:30 y 00:30 dan una media de 00:00 (verificado).
- **SC-004**: El 100 % de los gráficos tiene descripción y tabla alternativa (verificado en la e2e).
- **SC-005**: El texto tenue mide ≥ 4,5:1 de contraste (verificado con el cálculo WCAG en un test).
- **SC-006**: La migración que contrae `user_id` no pierde ni altera ninguna fila.

## Assumptions

- La duración de ciclo es fija en 90 minutos hasta que 006 estime la de cada persona.
- El periodo termina en la fecha de la noche de hoy que envía el cliente (su zona horaria).
- El dashboard es una pestaña nueva, "Tendencias", junto a Noche, Siestas y Métricas.
- Las features 010 y 011 ampliarán esta misma bienvenida; no crearán otras.
- Corrige en el dashboard la deuda DT-23 (varias noches con la misma fecha se suman).
