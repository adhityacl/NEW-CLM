import React, { useState, useEffect, useRef, useId } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import { CustomTableCell, CustomTableHeader } from '../lib/tiptapTableCellBackground';
import {
  FileSignature,
  FileDown,
  Save,
  Printer,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Shield,
  FileText,
  UserCheck,
  Edit3,
  Download,
  Building2,
  Calendar,
  DollarSign,
  PlusCircle,
  HelpCircle,
  Check,
  ExternalLink,
  Target,
  Trash2,
  MapPin,
  User,
  Briefcase,
  FolderOpen,
  ListChecks,
  ArrowLeft,
  Variable,
  History,
  Info,
  MessageSquare,
} from 'lucide-react';
import { Partner, Contract } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { useAlertToast } from '../context/AlertToastContext';
import { useTenant } from '../context/TenantContext';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../App';
import { CommentAnchor, renderRedlineHtml, stripCommentAnchors } from '../lib/tiptapCommentMark';
import { documentsApi, errorMessage } from '../lib/documentsApi';
import { formatDateTime, type DocumentComment, type DocumentDetail, type DocumentStatus, type DocumentType } from '../lib/documentModel';
import { diffParagraphs, htmlToParagraphs, type DiffPart } from '../lib/paragraphDiff';
import { DocumentExplorer } from './documents/DocumentExplorer';
import { DraftHistoryPanel } from './documents/DraftHistoryPanel';
import { DocumentInfoPanel } from './documents/DocumentInfoPanel';
import { CommentsPanel } from './documents/CommentsPanel';
import { RelativeTime } from './documents/RelativeTime';
import {
  buildAgreementHtml,
  jurisdictionFromSettings,
  setAgreementJurisdiction,
  COOPERATION_AGREEMENT_FIELDS,
  renderFillableSlot,
  stripFillableSlotsToPlainText,
} from '../data/cooperationAgreementTemplate';
import { FillableSlot, setFillableSlotValue, focusFillableSlot } from '../lib/tiptapFillableSlot';
import { ContractEditorToolbar } from './editor/ContractEditorToolbar';
import { TableSelectionOverlay } from './editor/TableSelectionOverlay';

interface ContractCreatorViewProps {
  partners: Partner[];
  contracts: Contract[];
  onSaveToSystem: (contractData: Partial<Contract>) => Promise<void>;
  onNavigateToContracts: () => void;
}

/**
 * Custom field *definitions* (label/type/icon/description — everything the
 * Fields tab and the Template tab's "Kustom" filter need to show and manage
 * one) used to live only in `localStorage`, never in the saved template
 * itself. A saved template's HTML always kept the actual fillable-slot
 * markup (so the value show up fine, just as an unlabeled "T ..." badge),
 * but logging in on another device/browser, or simply having localStorage
 * cleared, wiped the matching definition — the slot became orphaned: it
 * still holds a value, but nothing in the sidebar can label or manage it
 * anymore. These two helpers are the fix: custom field definitions now
 * travel WITH the template (see handleSaveTemplate/handleLoadTemplate), and
 * `recoverCustomFieldsFromContent` is a backstop for templates saved before
 * this fix — it reconstructs a usable (if generically-labeled) definition
 * for any fillable-slot found in the content that isn't otherwise known.
 */
function extractSlotKeysFromHtml(html: string): Array<{ key: string; type: string }> {
  const results: Array<{ key: string; type: string }> = [];
  const seen = new Set<string>();
  const tagRegex = /<span[^>]*class="[^"]*\bfillable-slot\b[^"]*"[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html))) {
    const tag = match[0];
    const key = tag.match(/data-slot-key="([^"]*)"/)?.[1];
    const type = tag.match(/data-slot-type="([^"]*)"/)?.[1] || 'text';
    if (key && !seen.has(key)) {
      seen.add(key);
      results.push({ key, type });
    }
  }
  return results;
}

const SLOT_TYPE_TO_FIELD_TYPE: Record<string, 'text' | 'date' | 'currency' | 'textarea'> = {
  date: 'date',
  currency: 'currency',
};
const SLOT_TYPE_ICON: Record<string, string> = {
  text: '🏷️',
  date: '📅',
  currency: '💰',
  entity: '🏢',
  person: '👤',
  location: '📍',
  number: '#️⃣',
};

function humanizeSlotKey(key: string): string {
  const base = key
    .replace(/^custom_/, '')
    .replace(/_[a-z0-9]{4,8}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!base) return 'Kolom Kustom';
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function recoverCustomFieldsFromContent(
  contentHtml: string,
  knownKeys: Set<string>,
  recoveredDescription: string,
): any[] {
  return extractSlotKeysFromHtml(contentHtml)
    .filter(({ key }) => !knownKeys.has(key))
    .map(({ key, type }) => ({
      key,
      label: humanizeSlotKey(key),
      type: SLOT_TYPE_TO_FIELD_TYPE[type] || 'text',
      icon: SLOT_TYPE_ICON[type] || '🏷️',
      placeholder: '',
      description: recoveredDescription,
      isCustom: true,
    }));
}

/** Merges a template's own saved custom fields (if any) plus a recovery
 * pass over its content into whatever custom fields are already loaded,
 * without duplicating by key. `builtInKeys` (COOPERATION_AGREEMENT_FIELDS'
 * keys) must be passed in so the recovery pass doesn't mistake a *built-in*
 * field's own fillable-slot for an orphaned custom one. */
function mergeTemplateCustomFields(
  currentCustomFields: any[],
  templateCustomFields: any[] | undefined,
  contentHtml: string,
  builtInKeys: Set<string>,
  recoveredDescription: string,
): any[] {
  const merged = [...currentCustomFields];
  const knownKeys = new Set([...builtInKeys, ...merged.map((f) => f.key)]);
  for (const f of Array.isArray(templateCustomFields) ? templateCustomFields : []) {
    if (f?.key && !knownKeys.has(f.key)) {
      merged.push(f);
      knownKeys.add(f.key);
    }
  }
  for (const f of recoverCustomFieldsFromContent(contentHtml, knownKeys, recoveredDescription)) {
    merged.push(f);
    knownKeys.add(f.key);
  }
  return merged;
}

const BUILT_IN_FIELD_KEYS = new Set(COOPERATION_AGREEMENT_FIELDS.map((f) => f.key));

/** Fillable-slot keys as they actually appear in the document right now, top to bottom,
 * deduped by first occurrence — drives the Fields panel's order and which fields show at all. */
function getOrderedSlotKeys(editor: Editor | null): string[] {
  if (!editor) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  editor.state.doc.descendants((node) => {
    const key = node.type.name === 'fillableSlot' ? (node.attrs.slotKey as string) : '';
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    return true;
  });
  return keys;
}

const INITIAL_FIELD_VALUES: Record<string, string> = {
  firstPartyName: '',
  firstPartyAlias: '',
  firstPartyAddress: '',
  firstPartyPic: '',
  firstPartyPosition: '',
  firstPartyEmail: '',
  firstPartyBusinessDesc: '',
  partnerName: '',
  partnerAlias: '',
  partnerAddress: '',
  partnerPic: '',
  partnerPosition: '',
  partnerBusinessDesc: '',
  dateStr: '',
  startDate: '',
  endDate: '',
  scopeDescId: '',
  scopeDescEn: '',
  feeAmountId: '',
  feeAmountEn: '',
  bankName: '',
  bankAccount: '',
  bankHolder: '',
  partnerEmail: '',
};

const AUTOSAVE_INTERVAL_MS = 30_000;

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };
type PreviewOverride = { kind: 'version'; version: number; html: string } | { kind: 'diff'; version: number; parts: DiffPart[] };
type Baseline = { html: string; title: string } | null;

/** Baseline = the last content known to be on the server (or the untouched starting content of a new document). */
const differsFrom = (baseline: Baseline, html: string, title: string) =>
  baseline !== null && (html !== baseline.html || title.trim() !== baseline.title);

const toComparableParagraphs = (html: string) => htmlToParagraphs(stripFillableSlotsToPlainText(stripCommentAnchors(html)));

