/**
 * Demo dataset shown on first run (and after "Reset → load demo data").
 *
 * Three fictional organizations illustrate how policy packs change the
 * product per country and industry:
 *   - Demo Asia Tech Pte. Ltd.         Singapore · Technology & SaaS · SGD
 *   - PT Demo Nusantara Finansial      Indonesia · Financial Services · IDR
 *   - Demo Precision Manufacturing K.K. Japan · Manufacturing · JPY
 *
 * Every company, person, e-mail address (example.com, RFC 2606) and
 * identifier below is synthetic. Dates are relative to "today" so the demo
 * always contains active, expiring and expired records.
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

const SG = 'org-demo-sg';
const ID = 'org-demo-id';
const JP = 'org-demo-jp';

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

export const DEMO_TENANTS: Row[] = [
  tenant(SG, 'Demo Asia Tech Pte. Ltd.', 'Private Limited (Pte. Ltd.)', 'SG', 'technology', true),
  tenant(ID, 'PT Demo Nusantara Finansial', 'PT (Perseroan Terbatas)', 'ID', 'financial_services'),
  tenant(JP, 'Demo Precision Manufacturing K.K.', 'Kabushiki Kaisha (KK)', 'JP', 'manufacturing'),
];

export function buildDemoDataset(now: Date = new Date()): DemoDataset {
  const day = (offset: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
    return d.toISOString().slice(0, 10);
  };
  const ts = (offset: number) => `${day(offset)}T09:00:00.000Z`;
  const monthEnd = (monthsAgo: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
    return d.toISOString().slice(0, 10);
  };

  const doc = (key: string, status: 'Available' | 'Missing' | 'Expired', extra: Row = {}): Row => ({
    key,
    nama: key,
    status,
    wajib: false,
    files: [],
    ...extra,
  });

  const partner = (p: Row): Row => ({
    jenis_partner: 'Vendor',
    codename: '',
    pic_internal: '',
    catatan: '',
    tags: [],
    identifiers: [],
    link_folder_dd: '',
    created_at: ts(-400),
    updated_at: ts(-5),
    ...p,
    pic_partner: `${p.nama_pic} (${p.email_pic} | ${p.telepon_pic})`,
    kontak_pic: `${p.email_pic} / ${p.telepon_pic}`,
  });

  const partners: Row[] = [
    // Singapore · Technology
    partner({
      partner_id: 'P0001', organizationId: SG, nama_partner: 'Orbit Cloud Services Pte. Ltd.', country: 'SG',
      entity_type: 'Private Limited (Pte. Ltd.)', jenis_partner: 'Vendor', tags: ['Cloud Infrastructure'],
      identifiers: [{ scheme: 'sg_uen', value: '201900001D', country: 'SG' }, { scheme: 'sg_gst', value: 'M90000001X', country: 'SG' }],
      nama_pic: 'Grace Wong', email_pic: 'grace.wong@orbit-cloud.example.com', telepon_pic: '+6560000001',
      alamat_pic: '1 Demo Tech Park, Singapore 000001', pic_internal: 'Procurement',
      catatan: 'Primary cloud hosting provider for production workloads in the Singapore region.',
      daftar_dokumen_dd: [
        doc('nda', 'Available'), doc('sg_bizfile', 'Available', { tanggalKadaluarsa: day(200) }),
        doc('sg_gst_certificate', 'Available'), doc('tech_dpa', 'Available'),
        doc('tech_soc2_iso', 'Available', { tanggalKadaluarsa: day(40) }),
      ],
    }),
    partner({
      partner_id: 'P0002', organizationId: SG, nama_partner: 'Bangalore Code Labs Private Limited', country: 'IN',
      entity_type: 'Private Limited Company', tags: ['Systems Integrator'],
      identifiers: [{ scheme: 'in_pan', value: 'AAACD0000A', country: 'IN' }, { scheme: 'in_gstin', value: '29AAACD0000A1Z0', country: 'IN' }],
      nama_pic: 'Arjun Mehta', email_pic: 'arjun@codelabs.example.com', telepon_pic: '+918000000002',
      alamat_pic: '2 Demo Road, Bengaluru 560000, India', pic_internal: 'Engineering',
      catatan: 'Offshore development partner for the mobile app programme.',
      daftar_dokumen_dd: [doc('nda', 'Available'), doc('tech_dpa', 'Missing'), doc('tech_security_questionnaire', 'Available')],
    }),
    partner({
      partner_id: 'P0003', organizationId: SG, nama_partner: 'Kyoto Data Systems K.K.', country: 'JP',
      entity_type: 'Kabushiki Kaisha (KK)', tags: ['SaaS Vendor'],
      identifiers: [{ scheme: 'jp_corporate_number', value: '1000000000003', country: 'JP' }],
      nama_pic: 'Yuki Tanaka', email_pic: 'yuki@kyoto-data.example.com', telepon_pic: '+81300000003',
      alamat_pic: '3 Demo-cho, Kyoto 600-0000, Japan', pic_internal: 'Data Team',
      catatan: 'Analytics SaaS. SOC 2 report expired and must be refreshed before renewal.',
      daftar_dokumen_dd: [doc('nda', 'Available'), doc('tech_dpa', 'Available'), doc('tech_soc2_iso', 'Expired', { tanggalKadaluarsa: day(-20) })],
    }),
    partner({
      partner_id: 'P0004', organizationId: SG, nama_partner: 'Metro Retail Group Sdn. Bhd.', country: 'MY',
      entity_type: 'Sendirian Berhad (Sdn. Bhd.)', jenis_partner: 'Klien', tags: ['Customer'],
      identifiers: [{ scheme: 'my_ssm', value: '202000000004', country: 'MY' }],
      nama_pic: 'Nurul Aziz', email_pic: 'procurement@metro-retail.example.com', telepon_pic: '+60300000004',
      alamat_pic: '4 Jalan Demo, Kuala Lumpur 50000, Malaysia', pic_internal: 'Sales',
      catatan: 'Enterprise customer for the retail analytics platform.',
      daftar_dokumen_dd: [doc('nda', 'Available'), doc('tech_dpa', 'Available')],
    }),
    // Indonesia · Financial services
    partner({
      partner_id: 'P0005', organizationId: ID, nama_partner: 'PT Sinar Pembayaran Digital', country: 'ID',
      entity_type: 'PT (Perseroan Terbatas)', tags: ['Payment Provider'],
      identifiers: [{ scheme: 'id_npwp', value: '00.000.000.5-000.000', country: 'ID' }, { scheme: 'id_nib', value: '9100000000005', country: 'ID' }],
      nama_pic: 'Dewi Lestari', email_pic: 'dewi@sinar-bayar.example.com', telepon_pic: '+62210000005',
      alamat_pic: 'Jl. Demo No. 5, Jakarta 10000', pic_internal: 'Payments',
      catatan: 'Payment gateway for virtual accounts and QR payments.',
      daftar_dokumen_dd: [
        doc('nda', 'Available'), doc('id_akta', 'Available'), doc('id_nib', 'Available', { tanggalKadaluarsa: day(300) }),
        doc('id_npwp', 'Available'), doc('fs_aml_questionnaire', 'Available'),
        doc('fs_security_certification', 'Available', { tanggalKadaluarsa: day(120) }),
      ],
    }),
    partner({
      partner_id: 'P0006', organizationId: ID, nama_partner: 'PT Mitra Penagihan Sejahtera', country: 'ID',
      entity_type: 'PT (Perseroan Terbatas)', tags: ['Collection Agency'],
      identifiers: [{ scheme: 'id_npwp', value: '00.000.000.6-000.000', country: 'ID' }],
      nama_pic: 'Agus Pratama', email_pic: 'agus@mitra-tagih.example.com', telepon_pic: '+62220000006',
      alamat_pic: 'Jl. Contoh No. 6, Bandung 40000', pic_internal: 'Collections',
      catatan: 'Business licence expired; AML questionnaire outstanding.',
      daftar_dokumen_dd: [
        doc('nda', 'Available'), doc('id_nib', 'Expired', { tanggalKadaluarsa: day(-10) }),
        doc('fs_aml_questionnaire', 'Missing'),
      ],
    }),
    partner({
      partner_id: 'P0007', organizationId: ID, nama_partner: 'Lion City Credit Analytics Pte. Ltd.', country: 'SG',
      entity_type: 'Private Limited (Pte. Ltd.)', tags: ['KYC Provider'],
      identifiers: [{ scheme: 'sg_uen', value: '202100007K', country: 'SG' }],
      nama_pic: 'Marcus Lee', email_pic: 'marcus@lioncity-credit.example.com', telepon_pic: '+6560000007',
      alamat_pic: '7 Demo Street, Singapore 000007', pic_internal: 'Risk',
      catatan: 'Credit-scoring API. Foreign vendor: treaty residence certificate on file.',
      daftar_dokumen_dd: [
        doc('nda', 'Available'), doc('fs_aml_questionnaire', 'Available'),
        doc('id_cor', 'Available', { tanggalKadaluarsa: day(75) }), doc('id_dgt', 'Missing'),
      ],
    }),
    // Japan · Manufacturing
    partner({
      partner_id: 'P0008', organizationId: JP, nama_partner: 'Hanoi Components Joint Stock Company', country: 'VN',
      entity_type: 'Joint Stock Company (JSC)', tags: ['Component Supplier'],
      identifiers: [{ scheme: 'vn_tax_code', value: '0100000008', country: 'VN' }],
      nama_pic: 'Nguyen Van An', email_pic: 'an.nguyen@hanoi-components.example.com', telepon_pic: '+84240000008',
      alamat_pic: '8 Demo Industrial Zone, Hanoi, Vietnam', pic_internal: 'Supply Chain',
      catatan: 'Tier-1 supplier of machined aluminium housings.',
      daftar_dokumen_dd: [
        doc('nda', 'Available'), doc('vn_erc', 'Available'), doc('mfg_supplier_code', 'Available'),
        doc('mfg_quality_cert', 'Available', { tanggalKadaluarsa: day(400) }),
      ],
    }),
    partner({
      partner_id: 'P0009', organizationId: JP, nama_partner: 'Chonburi Logistics Co., Ltd.', country: 'TH',
      entity_type: 'Company Limited (Co., Ltd.)', tags: ['Logistics Provider'],
      identifiers: [{ scheme: 'th_tax_id', value: '0200000000009', country: 'TH' }],
      nama_pic: 'Somchai Chaiyo', email_pic: 'somchai@chonburi-logistics.example.com', telepon_pic: '+66380000009',
      alamat_pic: '9 Demo Port Road, Chonburi, Thailand', pic_internal: 'Supply Chain',
      catatan: 'Sea-freight forwarding for inbound components.',
      daftar_dokumen_dd: [doc('nda', 'Available'), doc('mfg_supplier_code', 'Missing')],
    }),
    partner({
      partner_id: 'P0010', organizationId: JP, nama_partner: 'Shenzhen Precision Molds Co., Ltd.', country: 'CN',
      entity_type: 'Limited Liability Company', tags: ['Contract Manufacturer'],
      identifiers: [{ scheme: 'cn_uscc', value: '91440300MA5000001X', country: 'CN' }],
      nama_pic: 'Li Wei', email_pic: 'li.wei@sz-molds.example.com', telepon_pic: '+867550000010',
      alamat_pic: '10 Demo Avenue, Shenzhen, China', pic_internal: 'Engineering',
      catatan: 'Tooling and injection moulds. ISO 9001 certificate lapsed.',
      daftar_dokumen_dd: [
        doc('nda', 'Available'), doc('mfg_supplier_code', 'Available'),
        doc('mfg_quality_cert', 'Expired', { tanggalKadaluarsa: day(-45) }),
      ],
    }),
  ];

  const partnerName = (id: string) => partners.find((p) => p.partner_id === id)?.nama_partner || '';

  const contract = (c: Row): Row => ({
    jenis_dokumen: 'Master Agreement',
    kategori_kerjasama: [],
    auto_renewal: false,
    notice_period_hari: 30,
    notice_type_required: 'Termination',
    status: 'Active',
    status_approval: 'Signed',
    link_file_kontrak: '',
    internal_notes: '',
    created_at: ts(-200),
    updated_at: ts(-3),
    ...c,
    partner_nama: partnerName(c.partner_id),
  });

  const contracts: Row[] = [
    contract({
      contract_id: 'C0001', organizationId: SG, nomor_kontrak: 'DAT/MSA/2025/001', judul_kontrak: 'Cloud Hosting Master Services Agreement',
      partner_id: 'P0001', kategori_kerjasama: ['Cloud Infrastructure'], tanggal_mulai: day(-300), tanggal_berakhir: day(65),
      currency: 'SGD', nilai_kontrak: 480000, auto_renewal: true, notice_period_hari: 60, pic_internal: 'Procurement',
      internal_notes: 'Auto-renews for 12 months unless 60 days notice is given. Price review clause at renewal.',
      created_at: ts(-305),
    }),
    contract({
      contract_id: 'C0002', organizationId: SG, nomor_kontrak: 'DAT/MSA/2026/002', judul_kontrak: 'Software Development Services Agreement',
      partner_id: 'P0002', kategori_kerjasama: ['Systems Integrator'], tanggal_mulai: day(-120), tanggal_berakhir: day(245),
      currency: 'USD', nilai_kontrak: 250000, pic_internal: 'Engineering',
      internal_notes: 'Fixed-fee milestones; DPA still to be countersigned.',
    }),
    contract({
      contract_id: 'C0003', organizationId: SG, nomor_kontrak: 'DAT/SUB/2025/003', judul_kontrak: 'Analytics Platform Subscription',
      partner_id: 'P0003', kategori_kerjasama: ['SaaS Vendor'], tanggal_mulai: day(-380), tanggal_berakhir: day(-15),
      currency: 'JPY', nilai_kontrak: 18000000, status: 'Expired', pic_internal: 'Data Team',
      internal_notes: 'Expired pending renewal negotiation and updated SOC 2 report.',
    }),
    contract({
      contract_id: 'C0004', organizationId: SG, nomor_kontrak: 'DAT/CUS/2026/004', judul_kontrak: 'Enterprise Customer Agreement',
      partner_id: 'P0004', kategori_kerjasama: ['Customer'], tanggal_mulai: day(-60), tanggal_berakhir: day(305),
      currency: 'MYR', nilai_kontrak: 600000, auto_renewal: true, notice_period_hari: 90, pic_internal: 'Sales',
    }),
    contract({
      contract_id: 'C0005', organizationId: SG, jenis_dokumen: 'Agreement Addendum', parent_contract_id: 'C0001',
      parent_contract_nomor: 'DAT/MSA/2025/001', nomor_kontrak: 'DAT/ADD/2026/005', judul_kontrak: 'Addendum 1 — Additional GPU capacity',
      partner_id: 'P0001', kategori_kerjasama: ['Cloud Infrastructure'], tanggal_mulai: day(-30), tanggal_berakhir: day(65),
      currency: 'SGD', nilai_kontrak: 60000, pic_internal: 'Procurement',
      field_yang_berubah: ['Nilai Kontrak / IO', 'Ruang Lingkup / Deliverables'],
      ringkasan_perubahan: 'Adds 8 GPU nodes at a fixed monthly fee until the master agreement end date.',
    }),
    contract({
      contract_id: 'C0006', organizationId: ID, nomor_kontrak: 'DNF/PKS/2025/006', judul_kontrak: 'Perjanjian Kerja Sama Layanan Payment Gateway',
      partner_id: 'P0005', kategori_kerjasama: ['Payment Provider'], tanggal_mulai: day(-200), tanggal_berakhir: day(165),
      currency: 'IDR', nilai_kontrak: 1200000000, auto_renewal: true, notice_period_hari: 60, pic_internal: 'Payments',
      internal_notes: 'Mencakup hak audit regulator dan kewajiban pelaporan insiden 1x24 jam.',
    }),
    contract({
      contract_id: 'C0007', organizationId: ID, nomor_kontrak: 'DNF/PKS/2025/007', judul_kontrak: 'Perjanjian Jasa Penagihan',
      partner_id: 'P0006', kategori_kerjasama: ['Collection Agency'], tanggal_mulai: day(-340), tanggal_berakhir: day(25),
      currency: 'IDR', nilai_kontrak: 350000000, notice_period_hari: 30, pic_internal: 'Collections',
      internal_notes: 'Perpanjangan ditahan sampai dokumen DD partner diperbarui.',
    }),
    contract({
      contract_id: 'C0008', organizationId: ID, nomor_kontrak: 'DNF/MSA/2026/008', judul_kontrak: 'Credit Scoring API Services Agreement',
      partner_id: 'P0007', kategori_kerjasama: ['KYC Provider'], tanggal_mulai: day(-100), tanggal_berakhir: day(265),
      currency: 'SGD', nilai_kontrak: 90000, pic_internal: 'Risk',
    }),
    contract({
      contract_id: 'C0009', organizationId: JP, nomor_kontrak: 'DPM-SA-2026-009', judul_kontrak: 'Component Supply Agreement',
      partner_id: 'P0008', kategori_kerjasama: ['Component Supplier'], tanggal_mulai: day(-150), tanggal_berakhir: day(580),
      currency: 'USD', nilai_kontrak: 1800000, notice_period_hari: 90, pic_internal: 'Supply Chain',
      internal_notes: 'FCA Hai Phong (Incoterms 2020). Quality acceptance within 14 days of delivery.',
    }),
    contract({
      contract_id: 'C0010', organizationId: JP, nomor_kontrak: 'DPM-LS-2025-010', judul_kontrak: 'Logistics Services Agreement',
      partner_id: 'P0009', kategori_kerjasama: ['Logistics Provider'], tanggal_mulai: day(-400), tanggal_berakhir: day(10),
      currency: 'THB', nilai_kontrak: 4500000, auto_renewal: true, notice_period_hari: 30, pic_internal: 'Supply Chain',
    }),
  ];

  const contractNo = (id: string) => contracts.find((c) => c.contract_id === id)?.nomor_kontrak || '';

  const order = (o: Row): Row => ({
    charging_type: 'Postpaid',
    notice_period_hari: 14,
    notice_type_required: 'Termination',
    status: 'Active',
    internal_notes: '',
    created_at: ts(-100),
    updated_at: ts(-2),
    ...o,
    mata_uang: o.currency,
    partner_nama: partnerName(o.partner_id),
    contract_nomor: o.contract_id ? contractNo(o.contract_id) : '',
  });

  const ios: Row[] = [
    order({
      io_id: 'IO0001', organizationId: SG, contract_id: 'C0001', partner_id: 'P0001', nomor_io: 'OF-2026-001',
      judul_io: 'Reserved compute capacity FY2026', kanal_media: 'Compute — reserved instances', pricing_model: 'Subscription (flat)',
      tanggal_mulai: day(-90), tanggal_berakhir: day(20), currency: 'SGD', nilai_io: 120000, charging_type: 'Prepaid',
      deliverables: '# ORDER FORM SUMMARY\n- 40 reserved instances\n- 99.95% monthly availability SLA',
    }),
    order({
      io_id: 'IO0002', organizationId: SG, contract_id: 'C0004', partner_id: 'P0004', nomor_io: 'OF-2026-002',
      judul_io: 'Enterprise plan — 250 seats', kanal_media: 'Enterprise plan', pricing_model: 'Subscription (per seat)',
      tanggal_mulai: day(-60), tanggal_berakhir: day(300), currency: 'MYR', nilai_io: 150000,
      deliverables: '# ORDER FORM SUMMARY\n- 250 named seats\n- Premium support',
    }),
    order({
      io_id: 'IO0003', organizationId: ID, contract_id: 'C0006', partner_id: 'P0005', nomor_io: 'SO-2026-003',
      judul_io: 'Virtual account & QR payment channel', kanal_media: 'Payment gateway', pricing_model: 'Per Transaction',
      tanggal_mulai: day(-150), tanggal_berakhir: day(30), currency: 'IDR', nilai_io: 250000000,
      deliverables: '# RINGKASAN SERVICE ORDER\n- Biaya per transaksi berjenjang\n- Settlement H+1',
    }),
    order({
      io_id: 'IO0004', organizationId: ID, contract_id: 'C0008', partner_id: 'P0007', nomor_io: 'SO-2026-004',
      judul_io: 'Credit scoring API — 1M calls', kanal_media: 'Credit scoring API', pricing_model: 'Tiered Volume',
      tanggal_mulai: day(-60), tanggal_berakhir: day(120), currency: 'SGD', nilai_io: 45000,
    }),
    order({
      io_id: 'IO0005', organizationId: JP, contract_id: 'C0009', partner_id: 'P0008', nomor_io: 'PO-2026-005',
      judul_io: 'Aluminium housings — batch Q3', kanal_media: 'Housing A-200', pricing_model: 'Unit Price',
      tanggal_mulai: day(-20), tanggal_berakhir: day(40), currency: 'USD', nilai_io: 240000, charging_type: 'Milestone-based',
      deliverables: '# PURCHASE ORDER SUMMARY\n- 12000 units at USD 20 each\n- Delivery in two lots',
    }),
  ];

  const spending = (s: Row): Row => ({
    payment_status: 'Paid',
    bank_name: 'Demo Bank',
    bank_account_number: '000-000000-0',
    created_at: ts(-30),
    ...s,
    vendor_name: partnerName(s.vendor_id),
    bank_account_holder_name: partnerName(s.vendor_id),
  });

  const spendings: Row[] = [
    spending({ id: 'SP0001', organizationId: SG, vendor_id: 'P0001', invoice_number: 'ORB-INV-1001', invoice_date: day(-62), invoice_month: [monthEnd(2)], invoice_description: 'Cloud hosting — monthly fee', currency: 'SGD', total_amount: 40000 }),
    spending({ id: 'SP0002', organizationId: SG, vendor_id: 'P0001', invoice_number: 'ORB-INV-1002', invoice_date: day(-31), invoice_month: [monthEnd(1)], invoice_description: 'Cloud hosting — monthly fee', currency: 'SGD', total_amount: 40000, payment_status: 'Unpaid' }),
    spending({ id: 'SP0003', organizationId: SG, vendor_id: 'P0002', invoice_number: 'BCL/2026/045', invoice_date: day(-40), invoice_month: [monthEnd(1)], invoice_description: 'Milestone 2 — mobile app beta', currency: 'USD', total_amount: 62500 }),
    spending({ id: 'SP0004', organizationId: ID, vendor_id: 'P0005', invoice_number: 'SPD/INV/2026/0088', invoice_date: day(-35), invoice_month: [monthEnd(1)], invoice_description: 'Biaya transaksi payment gateway', currency: 'IDR', total_amount: 45000000 }),
    spending({ id: 'SP0005', organizationId: ID, vendor_id: 'P0007', invoice_number: 'LCCA-2026-19', invoice_date: day(-25), invoice_month: [monthEnd(1)], invoice_description: 'Credit scoring API usage', currency: 'SGD', total_amount: 11250 }),
    spending({ id: 'SP0006', organizationId: JP, vendor_id: 'P0008', invoice_number: 'HCJ-2026-311', invoice_date: day(-12), invoice_month: [monthEnd(0)], invoice_description: 'Housing A-200 — lot 1', currency: 'USD', total_amount: 120000, payment_status: 'Unpaid' }),
  ];

  const evaluation = (e: Row): Row => ({
    year: Number(e.review_date.slice(0, 4)),
    incident_frequency: 'Never',
    pricing: 'Moderate',
    evaluator_email: '',
    evaluator_name: '',
    created_at: `${e.review_date}T10:00:00.000Z`,
    updated_at: `${e.review_date}T10:00:00.000Z`,
    ...e,
    supplier_name: partnerName(e.partner_id),
  });

  const evaluations: Row[] = [
    evaluation({ id: 'EVAL-0001', organizationId: SG, partner_id: 'P0001', review_date: day(-45), type_of_work: 'Cloud hosting', sla_score: 96, obligation_target: 'Met', communication: 'Good', final_evaluation: 'Recommended', calculated_score: 90, notes: 'Stable service; one minor incident resolved within SLA.', evaluator_name: 'Daniel Lim', evaluator_email: 'procurement.sg@example.com' }),
    evaluation({ id: 'EVAL-0002', organizationId: SG, partner_id: 'P0002', review_date: day(-20), type_of_work: 'Software development', sla_score: 82, obligation_target: 'Met', incident_frequency: 'Rare', communication: 'Good', pricing: 'Cheap', final_evaluation: 'Recommended with notes', calculated_score: 85, notes: 'Good velocity; documentation needs improvement.', evaluator_name: 'Daniel Lim', evaluator_email: 'procurement.sg@example.com' }),
    evaluation({ id: 'EVAL-0003', organizationId: ID, partner_id: 'P0005', review_date: day(-30), type_of_work: 'Payment gateway', sla_score: 98, obligation_target: 'Met', communication: 'Good', final_evaluation: 'Recommended', calculated_score: 90, notes: 'Settlement accuracy 100% this quarter.', evaluator_name: 'Budi Hartono', evaluator_email: 'finance.id@example.com' }),
    evaluation({ id: 'EVAL-0004', organizationId: JP, partner_id: 'P0010', review_date: day(-15), type_of_work: 'Tooling', sla_score: 70, obligation_target: 'Not met', incident_frequency: 'Frequent', communication: 'Poor/Needs Improvement', pricing: 'Cheap', final_evaluation: 'Not recommended', calculated_score: 50, notes: 'Two late deliveries; quality certificate lapsed.', evaluator_name: 'Kenji Sato', evaluator_email: 'legal.jp@example.com' }),
  ];

  const notifications: Row[] = [
    {
      notif_id: 'NTF-0001', organizationId: SG, parent_type: 'Contract', parent_id: 'C0001', parent_nomor: 'DAT/MSA/2025/001',
      parent_judul: 'Cloud Hosting Master Services Agreement', jenis_notifikasi: 'Reminder 90d', tanggal_terkirim: ts(-25),
      status_terkirim: true, penerima: 'legal.sg@example.com', pesan: 'Contract DAT/MSA/2025/001 expires in 90 days. Notice of termination is required 60 days before expiry.', is_read: false,
    },
    {
      notif_id: 'NTF-0002', organizationId: ID, parent_type: 'Contract', parent_id: 'C0007', parent_nomor: 'DNF/PKS/2025/007',
      parent_judul: 'Perjanjian Jasa Penagihan', jenis_notifikasi: 'Reminder 30d', tanggal_terkirim: ts(-5),
      status_terkirim: true, penerima: 'legal.id@example.com', pesan: 'Kontrak DNF/PKS/2025/007 berakhir dalam 30 hari.', is_read: false,
    },
  ];

  const user = (u: Row): Row => ({ status: 'Active', addedBy: 'Demo dataset', createdAt: ts(-400), ...u });
  const allowedUsers: Row[] = [
    user({ id: 'usr-demo-sg-legal', organizationId: SG, email: 'legal.sg@example.com', name: 'Aisha Tan', role: 'Admin', department: 'Legal' }),
    user({ id: 'usr-demo-sg-proc', organizationId: SG, email: 'procurement.sg@example.com', name: 'Daniel Lim', role: 'Manager', department: 'Procurement' }),
    user({ id: 'usr-demo-sg-viewer', organizationId: SG, email: 'viewer.sg@example.com', name: 'Priya Nair', role: 'Viewer', department: 'Finance' }),
    user({ id: 'usr-demo-id-legal', organizationId: ID, email: 'legal.id@example.com', name: 'Rina Kusuma', role: 'Admin', department: 'Legal & Compliance' }),
    user({ id: 'usr-demo-id-fin', organizationId: ID, email: 'finance.id@example.com', name: 'Budi Hartono', role: 'Editor', department: 'Finance' }),
    user({ id: 'usr-demo-jp-legal', organizationId: JP, email: 'legal.jp@example.com', name: 'Kenji Sato', role: 'Admin', department: 'Legal' }),
  ];

  const dept = (id: string, organizationId: string, name: string): Row => ({ id, organizationId, name, created_at: ts(-400), updated_at: ts(-400) });
  const departments: Row[] = [
    dept('team-demo-sg-legal', SG, 'Legal'), dept('team-demo-sg-proc', SG, 'Procurement'), dept('team-demo-sg-fin', SG, 'Finance'),
    dept('team-demo-id-legal', ID, 'Legal & Compliance'), dept('team-demo-id-proc', ID, 'Procurement'), dept('team-demo-id-fin', ID, 'Finance'),
    dept('team-demo-jp-legal', JP, 'Legal'), dept('team-demo-jp-scm', JP, 'Supply Chain'),
  ];

  const activityLogs: Row[] = [
    { id: 'LOG-DEMO-1', organizationId: SG, timestamp: ts(-3), userEmail: 'procurement.sg@example.com', userName: 'Daniel Lim', role: 'Manager', actionType: 'CREATE', module: 'CONTRACT', description: 'Created addendum DAT/ADD/2026/005 (SGD 60,000).' },
    { id: 'LOG-DEMO-2', organizationId: ID, timestamp: ts(-2), userEmail: 'legal.id@example.com', userName: 'Rina Kusuma', role: 'Admin', actionType: 'DD_UPDATE', module: 'PARTNER', description: 'Flagged expired business licence for PT Mitra Penagihan Sejahtera.' },
    { id: 'LOG-DEMO-3', organizationId: JP, timestamp: ts(-1), userEmail: 'legal.jp@example.com', userName: 'Kenji Sato', role: 'Admin', actionType: 'CREATE', module: 'IO', description: 'Issued purchase order PO-2026-005 (USD 240,000).' },
  ];

  return {
    tenants: DEMO_TENANTS.map((t) => ({ ...t, settings: { ...t.settings }, created_at: ts(-400), updated_at: ts(-1) })),
    departments,
    allowedUsers,
    partners,
    contracts,
    ios,
    spendings,
    evaluations,
    notifications,
    activityLogs,
  };
}
