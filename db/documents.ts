import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

const organizationId = 'ledgerflow-org';
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

export type DocumentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  status: string;
  linkedReference: string | null;
  uploadedBy: string;
  createdAt: string;
};

export async function listDocuments(): Promise<DocumentSummary[]> {
  const rows = await query<{
    id: string; filename: string; mimetype: string; sizebytes: number;
    category: string; status: string; linkedreference: string | null;
    uploadedby: string | null; createdat: string;
  }>(`
    SELECT d.id, d.file_name AS filename, d.mime_type AS mimetype, d.size_bytes AS sizebytes,
      d.category, d.status, d.linked_reference AS linkedreference,
      COALESCE(u.display_name, 'Unknown') AS uploadedby, d.created_at AS createdat
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.organization_id = $1
    ORDER BY d.created_at DESC
  `, [organizationId]);

  return rows.map((row) => ({
    id: row.id,
    fileName: row.filename,
    mimeType: row.mimetype,
    sizeBytes: Number(row.sizebytes),
    category: row.category,
    status: row.status,
    linkedReference: row.linkedreference,
    uploadedBy: row.uploadedby || 'Unknown',
    createdAt: row.createdat,
  }));
}

export async function uploadDocument(
  input: { fileName: string; mimeType: string; contentBase64: string; category?: string; linkedReference?: string },
  user: ChatGPTUser,
): Promise<DocumentSummary> {
  if (!input.fileName || !input.contentBase64) throw new Error('A file name and file content are required.');
  const sizeBytes = Math.ceil((input.contentBase64.length * 3) / 4);
  if (sizeBytes > MAX_SIZE_BYTES) throw new Error('Files are limited to 8 MB.');

  const id = crypto.randomUUID();
  const userId = `user-${stableKey(user.userId)}`;
  await executeBatch([
    { text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, 'LedgerFlow Organization', 'LEDGERFLOW', 'KHR', 'Asia/Phnom_Penh', 1)
      ON CONFLICT(id) DO NOTHING`, parameters: [organizationId] },
    { text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email,
      display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`, parameters: [userId, organizationId, user.userId, user.email, user.displayName] },
    { text: `INSERT INTO documents (id, organization_id, file_name, mime_type, size_bytes, category, status, linked_reference, content_base64, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'Verified', $7, $8, $9)`, parameters: [id, organizationId, input.fileName, input.mimeType || 'application/octet-stream', sizeBytes, input.category || 'Other', input.linkedReference || null, input.contentBase64, userId] },
  ]);

  const saved = (await listDocuments()).find((d) => d.id === id);
  if (!saved) throw new Error('Document was uploaded but could not be reloaded.');
  return saved;
}

export async function getDocumentContent(id: string): Promise<{ fileName: string; mimeType: string; contentBase64: string } | null> {
  const row = (await query<{ filename: string; mimetype: string; content: string }>(`
    SELECT file_name AS filename, mime_type AS mimetype, content_base64 AS content
    FROM documents WHERE id = $1 AND organization_id = $2
  `, [id, organizationId]))[0];
  if (!row) return null;
  return { fileName: row.filename, mimeType: row.mimetype, contentBase64: row.content };
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}
