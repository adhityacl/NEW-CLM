import React, { useState, useRef, useEffect } from 'react';
import {
  FileSignature,
  FileDown,
  Save,
  Printer,
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
  RotateCcw,
  Sparkles,
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
  ArrowRightLeft,
  Calendar,
  DollarSign,
  PlusCircle,
  HelpCircle,
  Check,
  ExternalLink,
  Target,
  Trash2,
  Table,
  Superscript,
  Subscript,
  Eraser,
} from 'lucide-react';
import { Partner, Contract } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useTenant } from '../context/TenantContext';
import { getAuthHeaders } from '../App';
import {
  buildIndonesianAgreementHtml,
  buildBilingualExportHtml,
  COOPERATION_AGREEMENT_ARTICLES,
  COOPERATION_AGREEMENT_PREAMBLE,
  COOPERATION_AGREEMENT_SIGNATURES,
  COOPERATION_AGREEMENT_FIELDS,
  COOPERATION_AGREEMENT_HEADER,
  renderFillableSlot,
  stripFillableSlotsToPlainText,
} from '../data/cooperationAgreementTemplate';

interface ContractCreatorViewProps {
  partners: Partner[];
  contracts: Contract[];
  onSaveToSystem: (contractData: Partial<Contract>) => Promise<void>;
  onNavigateToContracts: () => void;
}

