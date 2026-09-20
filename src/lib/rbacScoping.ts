import { Partner, Contract, InsertionOrder, PartnerSpending, UserSession } from '../types';

export type StandardRole = 'superuser' | 'admin' | 'manager' | 'editor' | 'viewer';

/**
 * Normalizes any role string into one of the 5 standardized roles:
 * - superuser: System Level (user accounts, roles, system config)
 * - admin: Global Level (review, edit, final approval for all documents)
 * - manager: Group / Dept Level (internal approval for department documents)
 * - editor: Group / Dept Level (create, upload, revise drafts in department)
 * - viewer: Restricted / Read-Only (view final documents only)
 */
export function normalizeRole(role?: string): StandardRole {
  const r = (role || '').toLowerCase().trim();
  if (r === 'superuser') return 'superuser';
  if (r === 'admin') return 'admin';
  if (r === 'manager') return 'manager';
  if (r === 'editor') return 'editor';
  if (r === 'viewer') return 'viewer';

  // Backward compatibility with legacy role values
  if (r === 'legal') return 'manager';
  if (r === 'finance') return 'editor';
  if (r === 'staff') return 'viewer';

  return 'viewer';
}

/**
 * Returns true if the role has global scope over all departments
 */
export function isGlobalRole(role?: string): boolean {
  const norm = normalizeRole(role);
  return norm === 'admin' || norm === 'superuser';
}

/**
 * Normalizes department string for comparison (stripping spaces, symbols, and lowercasing)
 */
function cleanDeptString(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[&/\\#,+()$~%.'":*?<>{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a partner's Internal PIC matches the user's assigned Department
 * Supports partial/fuzzy matching (e.g. "Commercial & Marketing" matches "Commercial" or "Marketing")
 */
export function matchesDepartment(partnerPic?: string, userDept?: string): boolean {
  // If user has no specific department assigned, do not lock them out
  if (!userDept || !userDept.trim()) return true;

  // If partner has no internal PIC assigned, consider it open/unassigned
  if (!partnerPic || !partnerPic.trim()) return true;

  const pClean = cleanDeptString(partnerPic);
  const dClean = cleanDeptString(userDept);

  if (pClean === dClean) return true;
  if (pClean.includes(dClean) || dClean.includes(pClean)) return true;

  // Split words to catch matches like "Commercial & Marketing" vs "Commercial"
  const pTokens = pClean.split(' ').filter((t) => t.length > 2);
  const dTokens = dClean.split(' ').filter((t) => t.length > 2);

  return pTokens.some((pt) => dTokens.includes(pt));
}

/**
 * Checks if a user has access to view a Partner
 */
export function canViewPartner(partner: Partner, user: UserSession | null): boolean {
  if (!user) return true; // Default permissive if session loading
  if (isGlobalRole(user.role)) return true;

  const pic = partner.pic_internal || partner.internal_pic;
  return matchesDepartment(pic, user.department);
}

/**
 * Checks if a user has access to edit a Partner
 */
export function canEditPartner(partner: Partner, user: UserSession | null): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'viewer') return false;
  if (isGlobalRole(user.role)) return true;

  const pic = partner.pic_internal || partner.internal_pic;
  return matchesDepartment(pic, user.department);
}

/**
 * Checks if a user can create new Partners
 */
export function canCreatePartner(user: UserSession | null): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  return role !== 'viewer';
}

/**
 * Checks if a user can delete/archive a Partner
 */
export function canDeletePartner(user: UserSession | null): boolean {
  if (!user) return false;
  return isGlobalRole(user.role);
}

/**
 * Checks if a user has access to view a Contract
 * The scope is governed by the Internal PIC on the governing partner!
 */
export function canViewContract(
  contract: Contract,
  partners: Partner[],
  user: UserSession | null
): boolean {
  if (!user) return true;
  if (isGlobalRole(user.role)) return true;

  const role = normalizeRole(user.role);

  // Find governing partner by partner_id or partner name
  const governingPartner = partners.find(
    (p) =>
      p.partner_id === contract.partner_id ||
      (contract.partner_nama && p.nama_partner.toLowerCase() === contract.partner_nama.toLowerCase())
  );

  const pic =
    governingPartner?.pic_internal ||
    governingPartner?.internal_pic ||
    contract.pic_internal;

  const deptMatch = matchesDepartment(pic, user.department);
  if (!deptMatch) return false;

  // Viewer rule: Viewer can only view documents that are Final/Aktif/Signed
  if (role === 'viewer') {
    const isFinal =
      contract.status === 'Aktif' ||
      contract.status_approval === 'Signed' ||
      contract.status_approval === 'Aktif';
    return isFinal;
  }

  return true;
}

