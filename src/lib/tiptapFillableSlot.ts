import { Node, mergeAttributes, type Editor } from '@tiptap/core';

export type FillableSlotType =
  | 'text'
  | 'date'
  | 'currency'
  | 'entity'
  | 'person'
  | 'location'
  | 'number';

const SLOT_ICONS: Record<string, string> = {
  text: 'T',
  date: '📅',
  currency: '💰',
  entity: '🏢',
  person: '👤',
  location: '📍',
  number: '#️⃣',
};

const EMPTY_VALUE = '...';

function isSlotFilled(text: string): boolean {
  const trimmed = (text || '').trim();
  return Boolean(trimmed) && trimmed !== EMPTY_VALUE && !trimmed.startsWith('[');
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fillableSlot: {
      insertFillableSlot: (options: {
        slotKey: string;
        slotType: FillableSlotType;
        value?: string;
      }) => ReturnType;
    };
  }
}

/**
 * Inline node whose text content is real, editable ProseMirror content
 * (not a nested `contenteditable` hack), so cursor movement, backspace and
 * selection behave normally instead of the quirks of the old contentEditable
 * implementation. HTML shape is kept identical to `renderFillableSlot()` in
 * cooperationAgreementTemplate.ts (class/data-attributes/child span names) so
 * every downstream consumer (translate-template prompt, stripFillableSlotsToPlainText,
 * saved contracts) keeps working unchanged.
 */
export const FillableSlot = Node.create({
  name: 'fillableSlot',
  group: 'inline',
  inline: true,
  content: 'text*',
  marks: '',
  selectable: true,
  draggable: true,
  atom: false,

  addAttributes() {
    return {
      slotKey: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-slot-key') || '',
        renderHTML: (attrs) => ({ 'data-slot-key': attrs.slotKey }),
      },
      slotType: {
        default: 'text',
        parseHTML: (el) => el.getAttribute('data-slot-type') || 'text',
        renderHTML: (attrs) => ({ 'data-slot-type': attrs.slotType }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.fillable-slot',
        contentElement: '.slot-text',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const text = node.textContent || '';
    const filled = isSlotFilled(text);
    const icon = SLOT_ICONS[node.attrs.slotType] || 'T';

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: `fillable-slot ${filled ? 'slot-filled' : 'slot-empty'}`,
        draggable: 'true',
      }),
      ['span', { class: 'slot-icon-badge', contenteditable: 'false' }, icon],
      ['span', { class: 'slot-text' }, 0],
    ];
  },

  addCommands() {
    return {
      insertFillableSlot:
        ({ slotKey, slotType, value }) =>
        ({ chain }) => {
          const text = value && value.trim() ? value.trim() : EMPTY_VALUE;
          return chain()
            .insertContent({
              type: this.name,
              attrs: { slotKey, slotType },
              content: [{ type: 'text', text }],
            })
            .run();
        },
    };
  },
});

/**
 * Replaces the text content of every fillableSlot node matching `slotKey`
 * with `value`, in a single transaction. Mirrors the old direct-DOM
 * `querySelectorAll('[data-slot-key="..."]')` sync, but goes through
 * ProseMirror's document model instead of mutating the rendered DOM, so the
 * editor state never desyncs from what's on screen.
 */
export function setFillableSlotValue(editor: Editor | null, slotKey: string, rawValue: string): boolean {
  if (!editor) return false;
  const value = rawValue && rawValue.trim() ? rawValue : EMPTY_VALUE;
  const { state, view } = editor;
  let tr = state.tr;
  let changed = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'fillableSlot' && node.attrs.slotKey === slotKey) {
      const from = tr.mapping.map(pos + 1);
      const to = tr.mapping.map(pos + node.nodeSize - 1);
      if (to > from) {
        tr = tr.delete(from, to);
      }
      tr = tr.insertText(value, from);
      changed = true;
    }
    return true;
  });

  if (changed && tr.docChanged) {
    tr.setMeta('addToHistory', false);
    view.dispatch(tr);
  }

  return changed;
}

/** Scrolls to and briefly highlights the first fillableSlot node matching `slotKey`. */
export function focusFillableSlot(editor: Editor | null, slotKey: string) {
  if (!editor) return;
  const { state, view } = editor;
  let targetPos: number | null = null;

  state.doc.descendants((node, pos) => {
    if (targetPos === null && node.type.name === 'fillableSlot' && node.attrs.slotKey === slotKey) {
      targetPos = pos;
    }
    return targetPos === null;
  });

  if (targetPos === null) return;
  const pos = targetPos as number;

  editor
    .chain()
    .focus()
    .setTextSelection({ from: pos + 1, to: pos + 1 })
    .run();

  const domNode = view.nodeDOM(pos) as HTMLElement | null;
  const el = domNode instanceof HTMLElement ? domNode : (domNode as any)?.parentElement;
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'outline 0.2s ease';
    el.style.outline = '3px solid #f59e0b';
    setTimeout(() => {
      el.style.outline = '';
    }, 1500);
  }
}
