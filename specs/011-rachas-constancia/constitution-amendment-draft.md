# Borrador de enmienda: principio VIII, ampliación (v2.1.0 → v2.2.0)

**Estado**: borrador, **no aplicado**. Se aplica con `/speckit-constitution` antes del plan de 011
(calendario de enmiendas de `docs/sdd/propuestas/2026-09-29-set-de-features.md`).

**Tipo**: MINOR (se amplía materialmente una guía; no se elimina ni redefine nada).

## Viñetas que se añaden al principio VIII

Se añaden al final de la lista de viñetas de "VIII. Datos de salud: privacidad y honestidad", después
de "Notificaciones sin datos de salud":

```markdown
- **Motivación solo por conductas controlables**: toda racha, logro o refuerzo MUST basarse solo en
  conductas que la persona controla (por ejemplo, levantarse a su hora o registrar la noche). MUST
  NOT puntuarse ni premiarse un resultado de sueño (horas dormidas, calidad, fases ni puntuaciones
  derivadas).
- **Sin comparación, sin canje, sin pérdida**: MUST NOT existir comparación social ni rankings,
  recompensas canjeables (puntos, monedas, niveles, premios) ni avisos o textos que adviertan de
  perder un logro o una racha. Los logros ganados MUST NOT retirarse, y saltarse un registro MUST
  NOT mejorar nunca un indicador de constancia.
- **Gamificación opcional y ocultable**: toda gamificación MUST estar desactivada hasta que la
  persona la active, y MUST poder ocultarse en cualquier momento; desactivada, no se calcula ni se
  muestra.
```

## Cambio en la "Razón" del principio VIII

Se añade una frase al final:

```markdown
Premiar resultados de sueño o penalizar su ausencia alimenta esa misma ansiedad; motivar la
constancia en conductas controlables, con feedback informativo y opcional, no lo hace.
```

## Fila del historial de enmiendas

Se añade como primera fila de la tabla:

```markdown
| 2.2.0 | AAAA-MM-DD | MINOR | **Principio VIII**, ampliación: la motivación se basa solo en conductas controlables; se prohíben las puntuaciones de resultado, la comparación social, las recompensas canjeables y los avisos de pérdida; los logros no se retiran y saltarse un registro no mejora la constancia; toda gamificación es opcional (desactivada por defecto) y ocultable. Necesaria antes del plan de 011. |
```

Y el pie pasa a:

```markdown
**Version**: 2.2.0 | **Ratified**: 2026-09-29 | **Last Amended**: AAAA-MM-DD
```

## Impacto

- Plantillas: el "Constitution Check" de los planes ya recorre I–VIII; no cambia.
- `docs/sdd/terminos-prohibidos.txt`: sin cambios por la enmienda; las palabras de culpa de 011
  (FR-022) se vigilan con la prueba de la propia feature.
- Features existentes: ninguna tiene gamificación; no hay incumplimientos.
