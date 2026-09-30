# Debate: Defensor del usuario (resumen fiel)

## Punto de partida

- Hoy registrar una noche es un solo gesto: "Me voy a dormir" / "Ya desperté" (SC-001).
- La interfaz ya tiene tema oscuro.
- La cinta de 14 noches solo muestra un `title` al pasar el cursor; no tiene alternativa en texto.
- El color `--ink-faint` tiene un contraste de unos 3,9:1, por debajo del nivel AA.

## Valor de cada propuesta

| Propuesta | Valor | Por qué |
|---|---|---|
| A | Medio | Para el usuario actual añade un login y no le da nada a cambio. Solo tiene sentido si hay familiares o amigos reales. |
| B | Medio (Alto si se reescribe) | Convierte "controlar el REM" en un diario y una calculadora. Ver el REM real queda en P2 y depende de D. |
| C | Alto | Responde directamente a la petición. El riesgo es la jerga y mostrar demasiados KPI. |
| D | Alto como análisis de factibilidad, Medio como MVP | El `export.xml` es incómodo de usar y solo sirve para una importación puntual. |

## Top 5 por valor/esfuerzo

1. C-US1: duración frente al objetivo.
2. B-P1: descargo e insignias (S).
3. C-US2: deuda de 14 días.
4. D-P1 + reconciliación: importar Apple, siempre que se aplique UX-07.
5. A-HU5: exportar y borrar, como historia independiente para un solo usuario.

**Aplazar o quitar**:
- C-US4: con n ≥ 10 casi nunca mostraría nada y confunde.
- C-US5.
- B-P3: ortosomnia.
- A-HU8.

## Cambios de UX exigidos

| ID | Dónde | Cambio |
|---|---|---|
| UX-01 | B, diario | "Ya desperté" sigue cerrando con 1 toque. Después aparece una tarjeta opcional y descartable con chips: "tardé en dormirme" (<15 / 15–30 / >30) y "despertares" (0 / 1–2 / 3+). |
| UX-02 | B | Sección "Fases" con un estado vacío honesto: "Para ver REM necesitas reloj/anillo. Importa →". |
| UX-03 | B, calculadora | Mostrar ventanas horarias. Colocarla junto a "Me voy a dormir". |
| UX-04 | C, KPIs | 3 KPIs: media, objetivo cumplido y deuda. La regularidad va en un plegable. Nunca las siglas SRI ni DE. |
| UX-05 | C, US4 | Frases en lugar de ρ o IC: "Las noches en que duermes más, tu Energía suele ser algo más alta (23 noches; puede ser casualidad)". |
| UX-06 | C, US1 | Objetivo editable en línea y en el onboarding. |
| UX-07 | D, Apple | Aceptar el `export.zip`. Guía con capturas, barra de progreso y resumen previo ("212 noches, 180 con fases. ¿Importar?"). |
| UX-08 | D, OAuth | Al conectar, decir qué se comparte ("solo tu sueño"). Al desconectar, dos opciones: mantener o borrar lo importado. Mostrar el estado de la última sincronización. |
| UX-09 | D/B, reconciliación | Una preferencia global ("cuando haya reloj, usar el reloj") y un aviso agrupado, no un modal por noche. |
| UX-10 | A, migración | En el primer acceso, "Crea tu contraseña" con un enlace de un solo uso y "Tus 143 noches están a salvo". Sin usar la terminal. |
| UX-11 | A, sesión | Sesión deslizante de 30 días, sin cierre por inactividad. Si la sesión caduca con una noche abierta, mostrar esa noche nada más entrar. |
| UX-12 | A | Recuperación manual solo si hay ≤ 5 usuarios. La invitación explica que nadie más, ni siquiera el administrador, ve sus datos. |
| UX-13 | B/C | Tabla alternativa también para la cinta actual. `--ink-faint` ≥ 4,5:1. |

## Lo que falta

- **N-01**, objetivo y bienvenida (S): se muestra una sola vez con 0 noches y sin objetivo. Si se salta, queda en 420 min y se puede editar.
- **N-02**, recordatorio para cerrar la noche (S): si una noche lleva abierta ≥ 14 h, al abrir la app aparece "¿Olvidaste marcar que despertaste?" con un botón y la hora propuesta. Sin notificaciones push.
- **N-03**, exportar en CSV/JSON con un solo usuario (S): reimportar el archivo en una base vacía da los mismos recuentos.
- **N-04**, PWA instalable (S–M): con una noche abierta, "Ya desperté" se ve sin hacer scroll en una pantalla de 375 px.

## Glosario para el usuario

| Término técnico | Texto para el usuario |
|---|---|
| SRI | Regularidad |
| DE | Variación ±N min |
| Punto medio | Mitad de tu noche |
| ρ | Suelen ir juntos / no vemos relación clara |
| IC y n | Basado en N noches; puede ser casualidad |
| Deuda | Sueño pendiente |
| % cumplimiento | Noches con tus horas objetivo: X de Y |
| Jetlag social | Diferencia entre semana y fin de semana |
| SOL | Tiempo hasta dormirte |
| WASO | Tiempo despierto durante la noche |
| TIB | Tiempo en la cama |
| TST | Tiempo dormido |
| Eficiencia | Tiempo dormido / tiempo en cama |
| Core | Ligero |
| Deep | Profundo |
| Hipnograma | Tus fases de la noche |
| Insignias | Anotado por ti · Estimado · Del reloj |
| Reconciliar | "Esta noche la tienes dos veces: ¿cuál guardamos?" |

**Principios**:
- Frases antes que números.
- Sin puntuaciones ni rojo/verde.
- Fases ocultables con un interruptor.
- Un dato que falta se muestra como "—".

## Preguntas al usuario

1. ¿Qué reloj o anillo usas?
2. ¿Con quién compartirías la app? Si con nadie, aplazar A.
3. ¿Aceptas 2 preguntas opcionales al despertar, o prefieres un solo toque?