export const ContractCreatorView: React.FC<ContractCreatorViewProps> = ({
  partners,
  contracts,
  onSaveToSystem,
  onNavigateToContracts,
}) => {
  const { t, language } = useLanguage();
  const confirmDialog = useConfirm();
  const showAlert = useAlertToast();
  const { activeTenant } = useTenant();
  const { isEditor: canEdit, isManager: canManageFields } = useAuth();
  const { policy } = useTenantSettings();
  // Document language and jurisdiction wording follow the organization settings. The 15-article
  // template only has English and Indonesian text, so a Chinese org setting falls back to English.
  const docLanguage = policy.settings.language;
  const templateLanguage: 'EN' | 'ID' = docLanguage === 'ID' ? 'ID' : 'EN';
  setAgreementJurisdiction(jurisdictionFromSettings(policy.settings));
  const paperSheetRef = useRef<HTMLDivElement>(null);

  // Compute First Party details dynamically from activeTenant
  const tenantEntityName = activeTenant
    ? `${activeTenant.legalEntity ? activeTenant.legalEntity + ' ' : ''}${activeTenant.name}`
    : 'Organization';
  const tenantBrand = activeTenant?.brandName || activeTenant?.name || 'ITS';

  // General Cooperation Agreement titles
  const agreementTitle = docLanguage === 'ID' ? 'PERJANJIAN KERJASAMA' : 'COOPERATION AGREEMENT';
  const defaultDocTitle = `${agreementTitle} - ${tenantEntityName} & ${docLanguage === 'ID' ? 'Mitra' : 'Partner'}`;
  const now = new Date();
  const defaultContractNo = `${tenantBrand.toUpperCase().replace(/\s+/g, '')}/AGR/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(contracts.length + 1).padStart(3, '0')}`;

  const [docTitle, setDocTitle] = useState(defaultDocTitle);
  const [contractNumber, setContractNumber] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // Document explorer, persistence and version state
  const [screen, setScreen] = useState<'explorer' | 'editor'>('explorer');
  const [currentDoc, setCurrentDoc] = useState<DocumentDetail | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [previewOverride, setPreviewOverride] = useState<PreviewOverride | null>(null);
  const currentDocRef = useRef<DocumentDetail | null>(null);
  const baselineRef = useRef<Baseline>(null);
  const docTitleRef = useRef(docTitle);
  const inFlightSaveRef = useRef<Promise<string | null> | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const panelIdPrefix = useId();

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'fields' | 'partners' | 'templates' | 'contents' | 'history' | 'info' | 'comments'>('fields');
  const [highlightFillable, setHighlightFillable] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [wordCount, setWordCount] = useState(0);
  // Fields panel order/visibility: only slots actually present in the document, in document order.
  const [orderedSlotKeys, setOrderedSlotKeys] = useState<string[]>([]);
  const [charCount, setCharCount] = useState(0);

  // Fillable slot field values state - dynamically initialized with activeTenant
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(INITIAL_FIELD_VALUES);

  // Kept in sync with fieldValues via effect below; lets the editor's drop handler
  // (created once by useEditor) always read the latest values without forcing a
  // full editor re-creation whenever a field changes.
  const fieldValuesRef = useRef(fieldValues);
  useEffect(() => {
    fieldValuesRef.current = fieldValues;
  }, [fieldValues]);

  // Debounces the word/char counter so typing doesn't re-render this whole
  // (large) component on every keystroke: `getText()` walks the entire
  // document, and for a long contract that plus the resulting re-render was
  // the actual source of the input lag reported while formatting text.
  const statsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (statsDebounceRef.current) clearTimeout(statsDebounceRef.current);
    };
  }, []);

  // Custom fields state with local persistence
  const [customFields, setCustomFields] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('silegal_custom_fields');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('silegal_custom_fields', JSON.stringify(customFields));
  }, [customFields]);

  // Form states for creating custom fields
  const [showAddCustomField, setShowAddCustomField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'date' | 'currency' | 'textarea' | 'email' | 'boolean' | 'select'>('text');
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldDescription, setNewFieldDescription] = useState('');
  const [newFieldIcon, setNewFieldIcon] = useState('⭐');
  // Comma-separated raw input for the 'select' type's option list.
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [activeDragCategory, setActiveDragCategory] = useState<'all' | 'firstParty' | 'partner' | 'operational' | 'custom'>('all');

  const handleCreateCustomField = () => {
    if (!newFieldLabel.trim()) {
      showAlert({ title: t('contract_creator.msg.custom_field_name_required', 'Nama kolom isian belum diisi'), variant: 'warning' });
      return;
    }
    const safeKey = `custom_${newFieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Auto-resolve dynamic default icons based on field type
    let finalIcon = newFieldIcon;
    if (!newFieldIcon.trim() || newFieldIcon === '⭐') {
      if (newFieldType === 'date') finalIcon = '📅';
      else if (newFieldType === 'currency') finalIcon = '💰';
      else if (newFieldType === 'textarea') finalIcon = '📝';
      else if (newFieldType === 'email') finalIcon = '📧';
      else if (newFieldType === 'boolean') finalIcon = '☑️';
      else if (newFieldType === 'select') finalIcon = '▾';
      else finalIcon = '🏷️';
    }

    const options = newFieldOptions
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (newFieldType === 'select' && options.length === 0) {
      showAlert({ title: t('contract_creator.msg.custom_field_options_required', 'Isi minimal satu opsi pilihan'), variant: 'warning' });
      return;
    }

    const newField = {
      key: safeKey,
      label: newFieldLabel.trim(),
      type: newFieldType,
      icon: finalIcon,
      placeholder: newFieldPlaceholder.trim() || t('contract_creator.masukkan', 'Masukkan {trim}...', { trim: newFieldLabel.trim() }),
      description: newFieldDescription.trim() || t('contract_creator.kolom_kustom_untuk', 'Kolom kustom untuk {trim}', { trim: newFieldLabel.trim() }),
      isCustom: true,
      ...(newFieldType === 'select' ? { options } : {}),
    };

    setCustomFields((prev) => [...prev, newField]);

    // Initialize its value in fieldValues
    setFieldValues((prev) => ({
      ...prev,
      [safeKey]: newFieldType === 'boolean' ? t('contract_creator.field.boolean_no', 'No') : ''
    }));

    // Reset form
    setNewFieldLabel('');
    setNewFieldPlaceholder('');
    setNewFieldDescription('');
    setNewFieldIcon('⭐');
    setNewFieldOptions('');
    setShowAddCustomField(false);
  };

  // Action status
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Templates state & functions
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isCustomTemplateActive, setIsCustomTemplateActive] = useState(false);
  // True once the initial template-library fetch has settled (success,
  // empty, or error) — distinct from `savedTemplates.length === 0`, which
  // is also true for the split second before the fetch has even started.
  // The default-template effect below needs to tell those two apart.
  const [templatesReady, setTemplatesReady] = useState(false);

  const fetchTemplates = async () => {
    try {
      setIsLoadingTemplates(true);
      const res = await fetch('/api/templates', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error(t('contract_creator.http_error', 'HTTP error {status}', { status: res.status }));
      }
      const text = await res.text();
      if (!text || text.trim().startsWith('<')) {
        setSavedTemplates([]);
        return;
      }
      const data = JSON.parse(text);
      setSavedTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setIsLoadingTemplates(false);
      setTemplatesReady(true);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) {
      showAlert({ title: t('contract_creator.msg.template_name_required', 'Nama template belum diisi'), variant: 'warning' });
      return;
    }
    const content = stripCommentAnchors(editor?.getHTML() || '');
    if (!content.trim()) {
      showAlert({ title: t('contract_creator.msg.template_content_empty', 'Konten template masih kosong'), variant: 'warning' });
      return;
    }

    try {
      setIsSavingTemplate(true);
      // Only the custom fields this document actually uses travel with it —
      // not every custom field the user has ever defined in this session.
      const usedKeys = new Set(extractSlotKeysFromHtml(content).map((s) => s.key));
      const templateCustomFields = customFields.filter((f) => usedKeys.has(f.key));
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          contentId: content,
          customFields: templateCustomFields,
        }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text && !text.trim().startsWith('<') ? JSON.parse(text) : { error: t('contract_creator.server_error_status', 'Server error (Status {status})', { status: res.status }) };
      } catch {
        data = { error: t('contract_creator.gagal_memproses_respon_server', 'Gagal memproses respon server.') };
      }

      if (res.ok && data.success) {
        setNewTemplateName('');
        showAlert({ title: t('contract_creator.msg.template_saved', 'Template kerjasama berhasil disimpan'), variant: 'success' });
        fetchTemplates();
      } else {
        showAlert({
          title: t('contract_creator.msg.template_save_failed', 'Gagal menyimpan template'),
          description: data.error || data.message || t('contract_creator.status', 'Status {status}.', { status: res.status }),
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Save template error:', err);
      showAlert({ title: t('contract_creator.msg.template_save_error', 'Terjadi kesalahan saat menyimpan template'), variant: 'destructive' });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const ok = await confirmDialog({
      description: t('contract_creator.confirm.delete_template_desc', 'Hapus template kerjasama ini?'),
      tone: 'danger',
      confirmLabel: t('contract_creator.confirm.delete_label', 'Hapus'),
    });
    if (!ok) {
      return;
    }
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text && !text.trim().startsWith('<') ? JSON.parse(text) : { error: t('contract_creator.server_error_status', 'Server error (Status {status})', { status: res.status }) };
      } catch {
        data = { error: t('contract_creator.gagal_memproses_respon_server', 'Gagal memproses respon server.') };
      }

      if (res.ok && data.success) {
        showAlert({ title: t('contract_creator.msg.template_deleted', 'Template kerjasama berhasil dihapus'), variant: 'success' });
        fetchTemplates();
      } else {
        showAlert({
          title: t('contract_creator.msg.template_delete_failed', 'Gagal menghapus template'),
          description: data.error || data.message || t('contract_creator.status', 'Status {status}.', { status: res.status }),
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Delete template error:', err);
      showAlert({ title: t('contract_creator.msg.template_delete_error', 'Terjadi kesalahan saat menghapus template'), variant: 'destructive' });
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Superscript,
      Subscript,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      TableKit.configure({
        table: { resizable: true },
        tableCell: false,
        tableHeader: false,
      }),
      CustomTableCell,
      CustomTableHeader,
      FillableSlot,
      CommentAnchor,
    ],
    content: '',
    onUpdate: ({ editor: instance }) => {
      if (statsDebounceRef.current) clearTimeout(statsDebounceRef.current);
      statsDebounceRef.current = setTimeout(() => {
        const text = instance.getText() || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        setWordCount(words);
        setCharCount(text.length);
        setHasUnsaved(differsFrom(baselineRef.current, instance.getHTML(), docTitleRef.current));
        setOrderedSlotKeys(getOrderedSlotKeys(instance));
      }, 300);
    },
    editorProps: {
      handleClick: (_view, _pos, event) => {
        if ((event.target as HTMLElement | null)?.closest?.('[data-comment-id]')) {
          setSidebarOpen(true);
          setSidebarTab('comments');
        }
        return false;
      },
      // Handles fields dragged in from the "Kolom Isian Drag & Drop" sidebar palette
      // (plain HTML5 dataTransfer JSON, not a ProseMirror-native drag). Moving an
      // existing fillableSlot node around inside the document is handled natively by
      // ProseMirror itself (the node spec declares `draggable: true`), so this only
      // needs to cover inserting a brand-new slot from outside the editor.
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const dataStr = event.dataTransfer?.getData('text/plain');
        if (!dataStr) return false;

        let data: { type?: string; key?: string; placeholder?: string } = {};
        try {
          data = JSON.parse(dataStr);
        } catch {
          return false;
        }
        if (!data.type || !data.key) return false;

        event.preventDefault();
        const coords = { left: event.clientX, top: event.clientY };
        const pos = view.posAtCoords(coords)?.pos ?? view.state.selection.from;
        const currentVal = fieldValuesRef.current[data.key] || '';

        view.dispatch(
          view.state.tr.insert(
            pos,
            view.state.schema.nodes.fillableSlot.create(
              { slotKey: data.key, slotType: data.type },
              view.state.schema.text(currentVal.trim() ? currentVal : '...')
            )
          )
        );
        return true;
      },
    },
  });

  // Word & Character counter (for use after programmatic content/command changes)
  const updateStats = () => {
    if (!editor) return;
    const text = editor.getText() || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(text.length);
    setOrderedSlotKeys(getOrderedSlotKeys(editor));
  };

  // Render or re-render the 15-article template into the editor
  const renderTemplateToEditor = (vals: Record<string, string>, cNo: string) => {
    if (!editor) return;
    const initialHtml = buildAgreementHtml({
      contractNo: cNo,
      firstPartyName: vals.firstPartyName,
      firstPartyAlias: vals.firstPartyAlias,
      firstPartyAddress: vals.firstPartyAddress,
      firstPartyPic: vals.firstPartyPic,
      firstPartyPosition: vals.firstPartyPosition,
      firstPartyEmail: vals.firstPartyEmail,
      firstPartyBusinessDesc: vals.firstPartyBusinessDesc,
      partnerName: vals.partnerName,
      partnerAlias: vals.partnerAlias,
      partnerAddress: vals.partnerAddress,
      partnerPic: vals.partnerPic,
      partnerPosition: vals.partnerPosition,
      partnerBusinessDesc: vals.partnerBusinessDesc,
      dateStr: vals.dateStr,
      startDate: vals.startDate,
      endDate: vals.endDate,
      scopeDescId: vals.scopeDescId,
      feeAmountId: vals.feeAmountId,
      bankName: vals.bankName,
      bankAccount: vals.bankAccount,
      bankHolder: vals.bankHolder,
      partnerEmail: vals.partnerEmail,
    }, templateLanguage);
    editor.commands.setContent(initialHtml);
    updateStats();
  };

  const recoveredFieldDescription = t(
    'contract_creator.custom_field_recovered_desc',
    'Kolom kustom dipulihkan otomatis dari dokumen (label asli tidak tersimpan).',
  );

  const markClean = (title: string) => {
    if (!editor) return;
    baselineRef.current = { html: editor.getHTML(), title: title.trim() };
    setHasUnsaved(false);
  };

  const isDirty = () =>
    Boolean(editor) && !editor!.isDestroyed && differsFrom(baselineRef.current, editor!.getHTML(), docTitleRef.current);

  const setDocument = (doc: DocumentDetail | null) => {
    currentDocRef.current = doc;
    setCurrentDoc(doc);
  };

  /**
   * New documents start from the first entry of the template library (not the built-in
   * 15-article agreement, which stays behind "Reset Template"); blank if the library is empty.
   */
  const resetToNewDocument = () => {
    if (!editor) return;
    const template = savedTemplates[0];
    editor.commands.setContent(template?.contentId ?? '');
    setIsCustomTemplateActive(Boolean(template));
    if (template) {
      setCustomFields((prev) =>
        mergeTemplateCustomFields(prev, template.customFields, template.contentId, BUILT_IN_FIELD_KEYS, recoveredFieldDescription),
      );
    }
    setDocument(null);
    setDocTitle(defaultDocTitle);
    setContractNumber('');
    setFieldValues(INITIAL_FIELD_VALUES);
    setPreviewOverride(null);
    setViewMode('editor');
    setSaveState({ status: 'idle' });
    markClean(defaultDocTitle);
    updateStats();
  };

  const loadDocument = (doc: DocumentDetail) => {
    if (!editor) return;
    editor.commands.setContent(doc.content || '');
    setCustomFields((prev) => mergeTemplateCustomFields(prev, undefined, doc.content, BUILT_IN_FIELD_KEYS, recoveredFieldDescription));
    setIsCustomTemplateActive(true);
    setDocument(doc);
    setDocTitle(doc.name);
    setContractNumber('');
    setFieldValues(INITIAL_FIELD_VALUES);
    setPreviewOverride(null);
    setViewMode('editor');
    setSaveState({ status: 'idle' });
    markClean(doc.name);
    setHistoryRefreshKey((k) => k + 1);
    updateStats();
  };

  // Waits for the template library fetch to settle so a new document never races an empty `savedTemplates`.
  useEffect(() => {
    if (!editor || !templatesReady || baselineRef.current) return;
    resetToNewDocument();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, templatesReady]);

  useEffect(() => {
    docTitleRef.current = docTitle;
    if (editor && !editor.isDestroyed) setHasUnsaved(differsFrom(baselineRef.current, editor.getHTML(), docTitle));
  }, [docTitle, editor]);

  const performSave = async (kind: 'auto' | 'manual', keepalive: boolean): Promise<string | null> => {
    const existing = currentDocRef.current;
    if (!editor || editor.isDestroyed || !baselineRef.current || !canEdit) return existing?.id ?? null;
    const html = editor.getHTML();
    const title = docTitleRef.current.trim() || defaultDocTitle;
    const dirty = differsFrom(baselineRef.current, html, title);
    if (existing && !dirty) return existing.id;
    if (!existing && !dirty && kind === 'auto') return null;

    setSaveState({ status: 'saving' });
    try {
      const doc = existing
        ? (await documentsApi.saveDraft(existing.id, { content: html, name: title, kind }, keepalive)).document
        : await documentsApi.create({ name: title, content: html }, keepalive);
      setDocument(doc);
      baselineRef.current = { html, title };
      if (!docTitleRef.current.trim()) setDocTitle(title);
      setHasUnsaved(differsFrom(baselineRef.current, editor.getHTML(), docTitleRef.current));
      setSaveState({ status: 'idle' });
      setHistoryRefreshKey((k) => k + 1);
      return doc.id;
    } catch (err) {
      setSaveState({ status: 'error', message: errorMessage(err) });
      return null;
    }
  };

  /** Serialized so autosave, manual save and leave-page saves never overlap. Resolves to the document id. */
  const saveNow = async (kind: 'auto' | 'manual', keepalive = false): Promise<string | null> => {
    if (inFlightSaveRef.current) await inFlightSaveRef.current;
    const pending = performSave(kind, keepalive);
    inFlightSaveRef.current = pending;
    try {
      return await pending;
    } finally {
      if (inFlightSaveRef.current === pending) inFlightSaveRef.current = null;
    }
  };

  const saveNowRef = useRef(saveNow);
  useEffect(() => {
    saveNowRef.current = saveNow;
  });

  useEffect(() => {
    if (screen !== 'editor' || !canEdit) return;
    const id = setInterval(() => void saveNowRef.current('auto'), AUTOSAVE_INTERVAL_MS);
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNowRef.current('manual');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [screen, canEdit]);

  // ponytail: keepalive requests are capped at 64 KB by browsers; larger unsaved documents rely on the leave-page prompt.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!editor || editor.isDestroyed || !differsFrom(baselineRef.current, editor.getHTML(), docTitleRef.current)) return;
      void saveNowRef.current('auto', true);
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Leaving the Create Contract page inside the app also saves pending changes.
      void saveNowRef.current('auto', true);
    };
  }, [editor]);

  useEffect(() => {
    if (screen === 'editor') titleInputRef.current?.focus({ preventScroll: true });
  }, [screen]);

  const startNewDocument = () => {
    resetToNewDocument();
    setScreen('editor');
  };

  const openDocument = async (id: string) => {
    try {
      loadDocument(await documentsApi.get(id));
      setScreen('editor');
    } catch (err) {
      showAlert({ title: t('documents.msg.open_failed', 'Gagal membuka dokumen'), description: errorMessage(err), variant: 'destructive' });
    }
  };

  const backToExplorer = async () => {
    if (canEdit && isDirty() && !(await saveNow('auto'))) {
      const leave = await confirmDialog({
        description: t('documents.confirm.leave_unsaved', 'Perubahan gagal disimpan. Tetap kembali ke daftar dokumen dan buang perubahan?'),
        tone: 'danger',
        confirmLabel: t('documents.action.leave', 'Tetap kembali'),
      });
      if (!leave) return;
    }
    setScreen('explorer');
  };

  const showVersion = async (version: number, kind: PreviewOverride['kind']) => {
    const doc = currentDocRef.current;
    if (!doc || !editor) return;
    try {
      const draft = await documentsApi.getDraft(doc.id, version);
      setPreviewOverride(
        kind === 'version'
          ? { kind, version, html: draft.content }
          : { kind, version, parts: diffParagraphs(toComparableParagraphs(draft.content), toComparableParagraphs(editor.getHTML())) },
      );
      setViewMode('preview');
    } catch (err) {
      showAlert({ title: t('documents.msg.action_failed', 'Aksi gagal'), description: errorMessage(err), variant: 'destructive' });
    }
  };

  const restoreVersion = async (version: number) => {
    const doc = currentDocRef.current;
    if (!doc) return;
    const ok = await confirmDialog({
      description: t('documents.confirm.restore', 'Pulihkan dokumen ke versi {v}? Isi saat ini tetap tersimpan di riwayat.', { v: version }),
      confirmLabel: t('documents.history.restore', 'Pulihkan'),
    });
    if (!ok) return;
    if (isDirty() && !(await saveNow('manual'))) return;
    try {
      const { document } = await documentsApi.restoreDraft(doc.id, version);
      loadDocument(document);
      showAlert({ title: t('documents.msg.restored', 'Versi {v} dipulihkan', { v: version }), variant: 'success' });
    } catch (err) {
      showAlert({ title: t('documents.msg.action_failed', 'Aksi gagal'), description: errorMessage(err), variant: 'destructive' });
    }
  };

  const updateDocumentInfo = async (patch: { status?: DocumentStatus; type?: DocumentType }) => {
    const doc = currentDocRef.current;
    if (!doc) return;
    try {
      setDocument(await documentsApi.update(doc.id, patch));
    } catch (err) {
      showAlert({ title: t('documents.msg.action_failed', 'Aksi gagal'), description: errorMessage(err), variant: 'destructive' });
    }
  };

  const switchViewMode = (mode: 'editor' | 'preview') => {
    setPreviewOverride(null);
    setViewMode(mode);
  };

  const handleLoadTemplate = async (tpl: any) => {
    const confirmMsg = `${t('contract_creator.confirm.use_template_prefix', 'Gunakan template')} "${tpl.name}"${t('contract_creator.confirm.use_template_suffix', '? Teks kontrak saat ini akan diganti.')}`;
    if (await confirmDialog(confirmMsg)) {
      if (editor) {
        editor.commands.setContent(tpl.contentId);
        setIsCustomTemplateActive(true);
        // Bring this template's own custom field definitions along (and, for
        // templates saved before this existed, recover a generic definition
        // for any fillable-slot the content has that isn't otherwise known) —
        // see the comment on mergeTemplateCustomFields for why this exists.
        setCustomFields((prev) =>
          mergeTemplateCustomFields(prev, tpl.customFields, tpl.contentId, BUILT_IN_FIELD_KEYS, recoveredFieldDescription),
        );
        setExportMessage({
          type: 'info',
          text: `${t('contract_creator.msg.template_loaded_prefix', 'Template')} "${tpl.name}" ${t('contract_creator.msg.template_loaded_suffix', 'berhasil dimuat ke editor.')}`,
        });
      }
    }
  };

  // Sync a single field from sidebar to all matching editor slots
  const handleFieldValueChange = (key: string, value: string) => {
    const updated = { ...fieldValues, [key]: value };
    setFieldValues(updated);

    // If partner name or first party name changed, also update document title
    if (key === 'partnerName' || key === 'firstPartyName') {
      const p1 = (key === 'firstPartyName' ? value : fieldValues.firstPartyName) || tenantEntityName;
      const p2 = (key === 'partnerName' ? value : fieldValues.partnerName) || 'Mitra';
      setDocTitle(`${agreementTitle} - ${p1} & ${p2}`);
    }

    if (!editor) return;
    // Sync via a ProseMirror transaction (not direct DOM mutation) so editor state never desyncs
    const didUpdateExistingSlots = setFillableSlotValue(editor, key, value);
    if (didUpdateExistingSlots) {
      updateStats();
    } else {
      // Fallback: re-render whole template
      renderTemplateToEditor(updated, contractNumber);
    }
  };

  // Focus directly on a slot inside the editor canvas
  const handleFocusSlot = (key: string) => {
    focusFillableSlot(editor, key);
  };

  // Insert raw HTML at the current cursor position
  const insertHTMLAtCursor = (html: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(html).run();
    updateStats();
  };

  // Apply registered partner into fields & editor
  const handleApplyPartner = (partner: Partner) => {
    setSelectedPartner(partner);
    const p = partner as any;
    const pName = partner?.nama_partner || 'Mitra';
    const pAddress = p?.alamat_pic || p?.alamat || '';
    const pPic = p?.nama_pic || p?.pic_name || partner?.pic_partner || 'Direktur';
    const pPosition = p?.pic_position || 'Direktur Utama';
    const pEmail = p?.email_pic || p?.email || 'legal@mitra.co.id';

    const updated = {
      ...fieldValues,
      partnerName: pName,
      partnerAddress: pAddress,
      partnerPic: pPic,
      partnerPosition: pPosition,
      partnerEmail: pEmail,
    };

    setFieldValues(updated);
    const p1 = fieldValues.firstPartyName || tenantEntityName;
    setDocTitle(`${agreementTitle} - ${p1} & ${pName}`);
    renderTemplateToEditor(updated, contractNumber);

    setExportMessage({
      type: 'success',
      text: `${t('contract_creator.msg.partner_synced_prefix', 'Data mitra')} "${pName}" ${t('contract_creator.msg.partner_synced_suffix', 'berhasil disinkronkan ke dalam 15 pasal Perjanjian Kerjasama!')}`,
    });
  };



  // Reset document to default template
  const handleResetDocument = async () => {
    if (
      await confirmDialog({
        description: t('contract_creator.confirm.reset_desc', 'Reset dokumen ke template awal? Perubahan yang belum disimpan akan hilang.'),
        tone: 'danger',
        confirmLabel: t('contract_creator.confirm.reset_label', 'Reset'),
      })
    ) {
      renderTemplateToEditor(fieldValues, contractNumber);
      setIsCustomTemplateActive(false);
      setExportMessage({
        type: 'info',
        text: t('contract_creator.msg.reset_done', 'Template 15 Pasal Perjanjian Kerjasama berhasil direset ke kondisi awal.'),
      });
    }
  };

  // Word-importable .doc download of already-cleaned document HTML
  const downloadWordDocument = (contentHtml: string, fileSuffix: string) => {
      const docHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${docTitle}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  /* Normal margin (Word preset): 1 inch on every side. */
  @page {
    size: A4 portrait;
    margin: 1in 1in 1in 1in;
    mso-page-orientation: portrait;
  }
  @page Section1 {
    size: 21.0cm 29.7cm;
    margin: 1in 1in 1in 1in;
    mso-header-margin: 0.5in;
    mso-footer-margin: 0.5in;
    mso-paper-source: 0;
  }
  div.Section1 {
    page: Section1;
  }
  /* Mirrors the ".ProseMirror" rules in src/index.css (the same typography
     the live editor and the Pratinjau tab render with) so the downloaded
     file reads as the same document, not a re-styled copy. Px values there
     are converted 1:1 to pt (16px = 12pt) since Word documents are pt-based. */
  body { font-family: 'Plus Jakarta Sans', 'Inter', Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.625; color: #0f172a; margin: 0; padding: 0; }
  h1 { font-size: 22.5pt; font-weight: bold; line-height: 1.25; margin: 18pt 0 9pt 0; }
  h2 { font-size: 18pt; font-weight: bold; line-height: 1.3; margin: 15pt 0 6pt 0; }
  h3 { font-size: 15pt; font-weight: bold; line-height: 1.35; margin: 12pt 0 6pt 0; }
  p { margin: 0 0 9pt 0; line-height: 1.625; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12pt 0; }
  td, th { border: 1px solid #cbd5e1; padding: 6pt 9pt; vertical-align: top; }
  th { background-color: #f8fafc; font-weight: bold; text-align: left; }
  blockquote { border-left: 3px solid #cbd5e1; padding-left: 12pt; margin: 12pt 0; color: #475569; font-style: italic; }
  hr { border: none; border-top: 1.5pt solid #e2e8f0; margin: 18pt 0; }
</style>
</head>
<body>
<div class="Section1">
  ${contentHtml}
</div>
</body>
</html>`;

      const blob = new Blob(['\ufeff', docHtml], {
        type: 'application/msword',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docTitle.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_')}_${fileSuffix}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  // Download DOCX in Single Indonesian Format (Direct from Editor)
  const handleDownloadIndonesianDocx = () => {
    setIsDownloadingDocx(true);
    try {
      downloadWordDocument(stripFillableSlotsToPlainText(stripCommentAnchors(editor?.getHTML() || '')), 'ID');
      setExportMessage({
        type: 'success',
        text: t('contract_creator.msg.docx_downloaded', 'File dokumen Word (.doc) versi Bahasa Indonesia berhasil diunduh!'),
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setExportMessage({
        type: 'error',
        text: `${t('contract_creator.msg.docx_download_failed', 'Gagal mengunduh dokumen')}: ${err?.message || t('contract_creator.kesalahan_file', 'Kesalahan file')}`,
      });
    } finally {
      setIsDownloadingDocx(false);
    }
  };

  const handleExportRedline = (comments: DocumentComment[]) => {
    const html = renderRedlineHtml(editor?.getHTML() || '', comments, {
      heading: t('documents.redline.heading', 'Komentar & Usulan Perubahan'),
      suggestion: t('documents.comments.suggestion', 'Usulan'),
      comment: t('documents.comments.comment', 'Komentar'),
      deletion: t('documents.comments.deletion', '(hapus teks)'),
      formatDate: (iso) => formatDateTime(iso, language),
    });
    downloadWordDocument(stripFillableSlotsToPlainText(html), 'redline');
  };

  // Print Document (Save as PDF)
  const handlePrint = () => {
    window.print();
  };

  // Save to SILEGAL system repository
  const handleSaveToSystem = async () => {
    setIsSaving(true);
    setExportMessage(null);
    try {
      const pName = fieldValues.partnerName || 'Mitra Usaha';

      const p1Name = fieldValues.firstPartyName || tenantEntityName;
      const p1Pic = fieldValues.firstPartyPic || 'Achmad Indrawan';

      const newContractPayload: Partial<Contract> = {
        judul_kontrak: docTitle,
        nomor_kontrak: contractNumber,
        partner_id: selectedPartnerId || (partners[0] ? partners[0].partner_id : 'PTR-DEFAULT'),
        tanggal_mulai: '2026-09-19',
        tanggal_berakhir: '2027-09-18',
        status: 'Active',
        jenis_dokumen: 'Master Agreement',
        kategori_kerjasama: ['Perjanjian Kerjasama', 'General Cooperation'],
        nilai_kontrak: 100000000,
        auto_renewal: true,
        notice_period_hari: 30,
        notice_type_required: 'Both',
        pic_internal: p1Pic,
        internal_notes: `Cooperation agreement between ${p1Name} and ${pName}, generated from the built-in template (governing law: ${jurisdictionFromSettings(policy.settings).governingLaw.en}).`,
      };

      await onSaveToSystem(newContractPayload);

      setExportMessage({
        type: 'success',
        text: t('contract_creator.kontrak_berhasil_disimpan_ke_sistem_repositori', 'Kontrak "{docTitle}" berhasil disimpan ke sistem repositori SILEGAL!', { docTitle }),
      });
    } catch (err: any) {
      console.error('Save to system error:', err);
      setExportMessage({
        type: 'error',
        text: t('contract_creator.gagal_menyimpan_kontrak_ke_sistem', 'Gagal menyimpan kontrak ke sistem: {value}', { value: err?.message || 'Terjadi kesalahan internal' }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Count filled vs unfilled fields
  const filledCount = COOPERATION_AGREEMENT_FIELDS.filter(
    (f) => fieldValues[f.key] && fieldValues[f.key].trim() && !fieldValues[f.key].startsWith('[')
  ).length;
  const totalSlotsCount = COOPERATION_AGREEMENT_FIELDS.length;

  // Fields panel: only built-in/custom fields whose slot is actually in the document, ordered
  // the way they appear there (not the fixed definition order).
  const orderedBuiltInKeys = orderedSlotKeys.filter((key) => key === 'contractNo' || BUILT_IN_FIELD_KEYS.has(key));
  const orderedCustomFields = orderedSlotKeys
    .map((key) => customFields.find((f) => f.key === key))
    .filter((f): f is (typeof customFields)[number] => Boolean(f));

  const saveStatus =
    saveState.status === 'saving' ? (
      <>
        <RefreshCw className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-hidden />
        {t('common.saving', 'Menyimpan…')}
      </>
    ) : saveState.status === 'error' ? (
      <span className="text-rose-700 dark:text-rose-300 inline-flex items-center gap-1">
        <AlertCircle className="w-3 h-3" aria-hidden />
        {t('documents.save.failed', 'Gagal menyimpan')}: {saveState.message}
      </span>
    ) : hasUnsaved ? (
      <>
        <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden />
        {t('documents.save.unsaved', 'Perubahan belum disimpan')}
      </>
    ) : currentDoc ? (
      <>
        {t('documents.save.draft_version', 'Draf v{v}', { v: currentDoc.current_version })} ·{' '}
        {t('documents.save.last_saved', 'Terakhir disimpan')} <RelativeTime iso={currentDoc.modified_at} />{' '}
        {t('documents.info.by', 'oleh {name}', { name: currentDoc.modified_by_name || '—' })}
      </>
    ) : (
      t('documents.save.never', 'Belum disimpan')
    );

  const sidebarTabs = [
    { id: 'fields', label: t('contract_creator.tab.fields', 'Kolom Isian'), icon: ListChecks },
    { id: 'partners', label: t('contract_creator.tab.partners', 'Mitra'), icon: Building2 },
    { id: 'templates', label: t('contract_creator.tab.templates', 'Template'), icon: FolderOpen },
    { id: 'contents', label: t('contract_creator.tab.contents', 'Konten'), icon: Variable },
    { id: 'history', label: t('documents.tab.history', 'Riwayat'), icon: History },
    { id: 'info', label: t('documents.tab.info', 'Info'), icon: Info },
    { id: 'comments', label: t('documents.tab.comments', 'Komentar'), icon: MessageSquare },
  ] as const;
  const activeSidebarTab = sidebarTabs.find((tab) => tab.id === sidebarTab) ?? sidebarTabs[0];

  // Vertical tabs per the WAI-ARIA tabs pattern: arrows/Home/End move and activate, one tab stop.
  const handleSidebarTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = sidebarTabs.length - 1;
    const keyTargets: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = keyTargets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setSidebarTab(sidebarTabs[next].id);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-text overflow-hidden font-sans">
      {screen === 'explorer' && (
        <DocumentExplorer canEdit={canEdit} canDelete={canEdit} onOpen={openDocument} onCreate={startNewDocument} />
      )}

      {/* The editor stays mounted (hidden) while the explorer is shown so TipTap keeps its state. */}
      <div className={screen === 'explorer' ? 'hidden' : 'contents'}>
      {/* 1. TOP NAVBAR / HEADER */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0 max-w-full">
          <button
            type="button"
            onClick={backToExplorer}
            className="inline-flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            aria-label={t('documents.action.back', 'Kembali ke daftar dokumen')}
            title={t('documents.action.back', 'Kembali ke daftar dokumen')}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
          </button>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-[#06C755] flex items-center justify-center shrink-0 border border-emerald-500/20">
            <FileSignature className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1 flex flex-col">
            <input
              ref={titleInputRef}
              aria-label={t('contract_creator.title_input_placeholder', 'Judul Dokumen Perjanjian')}
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="borderless-title text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 bg-transparent dark:bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none p-1 rounded-none transition-colors w-full sm:w-96 md:w-[460px] lg:w-[540px] truncate cursor-text leading-normal placeholder:text-slate-400 dark:placeholder:text-slate-500"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
              }}
              title={t('contract_creator.title_input_title', 'Klik untuk mengubah judul dokumen')}
              placeholder={t('contract_creator.title_input_placeholder', 'Judul Dokumen Perjanjian')}
            />
            <p className="px-1 text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 flex-wrap" aria-live="polite">
              {saveStatus}
            </p>
          </div>
        </div>

        {/* Action Controls & Mode Switcher */}
        <div className="flex items-center gap-2 flex-wrap">

          {canEdit && (
            <button
              type="button"
              onClick={() => void saveNow('manual')}
              disabled={saveState.status === 'saving'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              title={t('documents.save.manual_title', 'Simpan sebagai versi baru (Ctrl+S)')}
            >
              <Save className="w-3.5 h-3.5" aria-hidden />
              <span>{t('common.save', 'Simpan')}</span>
            </button>
          )}

          {/* View Mode Toggle: Edit vs Pratinjau */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 mr-1">
            <button
              type="button"
              onClick={() => switchViewMode('editor')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'editor'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={t('contract_creator.mode_edit_title', 'Sunting langsung teks kontrak dalam Bahasa Indonesia')}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t('contract_creator.mode_edit_label', 'Edit')}</span>
            </button>
            <button
              type="button"
              onClick={() => switchViewMode('preview')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={t('contract_creator.mode_preview_title', 'Pratinjau tampilan dokumen final')}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t('contract_creator.mode_preview_label', 'Pratinjau')}</span>
            </button>
          </div>

          {/* Primary Export: Download DOCX */}
          <button
            type="button"
            onClick={handleDownloadIndonesianDocx}
            disabled={isDownloadingDocx}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#06C755] hover:bg-[#05a847] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title={t('contract_creator.download_title', 'Download file Word (.doc)')}
          >
            {isDownloadingDocx ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            <span>{t('contract_creator.download_label', 'Download')}</span>
          </button>

          {/* Sidebar Toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ml-1 ${
              sidebarOpen
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#06C755] border-emerald-300 dark:border-emerald-800'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title={t('contract_creator.sidebar_toggle_title', 'Buka / Tutup Panel Pintasan Form & Klausul')}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Alert Notification Bar */}
      {exportMessage && (
        <div
          className={`px-4 py-2 border-b flex items-center justify-between text-xs font-medium transition-all ${
            exportMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : exportMessage.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
              : 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {exportMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : exportMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            )}
            <span>{exportMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1 cursor-pointer"
          >
            {t('contract_creator.text', '×')}
          </button>
        </div>
      )}

      {/* 2. WYSIWYG FORMATTING TOOLBAR (Only shown in Editor Mode) */}
      {viewMode === 'editor' && (
        <div className="flex items-stretch">
          <div className="flex-1 min-w-0">
            <ContractEditorToolbar editor={editor} />
          </div>
          <div className="flex items-center bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pr-3 pl-1 shrink-0">
            <button
              type="button"
              onClick={handleResetDocument}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={t('contract_creator.reset_template_title', 'Kembalikan isi ke template awal 15 pasal Perjanjian Kerjasama')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('contract_creator.reset_template_label', 'Reset Template')}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. MAIN WORKSPACE CONTAINER */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* VIEW MODE A: WYSIWYG CANVAS WORKSPACE (Versi Bahasa Indonesia) */}
        <div
          className={`flex-1 overflow-y-auto p-4 sm:p-8 md:p-12 justify-center items-start bg-slate-200/70 dark:bg-slate-950/80 ${
            viewMode === 'editor' ? 'flex' : 'hidden'
          }`}
        >
          <div
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
            className="transition-transform duration-150 w-full max-w-[850px] h-fit mb-16"
          >
            {/* White Paper Sheet */}
            <div
              ref={paperSheetRef}
              className={`bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl rounded-sm border border-slate-300/80 dark:border-slate-800 min-h-[1150px] p-10 sm:p-16 md:p-20 relative ${
                highlightFillable ? 'highlight-fillable-mode' : ''
              }`}
            >

              {/* Editable WYSIWYG Content Canvas */}
              <EditorContent
                editor={editor}
                className="outline-none min-h-[900px] font-sans leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[900px] selection:bg-emerald-200 dark:selection:bg-emerald-950"
              />
              <TableSelectionOverlay editor={editor} containerRef={paperSheetRef} />
            </div>
          </div>
        </div>

        {/* VIEW MODE B: READ-ONLY DOCUMENT PREVIEW (mirrors the editor paper, slots as plain text) */}
        <div
          className={`flex-1 overflow-y-auto p-4 sm:p-8 md:p-12 justify-center items-start bg-slate-200/70 dark:bg-slate-950/80 ${
            viewMode === 'preview' ? 'flex' : 'hidden'
          }`}
        >
          <div className="w-full max-w-[850px] h-fit mb-16">
            {previewOverride && (
              <div
                role="status"
                className="mb-3 p-3 rounded-lg border border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-100 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <span className="font-semibold">
                  {previewOverride.kind === 'version'
                    ? t('documents.preview.viewing', 'Melihat versi {v} (hanya baca). Dokumen yang sedang diedit tidak berubah.', { v: previewOverride.version })
                    : t('documents.preview.comparing', 'Perbandingan versi {v} dengan dokumen saat ini: + ditambahkan, − dihapus.', { v: previewOverride.version })}
                </span>
                <span className="flex gap-1.5">
                  {canEdit && previewOverride.version !== currentDoc?.current_version && (
                    <button
                      type="button"
                      onClick={() => restoreVersion(previewOverride.version)}
                      className="px-3 min-h-11 sm:min-h-8 rounded-lg bg-blue-700 text-white font-bold hover:bg-blue-800 cursor-pointer"
                    >
                      {t('documents.preview.restore', 'Pulihkan versi ini')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => switchViewMode('editor')}
                    className="px-3 min-h-11 sm:min-h-8 rounded-lg border border-blue-400 font-bold hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
                  >
                    {t('documents.preview.close', 'Tutup pratinjau')}
                  </button>
                </span>
              </div>
            )}
            {/* White Paper Sheet */}
            <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl rounded-sm border border-slate-300/80 dark:border-slate-800 min-h-[1150px] p-10 sm:p-16 md:p-20 relative">
              <div className="min-h-[900px] font-sans leading-relaxed text-slate-900 dark:text-slate-100">
                {/* "ProseMirror" class reused so this read-only preview picks up the exact
                    same heading/paragraph/table typography rules as the live editor content. */}
                {previewOverride?.kind === 'diff' ? (
                  <div className="ProseMirror">
                    {previewOverride.parts.every((part) => part.kind === 'same') && (
                      <p className="font-semibold text-slate-500">{t('documents.preview.no_diff', 'Tidak ada perbedaan teks.')}</p>
                    )}
                    {previewOverride.parts.map((part, i) =>
                      part.kind === 'same' ? (
                        <p key={i}>{part.text}</p>
                      ) : part.kind === 'added' ? (
                        <p key={i}>
                          <ins className="diff-added">+ {part.text}</ins>
                        </p>
                      ) : (
                        <p key={i}>
                          <del className="diff-removed">− {part.text}</del>
                        </p>
                      ),
                    )}
                  </div>
                ) : (
                  <div
                    className="ProseMirror"
                    dangerouslySetInnerHTML={{
                      __html: stripFillableSlotsToPlainText(
                        stripCommentAnchors(previewOverride?.kind === 'version' ? previewOverride.html : editor?.getHTML() || ''),
                      ),
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4. RIGHT SIDEBAR: QUICK FILL FORM & CLAUSE INSERTER */}
        {sidebarOpen && (
          <aside className="w-80 sm:w-[23rem] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex shrink-0 z-10 shadow-sm overflow-hidden">
            <div
              role="tablist"
              aria-orientation="vertical"
              aria-label={t('contract_creator.panel_title', 'Panel Asisten Kontrak')}
              className="w-14 sm:w-12 shrink-0 flex flex-col items-center gap-1.5 py-3 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              {sidebarTabs.map((tab, index) => {
                const Icon = tab.icon;
                const isActive = sidebarTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`${panelIdPrefix}-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`${panelIdPrefix}-panel`}
                    aria-label={tab.label}
                    title={tab.label}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setSidebarTab(tab.id)}
                    onKeyDown={(e) => handleSidebarTabKeyDown(e, index)}
                    className={`inline-flex items-center justify-center h-11 w-11 sm:h-9 sm:w-9 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755]/60 ${
                      isActive
                        ? 'bg-emerald-50 text-[#06C755] dark:bg-emerald-950/50 dark:text-emerald-400'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-[18px] h-[18px]" aria-hidden />
                  </button>
                );
              })}
            </div>

            <div className="flex-1 min-w-0 flex flex-col">
            <div className="h-12 shrink-0 px-4 flex items-center border-b border-slate-200 dark:border-slate-800">
              <h2 id={`${panelIdPrefix}-title`} className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeSidebarTab.label}
              </h2>
            </div>

            <div
              id={`${panelIdPrefix}-panel`}
              role="tabpanel"
              aria-labelledby={`${panelIdPrefix}-tab-${activeSidebarTab.id}`}
              tabIndex={0}
              className="flex-1 overflow-y-auto p-3 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#06C755]/40"
            >

              {sidebarTab === 'history' && (
                <DraftHistoryPanel
                  documentId={currentDoc?.id ?? null}
                  currentVersion={currentDoc?.current_version ?? null}
                  refreshKey={historyRefreshKey}
                  canEdit={canEdit}
                  viewingVersion={previewOverride?.version ?? null}
                  onView={(version) => showVersion(version, 'version')}
                  onCompare={(version) => showVersion(version, 'diff')}
                  onRestore={restoreVersion}
                />
              )}

              {sidebarTab === 'info' && (
                <DocumentInfoPanel
                  document={currentDoc}
                  organizationName={activeTenant?.name ?? '—'}
                  canEdit={canEdit}
                  canManageFields={canManageFields}
                  onUpdate={updateDocumentInfo}
                />
              )}

              {sidebarTab === 'comments' && (
                <CommentsPanel
                  editor={editor}
                  documentId={currentDoc?.id ?? null}
                  canEdit={canEdit}
                  ensureSaved={() => saveNow('manual')}
                  onContentChanged={(kind) => void saveNow(kind)}
                  onExportRedline={handleExportRedline}
                />
              )}

              {/* TAB 1: QUICK FILL FORM (Baris yang harus diisi) */}
              {sidebarTab === 'fields' && (
                <div className="space-y-2.5">
                  {/* Contract Number Field — only shown while its slot is actually in the document */}
                  {orderedBuiltInKeys.includes('contractNo') && (
                    <div
                      className="space-y-1 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800 hover:border-blue-400/60 dark:hover:border-blue-500/60 transition-colors bg-white dark:bg-slate-900"
                      title={t('contract_creator.field.contract_no.title', 'Nomor referensi atau nomor surat resmi perjanjian kerjasama')}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {t('contract_creator.field.contract_no.label', 'Nomor Perjanjian Kerjasama')}
                        </label>
                        <div className="flex items-center gap-1">
                          {contractNumber && contractNumber.trim() && !contractNumber.startsWith('[') && (
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> {t('contract_creator.filled_badge', 'Terisi')}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleFocusSlot('contractNo')}
                            className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                            aria-label={t('contract_creator.jump_to_slot', 'Lompat ke posisi isian di dokumen')}
                            title={t('contract_creator.jump_to_slot', 'Lompat ke posisi isian di dokumen')}
                          >
                            <Target className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={contractNumber}
                        onChange={(e) => {
                          const val = e.target.value;
                          setContractNumber(val);
                          setFillableSlotValue(editor, 'contractNo', val);
                        }}
                        className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder={defaultContractNo}
                      />
                    </div>
                  )}

                  {orderedBuiltInKeys.length === 0 && orderedCustomFields.length === 0 && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-4">
                      {t('contract_creator.fields_empty', 'Belum ada kolom isian yang dimasukkan ke dokumen ini.')}
                    </p>
                  )}

                  {/* Fillable slots present in the document, in document order */}
                  {orderedBuiltInKeys
                    .filter((key) => key !== 'contractNo')
                    .map((key) => {
                    const field = COOPERATION_AGREEMENT_FIELDS.find((f) => f.key === key);
                    if (!field) return null;
                    const currentVal = fieldValues[field.key] || '';
                    const isFilled = currentVal && currentVal.trim() && !currentVal.startsWith('[');
                    const fieldLabel = t(`contract_creator.field.${field.key}.label`, field.label);
                    const fieldPlaceholder = t(`contract_creator.field.${field.key}.placeholder`, field.placeholder);
                    const fieldDescription = t(`contract_creator.field.${field.key}.description`, field.description);

                    return (
                      <div
                        key={field.key}
                        className="space-y-1 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800 hover:border-blue-400/60 dark:hover:border-blue-500/60 transition-colors bg-white dark:bg-slate-900"
                        title={fieldDescription}
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            {fieldLabel}
                          </label>
                          <div className="flex items-center gap-1">
                            {isFilled && (
                              <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> {t('contract_creator.filled_badge', 'Terisi')}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleFocusSlot(field.key)}
                              className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                              aria-label={t('contract_creator.jump_to_slot', 'Lompat ke posisi isian di dokumen')}
                              title={t('contract_creator.jump_to_slot', 'Lompat ke posisi isian di dokumen')}
                            >
                              <Target className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {field.type === 'textarea' ? (
                          <textarea
                            rows={2}
                            value={currentVal}
                            onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                            placeholder={fieldPlaceholder}
                            className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        ) : (
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                            placeholder={fieldPlaceholder}
                            className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Render Custom Fields in Fields tab — only ones actually present in the document, in document order */}
                  {orderedCustomFields.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t('contract_creator.custom_fields_section_title', 'Kolom Isian Kustom Anda')}</span>
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded uppercase">
                          {t('contract_creator.custom_badge', 'Kustom')} ({orderedCustomFields.length})
                        </span>
                      </div>

                      {orderedCustomFields.map((field) => {
                        const currentVal = fieldValues[field.key] || '';
                        const isFilled = currentVal && currentVal.trim() && !currentVal.startsWith('[');

                        return (
                          <div
                            key={field.key}
                            className="space-y-1 p-2 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 transition-colors bg-emerald-50/5 dark:bg-emerald-950/5"
                            title={field.description}
                          >
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                                {field.label}
                              </label>
                              <div className="flex items-center gap-1">
                                {isFilled ? (
                                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                    <Check className="w-3 h-3" /> {t('contract_creator.filled_badge', 'Terisi')}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                                    {t('contract_creator.optional_badge', 'Opsional')}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleFocusSlot(field.key)}
                                  className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                                  aria-label={t('contract_creator.jump_to_slot', 'Lompat ke posisi isian di dokumen')}
                                  title={t('contract_creator.jump_to_slot', 'Lompat ke posisi isian di dokumen')}
                                >
                                  <Target className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ok = await confirmDialog({
                                      description: `${t('contract_creator.delete_custom_field_title', 'Hapus kolom isian kustom')} "${field.label}"?`,
                                      tone: 'danger',
                                      confirmLabel: t('contract_creator.confirm.delete_label', 'Hapus'),
                                    });
                                    if (ok) {
                                      setCustomFields((prev) => prev.filter((f) => f.key !== field.key));
                                      setFieldValues((prev) => {
                                        const next = { ...prev };
                                        delete next[field.key];
                                        return next;
                                      });
                                    }
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                                  aria-label={t('contract_creator.delete_custom_field_title', 'Hapus kolom isian kustom')}
                                  title={t('contract_creator.delete_custom_field_title', 'Hapus kolom isian kustom')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {field.type === 'textarea' ? (
                              <textarea
                                rows={2}
                                value={currentVal}
                                onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            ) : field.type === 'select' ? (
                              <select
                                value={currentVal}
                                onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              >
                                <option value="">{t('contract_creator.field.select_placeholder', '-- Pilih --')}</option>
                                {(field.options || []).map((opt: string) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : field.type === 'boolean' ? (
                              <div className="flex gap-1.5">
                                {[t('contract_creator.field.boolean_yes', 'Yes'), t('contract_creator.field.boolean_no', 'No')].map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleFieldValueChange(field.key, opt)}
                                    className={`flex-1 text-xs font-semibold rounded-lg py-1.5 transition-colors cursor-pointer ${
                                      currentVal === opt
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <input
                                type={field.type === 'email' ? 'email' : 'text'}
                                value={currentVal}
                                onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PARTNERS AUTO-FILL */}
              {sidebarTab === 'partners' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label
                      className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                      title={t('contract_creator.partners.select_label_title', 'Mengisi otomatis nama badan hukum, domisili kantor, direktur penandatangan, dan email resmi ke seluruh pasal perjanjian')}
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#06C755]" />
                      {t('contract_creator.partners.select_label', 'Pilih Mitra Terdaftar (Auto-Fill)')}
                    </label>

                    <select
                      value={selectedPartnerId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedPartnerId(id);
                        const p = partners.find((item) => item.partner_id === id);
                        if (p) handleApplyPartner(p);
                      }}
                      className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">{t('contract_creator.partners.select_placeholder', '-- Pilih dari Mitra Terdaftar --')}</option>
                      {partners.map((p) => (
                        <option key={p.partner_id} value={p.partner_id}>
                          {p.nama_partner} ({p.partner_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPartner && (
                    <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 space-y-1.5">
                      <div className="font-bold text-sm">{selectedPartner.nama_partner}</div>
                      <div className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                        <span>{selectedPartner.alamat_pic || (selectedPartner as any).alamat || t('contract_creator.partners.default_address', 'Alamat Terdaftar')}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <User className="w-3 h-3 shrink-0 text-slate-400" />
                        <span><strong>{selectedPartner.nama_pic || selectedPartner.pic_partner}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <Briefcase className="w-3 h-3 shrink-0 text-slate-400" />
                        <span><strong>{(selectedPartner as any).pic_position || t('contract_creator.partners.default_position', 'Direktur')}</strong></span>
                      </div>
                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={() => handleApplyPartner(selectedPartner)}
                          className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          {t('contract_creator.partners.resync_button', 'Sinkronkan Ulang ke Dokumen')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CUSTOM TEMPLATE LIBRARY & DRAG-AND-DROP BUILDER */}
              {sidebarTab === 'contents' && (
                <div className="space-y-4">
                  {/* Custom field builder */}
                  <div className="space-y-2 p-3 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/10 dark:bg-emerald-950/5">
                    <button
                      type="button"
                      onClick={() => setShowAddCustomField(!showAddCustomField)}
                      className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-800 dark:text-emerald-400 focus:outline-none cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <PlusCircle className="w-4 h-4 text-[#06C755]" />
                        <span>{t('contract_creator.custom_field_builder.create_button', 'Buat Kolom Isian Kustom Baru')}</span>
                      </span>
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-lg">
                        {showAddCustomField ? t('contract_creator.custom_field_builder.close', 'Tutup') : t('contract_creator.custom_field_builder.add', 'Tambah')}
                      </span>
                    </button>

                    {showAddCustomField && (
                      <div className="space-y-3 pt-2 border-t border-emerald-100 dark:border-emerald-900/60 transition-all">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t('contract_creator.custom_field_builder.name_label', 'Nama Kolom Isian')}</label>
                          <input
                            type="text"
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                            placeholder={t('contract_creator.custom_field_builder.name_placeholder', 'Contoh: Kompensasi Tambahan')}
                            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t('contract_creator.custom_field_builder.type_label', 'Tipe Isian')}</label>
                          <select
                            value={newFieldType}
                            onChange={(e: any) => setNewFieldType(e.target.value)}
                            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="text">{t('contract_creator.custom_field_builder.type_text', 'Teks biasa')}</option>
                            <option value="date">{t('contract_creator.custom_field_builder.type_date', 'Tanggal')}</option>
                            <option value="currency">{t('contract_creator.custom_field_builder.type_currency', 'Mata Uang')}</option>
                            <option value="textarea">{t('contract_creator.custom_field_builder.type_textarea', 'Paragraf / Textarea')}</option>
                            <option value="email">{t('contract_creator.custom_field_builder.type_email', 'Email')}</option>
                            <option value="boolean">{t('contract_creator.custom_field_builder.type_boolean', 'Ya / Tidak')}</option>
                            <option value="select">{t('contract_creator.custom_field_builder.type_select', 'Pilihan (Dropdown)')}</option>
                          </select>
                        </div>

                        {newFieldType === 'select' && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t('contract_creator.custom_field_builder.options_label', 'Daftar Opsi (pisahkan dengan koma)')}</label>
                            <input
                              type="text"
                              value={newFieldOptions}
                              onChange={(e) => setNewFieldOptions(e.target.value)}
                              placeholder={t('contract_creator.custom_field_builder.options_placeholder', 'Contoh: LLC, PT, CV')}
                              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t('contract_creator.custom_field_builder.placeholder_label', 'Placeholder Default')}</label>
                          <input
                            type="text"
                            value={newFieldPlaceholder}
                            onChange={(e) => setNewFieldPlaceholder(e.target.value)}
                            placeholder={t('contract_creator.custom_field_builder.placeholder_placeholder', 'Contoh: Rp 50.000.000 (Lima Puluh Juta)')}
                            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t('contract_creator.custom_field_builder.description_label', 'Keterangan / Deskripsi')}</label>
                          <input
                            type="text"
                            value={newFieldDescription}
                            onChange={(e) => setNewFieldDescription(e.target.value)}
                            placeholder={t('contract_creator.custom_field_builder.description_placeholder', 'Deskripsi singkat fungsi kolom isian ini')}
                            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleCreateCustomField}
                          className="w-full py-2 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>{t('contract_creator.custom_field_builder.submit_button', 'Buat Kolom Isian Baru')}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Drag & drop field palette */}
                  <div className="space-y-2.5">
                    <h3
                      className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                      title={t('contract_creator.dragdrop.section_title_attr', 'Seret elemen ke posisi kursor di dokumen untuk menempatkan kolom isian dinamis')}
                    >
                      <Target className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('contract_creator.dragdrop.section_title', 'Kolom Isian Drag & Drop')}</span>
                    </h3>

                    {/* Category Switcher Tabs */}
                    <div className="flex flex-wrap gap-1 pb-1">
                      {[
                        { id: 'all', label: t('contract_creator.dragdrop.cat_all', 'Semua') },
                        { id: 'firstParty', label: t('contract_creator.dragdrop.cat_first_party', 'Pihak I') },
                        { id: 'partner', label: t('contract_creator.dragdrop.cat_partner', 'Pihak II') },
                        { id: 'operational', label: t('contract_creator.dragdrop.cat_operational', 'Ketentuan') },
                        { id: 'custom', label: t('contract_creator.custom_badge', 'Kustom') },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveDragCategory(tab.id as any)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all cursor-pointer ${
                            activeDragCategory === tab.id
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                              : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {(() => {
                        const filteredDragFields = [
                          ...COOPERATION_AGREEMENT_FIELDS.map(f => ({ ...f, isCustom: false })),
                          ...customFields.map(f => ({ ...f, isCustom: true }))
                        ].filter(field => {
                          if (activeDragCategory === 'all') return true;
                          if (activeDragCategory === 'custom') return field.isCustom;
                          if (activeDragCategory === 'firstParty') return !field.isCustom && field.key.startsWith('firstParty');
                          if (activeDragCategory === 'partner') return !field.isCustom && field.key.startsWith('partner');
                          if (activeDragCategory === 'operational') return !field.isCustom && !field.key.startsWith('firstParty') && !field.key.startsWith('partner');
                          return true;
                        });

                        if (filteredDragFields.length === 0) {
                          return (
                            <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-[10px] text-slate-400">
                              {t('contract_creator.dragdrop.empty_category', 'Tidak ada kolom isian di kategori ini.')}
                            </div>
                          );
                        }

                        return filteredDragFields.map((item) => {
                          const itemLabel = item.isCustom ? item.label : t(`contract_creator.field.${item.key}.label`, item.label);
                          return (
                          <div
                            key={item.key}
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                'text/plain',
                                JSON.stringify({
                                  type: item.type,
                                  key: item.key,
                                  label: itemLabel,
                                  placeholder: item.placeholder,
                                })
                              );
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            className={`flex items-center justify-between p-2 bg-white dark:bg-slate-900 border rounded-lg cursor-grab active:cursor-grabbing transition-all shadow-2xs group ${
                              item.isCustom
                                ? 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10'
                                : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10'
                            }`}
                            title={t('contract_creator.dragdrop.item_title_attr', 'Seret elemen ini ke editor')}
                          >
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 truncate max-w-[200px]">
                              <span className="truncate">{itemLabel}</span>
                              {item.isCustom && (
                                <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1 py-0.2 rounded uppercase">
                                  {t('contract_creator.custom_badge', 'Kustom')}
                                </span>
                              )}
                            </span>
                            <span className="text-[9px] text-slate-400 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700 font-mono group-hover:text-emerald-600 group-hover:border-emerald-200 dark:group-hover:text-emerald-400">
                              {t('contract_creator.drag', 'DRAG')}
                            </span>
                          </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {sidebarTab === 'templates' && (
                <div className="space-y-4">

                  {/* 1. SAVE DRAFT AS TEMPLATE */}
                  <div
                    className="space-y-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20"
                    title={t('contract_creator.templates.save_section_title_attr', 'Simpan seluruh teks kontrak kustom saat ini sebagai master template yang siap dipakai ulang')}
                  >
                    <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('contract_creator.templates.save_section_title', 'Simpan Draf Sebagai Template')}</span>
                    </h3>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder={t('contract_creator.templates.name_placeholder', 'Nama template (misal: Template Sewa Server)')}
                        className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveTemplate}
                        disabled={isSavingTemplate}
                        className="w-full py-2 px-3 text-xs font-bold text-white bg-[#06C755] hover:bg-[#05b54c] rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {isSavingTemplate ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>{t('contract_creator.templates.saving', 'Menyimpan...')}</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>{t('contract_creator.templates.save_button', 'Simpan Template')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Saved templates library */}
                  <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('contract_creator.templates.library_title', 'Pustaka Template Terdaftar')}</span>
                    </h3>

                    {isLoadingTemplates ? (
                      <div className="text-center py-4 text-xs text-slate-400 flex items-center justify-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#06C755]" />
                        <span>{t('contract_creator.templates.loading', 'Memuat pustaka...')}</span>
                      </div>
                    ) : savedTemplates.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
                        {t('contract_creator.templates.empty', 'Belum ada template yang disimpan.')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {savedTemplates.map((tpl) => (
                          <div
                            key={tpl.id}
                            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-2 shadow-2xs hover:border-slate-300 transition-all"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {tpl.name}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                {t('contract_creator.id', 'ID: {value}', { value: tpl.id.substring(0, 8) })}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleLoadTemplate(tpl)}
                                className="px-2.5 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-lg transition-colors cursor-pointer"
                              >
                                {t('contract_creator.templates.use_button', 'Gunakan')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTemplate(tpl.id)}
                                className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                                title={t('contract_creator.templates.delete_title', 'Hapus Template')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
            </div>
          </aside>
        )}
      </div>

      {/* 5. BOTTOM STATUS BAR */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-500 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <span>{wordCount} {t('contract_creator.footer.words', 'kata')}</span>
          <span className="hidden sm:inline">{t('contract_creator.text_2', '•')}</span>
          <span className="hidden sm:inline">{charCount} {t('contract_creator.footer.chars', 'karakter')}</span>
          <span className="hidden md:inline">{t('contract_creator.text_2', '•')}</span>
          <span className="hidden md:inline">{t('contract_creator.footer.read_estimate', 'Estimasi baca')} ~{Math.max(1, Math.round(wordCount / 200))} {t('contract_creator.footer.minutes', 'menit')}</span>
          <span className="hidden lg:inline">{t('contract_creator.text_2', '•')}</span>
          <span className="hidden lg:inline text-emerald-600 dark:text-emerald-400 font-medium">
            {isCustomTemplateActive ? t('contract_creator.footer.custom_template_active', 'Template Kerjasama Kustom Aktif') : t('contract_creator.footer.default_template_active', '15 Pasal Perjanjian Kerjasama')}
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomLevel(Math.max(70, zoomLevel - 10))}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer"
            title={t('contract_creator.footer.zoom_out', 'Zoom Out')}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono w-10 text-center">{zoomLevel}%</span>
          <button
            type="button"
            onClick={() => setZoomLevel(Math.min(150, zoomLevel + 10))}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer"
            title={t('contract_creator.footer.zoom_in', 'Zoom In')}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel(100)}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 ml-1 cursor-pointer"
            title={t('contract_creator.footer.zoom_reset', 'Reset Zoom 100%')}
          >
            100%
          </button>
        </div>
      </footer>
      </div>
    </div>
  );
};
