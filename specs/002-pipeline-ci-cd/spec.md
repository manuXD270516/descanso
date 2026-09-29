# Feature Specification: Pipeline de construcción y despliegue continuo

**Feature Branch**: `002-pipeline-ci-cd`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: `docs/sdd/features/002-pipeline-ci-cd.md`. Como único usuario y
mantenedor, que cada integración en la rama principal termine en una versión desplegada y
verificada, sin pasos manuales:

- validación obligatoria de los cambios;
- imagen versionada y despliegue con verificación de salud;
- respaldos diarios con restauración probada;
- CI de menos de 5 minutos;
- entorno local en un comando;
- estado y versión visibles.

## Clarifications

### Session 2026-09-29

- Q: ¿Cómo se garantiza que un PR en rojo no se pueda integrar, si en un repositorio privado
  con plan gratuito no se pueden exigir checks? → A: Se hace público el repositorio y se protege
  la rama principal exigiendo el check de validación.
- Q: ¿Dónde se despliega, si el plan gratuito del proveedor actual no tiene disco persistente?
  → A: En el proveedor actual, en un plan de pago con disco persistente.
- Q: ¿Cómo se obtiene el respaldo diario si la base vive en el disco del servicio desplegado?
  → A: El servicio entrega una copia consistente a través de un punto de acceso protegido con un
  token secreto. Una tarea programada del pipeline (que también se puede lanzar a mano) la
  descarga, la sube al almacenamiento de respaldos y borra los respaldos de más de 14 días.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validar cada cambio antes de integrarlo (Priority: P1)

Al abrir o actualizar un pull request, el pipeline ejecuta el lint, los tests de backend y
frontend y el build de producción. Si algo falla, el cambio no se puede integrar en la rama
principal.

**Why this priority**: es la red de seguridad para todo lo demás. Sin ella, un despliegue
automático publicaría errores.

**Independent Test**: abrir un PR con un test roto y comprobar que el pipeline falla y que la
integración queda bloqueada; arreglarlo y comprobar que pasa.

**Acceptance Scenarios**:

1. **Given** un PR con todo correcto, **When** se abre, **Then** el pipeline ejecuta lint, tests
   de backend, tests de frontend y build, y el PR queda en verde.
2. **Given** un PR con un error de lint, un test fallido o un build roto, **When** se ejecuta el
   pipeline, **Then** el PR queda en rojo, indica qué paso falló, y no puede integrarse.
3. **Given** un PR cuyas dependencias no cambiaron respecto a la ejecución anterior, **When** se
   ejecuta el pipeline, **Then** termina en menos de 5 minutos.

---

### User Story 2 - Publicar y desplegar automáticamente cada integración (Priority: P1)

Al integrar en la rama principal se construye una imagen del servicio etiquetada con el
identificador del commit y con `latest`, se publica en el registro de imágenes y se despliega en
el proveedor configurado. El despliegue solo se da por bueno si el chequeo de salud responde
correctamente en un máximo de 60 segundos.

**Why this priority**: es el objetivo central de la feature: cero pasos manuales entre integrar
y tener la versión en producción.

**Independent Test**: integrar un cambio trivial y comprobar que aparece una imagen nueva con el
identificador del commit, que la app pública muestra esa versión y que el chequeo de salud
responde.

**Acceptance Scenarios**:

1. **Given** un merge en la rama principal, **When** termina el pipeline, **Then** existe una
   imagen etiquetada con el identificador completo del commit y con `latest`, que apuntan al
   mismo contenido.
2. **Given** la imagen publicada, **When** se despliega, **Then** el pipeline espera a que el
   chequeo de salud responda "ok" y marca el despliegue como exitoso.
3. **Given** una versión nueva que no responde al chequeo de salud en 60 s, **When** se
   despliega, **Then** el pipeline falla, lo notifica, y la versión anterior sigue atendiendo.
4. **Given** un push directo a una rama que no es la principal, **When** se ejecuta el
   pipeline, **Then** no se publica ninguna imagen ni se despliega.
5. **Given** dos merges seguidos, **When** se despliegan, **Then** el segundo espera o reemplaza
   al primero, y nunca quedan dos despliegues en paralelo.

---

### User Story 3 - Datos a salvo: persistencia y respaldos restaurables (Priority: P1)

La base de datos sobrevive a cualquier redespliegue. Una vez al día se genera automáticamente
un respaldo consistente, que se guarda fuera del servicio y se conserva 14 días. Existe un
procedimiento de restauración documentado y probado al menos una vez.

**Why this priority**: son años de datos personales; perderlos anularía el valor del producto
(principio II).

**Independent Test**: registrar un dato, redesplegar y ver que sigue; forzar un respaldo;
restaurarlo en un entorno limpio siguiendo el procedimiento y comprobar que el dato está.

**Acceptance Scenarios**:

