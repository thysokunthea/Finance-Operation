import { env } from 'cloudflare:workers';
import type { ChatGPTUser } from '@/app/chatgpt-auth';

const organizationId = 'ledgerflow-org';

export type ComplianceSettings = {
  jurisdiction: string;
  reportingFramework: string;
  taxpayerClassification: string;
  statutoryCurrency: string;
  secondaryCurrency: string;
  recordLanguage: string;
  standardVatRate: number;
  fiscalYearStartMonth: number;
  recordRetentionYears: number;
  gdtFilingMethod: string;
  reviewedAt?: string;
};

export const defaultComplianceSettings: ComplianceSettings = {
  jurisdiction: 'Cambodia',
  reportingFramework: 'CIFRS for SMEs',
  taxpayerClassification: 'Unconfirmed',
  statutoryCurrency: 'KHR',
  secondaryCurrency: 'USD',
  recordLanguage: 'Khmer + English',
  standardVatRate: 10,
  fiscalYearStartMonth: 1,
  recordRetentionYears: 10,
  gdtFilingMethod: 'Online',
};

export async function getComplianceSettings(): Promise<ComplianceSettings> {
  const row =
    await env.DB.prepare(`SELECT new_json AS settingsJson, occurred_at AS reviewedAt
    FROM audit_logs WHERE organization_id = ? AND resource_type = 'compliance_settings'
    AND resource_id = ? ORDER BY occurred_at DESC LIMIT 1`)
      .bind(organizationId, organizationId)
      .first<{ settingsJson: string | null; reviewedAt: string }>();
  if (!row?.settingsJson) return defaultComplianceSettings;
  try {
    return {
      ...defaultComplianceSettings,
      ...(JSON.parse(row.settingsJson) as ComplianceSettings),
      reviewedAt: row.reviewedAt,
    };
  } catch {
    return defaultComplianceSettings;
  }
}

export async function saveComplianceSettings(
  settings: ComplianceSettings,
  user: ChatGPTUser,
): Promise<ComplianceSettings> {
  if (
    !['CIFRS', 'CIFRS for SMEs', 'CRFRF', 'CFRS for NFPEs'].includes(
      settings.reportingFramework,
    )
  )
    throw new Error('Select a recognized Cambodian reporting framework.');
  if (
    ![
      'Unconfirmed',
      'Small taxpayer',
      'Medium taxpayer',
      'Large taxpayer',
    ].includes(settings.taxpayerClassification)
  )
    throw new Error('Select a valid taxpayer classification.');
  if (settings.standardVatRate < 0 || settings.standardVatRate > 100)
    throw new Error('VAT rate must be between 0% and 100%.');
  if (settings.recordRetentionYears < 10)
    throw new Error(
      'Cambodian accounting records must be retained for at least 10 years.',
    );
  if (settings.fiscalYearStartMonth !== 1)
    throw new Error(
      'Cambodia statutory accounting years start in January unless special authorization applies.',
    );

  const previous = await getComplianceSettings();
  const actorUserId = `user-${stableKey(user.userId)}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES (?, ?, ?, ?, ?, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email,
      display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`).bind(
      actorUserId,
      organizationId,
      user.userId,
      user.email,
      user.displayName,
    ),
    env.DB.prepare(`UPDATE organizations SET functional_currency = 'KHR', timezone = 'Asia/Phnom_Penh',
      fiscal_year_start_month = 1, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ?`).bind(
      organizationId,
    ),
    env.DB.prepare(`INSERT INTO audit_logs (id, organization_id, actor_user_id, action, resource_type,
      resource_id, previous_json, new_json, reason, correlation_id) VALUES (?, ?, ?, 'update',
      'compliance_settings', ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(),
      organizationId,
      actorUserId,
      organizationId,
      JSON.stringify(previous),
      JSON.stringify(settings),
      'Cambodia accounting and GDT compliance profile reviewed.',
      crypto.randomUUID(),
    ),
  ]);
  return getComplianceSettings();
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}
