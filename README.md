# Forge de Quêtes — Zombicide Fantasy

MVP local permettant de composer une mission sur une grille, gérer une collection, sauvegarder la mission en JSON et exporter un plan. L’interface s’ouvre directement avec `index.html`.

Le catalogue intégré contient les 84 faces Fantasy numérotées de 1R à 42V. Les sources et précautions de réutilisation des images sont détaillées dans `ASSET_SOURCES.md`.

La page dédiée **`catalog.html`**, accessible depuis l’onglet Collection, permet de sélectionner chaque face et de définir ses slots de porte directement sur l’image. Chaque slot reçoit un identifiant stable, une orientation et une position. Ces métadonnées sont sauvegardées dans le navigateur et importables/exportables au format `zombicide-catalog`. Les points ne sont pas affichés pendant la création d’une mission ; les portes s’y aimantent automatiquement, y compris après rotation d’une tuile.

Les slots peuvent être déplacés par glisser-déposer. Les types disponibles sont : porte, objectif, départ, invasion, sortie, statue, Chi, coffre, nécromancien, garde et bruit.

Le catalogue exporté porte la politique `doorPlacement: anchor-required` : une IA doit référencer un slot existant et ne peut pas inventer une position libre pour une porte. La CLI vérifie également que les coordonnées correspondent au slot après rotation de la tuile.

## Utilisation par une IA

La CLI transforme l’application en outil exploitable par un agent ou un modèle d’IA. Aucun serveur ni jeton d’API n’est nécessaire : le modèle produit un JSON, puis appelle les commandes locales.

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
