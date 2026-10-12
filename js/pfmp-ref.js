// Grille officielle « Fiche d'évaluation de l'apprenant en entreprise » (Bac Pro MELEC, épreuve E3).
// Chaque critère est évalué en 4 niveaux : - / + / ++ / +++.

export const LEVELS = [
  { label: '-', text: 'Pas de réussite ou non fait', value: 0 },
  { label: '+', text: 'Réussite partielle', value: 4 },
  { label: '++', text: 'Réussite totale avec aide', value: 7 },
  { label: '+++', text: 'Réussite totale en autonomie', value: 10 },
];

const C = (id, comp, label, crits) => ({ id, comp, label, criteres: crits.map((t, i) => ({ id: `${id}-${i + 1}`, label: t })) });

export const GROUPS = [
  {
    id: 'PREP',
    label: 'PRÉPARATION',
    tasks: [
      ['T1-1', 'T 1-1/TA 1-1 : prendre connaissance du dossier relatif aux opérations à réaliser, le constituer pour une opération simple / prendre connaissance du dossier relatif aux opérations à réaliser dans leur environnement'],
      ['T1-2', 'T 1-2 : rechercher et expliquer les informations relatives aux opérations et aux conditions d’exécution'],
      ['T1-3', 'T 1-3=TA 1-2 : vérifier et compléter si besoin la liste des matériels, équipements et outillages nécessaires aux opérations'],
      ['T1-4', 'T 1-4 : répartir les tâches en fonction des habilitations, des certifications des équipiers et du planning des autres intervenants'],
    ],
    comps: [
      C('PC1', 'C1', 'C1-C01 ANALYSER LES CONDITIONS DE L’OPÉRATION ET SON CONTEXTE', [
        'Les informations nécessaires sont recueillies',
        'Les contraintes techniques et d’exécution sont repérées',
        'Les contraintes liées à l’efficacité énergétique sont repérées',
        'Les risques professionnels sont évalués',
        'Les mesures de prévention de santé et sécurité au travail sont proposées',
        'Les contraintes environnementales sont recensées',
        'Les interactions avec les autres intervenants sont repérées',
        'Les habilitations et certifications nécessaires à l’opération sont identifiées',
      ]),
      C('PC3', 'C3', 'C3 DÉFINIR UNE INSTALLATION À L’AIDE DE SOLUTIONS PRÉÉTABLIES', [
        'Le dossier technique des opérations est constitué et complet',
        'La solution technique proposée répond au besoin du client et elle est pertinente',
        'La solution technique proposée intègre les enjeux d’efficacité énergétique',
      ]),
      C('PC10', 'C10', 'C10-C07 EXPLOITER LES OUTILS NUMÉRIQUES DANS LE CONTEXTE PROFESSIONNEL', [
        'Les applications numériques (logiciel de représentation graphique, de dimensionnement, de chiffrage...) sont exploitées avec pertinence',
        'La recherche d’information est faite avec pertinence',
        'Les moyens et outils de communication numériques sont exploités avec pertinence',
        'Les moyens et outils de communication sont exploités de manière éthique et responsable',
      ]),
    ],
  },
  {
    id: 'REAL',
    label: 'RÉALISATION',
    tasks: [
      ['T2-1', 'T 2-1=TA 2-1 : organiser le poste de travail'],
      ['T2-2', 'T 2-2=TA 2-2 : implanter, poser, installer les matériels électriques'],
      ['T2-3', 'T 2-3=TA 2-3 : câbler, raccorder les matériels électriques'],
      ['T2-4', 'T 2-4 : gérer les activités de son équipe'],
      ['T2-5', 'T 2-5 : coordonner son activité par rapport à celles des autres intervenants'],
      ['T2-6', 'T 2-6=TA 2-4 : mener son activité de manière éco-responsable'],
    ],
    comps: [
      C('PC2', 'C2', 'C2-C02 ORGANISER L’OPÉRATION DANS SON CONTEXTE', [
        'Après inventaire, les matériels, équipements et outillage manquants sont listés',
        'Le bon d’approvisionnement ou bon de commande est complété',
        'Les tâches sont réparties en fonction des habilitations et certifications des électriciens',
        'La répartition prend en compte l’avancement des autres intervenants',
        'Les activités sont organisées de manière chronologique',
        'Les contraintes propres au poste de travail, y compris environnementales, sont prises en compte',
        'Les activités sont (ré)organisées en fonction des aléas (techniques, organisationnels)',
        'Les règles de sécurité et de santé au travail sont respectées',
        'Le poste de travail est organisé',
        'Le poste de travail est approvisionné en matériel, équipements et outillage',
        'Le lieu d’activité est restitué quotidiennement propre et en ordre',
      ]),
      C('PC4', 'C4', 'C4-C03 RÉALISER UNE INSTALLATION DE MANIÈRE ÉCO-RESPONSABLE', [
        'Les matériels sont posés conformément aux prescriptions et règles de l’art',
        'Le façonnage est réalisé conformément aux prescriptions et règles de l’art',
        'Les câblages et les raccordements sont réalisés conformément aux prescriptions et règles de l’art',
        'Les adaptations techniques nécessaires sont réalisées',
        'Les réalisations respectent les contraintes liées à l’efficacité énergétique',
        'Les autocontrôles sont réalisés et les fiches d’autocontrôle sont complétées',
        'Les déchets sont triés et évacués de manière sélective',
        'Le consommable est utilisé sans gaspillage',
        'Les règles de santé et de sécurité au travail sont respectées',
        'Les procédures de respect de l’environnement des lieux et des biens sont appliquées',
      ]),
    ],
  },
  {
    id: 'MES',
    label: 'MISE EN SERVICE',
    tasks: [
      ['T3-1', 'T 3-1/TA 3-1 : réaliser les vérifications, les réglages, les paramétrages, les essais nécessaires à la mise en service de l’installation / réaliser les vérifications, les réglages, les essais nécessaires à la mise en service de l’installation'],
      ['T3-2', 'T 3-2/TA 3-2 : participer à la réception technique et aux levées de réserves de l’installation / participer aux opérations nécessaires aux levées de réserves de l’installation'],
    ],
    comps: [
      C('PC5', 'C5', 'C5-C04 CONTRÔLER LES GRANDEURS CARACTÉRISTIQUES DE L’INSTALLATION', [
        'Les contrôles (visuels, caractéristiques...) sont réalisés',
        'Les mesures (électriques, dimensionnelles...) sont réalisées',
        'Les mesures liées à l’efficacité énergétique sont réalisées',
        'Les essais adaptés sont réalisés',
        'Les grandeurs contrôlées sont correctement interprétées au regard des prescriptions',
        'Les règles de santé et de sécurité au travail sont respectées',
      ]),
      C('PC6', 'C6', 'C6 RÉGLER, PARAMÉTRER LES MATÉRIELS DE L’INSTALLATION', [
        'Les réglages sont réalisés conformément aux prescriptions',
        'Les réglages prennent en compte l’efficacité énergétique',
        'Les paramétrages guidés sont réalisés conformément aux prescriptions',
        'Les règles de santé et de sécurité au travail sont respectées',
      ]),
      C('PC7', 'C7', 'C7-C05 VALIDER LE FONCTIONNEMENT DE L’INSTALLATION', [
        'L’installation est mise en fonctionnement conformément aux prescriptions',
        'Le fonctionnement est conforme aux spécifications du cahier des charges (y compris celles liées à l’efficacité énergétique)',
        'Les opérations nécessaires à la levée de réserve sont faites',
        'Les règles de santé et de sécurité au travail sont respectées',
      ]),
    ],
  },
  {
    id: 'MAINT',
    label: 'MAINTENANCE',
    tasks: [
      ['T4-1', 'T 4-1 : réaliser une opération de maintenance préventive'],
      ['T4-2', 'T 4-2/TA 4-1 : réaliser une opération de dépannage / réaliser une opération de maintenance simple'],
    ],
    comps: [
      C('PC8', 'C8', 'C8 DIAGNOSTIQUER UN DYSFONCTIONNEMENT', [
        'Les informations relatives au dysfonctionnement sont analysées',
        'Le fonctionnement de l’installation est analysé',
        'Le diagnostic est posé',
        'Le diagnostic est pertinent et complet',
        'Les règles de santé et de sécurité au travail sont respectées',
      ]),
      C('PC9', 'C9', 'C9 REMPLACER UN MATÉRIEL ÉLECTRIQUE', [
        'Le matériel électrique à remplacer est identifié',
        'Le matériel électrique à remplacer est correctement déposé',
        'Le matériel électrique de remplacement est correctement choisi',
        'Le matériel électrique de remplacement est correctement installé',
        'Le fonctionnement est vérifié après rétablissement des énergies',
        'Les règles de santé et de sécurité au travail sont respectées',
      ]),
    ],
  },
  {
    id: 'COM',
    label: 'COMMUNICATION',
    tasks: [
      ['T5-1', 'T 5-1 : participer à la mise à jour du dossier technique de l’installation'],
      ['T5-2', 'T 5-2=TA 5-1 : échanger sur le déroulement des opérations, expliquer le fonctionnement de l’installation à l’interne et à l’externe'],
      ['T5-3', 'T 5-3 : conseiller le client, lui proposer une prestation complémentaire, une modification ou une amélioration'],
    ],
    comps: [
      C('PC11', 'C11', 'C11 COMPLÉTER LES DOCUMENTS LIÉS AUX OPÉRATIONS', [
        'Les documents à compléter sont identifiés',
        'Les informations nécessaires sont identifiées',
        'Les documents sont complétés ou modifiés correctement',
      ]),
      C('PC12', 'C12', 'C12 COMMUNIQUER ENTRE PROFESSIONNELS SUR L’OPÉRATION', [
        'Les informations nécessaires à la communication (contraintes des autres intervenants, aléas rencontrés, consignes de la hiérarchie, préparation de la réunion de chantier) sont identifiées',
        'Les contraintes techniques sont expliquées / remontées à sa hiérarchie',
        'Les choix technologiques sont argumentés',
        'Les choix économiques sont expliqués',
        'Les contraintes techniques liées à la performance énergétique de l’installation sont expliquées',
        'L’état d’avancement de l’opération est justifié / remonté à la hiérarchie',
        'Les difficultés sont remontées à la hiérarchie',
      ]),
      C('PC13', 'C13', 'C13 COMMUNIQUER AVEC LE CLIENT/USAGER SUR L’OPÉRATION', [
        'Les besoins du client sont collectés',
        'Les contraintes techniques d’utilisation et de performances énergétiques de l’installation sont expliquées',
        'Les usages et le fonctionnement de l’installation sont maîtrisés par le client',
        'Les choix technologiques et économiques sont expliqués',
        'L’état d’avancement de l’opération et ses contraintes sont expliqués',
        'Les prestations complémentaires sont expliquées',
        'La satisfaction client est collectée',
      ]),
    ],
  },
];