1. **Given** datos registrados en producción, **When** se despliega una versión nueva, **Then**
   el 100 % de los datos sigue disponible.
2. **Given** que pasan 24 h, **When** corre la tarea programada, **Then** existe un respaldo
   nuevo, fechado y completo, fuera del servicio.
3. **Given** respaldos de más de 14 días, **When** corre la tarea, **Then** esos respaldos se
   eliminan y se conservan los de los últimos 14 días.
4. **Given** un respaldo, **When** se sigue el procedimiento de restauración documentado,
   **Then** la app vuelve a mostrar exactamente los datos de ese respaldo.
5. **Given** que el respaldo falla, **When** termina la tarea, **Then** se notifica el fallo, y
   los respaldos anteriores no se tocan.
6. **Given** la necesidad de un respaldo inmediato (por ejemplo, antes de una migración),
   **When** se lanza la tarea a mano, **Then** genera un respaldo igual que la programada.
7. **Given** una petición de copia sin token o con un token inválido, **When** llega al
   servicio, **Then** se rechaza con 401 y no se entrega ningún dato.

---

### User Story 4 - Entorno local en un solo comando (Priority: P2)

Quien desarrolla puede levantar la app completa (API y frontend) en su máquina con un único
comando, con los datos en un volumen local que persiste entre arranques.

**Why this priority**: acelera el trabajo diario, pero no bloquea el despliegue.

**Independent Test**: en una máquina con los requisitos instalados, clonar el repo, ejecutar el
comando y abrir la app.

**Acceptance Scenarios**:

1. **Given** un clon limpio del repositorio, **When** se ejecuta el comando único, **Then** la
   app completa responde en un puerto local documentado y el chequeo de salud devuelve "ok".
2. **Given** datos registrados en local, **When** se detiene el entorno y se vuelve a levantar,
   **Then** los datos siguen ahí.

---

### User Story 5 - Estado y versión visibles (Priority: P3)

El README muestra el estado del pipeline de la rama principal. La app muestra en el pie de
página la versión desplegada, que coincide con el commit publicado.

**Why this priority**: da visibilidad y ayuda al diagnóstico, pero no aporta funcionalidad.

**Independent Test**: tras un despliegue, comparar el identificador del pie de página con el del
commit desplegado y con el indicador del README.

**Acceptance Scenarios**:

1. **Given** el README, **When** se visualiza, **Then** muestra un indicador del estado del
   último pipeline de la rama principal, que enlaza a sus ejecuciones.
2. **Given** una versión desplegada, **When** se abre la app, **Then** el pie de página muestra
   el identificador corto del commit desplegado.
3. **Given** el entorno local sin versión inyectada, **When** se abre la app, **Then** el pie
   muestra "dev".

### Edge Cases

- Chequeo de salud lento pero exitoso (por ejemplo, 45 s): el despliegue se acepta.
- Si el proveedor de hosting o el registro de imágenes no están disponibles, el pipeline falla
  con un mensaje claro y no deja el servicio a medias.
- Si un respaldo coincide con escrituras en curso, el respaldo debe ser consistente y no una
  copia parcial.
- Si el almacenamiento de respaldos no tiene credenciales o no se puede alcanzar, la tarea falla
  y notifica; no borra nada.
- Un PR que solo cambia documentación también se valida, pero no puede superar el límite de
  tiempo.
- Si se revierte un merge, la reversión se despliega como cualquier otro merge.

## Requirements *(mandatory)*

### Functional Requirements

**Validación de cambios**

- **FR-001**: Cada PR hacia la rama principal MUST ejecutar lint de backend y frontend, tests de
  backend, tests de frontend y el build de producción.
- **FR-002**: Un PR con cualquiera de esas verificaciones en rojo MUST NOT poder integrarse en
  la rama principal. La rama principal MUST exigir que el check de validación esté en verde
  antes de integrar. Para eso el repositorio pasa a ser público (ver Clarifications).
- **FR-003**: El pipeline de PR MUST reutilizar las dependencias descargadas en ejecuciones
  anteriores cuando no hayan cambiado.

**Publicación y despliegue**

- **FR-004**: Cada integración en la rama principal MUST construir y publicar una imagen del
  servicio con dos etiquetas: el identificador completo del commit y `latest`.
- **FR-005**: La construcción de la imagen MUST reutilizar las capas que no cambiaron.
- **FR-006**: Tras publicar, el pipeline MUST desplegar esa imagen exacta (por su identificador
  de commit) en el proveedor configurado. El proveedor es el actual, en un plan de pago que
  incluye disco persistente para la base (ver Clarifications).
- **FR-007**: El despliegue MUST considerarse fallido si el chequeo de salud no responde
  correctamente en 60 s; en ese caso MUST notificarse, y la versión anterior MUST seguir
  sirviendo.
- **FR-008**: Los despliegues MUST ejecutarse de uno en uno. Uno nuevo cancela o espera al que
  esté en curso, pero nunca corren dos en paralelo.

