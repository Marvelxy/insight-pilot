import type { DocSummary, Source } from '../lib/api';

/** Colored status pill for document ingestion state. */
export function StatusBadge({ status }: { status: DocSummary['status'] }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

/** Renders [1]-style citation markers as styled superscripts. */
export function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\[\d+\]$/.test(part) ? (
          <sup key={i} className="cite">
            {part}
          </sup>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Expandable citation list under an assistant message. */
export function Sources({
  sources,
  docNames,
}: {
  sources: Source[];
  docNames: Record<string, string>;
}) {
  if (sources.length === 0) return null;
  return (
    <details className="sources">
      <summary>
        {sources.length} source{sources.length === 1 ? '' : 's'}
      </summary>
      <ol>
        {sources.map((s, i) => (
          <li key={`${s.documentId}-${s.chunkIndex}-${i}`}>
            <span className="source-doc">
              {docNames[s.documentId] ?? s.documentId} · chunk {s.chunkIndex}
            </span>
            <span className="source-text">{s.content.slice(0, 400)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Relative date for document rows (falls back to locale date). */
export function formatDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(t).toLocaleDateString();
}
