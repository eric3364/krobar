const DELETED_TEMPLATES_STORAGE = "krobar-deleted-template-ids";

function readDeletedTemplateIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(DELETED_TEMPLATES_STORAGE);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(
        parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
      ),
    );
  } catch {
    return [];
  }
}

function writeDeletedTemplateIds(ids: string[]) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(DELETED_TEMPLATES_STORAGE, JSON.stringify(Array.from(new Set(ids)).slice(0, 500)));
  } catch {
    /* ignore localStorage failures */
  }
}

export function markTemplateDeleted(templateId: string) {
  if (!templateId.trim()) return;
  const ids = new Set(readDeletedTemplateIds());
  ids.add(templateId);
  writeDeletedTemplateIds([...ids]);
}

export function clearDeletedTemplate(templateId: string) {
  if (!templateId.trim()) return;
  writeDeletedTemplateIds(readDeletedTemplateIds().filter((id) => id !== templateId));
}

export function filterDeletedTemplates<T extends { id: string }>(templates: T[]): T[] {
  const deletedIds = new Set(readDeletedTemplateIds());
  if (deletedIds.size === 0) return templates;
  return templates.filter((template) => !deletedIds.has(template.id));
}

export function filterDeletedTemplateEntries<T extends { template_id: string }>(entries: T[]): T[] {
  const deletedIds = new Set(readDeletedTemplateIds());
  if (deletedIds.size === 0) return entries;
  return entries.filter((entry) => !deletedIds.has(entry.template_id));
}