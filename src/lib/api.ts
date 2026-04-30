// Client HTTP minimal vers le backend FastAPI.
// Toutes les communications avec Claude passent désormais par ce backend ;
// aucune clé API n'est stockée côté frontend.
//
// Mode MOCK : si VITE_USE_MOCK_API=true, on court-circuite l'API et on
// renvoie des données factices (utile dans la preview Lovable où le
// backend FastAPI n'est pas accessible). En outre, si l'appel réel
// échoue avec un 404, on bascule automatiquement en mock pour ne pas
// bloquer le test de l'UI.

import { isMockForced, mockAnalyze, mockRender } from "./mockBackend";

const API_BASE = "/api";

// Mémorise un fallback automatique après un premier 404 pour éviter
// de re-tenter inutilement le backend pendant la session.
let autoMockEnabled = false;

function shouldUseMock(): boolean {
  return isMockForced() || autoMockEnabled;
}

export async function analyzeText(text: string, detail_level: string = "auto") {
  if (shouldUseMock()) {
    return mockAnalyze(text, detail_level);
  }
  try {
    const r = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, detail_level }),
    });
    if (!r.ok) {
      if (r.status === 404) {
        // Backend absent (preview Lovable) → bascule définitive en mock.
        autoMockEnabled = true;
        console.warn(
          "[api] Backend /api/analyze introuvable (404). Bascule en mode MOCK pour la suite de la session.",
        );
        return mockAnalyze(text, detail_level);
      }
      if (r.status === 429) {
        throw new Error("Limite atteinte. Réessayez dans une heure.");
      }
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Erreur API : ${r.status}`);
    }
    return r.json();
  } catch (e) {
    // Erreur réseau (ex: CORS, DNS) → on tente le mock pour ne pas bloquer.
    if (e instanceof TypeError) {
      autoMockEnabled = true;
      console.warn(
        "[api] Backend injoignable (erreur réseau). Bascule en mode MOCK.",
        e,
      );
      return mockAnalyze(text, detail_level);
    }
    throw e;
  }
}

export async function renderTemplate(
  template_id: string,
  slots: Record<string, string>,
  palette: Record<string, string>,
) {
  if (shouldUseMock()) {
    return mockRender(template_id, slots);
  }
  const r = await fetch(`${API_BASE}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id, slots, palette }),
  });
  if (!r.ok) {
    if (r.status === 404) {
      autoMockEnabled = true;
      return mockRender(template_id, slots);
    }
    throw new Error(`Erreur rendu : ${r.status}`);
  }
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
