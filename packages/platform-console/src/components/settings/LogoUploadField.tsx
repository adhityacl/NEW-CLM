import React, { useState } from 'react';
import { Link2, Trash2, Upload } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAlertToast } from '../../context/AlertToastContext';

// Logo upload helper component
interface LogoUploadFieldProps {
  logo: string;
  name: string;
  onChange: (logo: string) => void;
  label?: string;
}

export const LogoUploadField: React.FC<LogoUploadFieldProps> = ({
  logo,
  name,
  onChange,
  label,
}) => {
  const { t } = useLanguage();
  const showAlert = useAlertToast();
  const [isUrlMode, setIsUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState(logo || '');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fallbackLetter = (name.trim() || 'O').charAt(0).toUpperCase();

  const handleFileChange = (file?: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showAlert({ title: t('admin.logo_raster_type', 'PNG, JPG, WebP. Max 2 MB.'), variant: 'warning' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showAlert({ title: t('admin.err_image_size', 'Ukuran file gambar maksimal 2MB.'), variant: 'warning' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onChange(result);
        setUrlInput(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleRemove = () => {
    onChange('');
    setUrlInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApplyUrl = () => {
    onChange(urlInput.trim());
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          {label || t('admin.org_logo_label', 'Logo Organisasi / Workspace')}
        </label>
        <button
          type="button"
          onClick={() => setIsUrlMode(!isUrlMode)}
          className="text-xs text-accent-text hover:underline flex items-center gap-1 cursor-pointer"
        >
          <Link2 className="w-3 h-3" />
          {isUrlMode
            ? t('admin.logo_mode_upload', 'Unggah File Gambar')
            : t('admin.logo_mode_url', 'Gunakan URL Gambar')}
        </button>
      </div>

      <div className="flex items-center gap-3.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
        {/* Preview Container */}
        <div className="relative shrink-0 group">
          <div className="w-14 h-14 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shadow-xs">
            {logo ? (
              <img
                src={logo}
                alt={name || t('admin.logo', 'Logo')}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full bg-linear-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center">
                {fallbackLetter}
              </div>
            )}
          </div>
          {logo && (
            <button
              type="button"
              onClick={handleRemove}
              title={t('admin.btn_remove_logo', 'Hapus Logo')}
              className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-md transition-all cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Input / Dropzone Area */}
        <div className="flex-1 min-w-0">
          {!isUrlMode ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex min-h-14 items-center justify-center border-2 border-dashed rounded-xl p-2.5 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-accent/30 bg-accent-soft'
                  : 'border-slate-300 dark:border-slate-700 hover:border-accent/30 hover:bg-white dark:hover:bg-slate-900'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={label || t('admin.org_logo_label', 'Logo Organisasi / Workspace')}
                onChange={(e) => handleFileChange(e.target.files?.[0])}
                className="hidden"
              />
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <Upload className="w-3.5 h-3.5 text-accent-text" />
                <span>{t('admin.logo_upload_cta', 'Pilih atau Tarik Logo')}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input aria-label={t('admin.org_logo_label', 'Logo Organisasi / Workspace')}
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-accent outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="theme-action ui-button ui-button-lg font-medium text-white transition-colors cursor-pointer"
                >
                  {t('admin.btn_apply', 'Terapkan')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
