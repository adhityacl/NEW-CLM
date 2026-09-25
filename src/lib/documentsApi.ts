import type {
  CommentAction,
  CommentType,
  DocumentComment,
  DocumentDetail,
  DocumentListResponse,
  DocumentStatus,
  DocumentType,
  DraftVersion,
  MetadataField,
  MetadataFieldType,
  MetadataValues,
} from './documentModel';

// Session and organization headers are added by the global fetch interceptor (src/lib/apiFetch.ts).
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
  return body as T;
}

const json = (method: string, body?: unknown, extra: RequestInit = {}): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
  ...extra,
});

export interface SaveDraftResult {
  document: DocumentDetail;
  version: number;
  created: boolean;
}

export const documentsApi = {
  list: (params: Record<string, string>, signal?: AbortSignal) =>
    request<DocumentListResponse>(`/documents?${new URLSearchParams(params)}`, { signal }),
  get: (id: string) => request<DocumentDetail>(`/documents/${id}`),
  create: (input: { name: string; content: string; type?: DocumentType }, keepalive = false) =>
    request<DocumentDetail>('/documents', json('POST', input, { keepalive })),
  update: (id: string, patch: { name?: string; status?: DocumentStatus; type?: DocumentType }) =>
    request<DocumentDetail>(`/documents/${id}`, json('PATCH', patch)),
  remove: (id: string) => request<{ success: true }>(`/documents/${id}`, json('DELETE')),

  listDrafts: (id: string) => request<DraftVersion[]>(`/documents/${id}/drafts`),
  getDraft: (id: string, version: number) =>
    request<DraftVersion & { content: string }>(`/documents/${id}/drafts/${version}`),
  saveDraft: (id: string, input: { content: string; name: string; kind: 'auto' | 'manual' }, keepalive = false) =>
    request<SaveDraftResult>(`/documents/${id}/drafts`, json('POST', input, { keepalive })),
  updateDraft: (id: string, version: number, input: { draft_name: string; labels: string[] }) =>
    request<{ success: true }>(`/documents/${id}/drafts/${version}`, json('PATCH', input)),
  restoreDraft: (id: string, version: number) =>
    request<SaveDraftResult>(`/documents/${id}/drafts/${version}/restore`, json('POST')),

  listFields: () => request<MetadataField[]>('/metadata-fields'),
  createField: (input: { name: string; field_type: MetadataFieldType; options: string[] }) =>
    request<MetadataField>('/metadata-fields', json('POST', input)),
  deleteField: (fieldId: string) => request<{ success: true }>(`/metadata-fields/${fieldId}`, json('DELETE')),
  getMetadata: (id: string) => request<MetadataValues>(`/documents/${id}/metadata`),
  saveMetadata: (id: string, values: MetadataValues) =>
    request<{ success: true }>(`/documents/${id}/metadata`, json('PUT', { values })),

  listComments: (id: string) => request<DocumentComment[]>(`/documents/${id}/comments`),
  addComment: (
    id: string,
    input: { comment_type?: CommentType; body?: string; quote?: string; new_text?: string; parent_id?: string },
  ) => request<DocumentComment>(`/documents/${id}/comments`, json('POST', input)),
  commentAction: (id: string, commentId: string, action: CommentAction) =>
    request<DocumentComment>(`/documents/${id}/comments/${commentId}/${action}`, json('POST')),
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
