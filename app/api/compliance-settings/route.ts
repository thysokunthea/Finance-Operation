import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  getComplianceSettings,
  saveComplianceSettings,
  type ComplianceSettings,
} from '@/db/compliance-settings';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    return Response.json(
      { settings: await getComplianceSettings() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Compliance settings could not be loaded.',
      },
      { status: 500 },
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
    return Response.json({
      settings: await saveComplianceSettings(
        (await request.json()) as ComplianceSettings,
        user,
      ),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Compliance settings could not be saved.',
      },
      { status: 400 },
    );
  }
}