export const ContractCreatorView: React.FC<ContractCreatorViewProps> = ({
  partners,
  contracts,
  onSaveToSystem,
  onNavigateToContracts,
}) => {
  const { language } = useLanguage();
  const { activeTenant } = useTenant();
  const editorRef = useRef<HTMLDivElement>(null);

  // Compute First Party details dynamically from activeTenant
  const tenantEntityName = activeTenant
    ? `${activeTenant.legalEntity ? activeTenant.legalEntity + ' ' : ''}${activeTenant.name}`
    : 'PT INFO TEKNO SIAGA';
  const tenantBrand = activeTenant?.brandName || activeTenant?.name || 'ITS';

  // General Cooperation Agreement titles
  const defaultDocTitle = `PERJANJIAN KERJASAMA - ${tenantEntityName} & Mitra`;
  const defaultContractNo = `${tenantBrand.toUpperCase().replace(/\s+/g, '')}/PKS/2026/09/${String(contracts.length + 1).padStart(3, '0')}`;

  const [docTitle, setDocTitle] = useState(defaultDocTitle);
  const [contractNumber, setContractNumber] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'fields' | 'partners' | 'templates'>('fields');
  const [highlightFillable, setHighlightFillable] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [viewMode, setViewMode] = useState<'editor' | 'bilingual_preview'>('editor');
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
      alert('Silakan masukkan nama kolom isian.');
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
  const [translatedCustomEnglishHtml, setTranslatedCustomEnglishHtml] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

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
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) {
      alert('Silakan masukkan nama template terlebih dahulu.');
      return;
    }
    const content = editorRef.current?.innerHTML || '';
    if (!content.trim()) {
      alert('Konten template masih kosong.');
      return;
    }

    try {
      setIsSavingTemplate(true);
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          contentId: content,
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
        alert('Template kerjasama berhasil disimpan!');
        fetchTemplates();
      } else {
        alert(data.error || data.message || `Gagal menyimpan template (Status ${res.status}).`);
      }
    } catch (err) {
      console.error('Save template error:', err);
      alert('Terjadi kesalahan saat menyimpan template.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus template kerjasama ini?')) {
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
        alert('Template kerjasama berhasil dihapus.');
        fetchTemplates();
      } else {
        alert(data.error || data.message || `Gagal menghapus template (Status ${res.status}).`);
      }
    } catch (err) {
      console.error('Delete template error:', err);
      alert('Terjadi kesalahan saat menghapus template.');
    }
  };

  const handleLoadTemplate = (tpl: any) => {
    if (window.confirm(`Gunakan template "${tpl.name}"? Teks kontrak saat ini akan diganti.`)) {
      if (editorRef.current) {
        editorRef.current.innerHTML = tpl.contentId;
        setIsCustomTemplateActive(true);
        setTranslatedCustomEnglishHtml(''); // Reset translation
        updateStats();
        setExportMessage({
          type: 'info',
          text: `Template "${tpl.name}" berhasil dimuat ke editor.`,
        });
      }
    }
  };

  const handleTranslateDocument = async () => {
    const content = editorRef.current?.innerHTML || '';
    if (!content.trim()) {
      alert('Konten kontrak kosong, tidak ada yang bisa diterjemahkan.');
      return;
    }

    try {
      setIsTranslating(true);
      const res = await fetch('/api/translate-template', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contentId: content }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text && !text.trim().startsWith('<') ? JSON.parse(text) : { error: `Server error (Status ${res.status})` };
      } catch {
        data = { error: 'Gagal memproses respon server.' };
      }

      if (res.ok && data.success) {
        setTranslatedCustomEnglishHtml(data.translatedHtml);
        setExportMessage({
          type: 'success',
          text: 'Kontrak berhasil diterjemahkan menjadi bilingual Bahasa Inggris & Indonesia berdampingan!',
        });
      } else {
        alert(data.error || data.message || 'Gagal menerjemahkan kontrak.');
      }
    } catch (err) {
      console.error('Translation error:', err);
      alert('Terjadi kesalahan saat menerjemahkan kontrak.');
    } finally {
      setIsTranslating(false);
    }
  };

  // Initial load or restore of the 15 articles general cooperation agreement
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML.trim()) {
      renderTemplateToEditor(fieldValues, contractNumber);
    }
  }, [viewMode]);

  // Word & Character counter
  const updateStats = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(text.length);
  };

  // Render or re-render template to editor
  const renderTemplateToEditor = (vals: Record<string, string>, cNo: string) => {
    if (!editorRef.current) return;
    const initialHtml = buildIndonesianAgreementHtml({
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
    });
    editorRef.current.innerHTML = initialHtml;
    updateStats();
  };

  // Sync a single field from sidebar to all matching editor slots
  const handleFieldValueChange = (key: string, value: string) => {
    const updated = { ...fieldValues, [key]: value };
    setFieldValues(updated);

    // If partner name or first party name changed, also update document title
    if (key === 'partnerName' || key === 'firstPartyName') {
      const p1 = (key === 'firstPartyName' ? value : fieldValues.firstPartyName) || tenantEntityName;
      const p2 = (key === 'partnerName' ? value : fieldValues.partnerName) || 'Mitra';
      setDocTitle(`PERJANJIAN KERJASAMA - ${p1} & ${p2}`);
    }

    // Direct DOM replacement for live updating without destroying editor selection if possible
    if (editorRef.current) {
      const slots = editorRef.current.querySelectorAll(`[data-slot-key="${key}"]`);
      if (slots && slots.length > 0) {
        slots.forEach((slot) => {
          const textSpan = slot.querySelector('.slot-text');
          if (textSpan) {
            textSpan.textContent = value || '...';
          } else {
            slot.textContent = value || '...';
          }
          // toggle border color class
          if (value && value.trim() && value !== '...') {
            (slot as HTMLElement).style.borderColor = '#3b82f6';
            (slot as HTMLElement).style.backgroundColor = '#eff6ff';
            (slot as HTMLElement).style.color = '#1d4ed8';
          } else {
            (slot as HTMLElement).style.borderColor = '#94a3b8';
            (slot as HTMLElement).style.backgroundColor = '#f8fafc';
            (slot as HTMLElement).style.color = '#475569';
          }
        });
        updateStats();
      } else {
        // Fallback: re-render whole template
        renderTemplateToEditor(updated, contractNumber);
      }
    }
  };

  // Focus directly on a slot inside the editor canvas
  const handleFocusSlot = (key: string) => {
    if (!editorRef.current) return;
    const targetSlot = editorRef.current.querySelector(`[data-slot-key="${key}"]`) as HTMLElement;
    if (targetSlot) {
      targetSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetSlot.focus();
      // Flash highlight
      targetSlot.style.transition = 'outline 0.2s ease';
      targetSlot.style.outline = '3px solid #f59e0b';
      setTimeout(() => {
        targetSlot.style.outline = '';
      }, 1500);
    }
  };

  // WYSIWYG command executor
  const executeCommand = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    updateStats();
  };

  // Insert HTML at cursor position
  const insertHTMLAtCursor = (html: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      editorRef.current.innerHTML += html;
      updateStats();
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const el = document.createElement('div');
    el.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node: ChildNode | null;
    let lastNode: ChildNode | null = null;
    while ((node = el.firstChild)) {
      lastNode = frag.appendChild(node);
    }
    range.insertNode(frag);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    updateStats();
  };

  // Open Table Customization Modal
  const insertTable = () => {
    setShowTableModal(true);
  };

  // Insert Custom Table based on rows and cols
  const handleInsertCustomTable = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const r = Math.max(1, Math.min(20, Number(tableRows) || 3));
    const c = Math.max(1, Math.min(10, Number(tableCols) || 3));

    let headerHtml = `<tr style="background-color: #f8fafc;">`;
    for (let j = 1; j <= c; j++) {
      headerHtml += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; font-weight: bold; color: #0f172a;">Kolom ${j}</th>`;
    }
    headerHtml += `</tr>`;

    let bodyHtml = ``;
    for (let i = 1; i <= r; i++) {
      bodyHtml += `<tr>`;
      for (let j = 1; j <= c; j++) {
        bodyHtml += `<td style="border: 1px solid #cbd5e1; padding: 8px 12px; color: #334155;">Data ${i}-${j}</td>`;
      }
      bodyHtml += `</tr>`;
    }

    const tableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt;">
        <thead>${headerHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
      <p><br></p>
    `;
    insertHTMLAtCursor(tableHtml);
    setShowTableModal(false);
  };

  // Handle table row/column operations on active table
  const handleTableAction = (action: 'addRow' | 'addCol' | 'deleteRow' | 'deleteTable') => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    let node: Node | null = selection.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeName === 'TABLE') {
        const table = node as HTMLTableElement;
        const row = selection.anchorNode ? (selection.anchorNode.parentElement?.closest('tr') as HTMLTableRowElement) : null;

        if (action === 'deleteTable') {
          table.remove();
          updateStats();
          return;
        }

        if (action === 'addRow' && table) {
          const colCount = table.rows[0]?.cells.length || 3;
          const newRow = table.insertRow();
          for (let i = 0; i < colCount; i++) {
            const newCell = newRow.insertCell();
            newCell.style.border = '1px solid #cbd5e1';
            newCell.style.padding = '8px 12px';
            newCell.style.color = '#334155';
            newCell.innerHTML = 'Data Baru';
          }
          updateStats();
          return;
        }

        if (action === 'addCol' && table) {
          for (let i = 0; i < table.rows.length; i++) {
            const r = table.rows[i];
            const newCell = r.insertCell();
            newCell.style.border = '1px solid #cbd5e1';
            newCell.style.padding = '8px 12px';
            if (i === 0) {
              newCell.style.fontWeight = 'bold';
              newCell.style.backgroundColor = '#f8fafc';
              newCell.style.color = '#0f172a';
              newCell.innerHTML = `Kolom Baru`;
            } else {
              newCell.style.color = '#334155';
              newCell.innerHTML = `Data`;
            }
          }
          updateStats();
          return;
        }

        if (action === 'deleteRow' && row && table.rows.length > 1) {
          row.remove();
          updateStats();
          return;
        }
        break;
      }
      node = node.parentNode;
    }
  };

  // Apply registered partner into fields & editor
  const handleApplyPartner = (partner: Partner) => {
    setSelectedPartner(partner);
    const p = partner as any;
    const pName = partner?.nama_partner || 'Mitra';
    const pAddress = p?.alamat_pic || p?.alamat || 'Jakarta, Indonesia';
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
    setDocTitle(`PERJANJIAN KERJASAMA - ${p1} & ${pName}`);
    renderTemplateToEditor(updated, contractNumber);

    setExportMessage({
      type: 'success',
      text: `Data mitra "${pName}" berhasil disinkronkan ke dalam 15 pasal Perjanjian Kerjasama!`,
    });
  };

  // Insert standard clause or custom fillable field into editor
  const handleInsertClause = (clauseType: string) => {
    let html = '';
    if (clauseType === 'confidentiality') {
      html = `<div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px; margin: 14px 0; font-size: 10pt;">
  <strong>Klausul Tambahan Kerahasiaan (NDA Ketat & UU PDP):</strong><br/>
  Para Pihak sepakat bahwa seluruh data pengguna Adapundi, informasi teknis, dan rahasia dagang merupakan Informasi Rahasia yang dilindungi selama 5 (lima) tahun sejak pengakhiran Perjanjian ini, serta tunduk penuh pada UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).
