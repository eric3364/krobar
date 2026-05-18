DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sicai_archetypes_archetype_id_key'
  ) THEN
    ALTER TABLE public.sicai_archetypes
      ADD CONSTRAINT sicai_archetypes_archetype_id_key UNIQUE (archetype_id);
  END IF;
END$$;

WITH fam(family, fam_label, fam_desc, fam_motifs, fam_tones, fam_best, fam_avoid) AS (VALUES
  ('NARRATIVE_SCENIQUE',       'scène narrative',        'scène incarnée avec personnages, lieu et action',                              ARRAY['personnage','décor','action'],          ARRAY['cinématographique','immersif'], ARRAY['storytelling','reportage'],            ARRAY['concepts abstraits purs']),
  ('DESCRIPTIVE_AMBIANCE',     'ambiance descriptive',   'évocation atmosphérique d''un lieu, d''un objet ou d''une matière',           ARRAY['texture','lumière','matière'],          ARRAY['poétique','sensoriel'],         ARRAY['descriptions sensorielles','climats'], ARRAY['procédures techniques']),
  ('EXPLICATIVE_SCHEMATIQUE',  'schéma explicatif',      'représentation didactique d''un mécanisme ou d''une structure',                ARRAY['flèche','bloc','légende'],              ARRAY['didactique','neutre'],          ARRAY['pédagogie','documentation'],           ARRAY['émotion brute']),
  ('PROCEDURALE_SEQUENTIELLE', 'procédure séquentielle', 'enchaînement d''étapes orientées dans le temps',                                ARRAY['étape','numérotation','flèche'],        ARRAY['méthodique','progressif'],      ARRAY['mode d''emploi','workflow'],           ARRAY['ambiances poétiques']),
  ('OPPOSITION_TRANSFORMATION','opposition / transformation','mise en tension de deux états ou bascule d''un état à un autre',          ARRAY['avant/après','axe','contraste'],        ARRAY['contrasté','dramatique'],       ARRAY['comparaison','changement'],            ARRAY['neutralité plate']),
  ('CONCEPTUELLE_SYSTEMIQUE',  'système conceptuel',     'cartographie abstraite de relations entre concepts ou acteurs',                ARRAY['nœud','réseau','grille'],               ARRAY['systémique','analytique'],      ARRAY['modèles','stratégie'],                 ARRAY['scènes incarnées'])
),
card(cardinality, card_label, card_desc, card_n) AS (VALUES
  ('UNITAIRE','un seul élément focal','focus sur une unité dominante', 1),
  ('BINAIRE','dualité',              'mise en relation de deux éléments', 2),
  ('TERNAIRE','triade',               'articulation de trois éléments', 3),
  ('MULTIPLE','pluralité',            'ensemble étendu de plusieurs éléments', 6)
),
reg(representation_regime, reg_label) AS (VALUES
  ('CONCRET',             'concret'),
  ('SEMI_METAPHORIQUE',   'semi-métaphorique'),
  ('ABSTRAIT_SYSTEMIQUE', 'abstrait systémique')
)
INSERT INTO public.sicai_archetypes (
  archetype_id, graphic_family, cardinality, representation_regime,
  description, composition_principle, visual_motifs, possible_tones, best_for, avoid_for
)
SELECT
  f.family || '_' || c.cardinality || '_' || r.representation_regime,
  f.family,
  c.cardinality,
  r.representation_regime,
  format('Archétype %s — %s, %s. %s ; %s.', f.fam_label, c.card_label, r.reg_label, f.fam_desc, c.card_desc),
  format('Composition %s avec %s éléments centraux, traités en mode %s.', f.fam_label, c.card_n, r.reg_label),
  to_jsonb(f.fam_motifs),
  to_jsonb(f.fam_tones),
  to_jsonb(f.fam_best),
  to_jsonb(f.fam_avoid)
FROM fam f
CROSS JOIN card c
CROSS JOIN reg r
ON CONFLICT (archetype_id) DO NOTHING;