# Implementation Plan: Multiusuario con perfiles

**Branch**: `008-multiusuario-perfiles` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-multiusuario-perfiles/spec.md`

## Summary

Descanso pasa a ser multiusuario con aislamiento estricto (constitución v2.0.0).

- **Capa `repo/`**: todo acceso a datos pasa por aquí con `userId` obligatorio. Las rutas dejan de
  usar SQL directo, y un recurso ajeno se responde con 404.
- **Migración `005_multiusuario.js`**: reconstruye `users` con roles, perfil y consentimiento, y
  añade `user_settings` (objetivo de sueño), `invites`, `password_resets` y `audit_log`.
- **Altas por invitación**: el propietario invita con enlaces de un solo uso que viajan en el
  fragmento de la URL; la persona invitada acepta la política y se registra con sus propias
  métricas iniciales.
- **Perfil y recuperación**: perfil con nombre, email, zona horaria, objetivo y contraseña;
  recuperación por enlace del propietario con registro de auditoría visible para la persona.
- **Borrado y exportación**: borrado de cuenta por CASCADE (el propietario, solo si no quedan otros
  usuarios) y exportación por usuario.
- **Respaldos cifrados con `age`**: el pipeline solo tiene la clave pública.
- **Verificación**: una suite de aislamiento de dos usuarios recorre todas las rutas, y un
  meta-test de esquema clasifica cada tabla.

## Technical Context

**Language/Version**: Node.js 22 LTS; TypeScript con Angular 20

**Primary Dependencies**: Express 5, better-sqlite3 13, `node:crypto`, `Intl` (zonas horarias).
Sin dependencias npm nuevas. En el workflow de respaldo, `age` (paquete apt del runner).

**Storage**: SQLite; migración 005 por el runner (`foreignKeys: false`, copia verificada).

**Testing**: `node --test` + supertest (helpers con propietario y segundo usuario);
Karma/Jasmine; Playwright con dos contextos de navegador.

**Target Platform**: Fly.io (256 MB), GitHub Actions para el respaldo.

**Project Type**: aplicación web, un único servicio.

**Performance Goals**: sin cambios. Las consultas con `user_id` usan los índices existentes por
fecha; con < 20 usuarios no hacen falta índices nuevos.

**Constraints**:
- La versión 004 debe funcionar sobre el esquema de 008.
- Nada de tokens en URLs que lleguen al servidor.
- El rollback manual por debajo de 008 se prohíbe por runbook.

**Scale/Scope**: < 20 usuarios; 1 migración; unas 14 rutas nuevas; 6 pantallas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento | Estado |
|---------------------|--------------|--------|
| Alcance (v2.0.0) | Filtrado por usuario en `repo/` (404 para lo ajeno), suite de dos usuarios en todas las rutas, meta-test de esquema y texto honesto sobre el acceso del operador en la invitación y en la política. | ✅ |
| I. Stack fijo | Sin dependencias npm nuevas; `age` es una herramienta del pipeline, no de la app. | ✅ |
| II. Persistencia segura (v2.0.0) | Reconstrucción de `users` verificada y con `foreignKeys: false`. El borrado de cuenta exige contraseña, borra solo filas del dueño y está probado; los respaldos se purgan en 14 días. | ✅ |
| III. Reglas de tiempo | `timezone` por usuario sin tocar las horas guardadas (siguen con su desfase). Fechas de invitación, recuperación, auditoría y consentimiento en ISO UTC. | ✅ |
| IV. Calidad | Tests de repo, aislamiento, esquema, invitaciones, recuperación, perfil, borrado, migración y compatibilidad; componentes; e2e con dos navegadores. | ✅ |
| V. Un solo servicio | Sin servicios nuevos. Secretos nuevos solo en GitHub (`BACKUP_AGE_RECIPIENT`, clave pública). | ✅ |
| VI. Simplicidad | Sin email ni router; recuperación manual (≤ 5 usuarios); política estática versionada. | ✅ |
| VII. UX en español | Pantallas en español; formularios con `autocomplete`, errores `role="alert"` y avisos `role="status"`. | ✅ |

**Re-check post-diseño**: sin violaciones. Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/008-multiusuario-perfiles/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/openapi-delta.yaml
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── migrations/005_multiusuario.js     # NUEVO (R3)
│   ├── policy.js                          # NUEVO: POLICY_VERSION
│   ├── repo/                              # NUEVO (R1)
│   │   ├── sleep.js · naps.js · metrics.js · entries.js · stats.js · export.js
│   │   └── users.js · invites.js · audit.js
│   ├── auth/
│   │   ├── bootstrap.js                   # rotación solo del propietario (R7)
│   │   ├── middleware.js                  # + requireOwner; req.user con role
│   │   └── tokens.js                      # NUEVO: tokens de un uso (invitación/recuperación)
│   ├── routes/
│   │   ├── sleep.js · naps.js · metrics.js · stats.js · export.js   # vía repo con req.user.id
│   │   ├── auth.js                        # + register, reset; status/login con role
│   │   ├── me.js                          # NUEVO: perfil, email, contraseña, actividad, borrar
│   │   └── people.js                      # NUEVO: personas, invitaciones, enlaces de recuperación
│   └── app.js
└── test/
    ├── helpers.js                         # + segundo usuario (otherApi)
    ├── isolation.test.js · schema-isolation.test.js · routes-no-db.test.js    # NUEVOS
    ├── invites.test.js · reset.test.js · me.test.js · delete-account.test.js # NUEVOS
    └── migrations-005.test.js · compat-previous-008.test.js                  # NUEVOS

frontend/src/app/
├── core/{auth.service.ts, link-tokens.ts, privacy.ts, account.service.ts}
├── features/account/{register,reset-password,forgot,profile,people,privacy}.component.*
└── app.ts / app.html                      # vistas de cuenta y aviso de restablecimiento

.github/workflows/backup.yml               # cifrado con age (R11)
docs/runbooks/{restaurar-respaldo,rollback-migracion}.md · docs/sdd/guia-migraciones.md
e2e/support/fixtures.ts (+ secondUser) · e2e/tests/{multiusuario,cuenta}.spec.ts
```

**Structure Decision**: se añade `backend/src/repo/` como única capa de acceso a datos de usuario.
El resto sigue la estructura existente.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
