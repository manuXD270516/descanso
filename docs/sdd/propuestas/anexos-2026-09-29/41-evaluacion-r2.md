# Evaluación independiente: gamificación y recordatorios (010–013)

Se aplicó la misma rúbrica ([00-rubrica.md](00-rubrica.md)) y el mismo evaluador que en las features 003–009. Hubo dos rondas.

## Ronda 1

| Feature | C1 | C2 | C3 | C4 | C5 | C6 | Ponderada | Veredicto |
|---------|----|----|----|----|----|----|-----------|-----------|
| 010 | 5 | 4 | 5 | 5 | 4 | 3 | 4,50 | Requiere revisión |
| 011 | 4 | 5 | 4 | 4 | 4 | 3 | 4,10 | Requiere revisión |
| 012 | — | — | — | — | — | — | — | Condición incorrecta |
| 013 | — | — | — | — | — | — | — | Semilla incompleta |

Revisiones exigidas:

- **V-14.** El UID del `.ics` cambiaba con cada versión, así que reimportar duplicaba eventos. Se pidió un UID estable, `STATUS:CANCELLED`, `URL` y un fichero golden.
- **V-15.** "Un toque para registrar la hora agendada" permitía ganar la racha con datos falsos. Se pidió confirmar o editar la hora, añadir el origen "Anotado después" y un test de propiedades.
- **V-16.** Había tres bienvenidas. Debe haber una sola, la de 005, ampliada por 010 y 011.
- **V-17.** La pausa estaba guardada en dos sitios. Debe ser una sola tabla `pauses`, propiedad de 010.
- **V-18.** Las pausas retroactivas servían para borrar faltas. Ya no se permiten.
- **V-19.** Faltaba la definición formal de racha, del "Día N" y de los hitos.
- **V-20.** El texto de la tolerancia debe decir "cualquier periodo de 7 días seguidos".
- **V-21.** Una noche abierta nunca contaba como fallo. Ahora solo es "pendiente" hasta el fin del día siguiente.
- **V-22.** Faltaba indicar cuándo se guarda un logro: en la transacción que cierra o edita una noche.
- **V-23.** Faltaban rachas "extendidas" más allá de 66 días. Se añaden hitos a los 100, 180 y 365 días.
- **Otros cambios:**
  - condiciones correctas para 012 (iPhone y avisos con la app cerrada) y 013 (P5, más 012 solo en iPhone);
  - operación de 013;
  - dependencia de zona horaria en 010;
  - limpieza de la v3.

## Ronda 2

- Todas las revisiones quedaron resueltas.
- Se corrigieron tres textos del documento v3: la tabla de resumen, la redacción del coste y la tabla de evaluación.
- Se aplicaron también cuatro mejoras recomendadas:
  - `best_streak` guardado de forma persistente;
  - `wake_logged_at` en la base de datos;
  - "un evento por cada día activo" en el `.ics`;
  - el sistema de confianza declarado como límite conocido.

| Feature | Ronda 1 | Ronda 2 | Veredicto |
|---------|---------|---------|-----------|
| 010 | 4,50 | 4,60 | **Aprobada** (sujeta al spike de calendario) |
| 011 | 4,10 | 4,45 | **Aprobada** |
| 012 | — | Semilla suficiente | Bien condicionada |
| 013 | — | Semilla suficiente | Bien condicionada |

Veredicto global: **lista para presentar al usuario**. Los resultados de 003–009 siguen vigentes.
