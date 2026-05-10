export type ChoremeFamily = "A" | "B" | "C";

export type ChoremeMeta = {
  code: string; // e.g. "A4"
  family: ChoremeFamily;
  triplet?: string;
  dominant_processes?: string[];
  matching_expressions?: string[];
};

export type TestCase = {
  id: number;
  expected_template: string;
  category: string;
  text: string;
  /** Présent si le template est un chorème. */
  choreme?: ChoremeMeta;
};

// ----- Génération dynamique pour couvrir l'intégralité du manifest (79 templates) -----

type ManifestEntry = {
  id: string;
  name?: string;
  category?: string;
  best_for?: string;
  cardinality?: number | { ideal?: number; min?: number; max?: number };
  choreme?: {
    code?: string;
    family?: ChoremeFamily;
    triplet?: string;
    dominant_processes?: string[];
    matching_expressions?: string[];
  };
};

function getIdeal(card: ManifestEntry["cardinality"]): number {
  if (card == null) return 3;
  if (typeof card === "number") return card;
  return card.ideal ?? 3;
}

function cleanBestFor(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/^[A-ZÀ-Ö0-9]+\s*—\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ITEMS = [
  "la conception",
  "le développement",
  "la maturité",
  "la transformation",
  "la consolidation",
  "l'expansion",
  "la diffusion",
];

function generateChoremeText(t: ManifestEntry): string {
  const ideal = getIdeal(t.cardinality);
  const markers = t.choreme?.matching_expressions ?? [];
  const topic =
    cleanBestFor(t.best_for) ||
    `analyse de ${(t.name || t.id).toLowerCase()}`;
  const intro = topic.charAt(0).toUpperCase() + topic.slice(1).replace(/\.$/, "") + ".";

  if (ideal <= 1) {
    const m = markers.slice(0, 3);
    return `${intro} ${m[0] || "Tout dépend de"} ce concept central, ${
      m[1] || "au cœur"
    } de toute la démarche. ${m[2] || "Rien sans"} cette idée fondatrice qui irrigue l'ensemble du propos.`;
  }

  const items = Array.from({ length: ideal }, (_, i) => ITEMS[i % ITEMS.length]);
  const m = [...markers];
  while (m.length < ideal) m.push(["puis", "ensuite", "enfin", "également"][m.length % 4]);
  const parts = items.map((it, i) => `${m[i]} ${it}`);
  return `${intro} On observe ${parts.join(", ")}. Cette structure caractérise bien le motif observé.`;
}

function generateProceduralText(t: ManifestEntry): string {
  const ideal = Math.max(2, getIdeal(t.cardinality));
  const intro = cleanBestFor(t.best_for) || `Présentation de ${t.name || t.id}`;
  const list = Array.from({ length: ideal }, (_, i) => ITEMS[i % ITEMS.length]).join(", ");
  return `${intro}. Cette structure articule plusieurs éléments successifs : ${list}. Chaque composant joue un rôle précis dans l'ensemble du dispositif.`;
}

/**
 * Construit la suite complète de tests : les cas existants conservés tels
 * quels, plus un cas généré automatiquement pour chaque template du manifest
 * non couvert (chorèmes + procéduraux manquants).
 */
export function buildFullTestSuite(manifest: { templates: ManifestEntry[] }): TestCase[] {
  const result: TestCase[] = [...testSuite];
  const covered = new Set(result.map((t) => t.expected_template));
  let nextId = result.reduce((m, t) => Math.max(m, t.id), 0) + 1;

  for (const tpl of manifest.templates) {
    if (covered.has(tpl.id)) continue;
    const isChoreme = tpl.id.startsWith("choreme_") || !!tpl.choreme;
    if (isChoreme && tpl.choreme?.code && tpl.choreme?.family) {
      result.push({
        id: nextId++,
        expected_template: tpl.id,
        category: "Chorème",
        text: generateChoremeText(tpl),
        choreme: {
          code: tpl.choreme.code,
          family: tpl.choreme.family,
          triplet: tpl.choreme.triplet,
          dominant_processes: tpl.choreme.dominant_processes,
          matching_expressions: tpl.choreme.matching_expressions,
        },
      });
    } else {
      result.push({
        id: nextId++,
        expected_template: tpl.id,
        category: tpl.category || "Other",
        text: generateProceduralText(tpl),
      });
    }
  }
  return result;
}

export const testSuite: TestCase[] = [
  {
    id: 1,
    expected_template: "process_3_steps",
    category: "Process",
    text: "Le déploiement d'une nouvelle formation suit trois grandes phases. La phase de conception débute par l'analyse des besoins du marché et la rédaction du programme pédagogique. La phase de production rassemble les supports, vidéos et évaluations sous la coordination du responsable pédagogique. La phase de lancement officialise la formation sur la plateforme avec communication marketing et inscription des premiers apprenants.",
  },
  {
    id: 2,
    expected_template: "process_5_steps",
    category: "Process",
    text: "La méthodologie de production d'un cours en ligne s'articule en cinq étapes successives. L'audit pédagogique identifie les compétences cibles et le public visé. La conception du syllabus structure les modules et les objectifs d'apprentissage. La rédaction des contenus produit les textes, scripts et exercices. L'enregistrement multimédia capture les vidéos et illustrations. Enfin, la mise en ligne déploie le cours sur la plateforme avec tests qualité.",
  },
  {
    id: 3,
    expected_template: "cycle_4_steps",
    category: "Process",
    text: "L'amélioration continue des formations repose sur le cycle PDCA appliqué chaque trimestre. Nous planifions les évolutions à apporter sur la base des retours apprenants. Nous déployons les modifications sur les modules concernés. Nous vérifions l'impact via les indicateurs de complétion et de satisfaction. Nous standardisons les bonnes pratiques pour les diffuser à l'ensemble du catalogue.",
  },
  {
    id: 4,
    expected_template: "comparison_2_columns",
    category: "Comparison",
    text: "Deux modes de formation cohabitent dans l'enseignement supérieur. Le présentiel offre une immersion totale, des interactions directes avec les enseignants, un cadre studieux et un fort esprit de promotion. Le distanciel propose flexibilité géographique, autonomie de rythme, accès permanent aux ressources et coût réduit pour l'apprenant.",
  },
  {
    id: 5,
    expected_template: "comparison_3_columns",
    category: "Comparison",
    text: "Trois filières complémentaires composent l'offre de l'établissement. La filière digitale forme aux métiers du e-business, du marketing numérique et du commerce en ligne avec une pédagogie orientée projets. La filière management développe les compétences en ressources humaines, finance et stratégie d'entreprise. La filière création se positionne sur les secteurs du luxe, du sport business et des industries culturelles.",
  },
  {
    id: 6,
    expected_template: "hierarchy_pyramid",
    category: "Hierarchy",
    text: "La progression d'un apprenant suit trois niveaux d'expertise. Le niveau fondamental couvre les bases théoriques et le vocabulaire métier. Le niveau professionnel développe les compétences opérationnelles et la résolution de cas pratiques. Le niveau stratégique forme à la prise de décision, au pilotage d'équipe et à la vision long terme.",
  },
  {
    id: 7,
    expected_template: "org_tree",
    category: "Hierarchy",
    text: "L'établissement est structuré autour de plusieurs entités spécialisées. La direction générale supervise l'ensemble des activités. Trois pôles principaux en dépendent : le pôle pédagogique qui pilote les programmes des différentes filières, le pôle technologique qui développe la plateforme de formation, et le pôle commercial qui gère le recrutement et les partenariats entreprises.",
  },
  {
    id: 8,
    expected_template: "swot_matrix",
    category: "Business Frameworks",
    text: "Analyse stratégique d'un établissement d'enseignement supérieur en 2026. Ses forces incluent une plateforme technologique propriétaire, un catalogue de cours diversifié et une marque reconnue dans le digital. Ses faiblesses portent sur une notoriété encore limitée à l'international et une dépendance forte au marché national. Ses opportunités résident dans l'essor de la formation continue, l'IA générative pour la production pédagogique et l'export à l'étranger. Ses menaces viennent de la concurrence des MOOC gratuits, de la pression réglementaire sur les certifications et des géants américains du e-learning.",
  },
  {
    id: 9,
    expected_template: "bcg_matrix",
    category: "Business Frameworks",
    text: "Le portefeuille de programmes d'une école se répartit selon la matrice BCG. Les programmes de bachelor digital sont les étoiles, avec une forte croissance et une part de marché élevée. Les mastères en management constituent les vaches à lait, génèrent des revenus stables sur un marché mature. Les nouvelles formations courtes en IA sont des dilemmes, à fort potentiel mais à part de marché encore faible. Les anciennes certifications bureautique sont les poids morts, à faible croissance et faible part.",
  },
  {
    id: 10,
    expected_template: "five_forces",
    category: "Business Frameworks",
    text: "L'environnement concurrentiel des écoles supérieures privées peut s'analyser via les cinq forces de Porter. La rivalité entre établissements est intense avec plus de cent écoles privées sur le marché. Le pouvoir des étudiants-clients s'accroît grâce à la transparence des classements. Les nouveaux entrants comme les bootcamps tech menacent les programmes courts. Les substituts incluent les MOOC gratuits et la formation en entreprise. Les fournisseurs, principalement les enseignants vacataires de qualité, ont un pouvoir grandissant face à la pénurie d'experts.",
  },
  {
    id: 11,
    expected_template: "business_model_canvas",
    category: "Business Frameworks",
    text: "Le modèle économique d'une école supérieure s'appuie sur neuf composantes. Ses partenaires clés sont les entreprises pour les stages et les organismes certificateurs. Ses activités clés sont la conception pédagogique et la production de contenus. Sa proposition de valeur réside dans des formations professionnalisantes à débouchés concrets. La relation client se construit via accompagnement individualisé et réseau d'anciens. Ses segments visent les bacheliers, alternants et professionnels en reconversion. Ses ressources clés sont la plateforme technologique et le corps enseignant. Ses canaux : salons étudiants, marketing digital et presse spécialisée. Sa structure de coûts couvre salaires, technologie et marketing. Ses revenus proviennent des frais de scolarité et financements de la formation continue.",
  },
  {
    id: 12,
    expected_template: "timeline_horizontal",
    category: "Timelines",
    text: "L'histoire d'une école supérieure s'écrit en quatre étapes marquantes. En 2010, naissance de la première école digitale du groupe. En 2015, fusion avec une école de management pour étendre l'offre. En 2020, lancement d'une plateforme de formation en ligne propriétaire. En 2025, intégration d'une école créative et création d'une division IA pédagogique.",
  },
  {
    id: 13,
    expected_template: "roadmap_quarters",
    category: "Timelines",
    text: "Roadmap 2026 d'un projet de plateforme pédagogique. Au premier trimestre, finalisation du pipeline de production automatisée et déploiement de la nouvelle infrastructure. Au deuxième trimestre, intégration de la génération vidéo native et lancement du tableau de bord pédagogique. Au troisième trimestre, ouverture de l'API à des partenaires institutionnels et internationalisation des contenus. Au quatrième trimestre, certification qualité et déploiement multi-école avec personnalisation par marque.",
  },
  {
    id: 14,
    expected_template: "fishbone",
    category: "Cause and Effect",
    text: "Le faible taux de complétion d'un cours en ligne peut s'analyser selon plusieurs catégories de causes. Côté pédagogique, le contenu peut être mal calibré ou les exercices trop difficiles. Côté technologique, des bugs de la plateforme ou une lecture vidéo lente démotivent. Côté humain, le manque d'accompagnement individuel et l'absence d'interactions sociales isolent l'apprenant. Côté contexte, des contraintes professionnelles et familiales empêchent une régularité d'étude.",
  },
  {
    id: 15,
    expected_template: "cause_effect_arrows",
    category: "Cause and Effect",
    text: "Trois facteurs principaux expliquent la hausse des inscriptions à l'école cette année. La refonte du site web a doublé le taux de conversion des visiteurs. Un partenariat presse avec un grand média étudiant a triplé la notoriété. L'élargissement du catalogue avec dix nouveaux programmes a élargi la cible. Ces trois leviers conjugués ont généré une croissance de quarante pour cent du nombre d'inscrits.",
  },
  {
    id: 16,
    expected_template: "donut_4_parts",
    category: "Parts of a Whole",
    text: "Répartition des étudiants par filière sur l'année 2025-2026. La filière digitale concentre quarante pour cent des effectifs avec ses programmes numériques. La filière management regroupe trente pour cent des étudiants en gestion et RH. La filière création accueille vingt pour cent des inscrits sur les domaines luxe et sport business. Les formations courtes spécialisées représentent les dix pour cent restants.",
  },
  {
    id: 17,
    expected_template: "stacked_bar",
    category: "Parts of a Whole",
    text: "La structure de coûts d'un cours en ligne se décompose en quatre postes successifs qui s'additionnent jusqu'au coût total. Le poste conception pédagogique pèse quinze pour cent du budget global. Le poste production de contenus écrits et illustrations cumule trente pour cent supplémentaires. Le poste enregistrement vidéo et montage représente la part la plus lourde avec quarante pour cent. Le poste diffusion, marketing et maintenance plateforme complète le total avec les quinze pour cent restants. Cette ventilation linéaire permet de visualiser le poids relatif de chaque phase dans la chaîne de production.",
  },
  {
    id: 18,
    expected_template: "mindmap_central",
    category: "Mindmap",
    text: "Les compétences clés d'un manager moderne se déploient autour de quatre axes principaux. L'intelligence relationnelle regroupe l'écoute active et la gestion des conflits. La vision stratégique inclut l'anticipation des marchés et l'analyse concurrentielle. L'excellence opérationnelle couvre la gestion de projet et le pilotage par les indicateurs. L'agilité numérique mobilise la maîtrise des outils digitaux et la culture data.",
  },
  {
    id: 19,
    expected_template: "iceberg",
    category: "Visual Metaphors",
    text: "La culture d'entreprise d'un établissement d'enseignement fonctionne comme un iceberg. La partie visible regroupe le logo, les locaux, le site web et les communications officielles. Sous la surface se cachent des éléments plus profonds. Les pratiques quotidiennes structurent les comportements informels. Les valeurs partagées orientent les décisions implicites. Les croyances fondatrices, parfois inconscientes, déterminent l'identité profonde de l'organisation.",
  },
  {
    id: 20,
    expected_template: "bridge_problem_solution",
    category: "Visual Metaphors",
    text: "Beaucoup d'apprenants peinent à passer de la formation théorique à l'employabilité réelle. Côté problème, on observe un manque d'expérience concrète et une difficulté à valoriser ses acquis face aux recruteurs. La transition s'opère via deux leviers complémentaires. Le premier levier est la mise en situation professionnelle par les stages et l'alternance. Le second est l'accompagnement à la valorisation, avec coaching CV et préparation aux entretiens. Côté solution, l'apprenant accède à un réseau professionnel actif et obtient un placement rapide en entreprise.",
  },
  {
    id: 21,
    expected_template: "idea_cluster",
    category: "Brainstorming",
    text: "Brainstorming des idées de campagne marketing pour la rentrée 2026. L'équipe communication propose une série de webinaires métiers animés par des alumni. Un partenariat avec des influenceurs étudiants permettrait d'élargir l'audience sur les réseaux sociaux. Des journées portes ouvertes immersives, mêlant cours en direct et témoignages, créeraient un effet d'engagement fort. Un podcast hebdomadaire avec des étudiants ambassadeurs nourrirait la visibilité long terme. Un salon virtuel 360 degrés permettrait de toucher les candidats à distance. Enfin, un programme de parrainage alumni structuré pourrait activer le bouche-à-oreille.",
  },
  {
    id: 22,
    expected_template: "story_arc",
    category: "Narrative",
    text: "L'histoire d'une école supérieure se construit en cinq actes successifs. Tout commence en 2010 avec la fondation par trois enseignants passionnés autour d'un projet pédagogique innovant. L'élément déclencheur survient en 2015 lorsque la première promotion sort avec un taux d'insertion exceptionnel, attirant l'attention du marché. Le climax du récit se joue en 2020 avec une crise de croissance majeure, le doublement des effectifs imposant une refonte complète de l'organisation. La résolution intervient en 2023 avec la mise en place d'une nouvelle gouvernance et le lancement de la plateforme pédagogique propriétaire. Aujourd'hui, l'école s'établit comme leader régional avec quatre campus et plus de deux mille étudiants.",
  },
  {
    id: 23,
    expected_template: "asymmetric_mindmap",
    category: "Mindmap",
    text: "L'organisation d'un événement corporate peut se décomposer de façon asymétrique. Le volet logistique comprend la réservation du lieu, le traiteur et la signalétique. Le volet communication englobe les invitations, les réseaux sociaux et le dossier de presse. Le volet programme se concentre sur les intervenants et les ateliers. Le volet budget ne comporte qu'un seul point : le suivi des dépenses en temps réel. Cette carte mentale asymétrique reflète l'inégalité naturelle de complexité entre les axes.",
  },
  {
    id: 24,
    expected_template: "bars_horizontal_sketchy",
    category: "Data Visualization",
    text: "Résultats du sondage de satisfaction des apprenants pour le semestre 2025. La qualité des contenus obtient un score de quatre-vingt-cinq pour cent. L'accompagnement pédagogique atteint soixante-douze pour cent. La plateforme technique recueille soixante-huit pour cent d'avis favorables. L'ambiance et le réseau étudiant culminent à quatre-vingt-onze pour cent. Ces barres horizontales permettent de comparer visuellement les dimensions évaluées.",
  },
  {
    id: 25,
    expected_template: "bullseye_target",
    category: "Strategy",
    text: "Priorisation des initiatives stratégiques selon leur impact. Au cœur de la cible se trouve le lancement de la certification IA, initiative à impact maximal. Le deuxième anneau contient le partenariat avec trois universités européennes. Le troisième anneau regroupe la refonte du site web et l'optimisation SEO. La zone extérieure rassemble les projets exploratoires comme le podcast et le programme ambassadeur. Cette visualisation en cible aide à focaliser les ressources sur les priorités centrales.",
  },
  {
    id: 26,
    expected_template: "butterfly_metamorphosis",
    category: "Visual Metaphors",
    text: "La transformation digitale d'une entreprise traditionnelle suit les étapes d'une métamorphose. La phase œuf représente l'idée initiale de transformation et la prise de conscience du besoin. La phase chenille correspond à l'accumulation de compétences numériques et à la formation des équipes. La phase chrysalide symbolise la période de restructuration interne et de refonte des processus. La phase papillon incarne l'entreprise transformée, agile et pleinement digitalisée, prête à déployer ses ailes sur de nouveaux marchés.",
  },
  {
    id: 27,
    expected_template: "colorful_staircase",
    category: "Process",
    text: "La montée en compétences d'un développeur junior suit un escalier progressif. La première marche couvre les fondamentaux : HTML, CSS et JavaScript. La deuxième marche introduit les frameworks modernes et la gestion de version. La troisième marche aborde l'architecture logicielle et les design patterns. La quatrième marche traite du DevOps, du CI/CD et du monitoring. La cinquième marche atteint le niveau senior avec le mentorat, la revue d'architecture et la prise de décisions techniques stratégiques.",
  },
  {
    id: 28,
    expected_template: "convergent_mindmap",
    category: "Mindmap",
    text: "Plusieurs disciplines convergent vers la création d'une expérience utilisateur réussie. Le design d'interface apporte l'esthétique et l'ergonomie visuelle. La recherche utilisateur fournit les insights comportementaux et les personas. Le développement front-end traduit les maquettes en interactions fluides. Le copywriting UX assure la clarté et la pertinence des messages. Toutes ces branches convergent vers un objectif unique : une expérience utilisateur cohérente et mémorable.",
  },
  {
    id: 29,
    expected_template: "curve_exponential",
    category: "Data Visualization",
    text: "La croissance du nombre d'utilisateurs de la plateforme suit une courbe exponentielle caractéristique. Les six premiers mois ont vu une progression lente avec seulement deux cents inscrits. Entre le sixième et le douzième mois, l'effet réseau a déclenché une accélération avec deux mille utilisateurs. À dix-huit mois, le cap des dix mille a été franchi grâce au bouche-à-oreille. À vingt-quatre mois, la plateforme compte cinquante mille utilisateurs actifs, confirmant le modèle de croissance exponentielle.",
  },
  {
    id: 30,
    expected_template: "cycle_6_steps",
    category: "Process",
    text: "Le cycle de vie d'un projet pédagogique numérique comporte six phases itératives. L'idéation génère les concepts de cours à partir des besoins identifiés. La conception structure le programme, les objectifs et les évaluations. La production crée les contenus multimédias et les exercices interactifs. La validation soumet le cours à une relecture par les pairs et des tests utilisateurs. Le déploiement met le cours en ligne et lance la communication. L'analyse mesure les résultats et alimente le cycle suivant d'idéation.",
  },
  {
    id: 31,
    expected_template: "flowchart_decision",
    category: "Process",
    text: "L'orientation d'un étudiant suit un arbre de décision structuré. Première question : le candidat souhaite-t-il travailler dans le digital ? Si oui, on vérifie son appétence pour la technique. Si technique, orientation vers le parcours développement. Si créatif, orientation vers le parcours UX design. Si ni technique ni créatif mais orienté business, parcours marketing digital. Si le candidat ne souhaite pas le digital, on explore les filières management classique ou création. Ce flowchart guide les conseillers d'orientation.",
  },
  {
    id: 32,
    expected_template: "flowing_arrows",
    category: "Process",
    text: "Le parcours d'un lead commercial dans l'entonnoir de conversion suit un flux continu. La découverte attire l'attention via le contenu marketing et les réseaux sociaux. L'intérêt se manifeste par le téléchargement d'une brochure ou l'inscription à un webinaire. L'évaluation compare l'offre avec les alternatives du marché. La décision se concrétise lors d'un entretien personnalisé. L'inscription finalise le processus avec le paiement et l'onboarding. Ces flèches fluides illustrent la continuité du parcours client.",
  },
  {
    id: 33,
    expected_template: "journey_map_gps",
    category: "Process",
    text: "Le parcours d'un apprenant dans une formation en ligne ressemble à un itinéraire GPS. Le point de départ est l'inscription et le diagnostic initial de compétences. La première étape traverse les modules fondamentaux avec des quiz de validation. Le détour prévu passe par un projet pratique en équipe. L'étape intermédiaire est le mentorat individuel pour lever les blocages. La destination finale est la certification et la mise en réseau avec les alumni. Chaque étape est jalonnée d'indicateurs de progression.",
  },
  {
    id: 34,
    expected_template: "lighthouse_beacon",
    category: "Visual Metaphors",
    text: "La vision stratégique d'une organisation agit comme un phare pour guider les équipes. Le faisceau principal éclaire la mission fondamentale : démocratiser l'accès à l'éducation de qualité. Les rayons secondaires illuminent les valeurs cardinales : innovation pédagogique, excellence académique et inclusion sociale. La base solide du phare représente les fondations : l'expertise accumulée, la technologie propriétaire et la communauté d'alumni. Dans la tempête des changements du marché, ce phare maintient le cap stratégique.",
  },
  {
    id: 35,
    expected_template: "mountain_timeline",
    category: "Timelines",
    text: "L'ascension d'une startup edtech vers le sommet suit le profil d'une montagne. Le camp de base en 2020 marque la création de l'entreprise avec trois cofondateurs. Le premier camp d'altitude en 2021 correspond à la levée de fonds d'amorçage. Le passage difficile de 2022 traverse la crise de croissance et le pivot du modèle. Le camp avancé de 2023 atteint la rentabilité avec mille clients. Le sommet visé en 2025 représente l'expansion internationale et le cap des dix mille utilisateurs.",
  },
  {
    id: 36,
    expected_template: "multilevel_mindmap",
    category: "Mindmap",
    text: "L'écosystème d'une école supérieure se déploie sur plusieurs niveaux hiérarchiques. Au premier niveau, quatre grands pôles : académique, technologique, commercial et administratif. Le pôle académique se subdivise en programmes initiaux, formation continue et recherche. Chaque programme se décline en spécialisations : le bachelor propose digital, management et création. La formation continue offre des certificats courts, des diplômes et du sur-mesure entreprise. Cette carte multi-niveaux capture la complexité organisationnelle.",
  },
  {
    id: 37,
    expected_template: "multiple_donuts_kpi",
    category: "Data Visualization",
    text: "Le tableau de bord KPI de la plateforme pédagogique présente quatre indicateurs clés sous forme de donuts. Le taux de complétion des cours atteint soixante-dix-huit pour cent, en hausse de cinq points. Le taux de satisfaction apprenant s'élève à quatre-vingt-sept pour cent. Le taux de placement à six mois culmine à quatre-vingt-deux pour cent. Le taux de recommandation NPS affiche soixante-cinq pour cent. Chaque donut visualise la progression vers l'objectif cible annuel.",
  },
  {
    id: 38,
    expected_template: "nodal_network",
    category: "Network",
    text: "Le réseau de partenaires d'une école supérieure forme un maillage complexe. Le nœud central est l'école elle-même, connectée à six catégories de partenaires. Les entreprises partenaires fournissent stages et alternances. Les universités internationales permettent les échanges. Les incubateurs accueillent les projets étudiants. Les organismes certificateurs valident les diplômes. Les médias spécialisés assurent la visibilité. Les associations d'alumni entretiennent le réseau. Chaque nœud est relié à plusieurs autres, créant un écosystème interconnecté.",
  },
  {
    id: 39,
    expected_template: "pie_chart_simple",
    category: "Parts of a Whole",
    text: "Répartition du budget marketing annuel d'un établissement d'enseignement supérieur. Le marketing digital absorbe quarante-cinq pour cent du budget total avec les campagnes Google Ads, les réseaux sociaux et le référencement. Les salons et événements physiques représentent vingt-cinq pour cent. Les relations presse et partenariats médias comptent pour vingt pour cent. Les supports imprimés et le branding consomment les dix pour cent restants.",
  },
  {
    id: 40,
    expected_template: "pots_plants_evolution",
    category: "Visual Metaphors",
    text: "La croissance d'un projet entrepreneurial étudiant suit l'évolution d'une plante. La graine représente l'idée initiale germée lors d'un hackathon. Le bourgeon symbolise le prototype développé pendant l'incubateur. La jeune pousse correspond au premier client et à la validation du marché. La plante en fleur incarne le produit mature avec une base d'utilisateurs fidèles. L'arbre fruitier représente l'entreprise rentable qui génère des revenus récurrents et essaime de nouvelles initiatives.",
  },
  {
    id: 41,
    expected_template: "prism_decomposition",
    category: "Visual Metaphors",
    text: "Un concept stratégique complexe peut être décomposé comme la lumière à travers un prisme. La vision globale entre d'un côté du prisme sous forme de lumière blanche unifiée. De l'autre côté émergent les composantes spectrales distinctes : la composante produit définit l'offre de formation. La composante marché identifie les segments cibles. La composante technologie spécifie les outils et plateformes. La composante humaine couvre les talents et compétences nécessaires. La composante financière détaille le modèle économique.",
  },
  {
    id: 42,
    expected_template: "realistic_effect",
    category: "Visual Effects",
    text: "Présentation du nouveau campus numérique avec un rendu réaliste et immersif. L'espace central de coworking accueille deux cents postes de travail modulables. Les salles de cours hybrides sont équipées de caméras intelligentes et d'écrans interactifs. Le studio de production multimédia permet l'enregistrement professionnel de contenus. L'espace détente offre une cafétéria, une salle de sport et un jardin intérieur. Ce visuel réaliste aide les futurs étudiants à se projeter dans leur environnement d'études.",
  },
  {
    id: 43,
    expected_template: "rocket_innovation",
    category: "Visual Metaphors",
    text: "Le lancement d'un nouveau programme de formation suit la métaphore d'une fusée. La rampe de lancement représente la phase de recherche et développement du programme. Les boosters sont les investissements marketing et les partenariats initiaux. La mise en orbite correspond à l'atteinte du seuil de rentabilité avec la première promotion complète. La vitesse de croisière symbolise le rythme établi de trois promotions par an. L'objectif lunaire vise l'accréditation internationale et le déploiement sur trois continents.",
  },
  {
    id: 44,
    expected_template: "sideways_tree",
    category: "Hierarchy",
    text: "L'arborescence des compétences d'un data scientist se déploie horizontalement. Le tronc principal est la science des données. La première branche majeure couvre les statistiques et probabilités avec les sous-branches inférence et modélisation. La deuxième branche porte sur la programmation avec Python et SQL comme ramifications. La troisième branche englobe le machine learning avec le supervisé et le non-supervisé. La quatrième branche traite de la visualisation avec les outils Tableau et D3.js. Cet arbre latéral offre une lecture naturelle de gauche à droite.",
  },
  {
    id: 45,
    expected_template: "stages_evolution_6",
    category: "Process",
    text: "La maturité digitale d'une organisation éducative évolue en six stades successifs. Le stade initial se caractérise par l'absence de stratégie numérique. Le stade émergent voit apparaître des initiatives isolées de digitalisation. Le stade défini formalise une stratégie et des processus numériques. Le stade géré mesure et optimise les performances digitales. Le stade optimisé automatise et personnalise les parcours. Le stade innovant anticipe les ruptures technologiques et expérimente en continu.",
  },
  {
    id: 46,
    expected_template: "telescope_tripod",
    category: "Visual Metaphors",
    text: "L'analyse prospective du marché de l'éducation s'apparente à l'observation au télescope. L'oculaire représente la vision à court terme : les tendances du prochain semestre. Le tube optique symbolise le moyen terme avec les évolutions technologiques sur trois ans. L'objectif principal pointe vers le long terme : les mutations structurelles du secteur à dix ans. Le trépied qui stabilise l'ensemble repose sur trois pieds : les données marché, l'expertise sectorielle et la veille concurrentielle.",
  },
  {
    id: 47,
    expected_template: "venn_2_circles",
    category: "Comparison",
    text: "Les compétences d'un product manager se situent à l'intersection de deux domaines. Le premier cercle englobe les compétences business : compréhension du marché, analyse de la concurrence, définition de la proposition de valeur et pilotage du P&L. Le second cercle regroupe les compétences techniques : compréhension de l'architecture logicielle, capacité à lire du code, maîtrise des outils de prototypage et connaissance des méthodologies agiles. L'intersection des deux cercles définit le profil idéal du product manager : quelqu'un qui parle les deux langages.",
  },
  {
    id: 48,
    expected_template: "watercolor_effect",
    category: "Visual Effects",
    text: "Création d'une identité visuelle artistique pour le programme Arts et Culture Numérique. Le visuel principal utilise des effets aquarelle pour évoquer la créativité et l'expression artistique. Les teintes pastel de bleu et de rose se fondent naturellement, symbolisant la convergence entre art traditionnel et technologie. Les contours volontairement flous représentent la liberté créative encouragée dans le programme. Ce style watercolor distingue visuellement cette filière des programmes business plus structurés.",
  },
  {
    id: 49,
    expected_template: "whiteboard_effect",
    category: "Visual Effects",
    text: "Simulation d'une session de brainstorming créatif sur tableau blanc. L'effet whiteboard reproduit l'aspect spontané d'un atelier de travail collaboratif. Des post-its virtuels regroupent les idées par thématique avec un code couleur. Des flèches tracées à main levée relient les concepts entre eux. Des annotations manuscrites ajoutent des commentaires et des votes. Ce rendu tableau blanc donne une impression d'authenticité et de travail en cours, idéal pour présenter des réflexions en mode workshop.",
  },
];
