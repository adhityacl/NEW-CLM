import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';

export interface DateInputProps {
  value: string; // ISO format YYYY-MM-DD or DD/MM/YYYY
  onChange: (isoDate: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  focusColor?: 'indigo' | 'emerald' | 'slate';
  min?: string;
  max?: string;
  id?: string;
  name?: string;
}

/**
 * Converts YYYY-MM-DD to DD/MM/YYYY
 */
export function formatIsoToDdMmYyyy(isoStr: string): string {
  if (!isoStr) return '';
  // If already DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoStr)) {
    return isoStr;
  }
  const match = isoStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }
  return isoStr;
}

/**
 * Converts DD/MM/YYYY to YYYY-MM-DD
 */
export function formatDdMmYyyyToIso(ddmmStr: string): string {
  if (!ddmmStr) return '';
  // If already YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(ddmmStr)) {
    return ddmmStr;
  }
  const match = ddmmStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const d = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    const y = match[3];
    const dayNum = parseInt(d, 10);
    const monthNum = parseInt(m, 10);
    const yearNum = parseInt(y, 10);
    if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1000) {
      return `${y}-${m}-${d}`;
    }
  }
  return '';
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  required = false,
  disabled = false,
  className = '',
  focusColor = 'indigo',
  min,
  max,
  id,
  name,
}) => {
  const hiddenPickerRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState<string>(() => formatIsoToDdMmYyyy(value));

  // Sync internal displayValue when parent value changes
  useEffect(() => {
    setDisplayValue(formatIsoToDdMmYyyy(value));
  }, [value]);

  const getIsoValueForPicker = (val: string): string => {
    if (!val) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    return formatDdMmYyyyToIso(val);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;

    // Filter out non-digit and non-slash characters
    let cleaned = rawInput.replace(/[^\d/]/g, '');

    // Auto-format digits with slashes if user types numbers sequentially
    const digitsOnly = cleaned.replace(/\D/g, '');
    let formatted = '';
    if (digitsOnly.length > 0) {
      if (digitsOnly.length <= 2) {
        formatted = digitsOnly;
      } else if (digitsOnly.length <= 4) {
        formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
      } else {
        formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4, 8)}`;
      }
    } else {
      formatted = '';
    }

    setDisplayValue(formatted);

    if (formatted.length === 10) {
      const iso = formatDdMmYyyyToIso(formatted);
      if (iso) {
        onChange(iso);
      }
    } else if (formatted === '') {
      onChange('');
    }
  };

  const handleBlur = () => {
    if (displayValue.length === 10) {
      const iso = formatDdMmYyyyToIso(displayValue);
      if (iso) {
        onChange(iso);
      }
    } else if (displayValue !== '') {
      // If incomplete or invalid, revert to parent value or reset
      setDisplayValue(formatIsoToDdMmYyyy(value));
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedIso = e.target.value; // YYYY-MM-DD
    if (pickedIso) {
      setDisplayValue(formatIsoToDdMmYyyy(pickedIso));
      onChange(pickedIso);
    }
  };

  const openCalendarPicker = () => {
    if (disabled) return;
    try {
      if (hiddenPickerRef.current && typeof hiddenPickerRef.current.showPicker === 'function') {
        hiddenPickerRef.current.showPicker();
      } else {
        hiddenPickerRef.current?.focus();
        hiddenPickerRef.current?.click();
      }
    } catch {
      hiddenPickerRef.current?.focus();
      hiddenPickerRef.current?.click();
    }
  };

  const focusBorderClass =
    focusColor === 'emerald'
      ? 'focus-within:border-[#06C755] focus:border-[#06C755]'
      : focusColor === 'slate'
      ? 'focus-within:border-slate-500 focus:border-slate-500'
      : 'focus-within:border-[#06C755] focus:border-[#06C755]';

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        maxLength={10}
        className={`w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-3 pr-9 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs focus:outline-none focus:bg-white dark:focus:bg-slate-800 transition-colors ${focusBorderClass} ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openCalendarPicker}
        title="Buka Kalender"
        className="absolute right-2.5 text-slate-400 hover:text-[#06C755] dark:hover:text-emerald-400 transition-colors cursor-pointer disabled:cursor-not-allowed p-0.5"
      >
        <Calendar className="w-4 h-4" />
      </button>

      {/* Hidden Native Date Input for Calendar Picker Popup */}
      <input
        ref={hiddenPickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        min={min}
        max={max}
        value={getIsoValueForPicker(value)}
        onChange={handlePickerChange}
        className="sr-only absolute pointer-events-none opacity-0 w-0 h-0"
      />
    </div>
  );
};
