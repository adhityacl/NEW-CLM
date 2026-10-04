# Control sizes

Buttons, inputs and selects share one height scale. A field and the action beside it must have the same height.

## Scale

| Size | Height | Text | Horizontal padding | Radius | Usage |
| --- | --- | --- | --- | --- | --- |
| Large | 44 px | 14 px | 16 px | 12 px | All single-line fields, any action on the same row as a field, page creation actions, form save/cancel |
| Medium | 36 px | 13 px | 12 px | 10 px | Button-only toolbars, add-row actions below a field, segments inside a segmented control |
| Small | 28 px | 12 px | 8 px | 8 px | Draft history, card actions, compact controls with no field beside them |

The tokens are in `src/index.css`: `--button-lg-height`, `--button-md-height` and `--button-sm-height`. `--form-control-height` points to `--button-lg-height`, so fields cannot drift away from the large action size.

## Hierarchy

The size follows the action's level, not its colour or the component that renders it. Actions on the same level share one size.

| Level | Examples | Size |
| --- | --- | --- |
| 1. Page action | `Add Contract`, `Add Service Order`, `New Document`, `Refresh Logs`, `Mark all as read` | Large |
| 2. Commit for a form, settings section or modal footer, including its Cancel | `Save SMTP Configuration`, `Save Notification Emails`, `Save API Key`, `Start Import`, `Connect Google Account`, modal Submit/Cancel | Large |
| 3. Action inside a card toolbar, list row, table row or side panel | Explorer table `Export CSV`, `Auto-Create in Drive` on a tenant row, `Input Evaluation` in a table cell, comment Reply | Medium or small |

Every filled (primary or destructive) button and every `type="submit"` button belongs to level 1 or 2, so it is large. The only exceptions are segments, tabs, table-row actions and the card-level actions listed in the test.

## Rules

1. **Fields are always large.** Text inputs, native selects and combobox triggers are 44 px on every viewport. A global rule sets this, so do not add `h-8`, `h-9` or `py-*` to fields; they have no effect.
2. **An action on the same row as a field uses the large size.** Examples: search + `View`, rows-per-page + page buttons, tag input + `Add Tag`, search + `Add New User`.
3. **A segmented control next to a field** has a 44 px container (`h-11 p-[3px]`, 1 px border) with medium segments inside.
4. **Pick the size explicitly.** Use `<Button size="lg">`, `<Button size="md">` or `<Button size="sm">`; the default is medium. Native buttons and links use `ui-button ui-button-lg|md|sm`. Do not size buttons with `h-*`, `min-h-*`, `py-*`, `px-*`, `rounded-*` or `text-xs`/`text-sm`. The size class overrides them, so for example `<Button size="sm" className="h-9">` and `<Button className="min-h-11">` still render at 28 px and 36 px.
5. **Icon-only buttons** add `iconOnly` (or `ui-button-icon`) and become a square of their size. The legacy `size="icon"` is a medium square.
6. **Mobile:** below 768 px every button and field is at least 44 px tall, which meets the touch target size.

Text buttons keep their natural width. When space is limited, wrap action groups; do not shrink a text button to icon width.

Navigation, calendar date cells, document cards and table header controls keep their dedicated layouts unless they are given an action size.

## Enforcement

`tests/e2e/ui-refinements.spec.ts` › "field rows and primary actions follow the control size scale" visits the main pages, dialogs, settings sections and admin tabs at 1440 px and 390 px. It fails in two cases:

- a button overlaps a field's row and has a different height;
- a filled or submit button that is not a segment, tab, table-row action or listed card-level action is not 44 px tall.
