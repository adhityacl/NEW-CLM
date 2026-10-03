import React from 'react';
import { Scale } from 'lucide-react';
import { LegalDocument } from './legal/LegalDocument';
import { TERMS_CONTENT } from './legal/termsContent';

interface TermsOfServiceViewProps {
  onBack?: () => void;
}

const ACCENT = {
  icon: <Scale aria-hidden="true" className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
  num: 'text-blue-700 dark:text-blue-400',
  toc: 'bg-blue-50/70 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40',
  tocTitle: 'text-blue-900 dark:text-blue-300',
  button: 'bg-blue-700 hover:bg-blue-800',
  link: 'text-blue-800 dark:text-blue-300',
};

export const TermsOfServiceView: React.FC<TermsOfServiceViewProps> = ({ onBack }) => (
  <LegalDocument catalog={TERMS_CONTENT} accent={ACCENT} idPrefix="tos" onBack={onBack} />
);
