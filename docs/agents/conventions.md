# Convenzioni di UI (binding, on-demand)

> Riferimento **on-demand** estratto da `AGENTS.md` per tenere minimo il contesto sempre-caricato (Feature #13706, leva "contesto sempre-caricato"). Consultalo prima di costruire o modificare qualunque UI. Le regole sono vincolanti, non preferenze stilistiche.

## UI guidelines — Material 3, always

**Binding rule**: every UI you build or modify must follow the
[Material 3 guidelines](https://m3.material.io/) for typography, spacing,
accessibility and layout. This is a platform-wide requirement, not a stylistic
preference.

- **Typography**: use the M3 type scale (display/headline/title/body/label);
  no arbitrary hardcoded font sizes. Nothing smaller than label-small (11px).
- **Color**: derive all colors from a single M3 theme (seed-generated palette);
  never scatter hardcoded hex values across components. Use container /
  on-container pairs for colored surfaces so text contrast holds by construction.
- **Spacing & layout**: 8dp grid (multiples of 8px, 4px for fine adjustments);
  touch targets ≥ 48×48px; responsive across M3 breakpoints (compact < 600,
  medium < 840, expanded ≥ 840) — usable at 360px width.
- **Accessibility (WCAG 2.1 AA)**: text contrast ≥ 4.5:1 (3:1 for large text);
  visible focus on every interactive element (never remove outlines without a
  replacement); `aria-label` on icon-only buttons; semantic HTML before ARIA.
- **Angular Material is the reference UI library** and is already installed and
  themed in this template. Build every new interface with Material components;
  never reintroduce hand-rolled CSS component libraries.
  - The theme is generated from the canonical MEDIT palette and lives in
    `App/frontend/src/theme/_theme-colors.scss` (single point of definition —
    regenerate it, never edit it by hand).
  - Style exclusively through `--mat-sys-*` system tokens; no hardcoded hex.
  - Prefer Material components over browser primitives (`MatDialog` instead of
    `confirm()` — see `shared/confirm-dialog/` — `MatSnackBar` instead of
    `alert()`).
  - The Contacts demo (toolbar, `mat-table`, `mat-form-field` form, confirm
    dialog) is the exemplar to replicate for new pages.
