# Data Model: Re-look moderno, sobrio y nocturno (014)

**Sin cambios de esquema ni de datos persistidos.** No hay migración, ni columnas, ni rutas nuevas; la
suite de aislamiento de dos usuarios y la comprobación del esquema no cambian (no hay datos nuevos que
aislar). No aplica expand/contract (`docs/sdd/guia-migraciones.md`): el código de master sigue operando
sobre el mismo esquema.

## Entidades de presentación (no persistidas)

### Token de diseño

| Campo | Tipo | Regla |
|-------|------|-------|
| nombre | custom property CSS (`--surface`, `--fs-lg`, `--dur-base`…) | Nombre de rol, no de tono. |
| valor claro / oscuro | color | Para colores: `light-dark(claro, oscuro)` con respaldo oscuro previo. |
| valor | longitud, duración o curva | Para medidas y movimiento: único. |

Catálogo, pares de contraste y umbrales: [contracts/design-tokens.md](contracts/design-tokens.md).

### Pedido de confirmación

| Campo | Tipo | Regla |
|-------|------|-------|
| `title` | texto | Pregunta corta, sin culpa ("¿Borrar esta noche?"). |
| `body` | texto | Qué se borra y "No se puede recuperar." |
| `confirmLabel` | texto | Por defecto "Borrar". |
| resultado | `boolean` | `true` solo con "Borrar"; Esc, atrás, "Conservar" o un pedido nuevo → `false`. |

Vive en memoria mientras el diálogo está abierto. Contrato: [contracts/confirm-dialog.md](contracts/confirm-dialog.md).

### Estado de campo

| Estado | Cuándo | Expuesto como |
|--------|--------|---------------|
| neutro | al cargar y mientras se escribe sin haber salido | `aria-invalid="false"` |
| inválido | `:user-invalid` tras salir del campo o al enviar | `aria-invalid="true"` + `aria-describedby` al mensaje |
| corregido | vuelve a ser válido | `aria-invalid="false"`, mensaje oculto |