export const ALL_COMPS = GROUPS.flatMap((g) => g.comps);

export const ATTITUDES = [
  ['AP1', 'HABILETÉ', ['Maladroit', 'Habileté inférieure à la moyenne', 'Habileté moyenne', 'Habileté supérieure', 'Très habile']],
  ['AP2', 'SOCIABILITÉ', ['Indiscipliné', 'Ne s’intègre pas', 'S’intègre difficilement', 'Accepte les règles du groupe', 'Excellente intégration']],
  ['AP3', 'INTÉRÊT PORTÉ AU TRAVAIL', ['Exécute sans intérêt', 'Peu d’écoute et de curiosité', 'Écoute et curiosité moyennes', 'Est attentif(ve), s’intéresse', 'Se passionne et se perfectionne']],
  ['AP4', 'INITIATIVE', ['Attend tout des autres', 'Esprit d’initiative limité', 'Esprit d’initiative moyen', 'Esprit d’initiative supérieur', 'Très porté à agir, à proposer']],
  ['AP5', 'ANALYSE CRITIQUE DU TRAVAIL', ['Sans qualité', 'Niveau de qualité insuffisant', 'Niveau de qualité passable', 'Bon niveau de qualité', 'Excellent']],
].map(([id, label, options]) => ({ id, label, options }));

