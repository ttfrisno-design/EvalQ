# EvalQ – Évaluation des compétences (Bac Pro MELEC)

Application web installable (PWA) pour évaluer les compétences des élèves des classes **1P2** et **TP2**,
à l’école et en entreprise, sur **tablette, téléphone ou ordinateur** (iPadOS, iOS, Android, Windows, macOS, ChromeOS, Linux).
Elle fonctionne **hors connexion** une fois installée. Aucune donnée n’est envoyée sur Internet.

## Fonctionnalités

- **Référentiel MELEC intégré** : compétences C1 à C13 et leurs critères, regroupés par épreuve (E2-1, E2-2, E31, E32, E33).
  Critères et compétences modifiables dans *Réglages*.
- **Notation** : chaque critère est noté **sur 10** ; la note d’une compétence est la **moyenne des critères évalués**,
  quel que soit leur nombre. Un critère non noté n’est pas compté.
- **Nouvelle évaluation** : intitulé, date, lieu (école / entreprise), choix des **compétences et des critères**,
  choix des **élèves**.
- **Saisie rapide** :
  - mode *Par élève* : boutons 0 à 10 adaptés au tactile, moyenne calculée en direct, case « Absent », commentaire ;
  - mode *Tableau* : grille élèves × critères (décimales acceptées), pratique sur tablette en paysage.
- **Évaluations en entreprise** repérables partout par l’**icône usine** et la **couleur orange**
  (les évaluations à l’école sont en **bleu** avec l’icône chapeau). Saisie de l’entreprise / du tuteur pour chaque élève.
- **Périodes** de 6 à 7 semaines et **semestres** paramétrables (dates 2026-2027 proposées par défaut).
- **Suivi de l’évolution** : pour chaque élève, graphique par compétence (ou moyenne générale) sur le semestre ou l’année,
  avec les moyennes par période ; profil radar école / entreprise ; comparaison avec la période précédente.
  Évolution de la classe période par période dans *Bilans*.
- **Bilan PDF** de fin de période (ou semestre / année) : synthèse de classe, fiche par élève
  (moyennes école / entreprise / globale, évolution, détail par critère, graphiques, liste des évaluations,
  commentaires, cadre d’appréciation). PDF individuel possible depuis la fiche d’un élève.
- **Import des élèves** depuis un fichier Excel (un onglet par classe, colonnes NOM et Prénom) —
  seuls le nom et le prénom sont conservés.
- **Sauvegarde / restauration** (fichier `.json`) pour ne rien perdre et transférer les données d’un appareil à l’autre.

## Mise en ligne (GitHub Pages)

1. Fusionner la branche dans `main`.
2. Sur GitHub : *Settings → Pages → Build and deployment → Source : **GitHub Actions***.
3. Le workflow `.github/workflows/pages.yml` publie l’application à l’adresse
   `https://<compte>.github.io/EvalQ/`.

## Installation sur l’appareil

- **iPad / iPhone** : ouvrir l’adresse dans Safari → bouton *Partager* → *Sur l’écran d’accueil*.
- **Android** : Chrome → menu ⋮ → *Installer l’application*.
- **Ordinateur** : Chrome / Edge → icône d’installation dans la barre d’adresse.

## Premier démarrage

1. Onglet *Évaluations* → **Importer un fichier Excel** → choisir le fichier des classes
   (onglets `1P2` et `TP2`).
2. Vérifier les dates des périodes dans *Réglages*.
3. Créer une évaluation, cocher compétences / critères / élèves, puis saisir les notes.

## Données personnelles

Les données (noms des élèves, notes) sont stockées **uniquement dans le navigateur de l’appareil** (localStorage)
et ne sont jamais envoyées sur un serveur. Aucune liste d’élèves n’est incluse dans ce dépôt.
Pensez à **exporter une sauvegarde** régulièrement (*Réglages → Sauvegarde*) : effacer les données du navigateur
ou désinstaller l’application supprime les notes.

## Technique

HTML / CSS / JavaScript sans étape de compilation. Bibliothèques incluses dans `vendor/` (pour le hors-ligne) :
Chart.js 4.5.1, jsPDF 2.5.2, jspdf-autotable 3.8.4, SheetJS 0.18.5 (mini).
Pour tester en local : `python3 -m http.server` puis ouvrir `http://localhost:8000`.
