export type TestCase = {
  id: number;
  expected_template: string;
  category: string;
  text: string;
};

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
    text: "Décomposition du budget annuel de production d'un cours en ligne. La conception pédagogique représente quinze pour cent du budget total. La production des contenus écrits et illustrations mobilise trente pour cent. L'enregistrement vidéo et le montage absorbent quarante pour cent. La diffusion, marketing et maintenance plateforme couvrent les quinze pour cent restants.",
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
];
