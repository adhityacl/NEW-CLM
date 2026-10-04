/** Termination evidence belongs to contract status, not the partner checklist. */
export function isTerminationNoticeDocument(document: { key?: string; nama?: string }): boolean {
  if (document.key === 'termination_notice') return true;
  const name = (document.nama || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ['termination notice', 'surat pemberitahuan pengakhiran', '终止通知'].includes(name);
}
