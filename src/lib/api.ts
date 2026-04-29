// Client HTTP minimal vers le backend FastAPI.
// Toutes les communications avec Claude passent désormais par ce backend ;
// aucune clé API n'est stockée côté frontend.

const API_BASE = "/api";

export async function analyzeText(text: string) {
  const r = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    if (r.status === 429) {
      throw new Error("Limite atteinte. Réessayez dans une heure.");
    }
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `Erreur API : ${r.status}`);
  }
  return r.json();
}

export async function renderTemplate(
  template_id: string,
  slots: Record<string, string>,
  palette: Record<string, string>,
) {
  const r = await fetch(`${API_BASE}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id, slots, palette }),
  });
  if (!r.ok) throw new Error(`Erreur rendu : ${r.status}`);
  return r.json();
}

export async function getTemplates() {
  const r = await fetch(`${API_BASE}/templates`);
  if (!r.ok) throw new Error("Impossible de charger les templates");
  return r.json();
}

export async function checkHealth() {
  const r = await fetch(`${API_BASE}/health`);
  return r.json();
}
