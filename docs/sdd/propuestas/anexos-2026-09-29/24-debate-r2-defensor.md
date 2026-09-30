# Debate ronda 2: Defensor del usuario (E, F)

## Veredictos

**E: valor alto en intención, pero la propuesta lo rebaja.** Cinco puntos concretos:

- **Opt-in escondido.** Como está, la función no existe para el usuario que la pidió. Hay que preguntarlo en la bienvenida ("¿Quieres llevar una racha de constancia? Sí / Ahora no").
- **Premiar la hora de levantarse.** La decisión está bien fundada, pero hay que explicarla en una frase y preguntarla (P1).
- **Contradicción entre documentos.** 15-F define "a tiempo" por la hora de acostarse; 14-E dice que acostarse no puntúa. Hay que unificarlo.
- **Recompensa.** Solo mensajes se queda corto. Propuesta sin patrones oscuros: una colección visible que no caduca.
  - Cada día cumplido enciende una estrella de la semana.
  - Cada hito desbloquea una "constelación" permanente con un **dato personal** ("21 días: tu hora de levantarte varió solo ±18 min").
  - Es feedback informativo, que según Deci 1999 aumenta la motivación.
  - Nada canjeable, sin puntos y sin pérdida.
- **Tolerancia 2/7.** Hay que decirla en claro. Además, `sin_dato` debe consumir tolerancia igual que `fuera_de_ventana` (honestidad).

**F: valor alto.** La fase 1 con ICS es honesta, pero el flujo en el móvil es débil. El aviso con la app abierta aporta poco de noche.

## Cambios de UX

| ID | Problema | Cambio |
|----|----------|--------|
| UX-14 | Dos pantallas de onboarding y 14 campos | Una sola bienvenida: 1) hora de levantarse; 2) la de acostarse se propone (despertar − objetivo − 15 min) y es editable; 3) "Igual todos los días", con la opción "distinto el fin de semana". Se puede saltar |
| UX-15 | El interruptor está escondido | Tarjeta en la bienvenida o tras 3 noches, con un ejemplo y qué se premia |
| UX-16 | Importar .ics: iPhone funciona, pero la app de Google Calendar en Android no importa archivos | Pasos por plataforma con capturas; en Android, "Abrir en Google Calendar (web)"; spike con 1 iPhone y 2 Android; SEQUENCE o aviso de duplicados |
| UX-17 | Pedir permiso en frío | Solo tras "Activar avisos", con una pantalla previa ("no muestra datos de sueño"). En iOS sin PWA, guía de instalación. Si se deniega, ofrecer el calendario |
| UX-18 | El toque en la notificación no lleva a dormir | "Descanso: en 30 min es tu hora de dormir" abre Noche con "Me voy a dormir" visible sin scroll. Sin sonido |
| UX-19 | La racha genera ansiedad antes de dormir | Nada de racha antes de dormir. Tras "Ya desperté": "Día 12 de constancia" + estrella. Las 7 estrellas van en el plegable de 005 |
| UX-20 | Confeti o modal | Tarjeta descartable, una sola vez, con el dato personal. Brillo ≤ 400 ms o nada con `reduced-motion`. `role="status"` |
| UX-21 | Marcar un "fallo" | Estrella apagada + "Te levantaste a las 9:10 (fuera de tu horario)", nunca en rojo |
| UX-22 | Dos pausas distintas | Un solo "Modo pausa (viaje, enfermedad, turnos) hasta…" que cubre racha y avisos. Máximo 14 días. "Tu racha te espera" |
| UX-23 | `wake_check` se solapa con 006-US4 | Con push: +60 min del despertar agendado y un toque para registrar la hora agendada. Sin push: queda 006-US4 |

## Lo que falta

1. **Aviso de prueba (S).** Llega en menos de 1 min; si falla, dice por qué.
2. **Resumen de la semana en la app los lunes (S).** "5 de 7 mañanas a tu hora · media 7 h 10 min". Una vez por semana, descartable, sin push.
3. **Horario único como fuente de verdad (S).** Un cambio actualiza la racha, los avisos y el ICS sin duplicar. Los hitos pasados no cambian.

## Glosario

| Técnico | Texto para el usuario |
|---------|-----------------------|
| Racha | Días de constancia |
| 2/7 | "Puedes fallar hasta 2 días por semana sin perderla" |
| Mejor / total | "Tu récord: 25 días" · "Mañanas a tu hora en total: 60" |
| Hito | Constelación / logro |
| fuera_de_ventana | Fuera de tu horario |
| sin_dato | Sin registrar |
| pendiente / pausado | Aún no / En pausa |
| Ventana | "Cuenta si te levantas entre 6:30 y 7:30" |
| prepare / bedtime / wake_check | Prepárate para dormir / Hora de dormir / ¿Ya despertaste? |
| .ics | "Añadir a mi calendario (con alarma)" |
| PWA | "Instalar Descanso en tu pantalla de inicio" |
| Reinicio | "Tu récord sigue siendo 25. Mañana es un buen día para empezar otra" |

**Palabras prohibidas:** perdiste, fallaste, rompiste, en peligro, ¡no la pierdas!, castigo.

## Preguntas

1. ¿Qué hábito premiar: levantarse a tu hora, acostarse a tu hora o registrar?
2. ¿Qué te haría sentir recompensado: colección, datos o mensajes? ¿Aceptas que no haya premios canjeables?
3. ¿iPhone o Android y qué calendario usas? ¿Qué avisos quieres? ¿Aceptas unos 3 $/mes o te vale ±15 min gratis?
