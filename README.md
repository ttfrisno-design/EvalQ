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
- **Comportement face au travail** : Rythme, Application, Persévérance, Soin, Autonomie, Efficacité, Initiative
  (notés sur 10). Évalué comme une compétence (seul ou avec d’autres), affiché à part (violet, icône étoile)
  et **exclu de la moyenne des compétences techniques**.
- **Code à 6 chiffres** demandé à chaque ouverture (et après 5 min en arrière-plan). Les données sont **chiffrées**
  (AES-256) avec ce code, sur l’appareil comme sur Google Drive.
- **Synchronisation Google Drive** : un fichier unique `EvalQ-donnees.json` dans votre Drive, partagé par tous vos
  appareils (PC, tablette, téléphone). Travail possible hors connexion ; fusion automatique des modifications
  faites sur plusieurs appareils.
- **Sauvegarde / restauration** manuelle (fichier `.json`).

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

## Synchronisation Google Drive (réglage unique)

1. [console.cloud.google.com](https://console.cloud.google.com/) → créer un projet « EvalQ ».
2. *API et services → Bibliothèque* → activer **Google Drive API**.
3. *Écran de consentement OAuth* (Google Auth Platform) → type **Externe**, nom « EvalQ » ;
   dans *Audience*, ajouter votre adresse Gmail comme **utilisateur test**.
4. *Clients → Créer un client* → **Application Web** → *Origines JavaScript autorisées* :
   `https://ttfrisno-design.github.io`.
5. Copier l’**ID client** (`….apps.googleusercontent.com`) et le coller dans *Réglages → Synchronisation*
   (ou le renseigner dans `js/config.js` pour qu’il soit prérempli sur tous les appareils).
6. Sur chaque appareil : *Réglages → Connecter Google Drive*, même compte Google, même code.

L’application n’a accès qu’aux fichiers qu’elle a elle-même créés dans votre Drive (autorisation `drive.file`).
La connexion Google dure une heure : ensuite, l’icône nuage devient orange ; la toucher reconnecte.

## Données personnelles

Les données (noms des élèves, notes) sont stockées **chiffrées** avec votre code, dans le navigateur de chaque
appareil et, si activé, dans **votre** Google Drive. Aucune liste d’élèves n’est incluse dans ce dépôt.
**Code oublié = données illisibles** : notez-le en lieu sûr. Une sauvegarde manuelle (*Réglages → Sauvegarde*)
produit un fichier non chiffré, à conserver en lieu sûr.

## Technique

HTML / CSS / JavaScript sans étape de compilation. Bibliothèques incluses dans `vendor/` (pour le hors-ligne) :
Chart.js 4.5.1, jsPDF 2.5.2, jspdf-autotable 3.8.4, SheetJS 0.18.5 (mini).
Pour tester en local : `python3 -m http.server` puis ouvrir `http://localhost:8000`.

## Autre application du dépôt

- [`appel/`](appel/README.md) : application d’appel (présent / absent) du Foyer Rural d’Isneauville, PWA reliée à Google Sheets via Apps Script.
