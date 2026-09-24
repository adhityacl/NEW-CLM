import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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
} from 'lucide-react';
import { Partner, Contract } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { useAlertToast } from '../context/AlertToastContext';
import { useTenant } from '../context/TenantContext';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { getAuthHeaders } from '../App';
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

export const ContractCreatorView: React.FC<ContractCreatorViewProps> = ({
  partners,
  contracts,
  onSaveToSystem,
  onNavigateToContracts,
}) => {
  const { t } = useLanguage();
  const confirmDialog = useConfirm();
  const showAlert = useAlertToast();
  const { activeTenant } = useTenant();
  const { policy } = useTenantSettings();
  // Document language and jurisdiction wording follow the organization settings.
  const docLanguage = policy.settings.language;
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

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'fields' | 'partners' | 'templates'>('fields');
  const [highlightFillable, setHighlightFillable] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Fillable slot field values state - dynamically initialized with activeTenant
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({
    firstPartyName: '',
    firstPartyAlias: '',
    firstPartyAddress: '',
    firstPartyPic: '',
    firstPartyPosition: '',
    firstPartyEmail: '',
    firstPartyBusinessDesc: '',
    partnerName: '',
    partnerAddress: '',
    partnerPic: '',
    partnerPosition: '',
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
  });

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
  const [newFieldType, setNewFieldType] = useState<'text' | 'date' | 'currency' | 'textarea'>('text');
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldDescription, setNewFieldDescription] = useState('');
  const [newFieldIcon, setNewFieldIcon] = useState('⭐');
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
      else finalIcon = '🏷️';
    }

    const newField = {
      key: safeKey,
      label: newFieldLabel.trim(),
      type: newFieldType,
      icon: finalIcon,
      placeholder: newFieldPlaceholder.trim() || `Masukkan ${newFieldLabel.trim()}...`,
      description: newFieldDescription.trim() || `Kolom kustom untuk ${newFieldLabel.trim()}`,
      isCustom: true
    };

    setCustomFields((prev) => [...prev, newField]);
    
    // Initialize its value in fieldValues
    setFieldValues((prev) => ({
      ...prev,
      [safeKey]: ''
    }));

    // Reset form
    setNewFieldLabel('');
    setNewFieldPlaceholder('');
    setNewFieldDescription('');
    setNewFieldIcon('⭐');
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
        throw new Error(`HTTP error ${res.status}`);
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
    const content = editor?.getHTML() || '';
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
        data = text && !text.trim().startsWith('<') ? JSON.parse(text) : { error: `Server error (Status ${res.status})` };
      } catch {
        data = { error: 'Gagal memproses respon server.' };
      }

      if (res.ok && data.success) {
        setNewTemplateName('');
        showAlert({ title: t('contract_creator.msg.template_saved', 'Template kerjasama berhasil disimpan'), variant: 'success' });
        fetchTemplates();
      } else {
        showAlert({
          title: t('contract_creator.msg.template_save_failed', 'Gagal menyimpan template'),
          description: data.error || data.message || `Status ${res.status}.`,
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
        data = text && !text.trim().startsWith('<') ? JSON.parse(text) : { error: `Server error (Status ${res.status})` };
      } catch {
        data = { error: 'Gagal memproses respon server.' };
      }

      if (res.ok && data.success) {
        showAlert({ title: t('contract_creator.msg.template_deleted', 'Template kerjasama berhasil dihapus'), variant: 'success' });
        fetchTemplates();
      } else {
        showAlert({
          title: t('contract_creator.msg.template_delete_failed', 'Gagal menghapus template'),
          description: data.error || data.message || `Status ${res.status}.`,
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
    ],
    content: '',
    onUpdate: ({ editor: instance }) => {
      if (statsDebounceRef.current) clearTimeout(statsDebounceRef.current);
      statsDebounceRef.current = setTimeout(() => {
        const text = instance.getText() || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        setWordCount(words);
        setCharCount(text.length);
      }, 300);
    },
    editorProps: {
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
      partnerAddress: vals.partnerAddress,
      partnerPic: vals.partnerPic,
      partnerPosition: vals.partnerPosition,
      dateStr: vals.dateStr,
      startDate: vals.startDate,
      endDate: vals.endDate,
      scopeDescId: vals.scopeDescId,
      feeAmountId: vals.feeAmountId,
      bankName: vals.bankName,
      bankAccount: vals.bankAccount,
      bankHolder: vals.bankHolder,
      partnerEmail: vals.partnerEmail,
    }, docLanguage);
    editor.commands.setContent(initialHtml);
    updateStats();
  };

  // Default template on first load: the first entry in the saved Template
  // Library (Pustaka Template Terdaftar), not the built-in 15-article
  // agreement — that template is now only reached via the explicit "Reset
  // Template" button. Waits for the library fetch to settle (templatesReady)
  // so it doesn't race the empty `savedTemplates` state that exists before
  // the request resolves; if the library genuinely has no templates yet,
  // the editor is left blank rather than falling back to the 15-article one.
  useEffect(() => {
    if (!editor || !editor.isEmpty || !templatesReady) return;
    const defaultTemplate = savedTemplates[0];
    if (defaultTemplate) {
      editor.commands.setContent(defaultTemplate.contentId);
      setIsCustomTemplateActive(true);
      // Same recovery as handleLoadTemplate — this auto-load path hits the
      // exact same "custom fields lost on fresh login" bug otherwise.
      const builtInKeys = new Set(COOPERATION_AGREEMENT_FIELDS.map((f) => f.key));
      setCustomFields((prev) =>
        mergeTemplateCustomFields(
          prev,
          defaultTemplate.customFields,
          defaultTemplate.contentId,
          builtInKeys,
          t('contract_creator.custom_field_recovered_desc', 'Kolom kustom dipulihkan otomatis dari dokumen (label asli tidak tersimpan).'),
        ),
      );
      updateStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, viewMode, templatesReady, savedTemplates]);

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
        const builtInKeys = new Set(COOPERATION_AGREEMENT_FIELDS.map((f) => f.key));
        setCustomFields((prev) =>
          mergeTemplateCustomFields(
            prev,
            tpl.customFields,
            tpl.contentId,
            builtInKeys,
            t('contract_creator.custom_field_recovered_desc', 'Kolom kustom dipulihkan otomatis dari dokumen (label asli tidak tersimpan).'),
          ),
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

  // Download DOCX in Single Indonesian Format (Direct from Editor)
  const handleDownloadIndonesianDocx = () => {
    setIsDownloadingDocx(true);
    try {
      const rawHtml = editor?.getHTML() || '';
      const contentHtml = stripFillableSlotsToPlainText(rawHtml);
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
      link.download = `${docTitle.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_')}_ID.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportMessage({
        type: 'success',
        text: t('contract_creator.msg.docx_downloaded', 'File dokumen Word (.doc) versi Bahasa Indonesia berhasil diunduh!'),
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setExportMessage({
        type: 'error',
        text: `${t('contract_creator.msg.docx_download_failed', 'Gagal mengunduh dokumen')}: ${err?.message || 'Kesalahan file'}`,
      });
    } finally {
      setIsDownloadingDocx(false);
    }
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
        text: `Kontrak "${docTitle}" berhasil disimpan ke sistem repositori SILEGAL!`,
      });
    } catch (err: any) {
      console.error('Save to system error:', err);
      setExportMessage({
        type: 'error',
        text: `Gagal menyimpan kontrak ke sistem: ${err?.message || 'Terjadi kesalahan internal'}`,
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

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-text overflow-hidden font-sans">
      
      {/* 1. TOP NAVBAR / HEADER */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-[#06C755] flex items-center justify-center shrink-0 border border-emerald-500/20">
            <FileSignature className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex items-center">
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="borderless-title text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 bg-transparent dark:bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none p-1 rounded-none transition-colors w-72 sm:w-96 md:w-[460px] lg:w-[540px] truncate cursor-text leading-normal placeholder:text-slate-400 dark:placeholder:text-slate-500"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
              }}
              title={t('contract_creator.title_input_title', 'Klik untuk mengubah judul dokumen')}
              placeholder={t('contract_creator.title_input_placeholder', 'Judul Dokumen Perjanjian')}
            />
          </div>
        </div>

        {/* Action Controls & Mode Switcher */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* View Mode Toggle: Edit vs Pratinjau */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 mr-1">
            <button
              type="button"
              onClick={() => setViewMode('editor')}
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
              onClick={() => setViewMode('preview')}
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
            &times;
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
            {/* White Paper Sheet */}
            <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl rounded-sm border border-slate-300/80 dark:border-slate-800 min-h-[1150px] p-10 sm:p-16 md:p-20 relative">
              <div className="min-h-[900px] font-sans leading-relaxed text-slate-900 dark:text-slate-100">
                {/* "ProseMirror" class reused so this read-only preview picks up the exact
                    same heading/paragraph/table typography rules as the live editor content. */}
                <div
                  className="ProseMirror"
                  dangerouslySetInnerHTML={{ __html: stripFillableSlotsToPlainText(editor?.getHTML() || '') }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 4. RIGHT SIDEBAR: QUICK FILL FORM & CLAUSE INSERTER */}
        {sidebarOpen && (
          <aside className="w-72 sm:w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 z-10 shadow-sm overflow-hidden">

            {/* Sidebar Header & Tabs */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
              <div className="px-3 py-2.5">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  {t('contract_creator.panel_title', 'Panel Asisten Kontrak')}
                </h2>
              </div>

              {/* 3 Sub-tabs */}
              <div role="tablist" aria-label={t('contract_creator.panel_title', 'Panel Asisten Kontrak')} className="grid grid-cols-3 gap-1 px-2 pb-2">
                {(
                  [
                    { id: 'fields', label: t('contract_creator.tab.fields', 'Kolom Isian'), icon: ListChecks },
                    { id: 'partners', label: t('contract_creator.tab.partners', 'Mitra'), icon: Building2 },
                    { id: 'templates', label: t('contract_creator.tab.templates', 'Template'), icon: FolderOpen },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const isActive = sidebarTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSidebarTab(tab.id)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              
              {/* TAB 1: QUICK FILL FORM (Baris yang harus diisi) */}
              {sidebarTab === 'fields' && (
                <div className="space-y-2.5">
                  {/* Contract Number Field */}
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

                  {/* Loop over predefined fillable slots */}
                  {COOPERATION_AGREEMENT_FIELDS.map((field) => {
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

                  {/* Render Custom Fields in Fields tab */}
                  {customFields.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t('contract_creator.custom_fields_section_title', 'Kolom Isian Kustom Anda')}</span>
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded uppercase">
                          {t('contract_creator.custom_badge', 'Kustom')} ({customFields.length})
                        </span>
                      </div>

                      {customFields.map((field) => {
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
                            ) : (
                              <input
                                type="text"
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

                  {/* 2. OPTION TO ADD CUSTOM DRAG & DROP FIELDS */}
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
                          </select>
                        </div>

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

                  {/* 3. DRAG AND DROP FIELDS SYSTEM */}
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

                    <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto pr-1">
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
                              DRAG
                            </span>
                          </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* 3. SAVED TEMPLATES LIBRARY */}
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
                                ID: {tpl.id.substring(0, 8)}
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
          </aside>
        )}
      </div>

      {/* 5. BOTTOM STATUS BAR */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-500 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <span>{wordCount} {t('contract_creator.footer.words', 'kata')}</span>
          <span className="hidden sm:inline">&bull;</span>
          <span className="hidden sm:inline">{charCount} {t('contract_creator.footer.chars', 'karakter')}</span>
          <span className="hidden md:inline">&bull;</span>
          <span className="hidden md:inline">{t('contract_creator.footer.read_estimate', 'Estimasi baca')} ~{Math.max(1, Math.round(wordCount / 200))} {t('contract_creator.footer.minutes', 'menit')}</span>
          <span className="hidden lg:inline">&bull;</span>
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
  );
};
