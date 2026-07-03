export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Builds a task_templates.id from its zone and title. Falls back to a
 * timestamp suffix if the base slug is already taken.
 */
export function generateTaskTemplateId(
  zoneId: string,
  title: string,
  existingIds: Iterable<string>
): string {
  const base = `${zoneId}-${slugify(title)}`;
  const existing = new Set(existingIds);
  if (!existing.has(base)) return base;
  return `${base}-${Date.now()}`;
}