</div>`;
    } else if (clauseType === 'indonesian_law') {
      html = `<p style="margin: 12px 0; text-align: justify; line-height: 1.6; font-size: 10pt;">
  <strong>Pengesampingan Pasal 1266 KUHPerdata:</strong> Para Pihak dengan ini secara tegas mengesampingkan berlakunya ketentuan Pasal 1266 Kitab Undang-Undang Hukum Perdata Indonesia sepanjang diperlukannya suatu putusan atau penetapan pengadilan untuk mengakhiri Perjanjian Kerjasama ini.
</p>`;
    } else if (clauseType === 'arbitration') {
      html = `<p style="margin: 12px 0; text-align: justify; line-height: 1.6; font-size: 10pt;">
  <strong>Domisili Hukum:</strong> Perjanjian Kerjasama ini diatur oleh hukum Republik Indonesia. Setiap perselisihan diselesaikan terlebih dahulu melalui musyawarah mufakat dalam waktu 14 (empat belas) hari kalender, dan apabila tidak tercapai kesepakatan, maka diselesaikan secara eksklusif di Pengadilan Negeri Jakarta Selatan.
</p>`;
    } else if (clauseType === 'bank_account') {
      const bName = fieldValues.bankName || 'PT Bank Central Asia Tbk (BCA)';
      const bAcc = fieldValues.bankAccount || '5271-889-001';
      const bHolder = fieldValues.bankHolder || fieldValues.firstPartyName || tenantEntityName;
      html = `<div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin: 14px 0; font-size: 10pt;">
  <strong>Rekening Bank Penampungan Pembayaran Resmi:</strong><br/>
  Bank: <strong>${bName}</strong><br/>
  Nomor Rekening: <strong>${bAcc}</strong><br/>
  Atas Nama: <strong>${bHolder}</strong><br/>
  SWIFT Code: <strong>CENAIDJA</strong>
</div>`;
    } else if (clauseType === 'sign_block') {
      const p1Name = fieldValues.firstPartyName || tenantEntityName;
      const p1Pic = fieldValues.firstPartyPic || 'Achmad Indrawan';
      const p1Pos = fieldValues.firstPartyPosition || 'Direktur Utama';
      const pName = fieldValues.partnerName || '[Nama Perusahaan Mitra]';
      const pPic = fieldValues.partnerPic || '[Nama Penandatangan Mitra]';
      const pPos = fieldValues.partnerPosition || '[Jabatan Mitra]';
      html = `<table style="width: 100%; border-collapse: collapse; margin-top: 30px; border: none;">
  <tr>
    <td style="width: 50%; vertical-align: top; padding: 15px; border: none; text-align: center;">
      <p style="margin-bottom: 4px; font-size: 9.5pt; color: #4b5563;">Pihak Pertama:</p>
      <p style="font-weight: bold; margin-bottom: 60px;">${p1Name}</p>
      <p style="font-weight: bold; text-decoration: underline; margin-bottom: 2px;">${p1Pic}</p>
      <p style="font-size: 9.5pt; color: #4b5563;">${p1Pos}</p>
    </td>
    <td style="width: 50%; vertical-align: top; padding: 15px; border: none; text-align: center;">
      <p style="margin-bottom: 4px; font-size: 9.5pt; color: #4b5563;">Pihak Kedua (Mitra):</p>
      <p style="font-weight: bold; margin-bottom: 60px;">${pName}</p>
      <p style="font-weight: bold; text-decoration: underline; margin-bottom: 2px;">${pPic}</p>
      <p style="font-size: 9.5pt; color: #4b5563;">${pPos}</p>
    </td>
  </tr>
