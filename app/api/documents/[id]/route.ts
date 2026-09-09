import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDocumentContent } from '@/db/documents';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const document = await getDocumentContent(id);
  if (!document) return Response.json({ error: 'Document not found.' }, { status: 404 });
  const bytes = Buffer.from(document.contentBase64, 'base64');
  return new Response(bytes, {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Disposition': `inline; filename="${document.fileName.replaceAll('"', '')}"`,
      'Cache-Control': 'private, max-age=0, no-cache',
    },
  });
}
