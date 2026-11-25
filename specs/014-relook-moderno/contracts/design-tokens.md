# Contrato: tokens de diseño (014)

Fuente única: `frontend/src/styles.css`, capa `tokens`. Los componentes solo usan estos nombres.

## Orden de capas

```css
@layer reset, tokens, base, components, utilities;
```

Los estilos de componente van dentro de `@layer components { … }`.

## Color (`light-dark(claro, oscuro)`, con respaldo oscuro previo)

| Token | Claro | Oscuro | Uso |
|-------|-------|--------|-----|
| `--surface` | `#f4f2ee` | `#12172b` | fondo base |
| `--surface-raised` | `#fbfaf7` | `#1a2140` | paneles, diálogo, menú |
| `--surface-sunken` | `#eae7e0` | `#0d1122` | campos, aviso médico |
| `--surface-hover` | `#e6e3db` | `#232b52` | hover |
| `--line` | `#d9d5cc` | `#2b3460` | separadores decorativos |
| `--line-strong` | `#767b95` | `#6b75a8` | borde de campos y controles |
| `--ink` | `#1c2140` | `#e6e4f0` | texto principal |
| `--ink-muted` | `#4a5070` | `#a9aecb` | texto secundario, aviso médico |
| `--ink-faint` | `#5e6482` | `#8f95b8` | metadatos |
| `--no-data` | `var(--ink-faint)` | `var(--ink-faint)` | "Sin dato", trazo discontinuo |
| `--accent` | `#3f4fb8` | `#a9b5f5` | acción primaria, enlaces |
| `--on-accent` | `#fbfaf7` | `#12172b` | texto sobre `--accent` |
| `--accent-2` | `#8a4f0c` | `#f0b46a` | amanecer como texto |
| `--accent-2-fill` | `#f0b46a` | `#f0b46a` | botón amanecer, barra de siesta |
| `--on-accent-2` | `#2e1d02` | `#2e1d02` | texto sobre `--accent-2-fill` |
| `--danger` | `#b3362b` | `#f08a80` | borrar, error |
| `--on-danger` | `#fbfaf7` | `#12172b` | texto sobre `--danger` |
| `--danger-bg` | `#f8e9e5` | `#2a2238` | fondo del mensaje de error |
| `--success` | `#1f6b45` | `#7fd3a8` | confirmaciones |
| `--focus` | `#2a3aa0` | `#ffd08a` | anillo de foco |
| `--backdrop` | `rgb(5 8 20 / .6)` | igual | telón del diálogo |
| `--cat-1…--cat-n` | a definir | a definir | categorías de Métricas y gráficos; ≥ 3:1 sobre `--surface-raised` |

## Pares de contraste verificados automáticamente

Texto (≥ 4,5:1): `--ink`, `--ink-muted` e `--ink-faint` sobre `--surface`, `--surface-raised`,
`--surface-sunken` y `--surface-hover`; `--accent`, `--accent-2`, `--danger` y `--success` sobre
`--surface` y `--surface-raised`; `--danger` sobre `--danger-bg`; `--on-accent` sobre `--accent`;
`--on-accent-2` sobre `--accent-2-fill`; `--on-danger` sobre `--danger`.

No texto (≥ 3:1): `--line-strong` y `--focus` sobre `--surface`, `--surface-raised` y `--surface-sunken`;
cada `--cat-*` sobre `--surface-raised`.

## Tipografía

| Token | Valor |
|-------|-------|
| `--font` | `'Bricolage Grotesque', 'Bricolage Fallback', system-ui, 'Segoe UI', Roboto, sans-serif` |
| `--fs-xs` | `0.8125rem` |
| `--fs-sm` | `0.875rem` |
| `--fs-base` | `1rem` |
| `--fs-md` | `clamp(1.0625rem, 1rem + 0.25vw, 1.125rem)` |
| `--fs-lg` | `clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)` |
| `--fs-xl` | `clamp(1.5rem, 1.25rem + 1vw, 2rem)` |
| `--fs-num` | `clamp(1.75rem, 1.4rem + 1.5vw, 2.5rem)` |
| `--lh-body` / `--lh-tight` | `1.5` / `1.2` |

La raíz (`html`) no fija `font-size`.

## Espacio, forma y movimiento

| Token | Valor |
|-------|-------|
| `--sp-1…--sp-6` | `.25rem`, `.5rem`, `.75rem`, `1rem`, `1.5rem`, `2rem` |
| `--radius-sm` / `--radius` / `--radius-pill` | `.5rem` / `.875rem` / `999px` |
| `--target` | `2.75rem` (44 px) |
| `--focus-ring` | `2px solid var(--focus)`, `outline-offset: 2px` |
| `--dur-fast` / `--dur-base` | `120ms` / `200ms` |
| `--ease-out` / `--ease-in` | `cubic-bezier(.2,.7,.3,1)` / `cubic-bezier(.4,0,1,1)` |
| `--shadow-dialog` | claro: `0 .5rem 2rem rgb(28 33 64 / .18)`; oscuro: `none` |

## Umbrales de layout

`@container (width < 30rem)` y `@container (width < 22rem)`; los `@media` que queden, en `rem`.

## Presupuestos (SC-005)

| Recurso | Límite |
|---------|--------|
| `styles-*.css` inicial | ≤ 10 kB crudo y ≤ 3 kB gzip |
| Estilo de un componente | aviso 6 kB, error 8 kB (`anyComponentStyle`) |
| Fuente `woff2` | ≤ 60 kB |
| JS inicial transferido | ≤ +5 kB sobre master |
