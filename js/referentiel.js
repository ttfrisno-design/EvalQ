// Référentiel par défaut : grille d'évaluation Bac Pro MELEC.
// Chaque critère est noté sur 10 ; la note d'une compétence est la moyenne
// des critères évalués, quel que soit leur nombre.

export const DEFAULT_EPREUVES = [
  { id: 'E2-1', label: 'E2-1 : Préparation d’un ouvrage' },
  { id: 'E2-2', label: 'E2-2 : Préparation d’un ouvrage' },
  { id: 'E31', label: 'E31 : Réalisation d’un équipement' },
  { id: 'E32', label: 'E32 : Livraison d’un équipement' },
  { id: 'E33', label: 'E33 : Maintenance d’un équipement' },
];

const RAW = [
  ['C1', 'Analyser les conditions de l’opération et son contexte', 'E2-1', [
    'Les symboles sont identifiés',
    'La fonction des appareils est conforme',
    'Les caractéristiques relevées sur la documentation sont conformes',
    'Les informations relevées sur les plans ou schémas sont conformes',
    'Les équipements et outillages sont correctement sélectionnés',
    'Les mesures de prévention sont proposées',
  ]],
  ['C2', 'Organiser l’opération dans son contexte', 'E31', [
    'Poste organisé pendant le câblage',
    'Poste rangé après le câblage',
    'Poste nettoyé',
    'Outils adaptés',
    'Respecter l’ordre logique de réalisation',
  ]],
  ['C3', 'Définir une installation à l’aide de solutions préétablies', 'E2-1', [
    'Le schéma proposé est conforme',
    'La solution proposée est conforme',
    'La modification proposée est conforme',
    'Le matériel proposé est conforme',
  ]],
  ['C4', 'Réaliser une installation de manière éco-responsable', 'E31', [
    'Esthétique industrielle',
    'Peigne bornier, longueur de fils',
    'Serrage connexion',
    'Sertissage des embouts',
    'Numérotation des conducteurs',
    'Fonctionnement',
  ]],
  ['C5', 'Contrôler les grandeurs caractéristiques de l’installation', 'E32', [
    'Choix de l’appareil de mesure',
    'Utilisation des appareils de mesures (raccordement)',
    'Réglage des appareils de mesures (calibre, nature du signal, unités)',
    'Lecture de l’appareil de mesure',
    'Exploitation des mesures',
  ]],
  ['C6', 'Régler, paramétrer les matériels de l’installation', 'E32', [
    'Réglage des protections thermiques, temporisations',
    'Paramétrer un appareil simple (horloge…)',
    'Paramétrer un système numérique',
    'Autonomie du réglage ou du paramétrage',
    'Utilisation de la documentation',
  ]],
  ['C7', 'Valider le fonctionnement de l’installation', 'E32', [
    'Mise en énergie maîtrisée',
    'Mise en service maîtrisée',
    'Mode manuel maîtrisé',
    'Mode automatique maîtrisé',
    'Sécurités et protections maîtrisées',
  ]],
  ['C8', 'Diagnostiquer un dysfonctionnement', 'E33', [
    'Mise en évidence de la panne',
    'Observation',
    'Circuit défaillant',
    'Relevé du circuit défaillant',
    'Éléments à tester',
    'Appareil utilisé',
    'Condition de test',
    'Critères de conformité',
    'Point de mesure',
    'Règles de sécurité respectées',
  ]],
  ['C9', 'Remplacer un matériel électrique', 'E33', [
    'Identification de l’appareil',
    'Mise en sécurité de l’intervention',
    'Relevé de la référence et confirmation de celle-ci',
    'Relevé de câblage de l’appareil',
    'Démontage et remontage avec méthode',
  ]],
  ['C10', 'Exploiter les outils numériques dans le contexte professionnel', 'E2-2', [
    'Utilisation See Electrical Expert',
    'Utilisation site constructeur',
    'Utilisation de Google Sheets',
    'Gestion fichiers, sauvegarde, partage / impression PDF, Drive',
    'Utilisation logiciel automatisme',
    'Utilisation messagerie, envoi pièce jointe',
  ]],
  ['C11', 'Compléter les documents liés aux opérations', 'E2-2', [
    'Les documents sont complétés totalement',
    'Les documents sont complétés avec soin',
    'Les documents sont correctement complétés',
    'Les documents sont compris de façon autonome',
  ]],
  ['C12', 'Communiquer entre professionnels sur l’opération', 'E31', [
    'Utilisation des bonnes terminologies',
    'Communication à bon escient',
    'S’exprime de façon claire et compréhensible',
    'Est attentif lors de la communication de consigne',
  ]],
  ['C13', 'Communiquer avec le client/usager sur l’opération', 'E32', [
    'Utilisation des bonnes terminologies',
    'S’exprime de façon claire et compréhensible',
    'La présentation est méthodique',
    'La présentation est complète',
    'Les règles de sécurité sont respectées',
  ]],
];

export const DEFAULT_COMPETENCES = RAW.map(([id, label, epreuve, crits]) => ({
  id,
  label,
  epreuve,
  criteres: crits.map((c, i) => ({ id: `${id}-${i + 1}`, label: c })),
}));

// Comportement face au travail : évalué comme une compétence (critères sur 10),
// mais affiché à part et exclu de la moyenne des compétences techniques.
export const BEHAVIOR_ID = 'CPT';
export const BEHAVIOR_EPREUVE = { id: BEHAVIOR_ID, label: 'Comportement face au travail' };
export const BEHAVIOR_COMP = {
  id: BEHAVIOR_ID,
  label: 'Comportement face au travail',
  epreuve: BEHAVIOR_ID,
  behavior: true,
  criteres: ['Rythme', 'Application', 'Persévérance', 'Soin', 'Autonomie', 'Efficacité', 'Initiative'].map((label, i) => ({
    id: `${BEHAVIOR_ID}-${i + 1}`,
    label,
  })),
};
