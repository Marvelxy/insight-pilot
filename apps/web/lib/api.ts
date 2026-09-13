export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const DOCS_URL = API_URL.replace(/\/api\/v1\/?$/, '/api/docs');

async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(`Cannot reach API at ${API_URL} — is it running? (make start)`);
  }
}

export interface Source {
  documentId: string;
  chunkIndex: number;
  content: string;
  score: number;
}

export interface ChatEvent {
  delta?: string;
  sources?: Source[];
  conversationId?: string;
  done?: boolean;
  messageId?: string;
}

export async function sseQuery(
  orgId: string,
  question: string,
  conversationId: string | undefined,
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  const res = await apiFetch(`${API_URL}/organizations/${orgId}/chat/query`, {
    method: 'POST',
    headers: authHeaders(orgId),
    body: JSON.stringify({ question, ...(conversationId ? { conversationId } : {}) }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new AuthError();
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('No stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const p of parts) {
      const line = p.trim().replace(/^data:\s*/, '');
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as ChatEvent);
      } catch {}
    }
  }
}

export class AuthError extends Error {
  constructor(message = 'Sign in required') {
    super(message);
    this.name = 'AuthError';
  }
}

function storedToken(): string | null {
  try {
    return localStorage.getItem('insightpilot-token');
  } catch {
    return null;
  }
}

/** Bearer headers — throws AuthError when logged out (no silent dev-user). */
function authHeaders(orgId?: string): Record<string, string> {
  const token = storedToken();
  if (!token) throw new AuthError();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(orgId ? { 'x-org-id': orgId } : {}),
  };
}

function uploadHeaders(orgId: string): Record<string, string> {
  const token = storedToken();
  if (!token) throw new AuthError();
  return { Authorization: `Bearer ${token}`, 'x-org-id': orgId };
}

export interface DocSummary {
  id: string;
  filename: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  chunkCount: number;
  createdAt: string;
}

export async function uploadDocument(orgId: string, file: File): Promise<DocSummary> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`${API_URL}/organizations/${orgId}/documents/upload`, {
    method: 'POST',
    // Never set Content-Type here — the browser adds multipart + boundary itself.
    headers: uploadHeaders(orgId),
    body: form,
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`Upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function fetchDocuments(orgId: string): Promise<DocSummary[]> {
  const res = await apiFetch(`${API_URL}/organizations/${orgId}/documents`, {
    headers: authHeaders(orgId),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`List ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function fetchDocStatus(orgId: string, docId: string): Promise<DocSummary> {
  const res = await apiFetch(`${API_URL}/organizations/${orgId}/documents/${docId}/status`, {
    headers: authHeaders(orgId),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`Status ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function deleteDocument(orgId: string, docId: string): Promise<{ id: string; deleted: boolean }> {
  const res = await apiFetch(`${API_URL}/organizations/${orgId}/documents/${docId}`, {
    method: 'DELETE',
    headers: authHeaders(orgId),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`Delete ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export async function fetchOrganizations(): Promise<OrgSummary[]> {
  const res = await apiFetch(`${API_URL}/organizations`, { headers: authHeaders() });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`Orgs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org';
  return `${base}-${Math.floor(Math.random() * 0xffff).toString(16)}`;
}

export async function createOrganization(name: string): Promise<OrgSummary> {
  const res = await apiFetch(`${API_URL}/organizations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: name.trim(), slug: slugify(name) }),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`Create ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export interface AuthResult {
  access_token: string;
  user: { id: string; email: string; name: string | null };
  orgId: string;
  role?: string;
}

export async function register(email: string, password: string, name?: string): Promise<AuthResult> {
  const res = await apiFetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
  });
  if (!res.ok) throw new Error(`Register ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function login(email: string, password: string, orgId?: string): Promise<AuthResult> {
  const res = await apiFetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(orgId ? { orgId } : {}) }),
  });
  if (!res.ok) throw new Error(`Login ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
