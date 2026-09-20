const fs = require('fs');

const path = 'src/lib/googleSheetsSync.ts';
let content = fs.readFileSync(path, 'utf8');

const startIndex = content.indexOf('export async function syncToGoogleSheet(');
const endIndex = content.indexOf('export async function pullFromGoogleSheet(');

if (startIndex === -1 || endIndex === -1) {
  console.log('Could not find functions');
  process.exit(1);
}

const replacement = `
// SYNC TO ORG GOOGLE SHEET (WRITE)
export async function syncToGoogleSheet(
  spreadsheetId: string,
  token: string,
  db: DataStore,
  tenantId?: string
): Promise<void> {
  const targetTenantId = tenantId || db.activeTenantId || 'org-adapundi';
  await ensureOrgSheetTabs(spreadsheetId, token);

  // 1. Partners
  const partnerValues = [
    PARTNER_HEADERS,
    ...db.partners.filter(p => !p.organizationId || p.organizationId === targetTenantId).map((p) => {
      const getLink = (nama: string) => {
        const doc = (p.daftar_dokumen_dd || []).find((d) => d.nama.toLowerCase() === nama.toLowerCase() || d.nama.includes(nama));
        return doc?.linkDrive || '';
      };
      
      return [
        p.partner_id,
        p.nama_partner,
        p.codename || '',
        p.badan_hukum || 'BHI',
        p.jenis_partner || 'Vendor',
        p.nama_pic || '',
        p.email_pic || '',
        p.telepon_pic || '',
        p.alamat_pic || '',
        p.pic_internal || '',
        p.status_dd || 'Belum Lengkap',
        p.link_folder_dd || '',
        p.catatan || '',
        p.tanggal_dd_diverifikasi || '',
        JSON.stringify(p.daftar_dokumen_dd || []),
        JSON.stringify(p.tags || ['Advertising']),
        p.created_at || '',
        p.updated_at || '',
        getLink('NDA'),
        getLink('COR'),
        getLink('DGT'),
        getLink('Termination notice'),
        getLink('Vendor assessment form'),
        getLink('Placement Documentation'),
        getLink('Invoice and Billing'),
        getLink('NIB'),
        getLink('Business license'),
        getLink('NPWP'),
        getLink('Akta'),
      ];
    }),
  ];
  await writeTabValues(spreadsheetId, token, 'Partner', partnerValues);

  // 2. Contracts
  const contractValues = [
    CONTRACT_HEADERS,
    ...db.contracts.filter(c => !c.organizationId || c.organizationId === targetTenantId).map((c) => [
      c.partner_id || '',
      c.contract_id,
      c.jenis_dokumen || 'Master Agreement',
      c.parent_contract_id || '',
      c.parent_contract_nomor || '',
      c.nomor_kontrak,
      c.judul_kontrak,
      c.partner_nama || '',
      JSON.stringify(c.kategori_kerjasama || []),
      c.tanggal_mulai,
      c.tanggal_berakhir,
      c.currency || 'IDR',
      c.nilai_kontrak || 0,
      c.nilai_kontrak_usd !== undefined && c.nilai_kontrak_usd !== null ? c.nilai_kontrak_usd : ((c.currency || 'IDR') === 'USD' ? (c.nilai_kontrak || 0) : Math.round((c.nilai_kontrak || 0) * 0.000062 * 100) / 100),
      c.auto_renewal ? 'true' : 'false',
      c.notice_period_hari || 30,
      c.notice_type_required || 'Termination',
      c.status || 'Aktif',
      c.status_approval || 'Aktif',
      c.pic_internal || '-',
      c.internal_notes || '',
      JSON.stringify(c.field_yang_berubah || []),
      c.ringkasan_perubahan || '',
      c.link_file_kontrak || '',
      c.fileName || '',
      c.sisa_hari || 0,
      c.created_at || '',
      c.updated_at || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Contract', contractValues);

  // 3. Insertion Orders
  const ioValues = [
    IO_HEADERS,
    ...db.ios.filter(i => !i.organizationId || i.organizationId === targetTenantId).map((i) => [
      i.partner_id || '',
      i.contract_id || '',
      i.contract_nomor || '-',
      i.io_id,
      i.nomor_io,
      i.judul_io,
      i.partner_nama || '',
      i.kanal_media || 'Digital Channel',
      i.tanggal_mulai,
      i.tanggal_berakhir,
      i.pricing_model || 'Flat Fee',
      i.charging_type || 'Prepaid',
      i.currency || 'IDR',
      i.nilai_io || 0,
      i.nilai_io_usd !== undefined && i.nilai_io_usd !== null ? i.nilai_io_usd : ((i.currency || 'IDR') === 'USD' ? (i.nilai_io || 0) : Math.round((i.nilai_io || 0) * 0.000062 * 100) / 100),
      i.deliverables || '-',
      i.notice_period_hari || 14,
      i.notice_type_required || 'Termination',
      i.status || 'Aktif',
      i.link_file_io || '',
      i.fileName || '',
      i.sisa_hari || 0,
      i.created_at || '',
      i.updated_at || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Insertion_Order', ioValues);

  // 4. Activity Logs (Filtered)
  const logValues = [
    ACTIVITY_HEADERS,
    ...db.activityLogs.filter(l => l.organizationId === targetTenantId || l.organizationId === 'GLOBAL').slice(0, 200).map((l) => [
      l.id,
      l.timestamp,
      l.userEmail,
      l.userName,
      l.role,
      l.actionType,
      l.module,
      l.description,
      l.ipAddress || '',
      l.userAgent || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Activity_Log', logValues);

  // 5. Notification Logs (Filtered)
  const notifValues = [
    NOTIFICATION_HEADERS,
    ...db.notifications.filter(n => !n.organizationId || n.organizationId === targetTenantId).map((n) => {
      let partnerId = '';
      let contractId = '';
      if (n.parent_type === 'Contract') {
        const c = db.contracts.find((ctr) => ctr.contract_id === n.parent_id);
        if (c) {
          partnerId = c.partner_id;
          contractId = c.contract_id;
        }
      } else if (n.parent_type === 'IO') {
        const io = db.ios.find((i) => i.io_id === n.parent_id);
        if (io) {
          partnerId = io.partner_id;
          contractId = io.contract_id || '';
        }
      }
      return [
        partnerId,
        contractId,
        n.notif_id,
        n.parent_type,
        n.parent_id,
        n.parent_nomor || '-',
        n.parent_judul || '-',
        n.jenis_notifikasi,
        n.tanggal_terkirim,
        n.status_terkirim ? 'true' : 'false',
        n.penerima,
        n.pesan,
      ];
    }),
  ];
  await writeTabValues(spreadsheetId, token, 'Notification_Log', notifValues);

  // 6. Partner Evaluations
  const evalValues = [
    EVALUATION_HEADERS,
    ...(db.evaluations || []).filter(e => !e.organizationId || e.organizationId === targetTenantId).map((e) => [
      e.partner_id || '',
      e.id,
      e.review_date,
      e.supplier_name,
      e.type_of_work || 'General Service',
      e.sla_score || 60,
      e.obligation_target,
      e.incident_frequency,
      e.communication,
      e.pricing,
      e.calculated_score || 0,
      e.final_evaluation,
      e.notes || '',
      e.evaluator_email || '',
      e.evaluator_name || '',
      e.created_at || '',
      e.updated_at || e.created_at || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Partner_Evaluation', evalValues);

  // 7. Partner Spendings
  const spendingValues = [
    SPENDING_HEADERS,
    ...(db.spendings || []).filter(s => !s.organizationId || s.organizationId === targetTenantId).map((s) => [
      s.vendor_id || '',
      s.id,
      s.vendor_name,
      s.invoice_number,
      s.invoice_date,
      JSON.stringify(s.invoice_month || []),
      s.invoice_description || '',
      s.currency,
      s.total_amount || 0,
      s.total_amount_usd !== undefined && s.total_amount_usd !== null ? s.total_amount_usd : ((s.currency || 'IDR') === 'USD' ? (s.total_amount || 0) : Math.round((s.total_amount || 0) * 0.000062 * 100) / 100),
      s.payment_status || 'Paid',
      s.bank_name || '',
      s.bank_account_number || '',
      s.bank_account_holder_name || '',
      s.invoice_file_url || '',
      s.invoice_file_name || '',
      s.billing_file_url || '',
      s.billing_file_name || '',
      s.folder_link || '',
      s.created_at || '',
      s.updated_at || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Partner_Spending', spendingValues);
}

// SYNC TO MASTER SYSTEM SHEET (WRITE)
export async function syncMasterSystemSheet(
  spreadsheetId: string,
  token: string,
  db: DataStore
): Promise<void> {
  await ensureMasterSheetTabs(spreadsheetId, token);

  // 1. Organization
  const orgValues = [
    ORGANIZATION_HEADERS,
    ...(db.tenants || []).map((t) => [
      t.id,
      t.name,
      t.legal_entity || 'PT',
      t.brand_name || t.name,
      t.driveFolderId || '',
      t.driveFolderLink || '',
      t.spreadsheetId || '',
      t.spreadsheetUrl || '',
      t.branding?.primaryColor || '#06C755',
      t.currency || 'IDR',
      t.slug || '',
      t.is_default ? 'TRUE' : 'FALSE',
      t.created_at || new Date().toISOString(),
      t.updated_at || new Date().toISOString(),
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Organization', orgValues);

  // 2. Allowed Users
  const userValues = [
    USER_HEADERS,
    ...db.allowedUsers.map((u) => [
      u.id,
      u.email,
      u.name,
      u.role,
      u.department || 'Umum',
      u.status,
      u.addedBy || 'System',
      u.addedByEmail || '',
      u.createdAt || '',
      u.lastLoginAt || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Allowed_User', userValues);

  // 3. System Log (Activity Logs)
  const logValues = [
    ACTIVITY_HEADERS,
    ...db.activityLogs.slice(0, 500).map((l) => [
      l.id,
      l.timestamp,
      l.userEmail,
      l.userName,
      l.role,
      l.actionType,
      l.module,
      l.description,
      l.ipAddress || '',
      l.userAgent || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'System_Log', logValues);

  // 4. Department
  const deptValues = [
    ['id', 'name', 'code', 'description', 'created_at', 'updated_at'],
    ...[
      ['team-commercial', 'Commercial & Marketing', 'COM', '', new Date().toISOString(), new Date().toISOString()],
      ['team-legal', 'Legal & Compliance', 'LEG', '', new Date().toISOString(), new Date().toISOString()],
      ['team-procurement', 'Procurement & Operations', 'PRO', '', new Date().toISOString(), new Date().toISOString()],
      ['team-general', 'General', 'GEN', '', new Date().toISOString(), new Date().toISOString()]
    ]
  ];
  await writeTabValues(spreadsheetId, token, 'Department', deptValues);
}

`;

content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(path, content, 'utf8');
console.log('Done!');