</table>`;
    } else if (clauseType === 'insert_text_slot') {
      html = renderFillableSlot('text', 'customText', 'Teks Isian Baru');
    } else if (clauseType === 'insert_date_slot') {
      html = renderFillableSlot('date', 'customDate', 'DD/MM/YYYY');
    } else if (clauseType === 'insert_amount_slot') {
      html = renderFillableSlot('currency', 'customAmount', 'Rp 0');
    }

    insertHTMLAtCursor(html);
  };

  // Reset document to default template
  const handleResetDocument = () => {
    if (
      window.confirm(
        'Reset dokumen kembali ke template awal 15 pasal PERJANJIAN KERJASAMA (Versi Bahasa Indonesia)? Perubahan kustom yang belum disimpan akan direset.'
      )
    ) {
      renderTemplateToEditor(fieldValues, contractNumber);
      setIsCustomTemplateActive(false);
      setTranslatedCustomEnglishHtml('');
      setExportMessage({
        type: 'info',
        text: 'Template 15 Pasal Perjanjian Kerjasama berhasil direset ke kondisi awal.',
      });
    }
  };

  // Download DOCX in Bilingual 2-Column Format (English Left | Indonesian Right)
  const handleDownloadBilingualDocx = () => {
    setIsDownloadingDocx(true);
    try {
      const bilingualHtml = buildBilingualExportHtml({
        contractNo: contractNumber,
        firstPartyName: fieldValues.firstPartyName || tenantEntityName,
        firstPartyAlias: fieldValues.firstPartyAlias || tenantBrand,
        firstPartyAddress: fieldValues.firstPartyAddress,
        firstPartyPic: fieldValues.firstPartyPic,
        firstPartyPosition: fieldValues.firstPartyPosition,
        firstPartyEmail: fieldValues.firstPartyEmail,
        firstPartyBusinessDesc: fieldValues.firstPartyBusinessDesc,
        partnerName: fieldValues.partnerName || 'Mitra Usaha',
        partnerAddress: fieldValues.partnerAddress || 'Alamat Mitra',
        partnerPic: fieldValues.partnerPic || 'Penandatangan Mitra',
        partnerPosition: fieldValues.partnerPosition || 'Direktur Utama',
        dateStr: fieldValues.dateStr,
        startDate: fieldValues.startDate,
        endDate: fieldValues.endDate,
        scopeDescId: fieldValues.scopeDescId,
        scopeDescEn: fieldValues.scopeDescEn,
        feeAmountId: fieldValues.feeAmountId,
        feeAmountEn: fieldValues.feeAmountEn,
        bankName: fieldValues.bankName,
        bankAccount: fieldValues.bankAccount,
        bankHolder: fieldValues.bankHolder || fieldValues.firstPartyName || tenantEntityName,
        partnerEmail: fieldValues.partnerEmail,
      });

      const blob = new Blob(['\ufeff', bilingualHtml], {
        type: 'application/msword',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safePartnerName = (fieldValues.partnerName || 'Mitra')
        .replace(/[^\w\s-]/gi, '')
        .replace(/\s+/g, '_');
      const safeContractNo = contractNumber.replace(/\//g, '-');
      link.download = `PKS_Bilingual_${safePartnerName}_${safeContractNo}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportMessage({
        type: 'success',
        text: 'File Kontrak Bilingual (.doc) 2-kolom (Inggris - Indonesia) berhasil diunduh!',
      });
    } catch (err: any) {
      console.error('Download bilingual error:', err);
      setExportMessage({
        type: 'error',
        text: `Gagal mengunduh dokumen bilingual: ${err?.message || 'Kesalahan format'}`,
      });
    } finally {
      setIsDownloadingDocx(false);
    }
  };

  // Download DOCX in Single Indonesian Format (Direct from Editor)
  const handleDownloadIndonesianDocx = () => {
    setIsDownloadingDocx(true);
    try {
      const rawHtml = editorRef.current?.innerHTML || '';
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
  @page {
    size: A4 portrait;
    margin: 1.27cm 1.27cm 1.27cm 1.27cm; /* Narrow margin: 0.5 in / 1.27 cm */
    mso-page-orientation: portrait;
  }
  @page Section1 {
    size: 21.0cm 29.7cm;
    margin: 1.27cm 1.27cm 1.27cm 1.27cm;
    mso-header-margin: 0.8cm;
    mso-footer-margin: 0.8cm;
    mso-paper-source: 0;
  }
  div.Section1 {
    page: Section1;
  }
  body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #111827; margin: 0; padding: 0; }
  h1 { font-size: 18pt; text-align: center; margin-bottom: 6px; }
  h2 { font-size: 12pt; margin-top: 16px; border-bottom: 1px solid #CCCCCC; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
  td { padding: 6px 10px; vertical-align: top; }
  p { margin: 0 0 6px 0; text-align: justify; line-height: 1.5; }
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
        text: 'File dokumen Word (.doc) versi Bahasa Indonesia berhasil diunduh!',
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setExportMessage({
        type: 'error',
        text: `Gagal mengunduh dokumen: ${err?.message || 'Kesalahan file'}`,
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
        status: 'Aktif',
        jenis_dokumen: 'Master Agreement',
        kategori_kerjasama: ['Perjanjian Kerjasama', 'General Cooperation'],
        nilai_kontrak: 100000000,
        auto_renewal: true,
        notice_period_hari: 30,
        notice_type_required: 'Both',
        pic_internal: p1Pic,
        internal_notes: `Perjanjian Kerjasama (General Cooperation Agreement) bilingual antara ${p1Name} dengan ${pName}. Memuat 15 pasal lengkap sesuai standar hukum Indonesia dan pengesampingan 1266 KUHPerdata. Dibuat via WYSIWYG Editor Kontrak SILEGAL.`,
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
              title="Klik untuk mengubah judul dokumen"
              placeholder="Judul Dokumen Perjanjian"
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
              title="Sunting langsung teks kontrak dalam Bahasa Indonesia"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('bilingual_preview')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'bilingual_preview'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Pratinjau tampilan bilingual berdampingan (Inggris kiri, Indonesia kanan)"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Pratinjau</span>
            </button>
          </div>

          {/* Primary Export: Download Bilingual DOCX */}
          <button
            type="button"
            onClick={handleDownloadBilingualDocx}
            disabled={isDownloadingDocx}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#06C755] hover:bg-[#05a847] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Download file Word (.DOC) bilingual 2-kolom (Inggris - Indonesia)"
          >
            {isDownloadingDocx ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            <span>Download</span>
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
            title="Buka / Tutup Panel Pintasan Form &amp; Klausul"
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
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center gap-1 shrink-0 z-10 shadow-xs">
          
          {/* History: Undo / Redo */}
          <div className="flex items-center border-r border-slate-200 dark:border-slate-800 pr-1.5 mr-1 gap-0.5">
            <button
              type="button"
              onClick={() => executeCommand('undo')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('redo')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Headings */}
          <div className="flex items-center border-r border-slate-200 dark:border-slate-800 pr-1.5 mr-1 gap-0.5">
            <button
              type="button"
              onClick={() => executeCommand('formatBlock', '<h1>')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
              title="Heading 1 (Judul Utama)"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('formatBlock', '<h2>')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
              title="Heading 2 (Judul Pasal)"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('formatBlock', '<p>')}
              className="px-1.5 py-1 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
              title="Teks Normal Paragraf"
            >
              P
            </button>
          </div>

          {/* Text Styling: Bold, Italic, Underline */}
          <div className="flex items-center border-r border-slate-200 dark:border-slate-800 pr-1.5 mr-1 gap-0.5">
            <button
              type="button"
              onClick={() => executeCommand('bold')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Tebal (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('italic')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Miring (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('underline')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Garis Bawah (Ctrl+U)"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('strikeThrough')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Coret (Strikethrough)"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Text Alignment */}
          <div className="flex items-center border-r border-slate-200 dark:border-slate-800 pr-1.5 mr-1 gap-0.5">
            <button
              type="button"
              onClick={() => executeCommand('justifyLeft')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Rata Kiri"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('justifyCenter')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Rata Tengah"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('justifyRight')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Rata Kanan"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('justifyFull')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Rata Kanan-Kiri (Justify)"
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Lists */}
          <div className="flex items-center border-r border-slate-200 dark:border-slate-800 pr-1.5 mr-1 gap-0.5">
            <button
              type="button"
              onClick={() => executeCommand('insertUnorderedList')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Bullet List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('insertOrderedList')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Numbered List"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Table & Formatting Tools */}
          <div className="flex items-center border-r border-slate-200 dark:border-slate-800 pr-1.5 mr-1 gap-0.5">
            <button
              type="button"
              onClick={insertTable}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
              title="Sisipkan Tabel"
            >
              <Table className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('superscript')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Superscript (Pangkat Atas)"
            >
              <Superscript className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('subscript')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Subscript (Pangkat Bawah)"
            >
              <Subscript className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('removeFormat')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Hapus Format Teks"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset Template */}
          <div className="flex items-center ml-auto">
            <button
              type="button"
              onClick={handleResetDocument}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Kembalikan isi ke template awal 15 pasal Perjanjian Kerjasama"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Template</span>
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
              className={`bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl rounded-sm border border-slate-300/80 dark:border-slate-800 min-h-[1150px] p-10 sm:p-16 md:p-20 relative ${
                highlightFillable ? 'highlight-fillable-mode' : ''
              }`}
            >
              
              {/* Editable WYSIWYG Content Canvas */}
              <div
                ref={editorRef}
                contentEditable={true}
                suppressContentEditableWarning={true}
                onInput={updateStats}
                onDragStart={(e) => {
                  const target = (e.target as HTMLElement).closest('.fillable-slot');
                  if (target) {
                    const slotKey = target.getAttribute('data-slot-key');
                    const slotType = target.getAttribute('data-slot-type') || 'text';
                    const slotTextEl = target.querySelector('.slot-text');
                    const slotVal = slotTextEl ? slotTextEl.textContent : '';
                    
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                      type: slotType,
                      key: slotKey,
                      placeholder: slotKey,
                      value: slotVal,
                      isInternalMove: true,
                    }));
                    e.dataTransfer.effectAllowed = 'move';
                    (window as any).__draggedSlotElement = target;
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  try {
                    const dataStr = e.dataTransfer.getData('text/plain');
                    if (!dataStr) return;
                    const data = JSON.parse(dataStr);
                    if (data.type && data.key) {
                      // If internal move, remove original element first
                      if (data.isInternalMove && (window as any).__draggedSlotElement) {
                        try {
                          (window as any).__draggedSlotElement.remove();
                        } catch (err) {}
                        (window as any).__draggedSlotElement = null;
                      }

                      // Find drop range
                      let range: Range | null = null;
                      if (document.caretRangeFromPoint) {
                        range = document.caretRangeFromPoint(e.clientX, e.clientY);
                      } else if ((e as any).rangeParent) {
                        // Firefox fallback
                        range = document.createRange();
                        range.setStart((e as any).rangeParent, (e as any).rangeOffset);
                      }

                      const currentVal = fieldValues[data.key] !== undefined ? fieldValues[data.key] : (data.value || '');
                      const slotHtml = renderFillableSlot(
                        data.type,
                        data.key,
                        data.placeholder || data.key,
                        currentVal !== '...' ? currentVal : ''
                      );

                      if (range) {
                        const selection = window.getSelection();
                        if (selection) {
                          selection.removeAllRanges();
                          selection.addRange(range);
                        }
                        insertHTMLAtCursor(slotHtml);
                      } else {
                        if (editorRef.current) {
                          editorRef.current.innerHTML += slotHtml;
                        }
                      }
                      updateStats();
                    }
                  } catch (err) {
                    console.error('Error handling drop:', err);
                  }
                }}
                className="outline-none min-h-[900px] font-sans leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none selection:bg-emerald-200 dark:selection:bg-emerald-950"
              />
            </div>
          </div>
        </div>

        {/* VIEW MODE B: BILINGUAL 2-COLUMN SIDE-BY-SIDE PREVIEW */}
        <div
          className={`flex-1 overflow-y-auto p-4 sm:p-8 md:p-10 bg-slate-200/60 dark:bg-slate-950/80 justify-center items-start ${
            viewMode === 'bilingual_preview' ? 'flex' : 'hidden'
          }`}
        >
          <div className="w-full max-w-6xl bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-300/70 dark:border-slate-800 p-6 sm:p-10 space-y-6 h-fit mb-16">

            {/* Side-by-Side Bilingual Table */}
            <div
              className={`border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs bg-white dark:bg-slate-900 ${
                highlightFillable ? 'highlight-fillable-mode' : ''
              }`}
            >
              <table className="w-full border-collapse">
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
                  
                  {/* Document Header Title Row */}
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                    <td className="p-4 border-r border-slate-200 dark:border-slate-700 text-center">
                      <h2 className="font-bold text-base text-slate-900 dark:text-white uppercase">COOPERATION AGREEMENT</h2>
                      <p className="text-xs font-semibold text-slate-500 mt-1">No. {fieldValues.firstPartyName || tenantEntityName}: {contractNumber || '...'}</p>
                    </td>
                    <td className="p-4 text-center">
                      <h2 className="font-bold text-base text-slate-900 dark:text-white uppercase">PERJANJIAN KERJASAMA</h2>
                      <p className="text-xs font-semibold text-slate-500 mt-1">No. {fieldValues.firstPartyName || tenantEntityName}: {contractNumber || '...'}</p>
                    </td>
                  </tr>

                  {isCustomTemplateActive ? (
                    <>
                      {translatedCustomEnglishHtml ? (
                        <tr>
                          <td className="p-6 border-r border-slate-200 dark:border-slate-700 align-top w-1/2">
                            <h3 className="font-bold text-xs uppercase text-emerald-700 dark:text-emerald-400 mb-4 tracking-wider">
                              ENGLISH TRANSLATION (AI GENERATED)
                            </h3>
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: translatedCustomEnglishHtml }}
                            />
                          </td>
                          <td className="p-6 align-top w-1/2">
                            <h3 className="font-bold text-xs uppercase text-emerald-700 dark:text-emerald-400 mb-4 tracking-wider">
                              BAHASA INDONESIA (DRAF EDITOR)
                            </h3>
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || '' }}
                            />
                          </td>
                        </tr>
                      ) : (
                        <tr>
                          <td colSpan={2} className="p-8 text-center bg-slate-50/50 dark:bg-slate-800/10">
                            <div className="max-w-md mx-auto space-y-4 py-8">
                              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                                <Sparkles className="w-6 h-6" />
                              </div>
                              <div className="space-y-1">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                  Terjemahkan Kontrak Menjadi Bilingual
                                </h3>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                  Template kustom ini menggunakan teks Bahasa Indonesia bebas. Klik tombol di bawah ini untuk menerjemahkan draf menjadi bilingual Bahasa Inggris & Indonesia secara instan menggunakan AI.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleTranslateDocument}
                                disabled={isTranslating}
                                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all disabled:opacity-60 cursor-pointer"
                              >
                                {isTranslating ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Menerjemahkan dengan AI...</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Terjemahkan Sekarang (Bilingual)</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Preamble Row */}
                      <tr>
                        <td className="p-4 border-r border-slate-200 dark:border-slate-700 align-top">
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: COOPERATION_AGREEMENT_PREAMBLE.en(fieldValues, 'plain'),
                            }}
                          />
                        </td>
                        <td className="p-4 align-top">
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: COOPERATION_AGREEMENT_PREAMBLE.id(fieldValues, 'plain'),
                            }}
                          />
                        </td>
                      </tr>

                      {/* 15 Articles Rows */}
                      {COOPERATION_AGREEMENT_ARTICLES(fieldValues, 'plain').map((article) => (
                        <tr key={article.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 border-r border-slate-200 dark:border-slate-700 align-top">
                            <h3 className="font-bold text-xs uppercase text-emerald-700 dark:text-emerald-400 mb-2">
                              {article.titleEn}
                            </h3>
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: article.contentEn }}
                            />
                          </td>
                          <td className="p-4 align-top">
                            <h3 className="font-bold text-xs uppercase text-emerald-700 dark:text-emerald-400 mb-2">
                              {article.titleId}
                            </h3>
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: article.contentId }}
                            />
                          </td>
                        </tr>
                      ))}

                      {/* Signatures Row */}
                      <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                        <td className="p-4 border-r border-slate-200 dark:border-slate-700 align-top">
                          <div
                            dangerouslySetInnerHTML={{
                              __html: COOPERATION_AGREEMENT_SIGNATURES.en(fieldValues, 'plain'),
                            }}
                          />
                        </td>
                        <td className="p-4 align-top">
                          <div
                            dangerouslySetInnerHTML={{
                              __html: COOPERATION_AGREEMENT_SIGNATURES.id(fieldValues, 'plain'),
                            }}
                          />
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 4. RIGHT SIDEBAR: QUICK FILL FORM & CLAUSE INSERTER */}
        {sidebarOpen && (
          <aside className="w-80 sm:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 z-10 shadow-sm overflow-hidden">
            
            {/* Sidebar Header & Tabs */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
              <div className="p-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#06C755]" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Panel Asisten Kontrak
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1 cursor-pointer"
                  title="Tutup Panel"
                >
                  &times;
                </button>
              </div>

              {/* 3 Sub-tabs */}
              <div className="grid grid-cols-3 px-2 pb-2 gap-1 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setSidebarTab('fields')}
                  className={`py-1.5 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                    sidebarTab === 'fields'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs font-bold border border-slate-200 dark:border-slate-700'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Formulir pengisian cepat seluruh baris wajib diisi"
                >
                  <span>📝</span>
                  <span>Kolom Isian</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('partners')}
                  className={`py-1.5 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                    sidebarTab === 'partners'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs font-bold border border-slate-200 dark:border-slate-700'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Pilih mitra terdaftar untuk mengisi otomatis"
                >
                  <span>🏢</span>
                  <span>Pilih Mitra</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('templates')}
                  className={`py-1.5 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                    sidebarTab === 'templates'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs font-bold border border-slate-200 dark:border-slate-700'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Buat, simpan, dan muat template kerjasama kustom Anda"
                >
                  <span>📁</span>
                  <span>Template</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* TAB 1: QUICK FILL FORM (Baris yang harus diisi) */}
              {sidebarTab === 'fields' && (
                <div className="space-y-4">
                  {/* Contract Number Field */}
                  <div className="space-y-1 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-blue-400/60 dark:hover:border-blue-500/60 transition-colors bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <span className="text-sm">#️⃣</span>
                        <span>Nomor Perjanjian Kerjasama</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {contractNumber && contractNumber.trim() && !contractNumber.startsWith('[') && (
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Terisi
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleFocusSlot('contractNo')}
                          className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          title="Lompat ke posisi isian di dokumen"
                        >
                          <Target className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Nomor referensi atau nomor surat resmi perjanjian kerjasama
                    </p>
                    <input
                      type="text"
                      value={contractNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        setContractNumber(val);
                        if (editorRef.current) {
                          const slot = editorRef.current.querySelector('[data-slot-key="contractNo"] .slot-text');
                          if (slot) {
                            slot.textContent = val || '...';
                            const parentSlot = slot.closest('.fillable-slot');
                            if (parentSlot) {
                              if (val && val.trim() && val !== '...') {
                                (parentSlot as HTMLElement).style.borderColor = '#3b82f6';
                                (parentSlot as HTMLElement).style.backgroundColor = '#eff6ff';
                                (parentSlot as HTMLElement).style.color = '#1d4ed8';
                                parentSlot.classList.remove('slot-empty');
                                parentSlot.classList.add('slot-filled');
                              } else {
                                (parentSlot as HTMLElement).style.borderColor = '#94a3b8';
                                (parentSlot as HTMLElement).style.backgroundColor = '#f8fafc';
                                (parentSlot as HTMLElement).style.color = '#475569';
                                parentSlot.classList.remove('slot-filled');
                                parentSlot.classList.add('slot-empty');
                              }
                            }
                          }
                        }
                      }}
                      className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder={defaultContractNo || "ITS/PKS/2026/09/001"}
                    />
                  </div>

                  {/* Loop over predefined fillable slots */}
                  {COOPERATION_AGREEMENT_FIELDS.map((field) => {
                    const currentVal = fieldValues[field.key] || '';
                    const isFilled = currentVal && currentVal.trim() && !currentVal.startsWith('[');

                    return (
                      <div
                        key={field.key}
                        className="space-y-1 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-blue-400/60 dark:hover:border-blue-500/60 transition-colors bg-white dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <span className="text-sm">{field.icon}</span>
                            <span>{field.label}</span>
                          </label>
                          <div className="flex items-center gap-1">
                            {isFilled && (
                              <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Terisi
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleFocusSlot(field.key)}
                              className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                              title="Lompat ke posisi isian di dokumen"
                            >
                              <Target className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-400 leading-tight">
                          {field.description}
                        </p>

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

                  {/* Render Custom Fields in Fields tab */}
                  {customFields.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Kolom Isian Kustom Anda</span>
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded uppercase">
                          Kustom ({customFields.length})
                        </span>
                      </div>

                      {customFields.map((field) => {
                        const currentVal = fieldValues[field.key] || '';
                        const isFilled = currentVal && currentVal.trim() && !currentVal.startsWith('[');

                        return (
                          <div
                            key={field.key}
                            className="space-y-1 p-2.5 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 transition-colors bg-emerald-50/5 dark:bg-emerald-950/5"
                          >
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <span className="text-sm">{field.icon}</span>
                                <span className="truncate max-w-[140px]">{field.label}</span>
                              </label>
                              <div className="flex items-center gap-1">
                                {isFilled ? (
                                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                    <Check className="w-3 h-3" /> Terisi
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                                    Opsional
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleFocusSlot(field.key)}
                                  className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                                  title="Lompat ke posisi isian di dokumen"
                                >
                                  <Target className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Hapus kolom isian kustom "${field.label}"?`)) {
                                      setCustomFields((prev) => prev.filter((f) => f.key !== field.key));
                                      setFieldValues((prev) => {
                                        const next = { ...prev };
                                        delete next[field.key];
                                        return next;
                                      });
                                    }
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                                  title="Hapus kolom isian kustom"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <p className="text-[10px] text-slate-400 leading-tight">
                              {field.description}
                            </p>

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
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-[#06C755]" />
                      Pilih Mitra Terdaftar (Auto-Fill)
                    </label>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Pilih mitra dari database untuk mengisi otomatis nama badan hukum, domisili kantor, direktur penandatangan, dan email resmi ke dalam seluruh pasal perjanjian:
                    </p>

                    <select
                      value={selectedPartnerId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedPartnerId(id);
                        const p = partners.find((item) => item.partner_id === id);
                        if (p) handleApplyPartner(p);
                      }}
                      className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">-- Pilih dari Mitra Terdaftar --</option>
                      {partners.map((p) => (
                        <option key={p.partner_id} value={p.partner_id}>
                          {p.nama_partner} ({p.partner_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPartner && (
                    <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 space-y-2">
                      <div className="font-bold text-sm">{selectedPartner.nama_partner}</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        📍 {selectedPartner.alamat_pic || (selectedPartner as any).alamat || 'Alamat Terdaftar'}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        👤 Penandatangan: <strong>{selectedPartner.nama_pic || selectedPartner.pic_partner}</strong>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        💼 Jabatan: <strong>{(selectedPartner as any).pic_position || 'Direktur'}</strong>
                      </div>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleApplyPartner(selectedPartner)}
                          className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          Sinkronkan Ulang ke Dokumen
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-500 space-y-1.5">
                    <div className="font-bold text-slate-700 dark:text-slate-300">Tips Integrasi Mitra:</div>
                    <p className="text-slate-500 text-[10px] leading-relaxed">
                      Menyinkronkan mitra otomatis memperbarui Preamble (Komparisi Para Pihak), Pasal 13 (Alamat Korespondensi), dan Blok Tanda Tangan resmi di bagian akhir perjanjian.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 3: CUSTOM TEMPLATE LIBRARY & DRAG-AND-DROP BUILDER */}
              {sidebarTab === 'templates' && (
                <div className="space-y-5">
                  
                  {/* 1. SAVE DRAFT AS TEMPLATE */}
                  <div className="space-y-2 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>💾</span>
                      <span>Simpan Draf Sebagai Template</span>
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Simpan seluruh teks kontrak kustom Bahasa Indonesia Anda saat ini sebagai master template kerjasama yang siap dipakai ulang kapan saja.
                    </p>
                    <div className="space-y-2 mt-2">
                      <input
                        type="text"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="Nama template (misal: Template Sewa Server)"
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
                            <span>Menyimpan...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Simpan Template</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 2. OPTION TO ADD CUSTOM DRAG & DROP FIELDS */}
                  <div className="space-y-2 p-3.5 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/10 dark:bg-emerald-950/5">
                    <button
                      type="button"
                      onClick={() => setShowAddCustomField(!showAddCustomField)}
                      className="w-full flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-400 focus:outline-none cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <PlusCircle className="w-4 h-4 text-[#06C755]" />
                        <span>Buat Kolom Isian Kustom Baru</span>
                      </span>
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-lg">
                        {showAddCustomField ? 'Tutup' : 'Tambah'}
                      </span>
                    </button>

                    {showAddCustomField && (
                      <div className="space-y-3 pt-2 border-t border-emerald-100 dark:border-emerald-900/60 transition-all">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Nama Kolom Isian</label>
                          <input
                            type="text"
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                            placeholder="Contoh: Kompensasi Tambahan"
                            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Tipe Isian</label>
                            <select
                              value={newFieldType}
                              onChange={(e: any) => setNewFieldType(e.target.value)}
                              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value="text">Teks biasa</option>
                              <option value="date">Tanggal</option>
                              <option value="currency">Mata Uang</option>
                              <option value="textarea">Paragraf / Textarea</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Emoji / Ikon</label>
                            <input
                              type="text"
                              value={newFieldIcon}
                              onChange={(e) => setNewFieldIcon(e.target.value)}
                              placeholder="⭐"
                              className="w-full text-xs text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Placeholder Default</label>
                          <input
                            type="text"
                            value={newFieldPlaceholder}
                            onChange={(e) => setNewFieldPlaceholder(e.target.value)}
                            placeholder="Contoh: Rp 50.000.000 (Lima Puluh Juta)"
                            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Keterangan / Deskripsi</label>
                          <input
                            type="text"
                            value={newFieldDescription}
                            onChange={(e) => setNewFieldDescription(e.target.value)}
                            placeholder="Deskripsi singkat fungsi kolom isian ini"
                            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleCreateCustomField}
                          className="w-full py-2 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Buat Kolom Isian Baru</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 3. DRAG AND DROP FIELDS SYSTEM */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span>🎯</span>
                        <span>Kolom Isian Drag &amp; Drop</span>
                      </h3>
                      <span className="text-[9px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded uppercase">
                        Seret &amp; Lepas
                      </span>
                    </div>
                    
                    <div className="p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/50 text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
                      Seret elemen di bawah ini dan jatuhkan pada posisi kursor di lembar dokumen Bahasa Indonesia Anda untuk menempatkan kolom isian dinamis:
                    </div>

                    {/* Category Switcher Tabs */}
                    <div className="flex flex-wrap gap-1 pb-1">
                      {[
                        { id: 'all', label: 'Semua' },
                        { id: 'firstParty', label: 'Pihak I' },
                        { id: 'partner', label: 'Pihak II' },
                        { id: 'operational', label: 'Ketentuan' },
                        { id: 'custom', label: 'Kustom' },
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
                          {tab.id === 'custom' && customFields.length > 0 && ` (${customFields.length})`}
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
                              Tidak ada kolom isian di kategori ini.
                            </div>
                          );
                        }

                        return filteredDragFields.map((item) => (
                          <div
                            key={item.key}
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                'text/plain',
                                JSON.stringify({
                                  type: item.type,
                                  key: item.key,
                                  label: item.label,
                                  placeholder: item.placeholder,
                                })
                              );
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            className={`flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 border rounded-xl cursor-grab active:cursor-grabbing transition-all shadow-2xs group ${
                              item.isCustom 
                                ? 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10'
                                : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10'
                            }`}
                            title="Seret elemen ini ke editor"
                          >
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 truncate max-w-[200px]">
                              <span>{item.icon}</span>
                              <span className="truncate">{item.label}</span>
                              {item.isCustom && (
                                <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1 py-0.2 rounded uppercase">
                                  Kustom
                                </span>
                              )}
                            </span>
                            <span className="text-[9px] text-slate-400 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700 font-mono group-hover:text-emerald-600 group-hover:border-emerald-200 dark:group-hover:text-emerald-400">
                              DRAG
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* 3. SAVED TEMPLATES LIBRARY */}
                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>📁</span>
                      <span>Pustaka Template Terdaftar</span>
                    </h3>
                    
                    {isLoadingTemplates ? (
                      <div className="text-center py-4 text-xs text-slate-400 flex items-center justify-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#06C755]" />
                        <span>Memuat pustaka...</span>
                      </div>
                    ) : savedTemplates.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
                        Belum ada template yang disimpan.
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
                                Gunakan
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTemplate(tpl.id)}
                                className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                                title="Hapus Template"
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
          <span>{wordCount} kata</span>
          <span className="hidden sm:inline">&bull;</span>
          <span className="hidden sm:inline">{charCount} karakter</span>
          <span className="hidden md:inline">&bull;</span>
          <span className="hidden md:inline">Estimasi baca ~{Math.max(1, Math.round(wordCount / 200))} menit</span>
          <span className="hidden lg:inline">&bull;</span>
          <span className="hidden lg:inline text-emerald-600 dark:text-emerald-400 font-medium">
            {isCustomTemplateActive ? 'Template Kerjasama Kustom Aktif' : '15 Pasal Perjanjian Kerjasama'}
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomLevel(Math.max(70, zoomLevel - 10))}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono w-10 text-center">{zoomLevel}%</span>
          <button
            type="button"
            onClick={() => setZoomLevel(Math.min(150, zoomLevel + 10))}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel(100)}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 ml-1 cursor-pointer"
            title="Reset Zoom 100%"
          >
            100%
          </button>
        </div>
      </footer>

      {/* Table Customization Modal */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Table className="w-5 h-5 text-emerald-600" />
                <span>Sisipkan Tabel Kustom</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tentukan jumlah baris dan kolom sesuai kebutuhan data kontrak Anda.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Jumlah Baris (Rows)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={tableRows}
                  onChange={(e) => setTableRows(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Jumlah Kolom (Cols)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={tableCols}
                  onChange={(e) => setTableCols(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleInsertCustomTable}
                className="px-4 py-2 text-xs font-bold text-white bg-[#06C755] hover:bg-[#05b34c] rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Buat & Sisipkan Tabel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
