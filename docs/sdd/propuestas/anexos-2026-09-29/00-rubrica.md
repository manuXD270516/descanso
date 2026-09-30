# Rúbrica de evaluación de propuestas (fijada antes de ver resultados)

Cada propuesta se puntúa de 1 a 5 en seis criterios ponderados. Aprobada si:
- la puntuación ponderada es ≥ 3,5;
- ningún criterio obligatorio (O) queda por debajo de 3;
- supera el checklist de calidad.

| # | Criterio | Peso | O | 1 = … | 5 = … |
|---|----------|------|---|-------|-------|
| C1 | Valor para el usuario | 25 % | | Nadie lo pidió o valor marginal | Resuelve una necesidad explícita del usuario con beneficio medible |
| C2 | Factibilidad técnica | 20 % | ✔ | Depende de APIs/permisos inciertos o de una app nativa | Realizable con el stack actual y dependencias verificadas |
| C3 | Encaje con la constitución | 20 % | ✔ | Viola principios MUST sin justificar | Cumple todos; complejidad justificada en Complexity Tracking |
| C4 | Privacidad y seguridad | 15 % | ✔ | Datos de salud expuestos o sin consentimiento | Minimización, cifrado, consentimiento, borrado/exportación |
| C5 | Esfuerzo y riesgo (inverso) | 10 % | | L con riesgos altos sin mitigar | S/M con riesgos mitigados |
| C6 | Testabilidad y medición | 10 % | | Criterios vagos | Criterios de aceptación medibles y automatizables |

## Checklist de calidad (todo sí)

- Historias priorizadas, cada una con criterios de aceptación medibles.
- Fuera de alcance explícito.
- ≤ 3 preguntas abiertas.
- Dependencias y orden declarados.
- Fuentes abiertas de verdad (no solo snippets).
- Sin afirmaciones médicas o regulatorias sin respaldo.

## Protocolo

1. **ReAct**: 4 investigadores, uno por área.
2. **Debate**: 3 críticos con roles opuestos, cada uno sobre las 4 propuestas.
   - Escéptico: constitución, simplicidad (YAGNI), coste, privacidad.
   - Arquitecto: dependencias, secuencia, datos, seguridad, pruebas.
   - Defensor del usuario: valor, UX, qué falta y qué sobra.
3. **Reflection**: el orquestador reescribe cada propuesta respondiendo a cada crítica (aceptada, rechazada con razón, o convertida en pregunta).
4. **Evaluación**: un evaluador independiente aplica esta rúbrica. Si una propuesta no aprueba, se hace una ronda de revisión dirigida y se vuelve a evaluar (máximo 2 ciclos). Si sigue sin aprobar, se marca como "No recomendada / aplazar".
5. **Síntesis**:
   - roadmap ordenado por dependencias;
   - archivos de entrada `docs/sdd/features/00N-*.md` para `/sdd-feature`;
   - un documento de propuesta con el registro del debate y las puntuaciones.
