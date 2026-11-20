import { authorize, type ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from './neon';

export type Vendor = {
  id: string;
  name: string;
  kind: 'Vendor' | 'Supplier' | 'Both';
  email: string;
  phone: string;
  address: string;
  taxId: string;
  contact: string;
  status: 'Active' | 'Inactive';
  version: number;
};
type Stored = {
  id: string;
  name: string;
  type: string;
  contact_json: string;
  version: number;
};
export async function listVendors(user: ChatGPTUser): Promise<Vendor[]> {
  authorize(user, 'read');
  const rows = await query<Stored>(
    "SELECT id,name,type,contact_json,version FROM counterparties WHERE organization_id=$1 AND (type IN ('vendor','supplier') OR contact_json!='{}') ORDER BY name,id",
    [user.organizationId],
  );
  return rows.map((row) => {
    const info = JSON.parse(row.contact_json || '{}');
    return {
      id: row.id,
      name: row.name,
      kind: info.kind || (row.type === 'supplier' ? 'Supplier' : 'Vendor'),
      email: info.email || '',
      phone: info.phone || '',
      address: info.address || '',
      taxId: info.taxId || '',
      contact: info.contact || '',
      status: info.status || 'Active',
      version: row.version,
    };
  });
}
export async function saveVendor(input: Partial<Vendor>, user: ChatGPTUser) {
  authorize(user, 'write');
  const clean = (value: unknown, max: number) => {
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > max)
      throw new Error('Invalid contact field.');
    return value.trim();
  };
  const name = clean(input.name, 200);
  if (!name) throw new Error('Vendor / supplier name is required.');
  const kind = input.kind || 'Vendor',
    status = input.status || 'Active';
  if (
    !['Vendor', 'Supplier', 'Both'].includes(kind) ||
    !['Active', 'Inactive'].includes(status)
  )
    throw new Error('Invalid vendor type or status.');
  const info = {
    kind,
    status,
    email: clean(input.email, 254),
    phone: clean(input.phone, 80),
    address: clean(input.address, 1000),
    taxId: clean(input.taxId, 100),
    contact: clean(input.contact, 200),
  };
  if (info.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email))
    throw new Error('Enter a valid email address.');
  const id = input.id || crypto.randomUUID();
  const statements: Array<{ text: string; parameters: unknown[] }> = [
    {
      text: "INSERT INTO organizations(id,name,code) VALUES($1,'LedgerFlow Organization',$1) ON CONFLICT(id) DO NOTHING",
      parameters: [user.organizationId],
    },
    {
      text: "SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM counterparties WHERE organization_id=$1 AND LOWER(TRIM(name))=LOWER($2) AND id!=$3), 'A counterparty with this name already exists. Edit the existing contact.')",
      parameters: [user.organizationId, name, id],
    },
  ];
  if (input.id)
    statements.push(
      {
        text: "SELECT ledgerflow_assert(EXISTS(SELECT 1 FROM counterparties WHERE id=$1 AND organization_id=$2 AND version=$3), 'Contact changed or is unavailable. Reload and try again.')",
        parameters: [id, user.organizationId, input.version || 0],
      },
      {
        text: 'UPDATE counterparties SET name=$3,contact_json=$4,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2',
        parameters: [id, user.organizationId, name, JSON.stringify(info)],
      },
    );
  else
    statements.push({
      text: "INSERT INTO counterparties(id,organization_id,type,code,name,contact_json) VALUES($1,$2,'vendor',$1,$3,$4)",
      parameters: [id, user.organizationId, name, JSON.stringify(info)],
    });
  statements.push({
    text: "INSERT INTO audit_logs(id,organization_id,action,resource_type,resource_id,new_json,correlation_id) VALUES($1,$2,'vendor_save','counterparty',$3,$4,$1)",
    parameters: [
      crypto.randomUUID(),
      user.organizationId,
      id,
      JSON.stringify({ name, ...info, actor: user.userId }),
    ],
  });
  await executeBatch(statements, { organizationId: user.organizationId });
  return listVendors(user);
}
