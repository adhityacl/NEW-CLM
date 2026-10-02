/**
 * Deterministic demo dataset used on first run and by "Reset → load demo data".
 * All organizations, people, addresses, e-mail domains, and identifiers are fictional.
 */
import { resolveTenantSettings } from '../lib/policy';

type Row = Record<string, any>;

export interface DemoDataset {
  tenants: Row[];
  departments: Row[];
  allowedUsers: Row[];
  partners: Row[];
  contracts: Row[];
  ios: Row[];
  spendings: Row[];
  evaluations: Row[];
  notifications: Row[];
  activityLogs: Row[];
}

const ID = 'org-demo-id';
const MY = 'org-demo-my';
const PH = 'org-demo-ph';

function tenant(id: string, name: string, legalEntity: string, countryCode: string, industry: string, isDefault = false): Row {
  const settings = resolveTenantSettings({ settings: { countryCode, industry: industry as any } });
  return {
    id,
    name,
    legalEntity,
    brandName: name,
    tagline: 'Contract Lifecycle Management',
    logoUrl: '/favicon.png',
    primaryColor: '#06C755',
    currency: settings.defaultCurrency,
    settings,
    domainSlug: id.replace(/^org-/, ''),
    isDefault,
    spreadsheetId: '',
    driveFolderId: '',
  };
}

// Fixed varied packs keep reset results reproducible while representing a random mix.
export const DEMO_TENANTS: Row[] = [
  tenant(ID, 'PT Nusantara Digital Finansial', 'PT (Perseroan Terbatas)', 'ID', 'p2p_lending', true),
  tenant(MY, 'Runcit Maju Sdn. Bhd.', 'Sendirian Berhad (Sdn. Bhd.)', 'MY', 'retail_franchise'),
  tenant(PH, 'Luzon Cloud Solutions, Inc.', 'Corporation', 'PH', 'b2b_saas'),
];

const pad = (value: number) => String(value).padStart(2, '0');
const date = (month: number, day = 15) => `2026-${pad(month)}-${pad(day)}`;
const timestamp = (month: number, day = 15) => `${date(month, day)}T09:00:00.000Z`;

