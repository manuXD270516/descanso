# Contrato: diálogo de confirmación (014)

## API

```ts
// frontend/src/app/shared/confirm/confirm.service.ts
interface ConfirmRequest {
  title: string;         // "¿Borrar esta noche?"
  body: string;          // "Se borra el registro de la noche del 3 mar. No se puede recuperar."
  confirmLabel?: string; // por defecto "Borrar"
}
class ConfirmService {
  ask(req: ConfirmRequest): Promise<boolean>;
}
```

- `ConfirmDialogComponent` se monta **una vez** en `app.html`.
- Un `ask()` con otro pedido abierto resuelve el anterior en `false` y muestra el nuevo.
- Si la sesión deja de estar autenticada con el diálogo abierto, se cierra y resuelve en `false`.

## Marcado y comportamiento

| Aspecto | Regla |
|---------|-------|
| Elemento | `<dialog closedby="closerequest" aria-labelledby="confirm-title" aria-describedby="confirm-body">`, abierto con `showModal()` |
| Botones | dentro de `<form method="dialog">`: "Conservar" (`value="keep"`, `autofocus`, `.btn`) y `confirmLabel` (`value="confirm"`, `.btn-danger-solid`) |
| Cierre | "Conservar", Esc y gesto atrás → `false`; tocar fuera no cierra |
| Fondo | inerte (modal) y sin scroll: `html:has(dialog[open]) { overflow: hidden }` |
| Foco | inicial en "Conservar"; al cerrar sin borrar vuelve al invocador; tras borrar, el componente lo lleva al encabezado de la lista |
| Móvil | `max-inline-size: min(26rem, 100% - 2rem)`; botones apilados a ancho completo con "Conservar" arriba bajo `@container`/`@media (width < 30rem)` |
| Movimiento | entrada con `@starting-style` (opacidad + `translate` 0,5 rem) solo con `no-preference` |

## Textos (español, sin culpa; pasan `docs/sdd/terminos-prohibidos.txt`)

| Origen | Título | Cuerpo |
|--------|--------|--------|
| Noche | ¿Borrar esta noche? | Se borra el registro de la noche del {fecha corta}. No se puede recuperar. |
| Siesta | ¿Borrar esta siesta? | Se borra la siesta del {fecha corta}. No se puede recuperar. |
| Métrica | ¿Borrar la métrica «{nombre}»? | Se borran la métrica y todos sus registros. No se puede recuperar. |

## Pruebas

- Karma: servicio (resolve `true`/`false`, pedido que reemplaza a otro), componente (foco inicial,
  `returnValue`, Esc → `false`), y los tres componentes con un `ConfirmService` falso.
- E2E: helper `confirmDialog(page, action: 'Borrar' | 'Conservar')` en `e2e/support/fixtures.ts` que
  espera `getByRole('dialog')`, devuelve su texto y pulsa el botón; reemplaza a `answerNextDialog`.
