import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import { getDocumentContent } from '@/db/documents';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    authorize(user);
    const { id } = await params;
    const document = await getDocumentContent(id);
    if (!document)
      return Response.json({ error: 'Document not found.' }, { status: 404 });
    const bytes = Buffer.from(document.contentBase64, 'base64');
    return new Response(bytes, {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(document.fileName)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=0, no-cache',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 500 },
    );
  }
}
