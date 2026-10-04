# Action button sizes

Choose sizes explicitly for each action. Buttons with text keep their natural width; only an explicitly marked icon button is square.

| Size | Height | Text | Horizontal padding | Usage |
| --- | --- | --- | --- | --- |
| Large | 44 px | 14 px | 16 px | Page creation actions and form save/cancel actions |
| Medium | 36 px | 13 px | 12 px | Toolbars, add-row actions and form helpers |
| Small | 28 px | 12 px | 8 px | Draft history, card actions and currency toggles |

Use `<Button size="lg">`, `<Button size="md">` or `<Button size="sm">`. The default size is medium. Add `iconOnly` for an icon-only button; the legacy `size="icon"` remains a medium square.

Native buttons and action links can use `ui-button ui-button-lg`, `ui-button ui-button-md` or `ui-button ui-button-sm`. Add `ui-button-icon` only when there is no visible text. Wrap action groups when space is limited rather than constraining a text button to an icon width.

Navigation, calendar date cells, document cards and table controls retain their dedicated layouts unless explicitly assigned an action size. Compact buttons meet the 24 px target minimum. Mobile page action groups may use two lines for a label while retaining the standard height.