**Datos y respaldos**

- **FR-009**: Los datos MUST persistir entre despliegues, reinicios y cambios de versión.
- **FR-010**: Un respaldo consistente de la base MUST generarse automáticamente al menos una vez
  cada 24 h y guardarse fuera del servicio de la app.
- **FR-011**: Los respaldos de más de 14 días MUST eliminarse automáticamente, y los de los
  últimos 14 días MUST conservarse.
- **FR-012**: El respaldo MUST poder lanzarse también a mano.
- **FR-013**: Un fallo del respaldo MUST notificarse y MUST NOT borrar respaldos existentes.
- **FR-014**: MUST existir un procedimiento de restauración documentado, y MUST haberse
  ejecutado con éxito al menos una vez restaurando un respaldo real.

**Entorno local**

- **FR-015**: MUST existir un único comando documentado que levante la app completa en local,
  con los datos en un almacenamiento local persistente.

**Visibilidad**

- **FR-016**: El README MUST mostrar un indicador del estado del pipeline de la rama principal.
- **FR-017**: La app MUST mostrar en el pie de página la versión desplegada (identificador corto
  del commit), o "dev" si no hay versión inyectada.
- **FR-018**: El servicio MUST exponer su versión en el chequeo de salud, para que el pipeline y
  quien opere puedan verificar qué versión está en producción.

**Seguridad**

- **FR-019**: Las credenciales (registro de imágenes, proveedor de hosting, almacenamiento de
  respaldos) MUST guardarse como secretos de la plataforma de CI/CD; ninguna MUST estar en el
  repositorio (principio V).
- **FR-020**: Los respaldos MUST guardarse en un almacenamiento privado, sin acceso público.
- **FR-021**: El servicio MUST entregar una copia consistente de la base solo a quien presente un
  token secreto válido. Sin token, o con uno inválido, MUST responder 401 sin revelar datos. Si
  el token no está configurado en el servicio, el punto de acceso MUST estar deshabilitado.
  Las credenciales del almacenamiento de respaldos MUST estar solo en la plataforma de CI/CD,
  no en el servicio.

### Key Entities

- **Imagen publicada**: el artefacto desplegable. Se identifica por el commit, lleva también la
  etiqueta `latest` y se guarda en el registro de imágenes.
- **Despliegue**: la puesta en marcha de una imagen concreta en el proveedor. Estado:
  en curso, exitoso o fallido; su versión es el commit.
- **Token de respaldo**: el secreto compartido entre el pipeline y el servicio que autoriza a
  pedir una copia de la base.
- **Respaldo**: una copia consistente de la base en una fecha y hora. Se identifica por la fecha,
  se guarda fuera del servicio y caduca a los 14 días.
- **Versión**: el identificador del commit desplegado; visible en el pie de página y en el
  chequeo de salud.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con caché caliente, el 100 % de 5 ejecuciones consecutivas del pipeline de PR
  termina en menos de 5 minutos.
- **SC-002**: En el 100 % de las integraciones en la rama principal, la versión del pie de
  página coincide con el commit integrado sin ninguna acción manual.
- **SC-003**: Un despliegue cuyo chequeo de salud no responde se marca como fallido en 60 s como
  máximo desde que la versión arranca, y la app sigue respondiendo con la versión anterior.
- **SC-004**: Tras 3 redespliegues consecutivos, el 100 % de los datos registrados antes sigue
  disponible.
- **SC-005**: En cualquier momento hay un respaldo de menos de 24 h, y nunca hay respaldos de
  más de 14 días.
- **SC-006**: Siguiendo solo la documentación, la restauración de un respaldo termina en menos
  de 15 minutos y los datos coinciden al 100 %.
- **SC-007**: Desde un clon limpio, el entorno local responde con un solo comando en menos de
  10 minutos (primera construcción incluida).
- **SC-008**: Cero credenciales en el repositorio.

## Assumptions

- "main" en la descripción se refiere a la rama principal del repositorio, que hoy se llama
  `master`. La spec dice "rama principal" y no exige renombrarla.
- Hay una sola persona usuaria y mantenedora; las notificaciones de fallo son las que la
  plataforma de CI/CD envía por defecto (correo o panel de ejecuciones).
- El workflow de CI mínimo de la feature 001 (lint, tests y build) es la base que esta feature
  amplía; no se duplica.
- El almacenamiento de respaldos es un bucket compatible con S3 aportado por el usuario (por
  ejemplo, uno con capa gratuita), con credenciales de acceso limitado.
- Un tiempo breve sin servicio durante un despliegue es aceptable (es uso personal); lo que no
  es aceptable es perder datos o quedarse con una versión rota.
- El entorno local requiere tener instalado el motor de contenedores.
- Se acepta un coste mensual pequeño y fijo de hosting (plan de pago con disco persistente).