/**
 * Checks if a user can edit a Contract
 */
export function canEditContract(
  contract: Contract,
  partners: Partner[],
  user: UserSession | null
): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'viewer') return false;
  if (isGlobalRole(user.role)) return true;

  const governingPartner = partners.find(
    (p) =>
      p.partner_id === contract.partner_id ||
      (contract.partner_nama && p.nama_partner.toLowerCase() === contract.partner_nama.toLowerCase())
  );

  const pic =
    governingPartner?.pic_internal ||
    governingPartner?.internal_pic ||
    contract.pic_internal;

  return matchesDepartment(pic, user.department);
}

/**
 * Checks if a user can create new Contracts
 */
export function canCreateContract(user: UserSession | null): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  return role !== 'viewer';
}

/**
 * Checks if a user has access to view an Insertion Order (IO)
 * The scope is governed by the Internal PIC on the governing partner!
 */
export function canViewIO(
  io: InsertionOrder,
  partners: Partner[],
  user: UserSession | null
): boolean {
  if (!user) return true;
  if (isGlobalRole(user.role)) return true;

  const governingPartner = partners.find(
    (p) =>
      (io.partner_id && p.partner_id === io.partner_id) ||
      (io.partner_nama && p.nama_partner.toLowerCase() === io.partner_nama.toLowerCase())
  );

  const pic = governingPartner?.pic_internal || governingPartner?.internal_pic;
  return matchesDepartment(pic, user.department);
}

/**
 * Checks if a user can edit an Insertion Order (IO)
 */
export function canEditIO(
  io: InsertionOrder,
  partners: Partner[],
  user: UserSession | null
): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'viewer') return false;
  if (isGlobalRole(user.role)) return true;

  const governingPartner = partners.find(
    (p) =>
      (io.partner_id && p.partner_id === io.partner_id) ||
      (io.partner_nama && p.nama_partner.toLowerCase() === io.partner_nama.toLowerCase())
  );

  const pic = governingPartner?.pic_internal || governingPartner?.internal_pic;
  return matchesDepartment(pic, user.department);
}

/**
 * Checks if a user can create new Insertion Orders (IO)
 */
export function canCreateIO(user: UserSession | null): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  return role !== 'viewer';
}

/**
 * Checks user approval permissions
 */
export function getApprovalCapabilities(user: UserSession | null): {
  canInternalApprove: boolean;
  canFinalApprove: boolean;
} {
  if (!user) return { canInternalApprove: false, canFinalApprove: false };
  const role = normalizeRole(user.role);

  if (role === 'admin' || role === 'superuser') {
    return { canInternalApprove: true, canFinalApprove: true };
  }
  if (role === 'manager') {
    return { canInternalApprove: true, canFinalApprove: false };
  }
  return { canInternalApprove: false, canFinalApprove: false };
}

/**
 * Checks if a user has access to view a Spending / Invoice record
 * The scope is governed by the Internal PIC on the governing partner!
 */
export function canViewSpending(
  spending: PartnerSpending,
  partners: Partner[],
  user: UserSession | null
): boolean {
  if (!user) return true;
  if (isGlobalRole(user.role)) return true;

  const governingPartner = partners.find(
    (p) =>
      (spending.vendor_id && p.partner_id === spending.vendor_id) ||
      (spending.vendor_name && p.nama_partner.toLowerCase() === spending.vendor_name.toLowerCase())
  );

  const pic = governingPartner?.pic_internal || governingPartner?.internal_pic;
  return matchesDepartment(pic, user.department);
}

/**
 * Checks if a user can edit/create a Spending / Invoice record
 */
export function canEditSpending(
  spending: PartnerSpending,
  partners: Partner[],
  user: UserSession | null
): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'viewer') return false;
  if (isGlobalRole(user.role)) return true;

  const governingPartner = partners.find(
    (p) =>
      (spending.vendor_id && p.partner_id === spending.vendor_id) ||
      (spending.vendor_name && p.nama_partner.toLowerCase() === spending.vendor_name.toLowerCase())
  );

  const pic = governingPartner?.pic_internal || governingPartner?.internal_pic;
  return matchesDepartment(pic, user.department);
}

