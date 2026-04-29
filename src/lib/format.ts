/**
 * Normalise un score numérique en pourcentage entier 0-100.
 *
 * Le score brut peut arriver dans deux formes différentes selon les branches du code :
 *  - Décimal entre 0 et 1 (ex: 0.95) → multiplié par 100
 *  - Déjà en pourcentage entre 0 et 100 (ex: 95) → utilisé tel quel
 *
 * Évite la double multiplication qui produisait des valeurs comme 950% ou 9500%.
 * Clamp final à [0, 100] pour absorber toute hallucination du modèle.
 */
export function formatScore(score: number | null | undefined): number {
  if (score === null || score === undefined || !Number.isFinite(score)) return 0;
  const n = Number(score);
  if (n < 0) return 0;
  // Heuristique : si la valeur est <= 1, on suppose un décimal et on multiplie.
  // Sinon, on considère que c'est déjà un pourcentage.
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Variante string formatée avec le suffixe %. */
export function formatScorePct(score: number | null | undefined): string {
  return `${formatScore(score)}%`;
}
