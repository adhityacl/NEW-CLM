import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Table,
  Superscript,
  Subscript,
  Eraser,
  Quote,
  Code2,
  Minus,
  Link2,
  Unlink,
  Highlighter,
  Rows3,
  Columns3,
  Trash2,
  IndentIncrease,
  IndentDecrease,
  Combine,
  SplitSquareHorizontal,
  PaintBucket,
} from 'lucide-react';

interface ContractEditorToolbarProps {
  editor: Editor | null;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
      active
        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`}
  >
    {children}
  </button>
);

const Divider = () => (
  <div className="w-px self-stretch bg-slate-200 dark:bg-slate-800 mx-1" />
);

const GRID_MAX = 8;

const CELL_COLORS: { label: string; value: string | null }[] = [
  { label: 'Tanpa warna', value: null },
  { label: 'Abu-abu', value: '#f1f5f9' },
  { label: 'Merah', value: '#fee2e2' },
  { label: 'Kuning', value: '#fef9c3' },
  { label: 'Hijau', value: '#dcfce7' },
  { label: 'Biru', value: '#dbeafe' },
  { label: 'Ungu', value: '#ede9fe' },
];

/** Hover-to-size table grid picker, matching the modern "Word/Notion-style" insert UX. */
const TableGridPicker: React.FC<{
  onPick: (rows: number, cols: number) => void;
}> = ({ onPick }) => {
  const [hovered, setHovered] = useState({ row: 0, col: 0 });

  return (
    <div className="p-2.5">
      <div
        className="grid gap-[3px] w-fit mx-auto"
        style={{ gridTemplateColumns: `repeat(${GRID_MAX}, 16px)`, gridAutoRows: '16px' }}
        onMouseLeave={() => setHovered({ row: 0, col: 0 })}
      >
        {Array.from({ length: GRID_MAX * GRID_MAX }).map((_, i) => {
          const row = Math.floor(i / GRID_MAX);
          const col = i % GRID_MAX;
          const isActive = row < hovered.row && col < hovered.col;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHovered({ row: row + 1, col: col + 1 })}
              onClick={() => onPick(row + 1, col + 1)}
              className={`w-full h-full rounded-[2px] border transition-colors ${
                isActive
                  ? 'bg-emerald-500 border-emerald-600'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-1 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg py-1">
        <Table className="w-3 h-3" />
        <span>{hovered.row || 1}</span>
        <span className="text-slate-400">x</span>
        <span>{hovered.col || 1}</span>
      </div>
    </div>
  );
};

export const ContractEditorToolbar: React.FC<ContractEditorToolbarProps> = ({
  editor,
}) => {
  const [showTableMenu, setShowTableMenu] = useState(false);

  if (!editor) return null;

  const insideTable = editor.isActive('table');

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Masukkan URL tautan:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center gap-0.5 shrink-0 z-10 shadow-xs">
      {/* History */}
      <ToolbarButton title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Block type */}
      <ToolbarButton
        title="Heading 1 (Judul Utama)"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Heading 2 (Judul Pasal)"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Heading 3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Teks Normal Paragraf"
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        <span className="text-xs font-bold px-0.5">P</span>
      </ToolbarButton>
      <ToolbarButton
        title="Kutipan (Blockquote)"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Blok Kode"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Text styling */}
      <ToolbarButton title="Tebal (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Miring (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Garis Bawah (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Coret (Strikethrough)" onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Sorot Teks (Highlight)" onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <Highlighter className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Tautan (Link)" onClick={setLink}>
        <Link2 className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Hapus Tautan"
        disabled={!editor.isActive('link')}
        onClick={() => editor.chain().focus().unsetLink().run()}
      >
        <Unlink className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Alignment */}
      <ToolbarButton title="Rata Kiri" onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Rata Tengah" onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Rata Kanan" onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Rata Kanan-Kiri (Justify)" onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
        <AlignJustify className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton title="Bullet List" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Numbered List" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Kurangi Indentasi"
        disabled={!editor.can().liftListItem('listItem')}
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
      >
        <IndentDecrease className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Tambah Indentasi"
        disabled={!editor.can().sinkListItem('listItem')}
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
      >
        <IndentIncrease className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Table */}
      <div className="relative">
        <ToolbarButton
          title="Tabel"
          active={showTableMenu}
          onClick={() => setShowTableMenu((v) => !v)}
        >
          <Table className="w-3.5 h-3.5" />
        </ToolbarButton>
        {showTableMenu && (
          <div
            className="absolute top-full left-0 mt-1 w-fit bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-30"
            onMouseLeave={() => setShowTableMenu(false)}
          >
            <TableGridPicker
              onPick={(rows, cols) => {
                editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                setShowTableMenu(false);
              }}
            />

            {insideTable && (
              <div className="p-1.5 space-y-0.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-2 whitespace-nowrap"
                >
                  <Rows3 className="w-3.5 h-3.5" /> Tambah Baris
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-2 whitespace-nowrap"
                >
                  <Columns3 className="w-3.5 h-3.5" /> Tambah Kolom
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-2 whitespace-nowrap"
                >
                  <Rows3 className="w-3.5 h-3.5" /> Toggle Baris Header
                </button>
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                <button
                  type="button"
                  disabled={!editor.can().mergeCells()}
                  onClick={() => editor.chain().focus().mergeCells().run()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-2 whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Combine className="w-3.5 h-3.5" /> Gabung Sel (Merge)
                </button>
                <button
                  type="button"
                  disabled={!editor.can().splitCell()}
                  onClick={() => editor.chain().focus().splitCell().run()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-2 whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5" /> Pisah Sel (Split)
                </button>
                <div className="px-2.5 py-1.5">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 mb-1.5">
                    <PaintBucket className="w-3 h-3" /> Warna Sel
                  </div>
                  <div className="flex items-center gap-1.5">
                    {CELL_COLORS.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        title={c.label}
                        onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', c.value).run()}
                        className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                        style={{ backgroundColor: c.value || 'transparent' }}
                      />
                    ))}
                  </div>
                </div>
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                <button
                  type="button"
                  onClick={() => editor.chain().focus().deleteRow().run()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus Baris
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus Kolom
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().deleteTable().run()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-bold rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-700 dark:text-rose-400 flex items-center gap-2 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus Seluruh Tabel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Divider />

      {/* Misc */}
      <ToolbarButton title="Superscript (Pangkat Atas)" onClick={() => editor.chain().focus().toggleSuperscript().run()}>
        <Superscript className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Subscript (Pangkat Bawah)" onClick={() => editor.chain().focus().toggleSubscript().run()}>
        <Subscript className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Garis Horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Hapus Format Teks" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
        <Eraser className="w-3.5 h-3.5" />
      </ToolbarButton>
    </div>
  );
};
