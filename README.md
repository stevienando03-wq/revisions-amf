# Révision Certification AMF — application web (PWA)

Application de révision **100 % hors-ligne** pour préparer la **Certification professionnelle AMF**.
Elle réunit, par module, **la lecture du cours** et **l'entraînement aux QCM**, avec un examen blanc qui reproduit la règle officielle (≥ 80 % en catégorie A **et** en catégorie C, sans compensation).

## Ce que fait l'app

- **Tableau de bord** : jauge globale + **deux jauges A et C** avec le seuil 80 % toujours visible ; progression par module (% de cours lu et % de réussite QCM) ; module ESG mis en avant ; bouton « Réviser mes erreurs ».
- **Cours** (12 modules), chacun en deux couches :
  - **Essentiel** : à retenir (flashcards), chiffres-clés, pièges.
  - **Cours complet** : le texte intégral des fiches, avec sommaire interne, ancres, marquage de la lecture et **reprise là où tu t'étais arrêté**.
- **Entraînement**, 4 modes :
  - **Drill par module** (correction immédiate + explication).
  - **Examen blanc** : 120 questions tirées selon la pondération officielle, **chrono 2 h**, correction et **verdict A/C** à la fin.
  - **Révision des erreurs** en répétition espacée (2 bonnes de suite → la question sort de la file).
  - **Flashcards** « je savais / je savais pas ».
- **Chaque QCM** explique pourquoi la bonne réponse est juste **et pourquoi chaque mauvaise option est fausse**, avec un bouton **« Revoir dans le cours »** qui saute à la bonne section.
- **Recherche plein texte** sur le cours et les questions.
- **Installable** sur iPhone et Android, **fonctionne sans réseau** après le premier chargement. Progression enregistrée sur l'appareil (`localStorage`), bouton **Réinitialiser**.

## Lancer en local

Comme c'est un site statique, il faut le servir par HTTP (le service worker ne marche pas en `file://`) :

```bash
cd AMF-Revision
python -m http.server 8000
```
Puis ouvre `http://localhost:8000`.

## Publier sur GitHub Pages

1. Crée un dépôt GitHub (ex. `revision-amf`) puis, depuis le dossier `AMF-Revision` :

```bash
git init
git add .
git commit -m "App de révision AMF"
git branch -M main
git remote add origin https://github.com/<TON-PSEUDO>/revision-amf.git
git push -u origin main
```

2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch → Branch : `main` / `/ (root)` → Save**.
3. Au bout d'une minute, l'app est en ligne à : `https://<TON-PSEUDO>.github.io/revision-amf/`

## Installer sur le téléphone

- **iPhone (Safari)** : ouvre l'URL → bouton **Partager** → **Sur l'écran d'accueil** → Ajouter.
- **Android (Chrome)** : ouvre l'URL → menu **⋮** → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).

Après la première ouverture en ligne, l'app fonctionne **hors connexion**.

## Mettre à jour le contenu

Tout le contenu est dans **`content.json`** (cours + banque de QCM). Pour mettre à jour : remplace ce fichier, incrémente la version du cache dans `sw.js` (`amf-rev-v1` → `amf-rev-v2`), puis recharge l'app.

## Structure

```
AMF-Revision/
├── index.html          # coquille de l'app
├── styles.css          # charte (bleu nuit / ivoire / anthracite)
├── app.js              # logique : routeur, cours, QCM, scores A/C, persistance
├── content.json        # tout le contenu (cours fidèle + banque QCM)
├── manifest.json       # PWA (installable)
├── sw.js               # service worker (hors-ligne)
└── icons/              # icônes 192 / 512 / maskable
```

## Avertissement

Le contenu est issu de **tes propres fiches de cours** (`_data_cours.json`). Les questions entraînent la **compréhension** : l'examen réel pioche dans une banque de 2 000+ questions renouvelées chaque année. Une réponse signalée « à vérifier » doit être recontrôlée dans le cours officiel.
