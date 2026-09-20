export const CATEGORY_STORAGE_KEY = 'LMS_SAVED_PARTNERSHIP_CATEGORIES';

export const DEFAULT_CATEGORIES = [
  'Advertising',
  'IT',
  'Logistics',
  'Marketing',
  'Consulting',
  'Media & Content',
  'Production',
  'Supplier',
  'Legal Services',
  'Finance & Accounting',
];

export function getSavedCategories(): string[] {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const combined = Array.from(new Set([...parsed, ...DEFAULT_CATEGORIES]));
        return combined;
      }
    }
  } catch (e) {
    console.error('Error reading saved categories:', e);
  }
  return DEFAULT_CATEGORIES;
}

export function saveCategory(newCategory: string): string[] {
  const trimmed = newCategory.trim();
  if (!trimmed) return getSavedCategories();

  const current = getSavedCategories();
  const exists = current.some((c) => c.toLowerCase() === trimmed.toLowerCase());

  let updated = current;
  if (!exists) {
    updated = [trimmed, ...current];
    try {
      localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving category template:', e);
    }
  }
  return updated;
}

export function saveMultipleCategories(categories: string[]): string[] {
  let current = getSavedCategories();
  categories.forEach((cat) => {
    const trimmed = cat.trim();
    if (trimmed && !current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      current = [trimmed, ...current];
    }
  });
  try {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error saving category templates:', e);
  }
  return current;
}