// ---------- Informations complétées par l'élève avant la PFMP ----------

export const STUDENT_FIELDS = [
  ['birthDate', 'Date de naissance', 'date', true],
  ['phone', 'Téléphone de l’élève', 'tel'],
  ['email', 'E-mail de l’élève', 'email'],
];

export const COMPANY_FIELDS = [
  ['name', 'Nom de l’entreprise', 'text', true],
  ['address', 'Adresse', 'text', true],
  ['postcode', 'Code postal', 'text', true],
  ['city', 'Ville', 'text', true],
  ['phone', 'Téléphone de l’entreprise', 'tel'],
  ['email', 'E-mail de l’entreprise', 'email'],
  ['siret', 'N° SIRET', 'text'],
  ['repName', 'Représentée par (nom du responsable)', 'text', true],
  ['repFunction', 'Fonction du responsable', 'text'],
  ['tutorName', 'Nom du tuteur', 'text', true],
  ['tutorFunction', 'Fonction du tuteur', 'text'],
  ['tutorPhone', 'Téléphone du tuteur', 'tel', true],
  ['tutorEmail', 'E-mail du tuteur', 'email'],
  ['hours', 'Horaires de travail', 'text'],
];

export const companyAddress = (c = {}) => [c.address, [c.postcode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

// ---------- Échange du formulaire élève (lien / code) ----------

const b64urlEncode = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDecode = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
export const encodePayload = (obj) => b64urlEncode(JSON.stringify(obj));
export const decodePayload = (s) => JSON.parse(b64urlDecode(s.trim()));

/** Extrait la réponse d'un élève depuis un lien ou un code collé. */
export function parseReply(text) {
  const m = String(text).match(/pfmp-import\/([\w-]+)/) || String(text).match(/^\s*([\w-]{20,})\s*$/);
  if (!m) throw new Error('Code ou lien non reconnu');
  const data = decodePayload(m[1]);
  if (data.k !== 'evalq-pfmp' || !data.p) throw new Error('Ce code ne correspond pas à une fiche PFMP');
  return data;
}
