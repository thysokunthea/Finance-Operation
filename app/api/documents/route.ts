import { getChatGPTUser } from '@/app/chatgpt-auth';
import { listDocuments, uploadDocument } from '@/db/documents';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    return Response.json({ documents: await listDocuments() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Documents could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const body = await request.json() as { fileName: string; mimeType: string; contentBase64: string; category?: string; linkedReference?: string };
    return Response.json({ document: await uploadDocument(body, user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Document could not be uploaded.' }, { status: 400 });
  }
}
