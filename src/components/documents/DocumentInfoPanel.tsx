import React, { useEffect, useId, useState } from 'react';
import { Info, PlusCircle, Save, Tags, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useAlertToast } from '../../context/AlertToastContext';
import { documentsApi, errorMessage } from '../../lib/documentsApi';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  METADATA_FIELD_TYPES,
  formatDateTime,
  isOneOf,
  type DocumentDetail,
  type DocumentStatus,
  type DocumentType,
  type MetadataField,
  type MetadataFieldType,
  type MetadataValues,
} from '../../lib/documentModel';
import { INPUT_CLASS, statusLabel, typeLabel } from './documentLabels';

interface DocumentInfoPanelProps {
  document: DocumentDetail | null;
  organizationName: string;
  canEdit: boolean;
  canManageFields: boolean;
  onUpdate: (patch: { status?: DocumentStatus; type?: DocumentType }) => void;
}

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };

const SECTION_TITLE = 'text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5';
const LABEL = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const BUTTON =
  'w-full inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-8 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer';

export const DocumentInfoPanel: React.FC<DocumentInfoPanelProps> = ({ document, organizationName, canEdit, canManageFields, onUpdate }) => {
  const { t, language } = useLanguage();
  const confirmDialog = useConfirm();
  const showAlert = useAlertToast();
  const idPrefix = useId();
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [values, setValues] = useState<MetadataValues>({});
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [newField, setNewField] = useState<{ name: string; type: MetadataFieldType; options: string }>({ name: '', type: 'text', options: '' });

  const documentId = document?.id ?? null;

  useEffect(() => {
    documentsApi.listFields().then(setFields).catch(() => setFields([]));
  }, []);

  useEffect(() => {
    setValues({});
    if (!documentId) return;
    let cancelled = false;
    documentsApi
      .getMetadata(documentId)
      .then((v) => !cancelled && setValues(v))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const saveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentId) return;
    setSaveState({ status: 'saving' });
    try {
      const payload: MetadataValues = {};
      for (const field of fields) payload[field.id] = values[field.id] ?? (field.field_type === 'multi_select' ? [] : '');
      await documentsApi.saveMetadata(documentId, payload);
      setSaveState({ status: 'idle' });
      showAlert({ title: t('documents.metadata.saved', 'Metadata tersimpan'), variant: 'success' });
    } catch (err) {
      setSaveState({ status: 'error', message: errorMessage(err) });
    }
  };

  const addField = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await documentsApi.createField({
        name: newField.name,
        field_type: newField.type,
        options: newField.options.split(',').map((o) => o.trim()).filter(Boolean),
      });
      setFields((prev) => [...prev, created]);
      setNewField({ name: '', type: 'text', options: '' });
    } catch (err) {
      showAlert({ title: t('documents.msg.action_failed', 'Aksi gagal'), description: errorMessage(err), variant: 'destructive' });
    }
  };

  const removeField = async (field: MetadataField) => {
    const ok = await confirmDialog({
      description: t('documents.metadata.delete_field_confirm', 'Hapus kolom "{name}"? Nilainya di semua dokumen ikut terhapus.', { name: field.name }),
      tone: 'danger',
      confirmLabel: t('documents.action.delete', 'Hapus'),
    });
    if (!ok) return;
    try {
      await documentsApi.deleteField(field.id);
      setFields((prev) => prev.filter((f) => f.id !== field.id));
    } catch (err) {
      showAlert({ title: t('documents.msg.action_failed', 'Aksi gagal'), description: errorMessage(err), variant: 'destructive' });
    }
  };

  const fieldTypeLabel = (type: MetadataFieldType) =>
    ({
      text: t('documents.metadata.type_text', 'Teks'),
      select: t('documents.metadata.type_select', 'Pilihan'),
      date: t('documents.metadata.type_date', 'Tanggal'),
      multi_select: t('documents.metadata.type_multi_select', 'Pilihan ganda'),
    })[type];

  const renderInput = (field: MetadataField) => {
    const inputId = `${idPrefix}-field-${field.id}`;
    const value = values[field.id];
    const set = (next: string | string[]) => setValues((prev) => ({ ...prev, [field.id]: next }));
    if (field.field_type === 'multi_select') {
      const picked = Array.isArray(value) ? value : [];
      return (
        <fieldset key={field.id} className="space-y-1">
          <legend className={LABEL}>{field.name}</legend>
          {field.options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 min-h-8">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={picked.includes(option)}
                onChange={(e) => set(e.target.checked ? [...picked, option] : picked.filter((p) => p !== option))}
                className="w-4 h-4 accent-emerald-600"
              />
              {option}
            </label>
          ))}
        </fieldset>
      );
    }
    const text = typeof value === 'string' ? value : '';
    return (
      <div key={field.id} className="space-y-1">
        <label htmlFor={inputId} className={LABEL}>
          {field.name}
        </label>
        {field.field_type === 'select' ? (
          <select id={inputId} disabled={!canEdit} value={text} onChange={(e) => set(e.target.value)} className={INPUT_CLASS}>
            <option value="">—</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={inputId}
            type={field.field_type === 'date' ? 'date' : 'text'}
            disabled={!canEdit}
            value={text}
            onChange={(e) => set(e.target.value)}
            className={INPUT_CLASS}
          />
        )}
      </div>
    );
  };

  const typeSelectId = `${idPrefix}-type`;
  const statusSelectId = `${idPrefix}-status`;

  return (
    <div className="space-y-5">
      <section className="space-y-2.5" aria-labelledby={`${idPrefix}-info`}>
        <h3 id={`${idPrefix}-info`} className={SECTION_TITLE}>
          <Info className="w-3.5 h-3.5 text-slate-400" aria-hidden />
          {t('documents.info.title', 'Informasi Dokumen')}
        </h3>
        {!document ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 p-3 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
            {t('documents.info.unsaved', 'Dokumen belum disimpan. Pembuat dan waktu dicatat otomatis saat penyimpanan pertama.')}
          </p>
        ) : (
          <dl className="space-y-2 text-xs text-slate-800 dark:text-slate-100">
            <div>
              <dt className={LABEL}>{t('documents.field.name', 'Nama')}</dt>
              <dd className="font-semibold break-words">{document.name}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <dt>
                  <label htmlFor={typeSelectId} className={LABEL}>
                    {t('documents.field.type', 'Jenis')}
                  </label>
                </dt>
                <dd>
                  <select
                    id={typeSelectId}
                    disabled={!canEdit}
                    value={document.type}
                    onChange={(e) => isOneOf(DOCUMENT_TYPES, e.target.value) && onUpdate({ type: e.target.value })}
                    className={INPUT_CLASS}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {typeLabel(t, type)}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
              <div className="space-y-1">
                <dt>
                  <label htmlFor={statusSelectId} className={LABEL}>
                    {t('documents.field.status', 'Status')}
                  </label>
                </dt>
                <dd>
                  <select
                    id={statusSelectId}
                    disabled={!canEdit}
                    value={document.status}
                    onChange={(e) => isOneOf(DOCUMENT_STATUSES, e.target.value) && onUpdate({ status: e.target.value })}
                    className={INPUT_CLASS}
                  >
                    {DOCUMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(t, status)}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
            </div>
            <div>
              <dt className={LABEL}>{t('documents.field.created', 'Dibuat')}</dt>
              <dd>
                {t('documents.info.by', 'oleh {name}', { name: document.created_by_name || '—' })}
                <br />
                <span className="text-slate-500 dark:text-slate-400">{formatDateTime(document.created_at, language)}</span>
              </dd>
            </div>
            <div>
              <dt className={LABEL}>{t('documents.field.modified', 'Diubah')}</dt>
              <dd>
                {t('documents.info.by', 'oleh {name}', { name: document.modified_by_name || '—' })}
                <br />
                <span className="text-slate-500 dark:text-slate-400">{formatDateTime(document.modified_at, language)}</span>
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className={LABEL}>{t('documents.info.organization', 'Organisasi')}</dt>
                <dd>{organizationName}</dd>
              </div>
              <div>
                <dt className={LABEL}>{t('documents.info.versions', 'Versi')}</dt>
                <dd>
                  v{document.current_version} · {t('documents.info.version_count', '{n} tersimpan', { n: document.draft_count })}
                </dd>
              </div>
            </div>
          </dl>
        )}
      </section>

      <section className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800" aria-labelledby={`${idPrefix}-meta`}>
        <h3 id={`${idPrefix}-meta`} className={SECTION_TITLE}>
          <Tags className="w-3.5 h-3.5 text-slate-400" aria-hidden />
          {t('documents.metadata.title', 'Metadata')}
        </h3>
        {fields.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {canManageFields
              ? t('documents.metadata.empty_admin', 'Belum ada kolom metadata. Tambahkan di bawah (mis. Kode Matter, Nama Klien).')
              : t('documents.metadata.empty', 'Admin organisasi belum menambahkan kolom metadata.')}
          </p>
        ) : !document ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('documents.metadata.unsaved', 'Simpan dokumen terlebih dahulu untuk mengisi metadata.')}
          </p>
        ) : (
          <form onSubmit={saveMetadata} className="space-y-2.5" aria-busy={saveState.status === 'saving'}>
            {fields.map(renderInput)}
            {saveState.status === 'error' && (
              <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
                {saveState.message}
              </p>
            )}
            {canEdit && (
              <button type="submit" disabled={saveState.status === 'saving'} className={BUTTON}>
                <Save className="w-3.5 h-3.5" aria-hidden />
                {saveState.status === 'saving' ? t('common.saving', 'Menyimpan…') : t('documents.metadata.save', 'Simpan Metadata')}
              </button>
            )}
          </form>
        )}
      </section>

      {canManageFields && (
        <section className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800" aria-labelledby={`${idPrefix}-fields`}>
          <h3 id={`${idPrefix}-fields`} className={SECTION_TITLE}>
            <PlusCircle className="w-3.5 h-3.5 text-slate-400" aria-hidden />
            {t('documents.metadata.manage_title', 'Kelola Kolom Metadata (Organisasi)')}
          </h3>
          {fields.length > 0 && (
            <ul className="space-y-1">
              {fields.map((field) => (
                <li key={field.id} className="flex items-center justify-between gap-2 text-xs p-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{field.name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400"> · {fieldTypeLabel(field.field_type)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeField(field)}
                    className="inline-flex items-center justify-center h-11 w-11 sm:h-7 sm:w-7 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label={`${t('documents.action.delete', 'Hapus')}: ${field.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addField} className="space-y-2 p-2.5 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800">
            <label className="block space-y-1">
              <span className={LABEL}>{t('documents.metadata.field_name', 'Nama kolom')}</span>
              <input
                required
                value={newField.name}
                onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                placeholder={t('documents.metadata.field_name_placeholder', 'mis. Kode Matter')}
                className={INPUT_CLASS}
              />
            </label>
            <label className="block space-y-1">
              <span className={LABEL}>{t('documents.metadata.field_type', 'Tipe')}</span>
              <select
                value={newField.type}
                onChange={(e) => isOneOf(METADATA_FIELD_TYPES, e.target.value) && setNewField({ ...newField, type: e.target.value })}
                className={INPUT_CLASS}
              >
                {METADATA_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {fieldTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            {(newField.type === 'select' || newField.type === 'multi_select') && (
              <label className="block space-y-1">
                <span className={LABEL}>{t('documents.metadata.options', 'Opsi (pisahkan dengan koma)')}</span>
                <input
                  required
                  value={newField.options}
                  onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                  placeholder="IP, Employment, Real Estate, Corporate"
                  className={INPUT_CLASS}
                />
              </label>
            )}
            <button type="submit" className={BUTTON}>
              <PlusCircle className="w-3.5 h-3.5" aria-hidden />
              {t('documents.metadata.add_field', 'Tambah Kolom')}
            </button>
          </form>
        </section>
      )}
    </div>
  );
};
