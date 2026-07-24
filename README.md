# Forge de Quêtes — Zombicide Fantasy

MVP local permettant de composer une mission sur une grille, gérer une collection, sauvegarder la mission en JSON et exporter un plan. Le serveur de développement sert l’interface depuis `app/index.html`.

Le catalogue intégré contient les 84 faces Fantasy numérotées de 1R à 42V. Les sources et précautions de réutilisation des images sont détaillées dans [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md).

La page dédiée **`app/catalog.html`**, accessible depuis l’onglet Collection, permet de sélectionner chaque face et de définir ses slots directement sur l’image. Chaque slot reçoit un identifiant stable, un type, une orientation si nécessaire et une position. Ces métadonnées sont sauvegardées dans le navigateur et importables/exportables au format `zombicide-catalog`. En mode administrateur local, le bouton **Enregistrer dans le projet** écrit directement le catalogue dans `config/default-catalog.json` grâce au serveur de développement. Le bouton **Fichier externe** permet également de choisir un JSON personnel qui sera réécrit automatiquement après chaque changement pendant la session.

La configuration versionnée par défaut se trouve dans `config/default-catalog.json`. Elle est chargée au démarrage, puis les réglages personnels enregistrés dans le navigateur prennent priorité. Le projet doit être lancé avec `npm run dev` pour permettre ce chargement.

## Arborescence

```text
app/
  assets/       Visuels des tuiles
  scripts/      Logique de l’éditeur et du catalogue
  styles/       Feuilles de style
  index.html    Éditeur de mission
  catalog.html  Éditeur du catalogue
cli/            Serveur local et CLI de génération
config/         Catalogue versionné par défaut
docs/           Règles IA, design, sources et notes du projet
examples/       Collection, catalogue et mission d’exemple
tests/          Tests automatisés de la CLI
```

Les slots peuvent être déplacés par glisser-déposer. Les types disponibles sont : porte, objectif, départ, invasion, sortie, statue, Chi, coffre, crypte, nécromancien, garde et bruit.
Les marqueurs sont triés dans la palette en trois temps : tokens de base, tokens custom, puis tokens uniques groupés par boîte. Une boîte décochée dans la collection rend ses marqueurs uniques indisponibles, y compris pour la validation stricte de la CLI.

Deux slots de porte placés face à face sur la jonction de deux tuiles représentent une seule connexion logique. L’éditeur centre la porte sur la séparation et interdit d’ajouter un second marqueur sur cette même connexion ; la CLI applique la même règle.

Les marqueurs disposent également d’un placement initial adapté : les portes préfèrent leurs slots mais restent déplaçables librement, les grilles et gravats préfèrent leurs slots de catalogue ou les arêtes de la grille 3×3, les départs/sorties/invasions occupent le centre d’une case extérieure, et les objectifs, cryptes, nécromanciens et autres marqueurs centraux occupent le centre exact d’une case de la grille 3×3.

Le catalogue exporté porte la politique `doorPlacement: catalog-preferred` : les slots existants sont proposés en priorité, mais une porte peut aussi utiliser des coordonnées libres. Lorsqu’un slot est choisi, la CLI vérifie que les coordonnées correspondent bien à ce slot après rotation de la tuile.

## Utilisation par une IA

La CLI transforme l’application en outil exploitable par un agent ou un modèle d’IA. Aucun serveur ni jeton d’API n’est nécessaire : le modèle produit un JSON, puis appelle les commandes locales.

Les règles canoniques sont documentées dans [`docs/CLI_RULES.md`](docs/CLI_RULES.md). Le fichier [`AGENTS.md`](AGENTS.md) impose leur lecture aux agents qui travaillent dans le dépôt. Avant toute génération, une IA doit exécuter :

```sh
npm run rules
node cli/zombicide-map.mjs context --json
```

La validation distingue deux niveaux : la CLI contrôle automatiquement la structure, les tuiles, les ancrages, les collisions et les contraintes géométriques connues ; l’agent doit ensuite effectuer l’audit logique des raccordements et des chemins Survivants, Zombies et Nécromanciens décrit dans la documentation. La collection utilisateur reste l’unique source de vérité pour les boîtes et tuiles disponibles.

```powershell
node cli/zombicide-map.mjs context --collection examples/collection.json
node cli/zombicide-map.mjs validate examples/mission.json --collection examples/collection.json --catalog examples/catalog.json
node cli/zombicide-map.mjs render examples/mission.json --collection examples/collection.json --catalog examples/catalog.json --output mission.png
```

Après `npm link`, la même CLI devient disponible globalement :

```powershell
zombicide-map validate mission.json --collection collection.json
```

### Commandes

- `rules` : affiche les règles canoniques que toute IA doit lire avant d’utiliser la CLI.
- `context` : imprime les tuiles disponibles, les marqueurs et le contrat JSON à donner au modèle.
- `catalog` : liste le catalogue et la disponibilité selon une collection.
- `validate <mission.json>` : vérifie structure, grille, références, collisions, collection et coordonnées.
- `render <mission.json> --output <carte.svg|carte.png>` : génère un plan sans ouvrir l’éditeur.

Options utiles :

- `--collection <collection.json>` applique une collection.
- `--catalog <catalogue.json>` applique les points de porte exportés depuis l’éditeur interne.
- `--json` produit une sortie structurée, adaptée à un agent.
- `--strict` traite les avertissements de collection comme un échec.

Le rendu SVG est entièrement autonome. Le rendu PNG est également sans dépendance npm : sous Windows, la CLI utilise le moteur headless de Microsoft Edge installé avec le système.

## Modèles de données

- `catalogue` : intégré au MVP, décrit les produits et les faces.
- `collection.json` : boîtes possédées et exceptions par face.
- `mission.json` : grille, instances de tuiles, marqueurs et options de rendu.

Les fichiers d’exemple dans `examples/` constituent la référence minimale.
