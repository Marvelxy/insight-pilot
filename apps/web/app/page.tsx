'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthError,
  DOCS_URL,
  createOrganization,
  deleteDocument,
  fetchDocStatus,
  fetchDocuments,
  fetchOrganizations,
  login,
  register,
  sseQuery,
  uploadDocument,
  type DocSummary,
  type OrgSummary,
  type Source,
} from '../lib/api';
import { AnswerText, Sources, StatusBadge, formatDate } from './components';

// Override with NEXT_PUBLIC_DEMO_ORG_ID in apps/web/.env.local if you re-seed.
const DEFAULT_ORG_ID = process.env.NEXT_PUBLIC_DEMO_ORG_ID ?? 'cmtti1unc00019ka9slq5q44u';

const SUGGESTIONS = [
  'What is this document about?',
  'Summarize the key points',
  'List any dates, names or numbers mentioned',
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

function rid(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function storedTokenSync(): string | null {
  try {
    return localStorage.getItem('insightpilot-token');
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageBubble({
  message,
  showCursor,
  docNames,
}: {
  message: ChatMessage;
  showCursor: boolean;
  docNames: Record<string, string>;
}) {
  if (message.role === 'user') {
    return <div className="msg msg-user">{message.content}</div>;
  }
  return (
    <div className="msg msg-assistant">
      <AnswerText text={message.content} />
      {showCursor && <span className="cursor" aria-hidden />}
      {message.sources && <Sources sources={message.sources} docNames={docNames} />}
    </div>
  );
}

export default function Page() {
  const [q, setQ] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [convId, setConvId] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [orgId, setOrgId] = useState<string>(() => {
    try {
      return localStorage.getItem('insightpilot-org') || DEFAULT_ORG_ID;
    } catch {
      return DEFAULT_ORG_ID;
    }
  });
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadTone, setUploadTone] = useState<'info' | 'ok' | 'err'>('info');
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const docNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of docs) map[d.id] = d.filename;
    return map;
  }, [docs]);

  const refreshDocs = useCallback(async () => {
    if (!storedTokenSync()) return;
    try {
      setDocs(await fetchDocuments(orgId));
    } catch (e) {
      handleAuthError(e, 'Failed to load documents');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const loadOrgs = useCallback(async () => {
    if (!storedTokenSync()) return;
    try {
      setOrgs(await fetchOrganizations());
    } catch (e) {
      handleAuthError(e, 'Failed to load organizations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doAuth() {
    if (!authEmail.trim() || authPassword.length < 8 || authBusy) return;
    setAuthBusy(true);
    setError('');
    try {
      const res =
        authMode === 'login'
          ? await login(authEmail.trim(), authPassword)
          : await register(authEmail.trim(), authPassword, authName.trim() || undefined);
      try {
        localStorage.setItem('insightpilot-token', res.access_token);
        localStorage.setItem('insightpilot-user', res.user.email);
        if (res.orgId) localStorage.setItem('insightpilot-org', res.orgId);
      } catch {}
      setToken(res.access_token);
      setUserEmail(res.user.email);
      if (res.orgId) setOrgId(res.orgId);
      setAuthPassword('');
      loadOrgs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auth failed');
    } finally {
      setAuthBusy(false);
    }
  }

  function logout() {
    try {
      localStorage.removeItem('insightpilot-token');
      localStorage.removeItem('insightpilot-user');
    } catch {}
    if (pollRef.current) clearInterval(pollRef.current);
    setToken(null);
    setUserEmail('');
    setOrgs([]);
    setDocs([]);
    setMessages([]);
    setConvId(undefined);
    setError('');
  }

  function handleAuthError(e: unknown, fallback: string) {
    if (e instanceof AuthError) {
      logout();
      setError('Session expired — please sign in again.');
    } else {
      setError(e instanceof Error ? e.message : fallback);
    }
  }

  function selectOrg(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    setOrgId(id);
    try {
      localStorage.setItem('insightpilot-org', id);
    } catch {}
    setMessages([]);
    setConvId(undefined);
    setError('');
    setUploadMsg('');
    setFile(null);
  }

  async function createOrg() {
    const name = newOrgName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError('');
    try {
      const org = await createOrganization(name);
      setOrgs((prev) => [...prev, org]);
      setNewOrgName('');
      setShowNewOrg(false);
      selectOrg(org.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    try {
      setToken(localStorage.getItem('insightpilot-token'));
      setUserEmail(localStorage.getItem('insightpilot-user') ?? '');
    } catch {}
    setAuthInitialized(true);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (token) loadOrgs();
  }, [token, loadOrgs]);

  // Previously selected org may be gone (re-seed) — fall back to the first.
  useEffect(() => {
    if (orgs.length > 0 && !orgs.some((o) => o.id === orgId)) {
      selectOrg(orgs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs]);

  useEffect(() => {
    if (token) refreshDocs();
  }, [token, refreshDocs]);

  // Keep the thread pinned to the latest message while streaming.
  useEffect(() => {
    const el = threadRef.current;
    if (el && loading) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function ask(text?: string) {
    const question = (text ?? q).trim();
    if (!question || loading) return;
    setQ('');
    setError('');
    setLoading(true);
    const assistantId = rid();
    setMessages((m) => [
      ...m,
      { id: rid(), role: 'user', content: question },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    try {
      let conv = convId;
      let captured = false;
      await sseQuery(orgId, question, convId, (e) => {
        if (e.conversationId) conv = e.conversationId;
        if (e.delta) {
          const delta = e.delta;
          setMessages((m) =>
            m.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg)),
          );
        }
        if (e.sources && !captured) {
          captured = true;
          const sources = e.sources;
          setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, sources } : msg)));
        }
      });
      if (conv) setConvId(conv);
    } catch (e) {
      handleAuthError(e, 'Request failed');
      setMessages((m) => m.filter((msg) => msg.id !== assistantId || msg.content !== ''));
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setMessages([]);
    setConvId(undefined);
    setError('');
  }

  function pickFile(f: File | null) {
    if (f) {
      setFile(f);
      setUploadMsg('');
    }
  }

  async function removeDoc(doc: DocSummary) {
    if (deletingId) return;
    if (!window.confirm(`Delete "${doc.filename}"? This removes it for the whole organization.`)) return;
    setDeletingId(doc.id);
    setError('');
    try {
      await deleteDocument(orgId, doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setUploadTone('ok');
      setUploadMsg(`Deleted ${doc.filename}.`);
    } catch (e) {
      if (e instanceof AuthError) {
        handleAuthError(e, 'Delete failed');
      } else {
        setError(e instanceof Error ? e.message : 'Delete failed');
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadMsg('Uploading…');
    setUploadTone('info');
    setError('');
    try {
      const doc = await uploadDocument(orgId, file);
      setUploadMsg(`Uploaded ${doc.filename} — ingesting…`);
      setFile(null);
      await refreshDocs();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetchDocStatus(orgId, doc.id);
          await refreshDocs();
          if (s.status === 'READY') {
            if (pollRef.current) clearInterval(pollRef.current);
            setUploadTone('ok');
            setUploadMsg(`Ready: ${s.filename} (${s.chunkCount} chunks) — ask anything below.`);
          } else if (s.status === 'FAILED') {
            if (pollRef.current) clearInterval(pollRef.current);
            setUploadTone('err');
            setUploadMsg(`Ingestion failed for ${s.filename}. Check the worker logs.`);
          }
        } catch (e) {
          if (pollRef.current) clearInterval(pollRef.current);
          setUploadTone('err');
          setUploadMsg(e instanceof Error ? e.message : 'Status check failed');
        }
      }, 2000);
    } catch (e) {
      setUploadTone('err');
      setUploadMsg(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (!authInitialized) {
    return null;
  }

  if (!token) {
    return (
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2-6.3-4.5-6.3 4.5L8 13.8 2 9.2h7.6L12 2z"
                  fill="#fff"
                />
              </svg>
            </span>
            <span>
              <span className="brand-name">InsightPilot</span>
              <br />
              <span className="brand-sub">RAG console</span>
            </span>
          </div>
          <div className="topbar-right">
            <a className="link-btn" href={DOCS_URL} target="_blank" rel="noreferrer">
              API docs
            </a>
          </div>
        </header>

        <section className="hero">
          <h1>
            Chat your docs, <span className="grad">with receipts.</span>
          </h1>
          <p>Sign in to upload documents and ask questions — every answer cites its sources.</p>
        </section>

        <section className="card auth-gate" style={{ maxWidth: 420, margin: '0 auto' }}>
          <div className="card-head">
            <h2>{authMode === 'login' ? 'Sign in' : 'Create account'}</h2>
          </div>
          <p className="card-sub">
            {authMode === 'login' ? 'Password login with bcrypt + JWT.' : 'New accounts get a personal workspace.'}
          </p>
          {authMode === 'register' && (
            <input
              value={authName}
              onChange={(e) => setAuthName(e.target.value)}
              placeholder="Name (optional)"
              maxLength={60}
              style={{ marginBottom: 10 }}
            />
          )}
          <input
            autoFocus
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doAuth();
            }}
            placeholder="you@example.com"
            type="email"
            style={{ marginBottom: 10 }}
          />
          <input
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doAuth();
            }}
            placeholder="Password (min 8 chars)"
            type="password"
            style={{ marginBottom: 10 }}
          />
          {error && <div className="error-box" style={{ marginTop: 0, marginBottom: 12 }}>{error}</div>}
          <button
            className="btn btn-block"
            onClick={doAuth}
            disabled={!authEmail.trim() || authPassword.length < 8 || authBusy}
            style={{ marginTop: 0 }}
          >
            {authBusy ? '…' : authMode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <p className="note" style={{ textAlign: 'center' }}>
            {authMode === 'login' ? 'No account yet? ' : 'Already have an account? '}
            <button
              className="link-btn"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {authMode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </section>

        <footer className="foot">InsightPilot · NestJS + Next.js + BullMQ</footer>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2-6.3-4.5-6.3 4.5L8 13.8 2 9.2h7.6L12 2z"
                fill="#fff"
              />
            </svg>
          </span>
          <span>
            <span className="brand-name">InsightPilot</span>
            <br />
            <span className="brand-sub">RAG console</span>
          </span>
        </div>
        <div className="topbar-right">
          <select
            className="org-select"
            value={orgId}
            onChange={(e) => selectOrg(e.target.value)}
            title="Switch organization"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button className="link-btn" onClick={() => setShowNewOrg(true)}>
            + New org
          </button>
          <button className="link-btn" onClick={logout} title={userEmail || 'Signed in'}>
            {userEmail ? `Logout (${userEmail.split('@')[0]})` : 'Logout'}
          </button>
          <a className="link-btn" href={DOCS_URL} target="_blank" rel="noreferrer">
            API docs
          </a>
        </div>
      </header>

      <section className="hero">
        <h1>
          Chat your docs, <span className="grad">with receipts.</span>
        </h1>
        <p>Upload PDFs or text, wait for ingestion, then ask — every answer cites its sources.</p>
      </section>

      <div className="grid">
        <div className="side">
          <section className="card">
            <h2>Upload a document</h2>
            <p className="card-sub">PDF, TXT or Markdown · up to 25 MB</p>
            <div
              className={`dropzone${dragging ? ' dragging' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <span>
                  Selected <strong>{file.name}</strong>
                </span>
              ) : (
                <span>
                  Drag a file here or <strong>browse</strong>
                </span>
              )}
            </div>
            {file && (
              <div className="file-row">
                <span>
                  {file.name} · {formatSize(file.size)}
                </span>
                <button className="icon-btn" onClick={() => setFile(null)}>
                  ✕
                </button>
              </div>
            )}
            <button className="btn btn-block" onClick={upload} disabled={!file || uploading}>
              {uploading ? 'Uploading…' : 'Upload & ingest'}
            </button>
            {uploadMsg && (
              <p
                className="note"
                style={
                  uploadTone === 'ok'
                    ? { color: 'var(--ok)' }
                    : uploadTone === 'err'
                      ? { color: 'var(--err)' }
                      : undefined
                }
              >
                {uploadMsg}
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Documents ({docs.length})</h2>
              <button className="icon-btn" onClick={refreshDocs} title="Refresh">
                ↻
              </button>
            </div>
            <p className="card-sub">Click a ready document to ask about it</p>
            {docs.length === 0 ? (
              <p className="empty">No documents yet — upload one above to get started.</p>
            ) : (
              <ul className="doc-list">
                {docs.map((d) => (
                  <li key={d.id} className="doc-item">
                    <button
                      className={`doc-row doc-row-main${d.status === 'READY' ? ' clickable' : ''}`}
                      disabled={d.status !== 'READY'}
                      onClick={() => setQ(`What is ${d.filename} about?`)}
                      title={d.status === 'READY' ? 'Ask about this document' : d.status}
                    >
                      <span className="doc-name">{d.filename}</span>
                      <span className="doc-meta">
                        <StatusBadge status={d.status} />
                        {d.status === 'READY' && <span>{d.chunkCount} chunks</span>}
                        <span>{formatDate(d.createdAt)}</span>
                      </span>
                    </button>
                    <button
                      className="icon-btn doc-delete"
                      onClick={() => removeDoc(d)}
                      disabled={deletingId === d.id}
                      title={`Delete ${d.filename}`}
                      aria-label={`Delete ${d.filename}`}
                    >
                      {deletingId === d.id ? '…' : '🗑'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Ask questions</h2>
            {messages.length > 0 && (
              <button className="icon-btn" onClick={newChat}>
                + New chat
              </button>
            )}
          </div>
          <p className="card-sub">Answers stream back with cited sources</p>

          <div className="thread" ref={threadRef}>
            {messages.length === 0 ? (
              <div className="thread-empty">
                <div className="big">✦</div>
                <p>Upload a document, wait for READY, then ask anything.</p>
                <div className="chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="chip" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  showCursor={loading && i === messages.length - 1}
                  docNames={docNames}
                />
              ))
            )}
          </div>

          <div className="composer">
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
              rows={2}
              placeholder="Ask about your documents… (Enter to send)"
            />
            <button className="btn" onClick={() => ask()} disabled={loading || !q.trim()}>
              {loading ? '…' : 'Ask'}
            </button>
          </div>
          {error && <div className="error-box">{error}</div>}
        </section>
      </div>

      <footer className="foot">
        InsightPilot · NestJS + Next.js + BullMQ · org <code>{orgId}</code>
      </footer>

      {showNewOrg && (
        <div className="modal-overlay" onClick={() => setShowNewOrg(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New organization</h2>
            <p className="card-sub">You become its OWNER. A URL slug is generated for you.</p>
            <input
              autoFocus
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createOrg();
                if (e.key === 'Escape') setShowNewOrg(false);
              }}
              placeholder="e.g. Acme Inc"
              maxLength={60}
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowNewOrg(false)}>
                Cancel
              </button>
              <button className="btn" onClick={createOrg} disabled={!newOrgName.trim() || creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
