import { query } from '@/db/neon';
import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import { listDocuments, uploadDocument, reviewDocument } from '@/db/documents';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    authorize(user, 'read');
    const missing = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM transactions t WHERE t.organization_id=$1 AND t.posting_status != 'deleted' AND NOT EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=t.organization_id AND d.linked_transaction_id=t.id AND d.status='Verified')`,
      [user.organizationId],
    );
    return Response.json(
      {
        missingEvidenceCount: Number(missing[0].count),
        documents: await listDocuments(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Documents could not be loaded.',
      },
      {
        status:
          error instanceof Error && error.message.startsWith('Forbidden:')
            ? 403
            : 500,
      },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    authorize(user, 'write');
    const body = (await request.json()) as {
      fileName: string;
      mimeType: string;
      contentBase64: string;
      category?: string;
      linkedReference?: string;
    };
    return Response.json({ document: await uploadDocument(body, user) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Document could not be uploaded.',
      },
      {
        status:
          error instanceof Error && error.message.startsWith('Forbidden:')
            ? 403
            : 400,
      },
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    return Response.json({
      documents: await reviewDocument(await request.json(), user),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Review failed.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 400 },
    );
  }
}
