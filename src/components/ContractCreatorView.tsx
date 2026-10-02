import React, { lazy, Suspense, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { DocumentExplorer } from './documents/DocumentExplorer';
import type { ContractCreatorViewProps } from '../features/documents/ContractDocumentEditor';

const DocumentEditor = lazy(() => import('../features/documents/ContractDocumentEditor').then(m => ({ default: m.ContractDocumentEditor })));

export const ContractCreatorView: React.FC<ContractCreatorViewProps> = (props) => {
  const { isEditor: canEdit } = useAuth();
  const { t } = useLanguage();
  const [editorRequest, setEditorRequest] = useState<{ documentId: string | null } | null>(null);

  if (!editorRequest) {
    return <DocumentExplorer canEdit={canEdit} canDelete={canEdit}
      onOpen={documentId => setEditorRequest({ documentId })}
      onCreate={() => setEditorRequest({ documentId: null })} />;
  }

  return <Suspense fallback={<div role="status" className="flex min-h-56 items-center justify-center text-sm text-slate-500">{t('common.loading', 'Loading…')}</div>}>
    <DocumentEditor {...props} initialDocumentId={editorRequest.documentId} />
  </Suspense>;
};