export function buildDemoDataset(_now: Date = new Date()): DemoDataset {
  const organizations = [
    {
      id: ID,
      prefix: 'ID',
      partnerCount: 10,
      months: [1, 2, 3, 4, 5, 6],
      currency: 'IDR',
      partnerPrefix: 'PT Mitra Nusantara',
      contactPrefix: 'Ayu',
      phonePrefix: '+62215550',
      contractValue: 600_000_000,
      orderValue: 100_000_000,
      spendingValue: 12_500_000,
      pricingModel: 'Per Transaction',
    },
    {
      id: MY,
      prefix: 'MY',
      partnerCount: 5,
      months: [1, 2, 3],
      currency: 'MYR',
      partnerPrefix: 'Mitra Niaga Malaysia',
      contactPrefix: 'Nur',
      phonePrefix: '+6035550',
      contractValue: 180_000,
      orderValue: 30_000,
      spendingValue: 4_500,
      pricingModel: 'Unit Price',
    },
    {
      id: PH,
      prefix: 'PH',
      partnerCount: 0,
      months: [],
      currency: 'PHP',
      partnerPrefix: 'Philippines Partner',
      contactPrefix: 'Maria',
      phonePrefix: '+63285550',
      contractValue: 0,
      orderValue: 0,
      spendingValue: 0,
      pricingModel: 'Subscription',
    },
  ];

  const partners: Row[] = [];
  const contracts: Row[] = [];
  const ios: Row[] = [];
  const spendings: Row[] = [];

  for (const organization of organizations) {
    for (let index = 1; index <= organization.partnerCount; index += 1) {
      const suffix = pad(index);
      const partnerId = `PRT-${organization.prefix}-${suffix}`;
      const contractId = `CTR-${organization.prefix}-${suffix}`;
      const partnerName = `${organization.partnerPrefix} ${suffix}`;
      const email = `contact.${organization.prefix.toLowerCase()}${suffix}@example.com`;
      const phone = `${organization.phonePrefix}${suffix}`;

      partners.push({
        partner_id: partnerId,
        organizationId: organization.id,
        nama_partner: partnerName,
        country: organization.prefix,
        entity_type: organization.prefix === 'ID' ? 'PT (Perseroan Terbatas)' : 'Private Company',
        jenis_partner: 'Vendor',
        codename: '',
        nama_pic: `${organization.contactPrefix} ${suffix}`,
        email_pic: email,
        telepon_pic: phone,
        pic_partner: `${organization.contactPrefix} ${suffix} (${email} | ${phone})`,
        kontak_pic: `${email} / ${phone}`,
        alamat_pic: `Demo Business District ${suffix}`,
        pic_internal: 'Procurement',
        catatan: 'Synthetic demo partner.',
        tags: ['Demo Vendor'],
        identifiers: [],
        daftar_dokumen_dd: [],
        link_folder_dd: '',
        created_at: timestamp(1, index),
        updated_at: timestamp(7, 1),
      });

      contracts.push({
        contract_id: contractId,
        organizationId: organization.id,
        jenis_dokumen: 'Master Agreement',
        nomor_kontrak: `${organization.prefix}/MSA/2026/${suffix}`,
        judul_kontrak: `Master Services Agreement ${partnerName}`,
        partner_id: partnerId,
        partner_nama: partnerName,
        kategori_kerjasama: ['Vendor Services'],
        tanggal_mulai: date(1, 1),
        tanggal_berakhir: date(12, 31),
        currency: organization.currency,
        nilai_kontrak: organization.contractValue + index * organization.spendingValue,
        auto_renewal: index % 2 === 0,
        notice_period_hari: 30,
        notice_type_required: 'Termination',
        status: 'Active',
        status_approval: 'Signed',
        pic_internal: 'Legal',
        link_file_kontrak: '',
        internal_notes: 'Synthetic demo contract for 2026.',
        created_at: timestamp(1, index),
        updated_at: timestamp(7, 1),
      });

      ios.push({
        io_id: `IO-${organization.prefix}-${suffix}`,
        organizationId: organization.id,
        contract_id: contractId,
        contract_nomor: `${organization.prefix}/MSA/2026/${suffix}`,
        partner_id: partnerId,
        partner_nama: partnerName,
        nomor_io: `${organization.prefix}/IO/2026/${suffix}`,
        judul_io: `2026 Service Order ${partnerName}`,
        kanal_media: 'Managed service',
        pricing_model: organization.pricingModel,
        charging_type: 'Postpaid',
        tanggal_mulai: date(1, 1),
        tanggal_berakhir: date(12, 31),
        currency: organization.currency,
        mata_uang: organization.currency,
        nilai_io: organization.orderValue + index * organization.spendingValue,
        notice_period_hari: 14,
        notice_type_required: 'Termination',
        status: 'Active',
        deliverables: 'Monthly managed service delivery.',
        internal_notes: 'Synthetic demo insertion order for 2026.',
        created_at: timestamp(1, index),
        updated_at: timestamp(7, 1),
      });

      for (const month of organization.months) {
        spendings.push({
          id: `SP-${organization.prefix}-${pad(month)}-${suffix}`,
          organizationId: organization.id,
          vendor_id: partnerId,
          vendor_name: partnerName,
          invoice_number: `${organization.prefix}-INV-2026-${pad(month)}-${suffix}`,
          invoice_date: date(month, Math.min(index + 5, 28)),
          invoice_month: [date(month, new Date(Date.UTC(2026, month, 0)).getUTCDate())],
          invoice_description: `Monthly service transaction for ${partnerName}`,
          currency: organization.currency,
          total_amount: organization.spendingValue + index * 1000,
          payment_status: month === organization.months.at(-1) ? 'Unpaid' : 'Paid',
          bank_name: 'Demo Bank',
          bank_account_number: `000-${organization.prefix}-${suffix}`,
          bank_account_holder_name: partnerName,
          created_at: timestamp(month, Math.min(index + 5, 28)),
        });
      }
    }
  }

  const createdAt = '2026-01-01T09:00:00.000Z';
  const allowedUsers: Row[] = [
    { id: 'usr-demo-id-admin', organizationId: ID, email: 'admin.id@example.com', name: 'Admin Indonesia', role: 'Admin', department: 'Legal', status: 'Active', addedBy: 'Demo dataset', createdAt },
    { id: 'usr-demo-my-admin', organizationId: MY, email: 'admin.my@example.com', name: 'Admin Malaysia', role: 'Admin', department: 'Legal', status: 'Active', addedBy: 'Demo dataset', createdAt },
    { id: 'usr-demo-ph-admin', organizationId: PH, email: 'admin.ph@example.com', name: 'Admin Filipina', role: 'Admin', department: 'Legal', status: 'Active', addedBy: 'Demo dataset', createdAt },
  ];
  const departments: Row[] = [
    { id: 'team-demo-id-legal', organizationId: ID, name: 'Legal', created_at: createdAt, updated_at: createdAt },
    { id: 'team-demo-my-legal', organizationId: MY, name: 'Legal', created_at: createdAt, updated_at: createdAt },
    { id: 'team-demo-ph-legal', organizationId: PH, name: 'Legal', created_at: createdAt, updated_at: createdAt },
  ];

  return {
    tenants: DEMO_TENANTS.map((item) => ({ ...item, settings: { ...item.settings }, created_at: createdAt, updated_at: '2026-07-01T09:00:00.000Z' })),
    departments,
    allowedUsers,
    partners,
    contracts,
    ios,
    spendings,
    evaluations: [],
    notifications: [],
    activityLogs: [],
  };
}
