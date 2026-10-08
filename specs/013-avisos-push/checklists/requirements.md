# Specification Quality Checklist: Avisos push con la app cerrada

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-08
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Sin marcadores `[NEEDS CLARIFICATION]`: Q1 (tipos por defecto y doble "prepárate" con el calendario
  de 010) y Q2 (informar del servicio de avisos del navegador) se resolvieron el 2026-10-08 con la
  opción A (ver Clarifications de la spec).
- La "Contexto técnico" de la entrada (disparador en proceso, tablas, rutas, service worker, VAPID,
  `fly.toml`) queda para el plan. La spec solo cita hechos de privacidad visibles para la persona
  (quién entrega el aviso), `role="status"` (accesibilidad, principio VII, como 010), zonas IANA de
  ejemplo para las pruebas de DST (principio III) y el coste decidido por el owner (SC-011).
- La coexistencia con el aviso en la app de 010 se resuelve por defecto (FR-019: nunca los dos a la
  vez en el mismo dispositivo) y la de `wake_check` con "¿Ya despertaste?" reutiliza la regla de
  010-R5.
- Antes del plan: spike de ½ día en un Android real (aviso con Chrome cerrado, apertura de Noche,
  memoria del servicio). Complexity Tracking del plan debe registrar que se abandona el auto-stop (R13
  de 002).
