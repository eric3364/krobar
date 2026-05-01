// Client HTTP minimal vers le backend FastAPI.
// Toutes les communications avec Claude passent désormais par ce backend ;
// aucune clé API n'est stockée côté frontend.
//
// Mode MOCK : si VITE_USE_MOCK_API=true, on court-circuite l'API et on
// renvoie des données factices (utile dans la preview Lovable où le
// backend FastAPI n'est pas accessible). En outre, si l'appel réel
// échoue (404, HTML retourné par le dev server, erreur réseau...), on
// bascule automatiquement en mock pour ne pas bloquer le test de l'UI.

import { isMockForced, mockAnalyze, mockRender } from "./mockBackend";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://krobar.online/api";

// Mémorise un fallback automatique après le premier échec pour éviter
// de re-tenter inutilement le backend pendant la session.
let autoMockEnabled = false;

function shouldUseMock(): boolean {
  return isMockForced() || autoMockEnabled;
}

function enableAutoMock(reason: string) {
  if (!autoMockEnabled) {
    autoMockEnabled = true;
    console.warn(`[api] Bascule en mode MOCK : ${reason}`);
  }
}

/**
 * Détecte si la réponse est réellement du JSON. Le dev server Vite renvoie
 * souvent `index.html` (200 OK, content-type text/html) pour les routes
 * /api/* qui ne sont pas montées — c'est ce qui produit l'erreur
 * "Unexpected token '<', '<!doctype...' is not valid JSON".
 */
function isJsonResponse(r: Response): boolean {
  const ct = r.headers.get("content-type") || "";
  return ct.toLowerCase().includes("application/json");
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
        enableAutoMock("Backend /api/analyze introuvable (404).");
        return mockAnalyze(text, detail_level);
      }
      if (r.status === 429) {
        throw new Error("Limite atteinte. Réessayez dans une heure.");
      }
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Erreur API : ${r.status}`);
    }
    if (!isJsonResponse(r)) {
      enableAutoMock(
        "Réponse non-JSON (probablement index.html du dev server).",
      );
      return mockAnalyze(text, detail_level);
    }
    try {
      return await r.json();
    } catch {
      enableAutoMock("Parse JSON impossible sur /api/analyze.");
      return mockAnalyze(text, detail_level);
    }
  } catch (e) {
    if (e instanceof TypeError) {
      enableAutoMock("Backend injoignable (erreur réseau).");
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
  try {
    const r = await fetch(`${API_BASE}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id, slots, palette }),
    });
    if (!r.ok) {
      if (r.status === 404) {
        enableAutoMock("Backend /api/render introuvable (404).");
        return mockRender(template_id, slots);
      }
      throw new Error(`Erreur rendu : ${r.status}`);
    }
    if (!isJsonResponse(r)) {
      enableAutoMock(
        "Réponse /api/render non-JSON (probablement index.html du dev server).",
      );
      return mockRender(template_id, slots);
    }
    try {
      return await r.json();
    } catch {
      enableAutoMock("Parse JSON impossible sur /api/render.");
      return mockRender(template_id, slots);
    }
  } catch (e) {
    if (e instanceof TypeError) {
      enableAutoMock("Backend /api/render injoignable.");
      return mockRender(template_id, slots);
    }
    throw e;
  }
}

export async function getTemplates() {
  const r = await fetch(`${API_BASE}/templates`);
  if (!r.ok || !isJsonResponse(r)) {
    throw new Error("Impossible de charger les templates");
  }
  return r.json();
}

export async function checkHealth() {
  const r = await fetch(`${API_BASE}/health`);
  if (!isJsonResponse(r)) {
    return { status: "mock", reason: "non-json response" };
  }
  return r.json();
}
