const fs = require('fs');
let content = fs.readFileSync('src/lib/googleSheetsSync.ts', 'utf8');

const helperCode = `/**
 * Helper to merge incoming records with existing records by ID or Name keys
 */
export function mergeRecords<T extends Record<string, any>>(
  existingList: T[] = [],
  incomingList: T[] = [],
  idKeys: string[] = ['id'],
  nameKeys: string[] = [],
  overwriteExisting: boolean = false
): T[] {
  if (!Array.isArray(existingList)) existingList = [];
  if (!Array.isArray(incomingList)) incomingList = [];

  const merged = [...existingList];

  for (const item of incomingList) {
    if (!item) continue;
    
    // Find matching record by any idKey or nameKey
    const index = merged.findIndex((existing) => {
      if (!existing) return false;
      // 1. Check ID keys match
      for (const k of idKeys) {
        if (item[k] && existing[k] && String(item[k]).trim() === String(existing[k]).trim()) {
          return true;
        }
      }
      // 2. Check Name keys match if both present
      for (const nk of nameKeys) {
        if (item[nk] && existing[nk] && String(item[nk]).trim().toLowerCase() === String(existing[nk]).trim().toLowerCase()) {
          return true;
        }
      }
      return false;
    });

    if (index >= 0) {
      if (overwriteExisting) {
        merged[index] = { ...merged[index], ...item };
      } else {
        merged[index] = { ...item, ...merged[index] };
      }
    } else {
      merged.push(item);
    }
  }

  return merged;
}

export async function pullFromGoogleSheet(`;

content = content.replace('export async function pullFromGoogleSheet(', helperCode);
fs.writeFileSync('src/lib/googleSheetsSync.ts', content, 'utf8');
