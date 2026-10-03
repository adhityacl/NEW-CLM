import React from 'react';
import { Shield } from 'lucide-react';
import { LegalDocument } from './legal/LegalDocument';
import { PRIVACY_CONTENT } from './legal/privacyContent';

interface PrivacyPolicyViewProps {
  onBack?: () => void;
}

const ACCENT = {
  icon: <Shield aria-hidden="true" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
  num: 'text-emerald-700 dark:text-emerald-400',
  toc: 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40',
  tocTitle: 'text-emerald-900 dark:text-emerald-300',
  button: 'bg-emerald-700 hover:bg-emerald-800',
  link: 'text-emerald-800 dark:text-emerald-300',
};

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onBack }) => (
  <LegalDocument catalog={PRIVACY_CONTENT} accent={ACCENT} idPrefix="section" onBack={onBack} />
);
