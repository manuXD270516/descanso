# Debate — crítico Escéptico (resumen fiel)

## Veredictos

- **A — Recortar fuerte / dividir.**
  - Aprobar ya A0, "acceso protegido para el propietario": scrypt, sesión en SQLite, CSRF y rate limit. Cierra DT-17 sin cambiar el alcance.
  - Aplazar el multiusuario real (HU2–HU8 y la enmienda MAJOR) hasta que exista un segundo usuario con nombre.
- **B — Aprobar con cambios.**
  - Se queda solo con el descargo y la calculadora de ciclos: frontend puro, tamaño S.
  - El diario SOL/WASO pasa a ser una pregunta al usuario.
  - `sleep_stages` y el hipnograma pasan a D.
  - Se eliminan las tendencias por fase.
- **C — Aprobar con cambios.**
  - Se quedan US1, US2, US4 simplificada y la DE circular.
  - Se aplazan el SRI, el jetlag social y el heatmap.
- **D — Aplazar.** Depende de saber qué dispositivo usa el usuario. F0 queda condicionada.

## Bloqueantes

| ID | Propuesta | Problema | Cambio pedido |
|----|-----------|----------|---------------|
| E1 | A (enmienda MAJOR sin demanda) | Choca con VI | Condicionar a que haya usuarios reales; mientras tanto, solo A0 |
| E2 | A (scrypt de 32 MiB/hash en una VM de 256 MB) | Varios logins concurrentes a la vez agotan la memoria | Serializar los hashes o medir el RSS; declararlo en Complexity Tracking |
| E3 | A (triggers como apaño para el NOT NULL) | Oculta una restricción del esquema | Aclarar II (PATCH): reconstruir la tabla copiando y verificando no es DROP; hacerlo en una transacción con recuento |
| E4 | A (`BACKUP_TOKEN` global expone a todos los usuarios; los backups guardan cuentas borradas) | Privacidad | Cifrar los backups en el cliente; retención por escrito; HU5 ⇒ "0 filas en la base viva, purga de los backups en ≤ N días" |
| E5 | B vs D | Dos modelos de fases incompatibles; la reconciliación del 50 % está duplicada | D es el único dueño; B no diseña tablas |
| E6 | D (importar 200 MB con < 256 MB sin evidencia) | Un `export.zip` real suele pasar de 1 GB; hacen falta unzip y SAX, que son dependencias nuevas | PoC con un export real; límite de tamaño; filtrar SleepAnalysis; Complexity Tracking |
| E7 | D (SLA < 15 min con la máquina parada) | Contradice el auto-stop; el worker muere al pararse; los webhooks elevan el coste | Sincronizar al abrir la app, sin SLA, o cuantificar el coste de `suspend` |
| E8 | B, C, D | Afirmaciones sacadas solo de snippets (SRI Phillips, mediana de 96 min, detalle de Oura, Rook/Sahha, fecha de Fitbit) | Abrir la fuente o retirar la cifra |

## Recortes

- **A**:
  - fuera de alcance: HU4, HU7 y HU8;
  - HU6 se reduce a validar DT-04;
  - HU5 (exportar) sí se queda, porque es útil con un solo usuario.
- **B**:
  - el diario pasa a ser una pregunta;
  - fuera las tendencias por fase (ruido con κ de 0,2 a 0,65);
  - la calculadora debe decir que el ciclo dura entre 70 y 120 min.
- **C**:
  - fuera el SRI, el jetlag social y los workdays, y el heatmap;
  - en US4 se quitan el IC con z de Fisher (sirve para Pearson, no para Spearman) y la corrección BH;
  - basta con mostrar n, ρ y el aviso, con n ≥ 10.
- **D**: F2 y el estado de sincronización quedan fuera hasta que F1 exista y se use.
- **Enmiendas**:
  - hay 4 propuestas distintas de "principio VIII"; hay que fusionarlas en una o en ninguna;
  - sobra enmendar I por el SVG propio.

## Conflictos entre propuestas

1. DT-01 debe ser una feature previa única; B no puede darla por "incluida".
2. Orden propuesto: DT-01 → A0 → C → B mínima → D-F0 (si procede). Sin `user_id` especulativo.
3. D es el dueño de las fases y de la conciliación.
4. `settings` de C frente a `users.timezone` de A: debe haber una sola ubicación.
5. La regla de la fecha de la noche para los datos importados debe ser única y con un solo juego de tests.

## Preguntas al usuario

1. ¿Habrá otros usuarios reales? ¿Quiénes son y están en la UE? (RGPD art. 9, exención doméstica, DPIA.)
2. ¿Qué dispositivo usas? Si es Oura, falta verificar si la API exige una membresía activa.
3. ¿Aceptas un coste mayor (512 MB, o `suspend` con webhooks)? ¿Con qué techo?
4. ¿Qué significa para ti "controlar el REM": te vale una estimación o necesitas una medición?
5. ¿"Calidad" y "Energía" se refieren a la mañana o a la noche anterior? (Define el lag de US4.)

## Lo que está bien

- **B**: honestidad, palabras prohibidas, insignias y "—" en lugar de 0.
- **C**: SVG propio, funciones puras y n mínima; corrige DT-21, DT-08 y DT-11.
- **A**: scrypt nativo, sesiones en SQLite, 404 en lugar de revelar la existencia, migración abortable.
- **D**: descarta con criterio agregadores, Garmin y apps nativas.
- **Matiz regulatorio**: la FDA se leyó solo a través de Covington y es de EE. UU. En la UE lo relevante es el MDR y el RGPD: citar la fuente primaria o bajar el tono.
