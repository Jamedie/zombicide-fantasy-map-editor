# Règles canoniques de la CLI Zombicide Map

Ce document est la référence obligatoire pour toute IA qui crée, modifie, valide ou rend une mission avec `cli/zombicide-map.mjs`.

## Workflow obligatoire pour une IA

Avant toute génération ou modification :

```sh
npm run rules
node cli/zombicide-map.mjs context --json
```

Si une collection ou un catalogue externe est utilisé, les mêmes options doivent être appliquées à `context`, `catalog`, `validate` et `render`.

Après chaque modification :

```sh
node cli/zombicide-map.mjs validate mission.json --strict
```

Une IA ne doit rendre ou livrer une mission que lorsque cette validation réussit.

La réussite de `validate` confirme les contraintes que la CLI peut calculer, mais ne suffit pas à prouver que le plan est jouable. Avant le rendu final, l’IA doit également effectuer l’audit logique décrit plus bas.

La disponibilité des boîtes et des tuiles ne doit jamais être codée en dur dans un prompt ou une mission : elle provient exclusivement de la collection fournie à la CLI.

## Contrat d’une mission

- `format` vaut `zombicide-map`.
- `version` vaut `1`.
- `name` est une chaîne non vide.
- La grille contient de 1 à 4 colonnes et de 1 à 4 lignes.
- `tiles` et `markers` sont des tableaux.
- Les coordonnées `x` et `y` d’un marqueur sont normalisées entre `0` et `1` dans sa tuile.
- Les rotations autorisées sont `0`, `90`, `180` et `270`.
- Tous les `instanceId` de tuiles et tous les `id` de marqueurs sont uniques.

## Tuiles et collection

- Une cellule de la grille ne peut contenir qu’une seule tuile.
- Une même tuile physique ne peut apparaître qu’une fois dans une mission.
- Les faces `R` et `V` d’un même numéro représentent la même tuile physique. Par exemple, `3R` et `3V` ne peuvent pas être utilisées ensemble.
- Chaque `catalogId` doit exister dans le catalogue chargé.
- Avec `--collection`, une tuile indisponible produit un avertissement. Avec `--strict`, cet avertissement fait échouer la commande.
- La priorité de disponibilité est : liste noire, liste blanche, produits possédés, indisponible.

## Types de marqueurs

Types reconnus :

`start`, `objective`, `invasion`, `exit`, `door`, `spawn`, `npc`, `vault`, `crypt`, `crypt-yellow`, `noise`, `gate`, `rubble`, `guard`, `statue`, `chi`.

Chaque marqueur référence une instance de tuile existante. Un identifiant de point d’ancrage reste technique : l’interface peut n’afficher que son mode de placement, mais le JSON conserve l’identifiant exact.

Chaque type de marqueur possède aussi une catégorie (`base`, `custom` ou `unique`) exposée par `context --json` dans `constraints.markerCatalog`. Les marqueurs `base` et `custom` n’appartiennent à aucune boîte et restent toujours disponibles. Les marqueurs `unique` possèdent une boîte d’origine ; si une collection est appliquée et que cette boîte n’est pas possédée, ils produisent un avertissement. Avec `--strict`, cet avertissement fait échouer la commande.

Un marqueur peut aussi exposer `colors` pour représenter plusieurs couleurs sur un même token, et `limit` pour plafonner le nombre d’exemplaires sur une carte. Une limite vaut `null` tant qu’elle n’est pas renseignée ; si elle est dépassée, la CLI produit un avertissement. Avec `--strict`, cet avertissement fait échouer la commande.

## Portes

- Les slots du catalogue sont préférés, mais le placement libre est autorisé par la politique `doorPlacement: catalog-preferred`.
- Une porte ancrée doit référencer un slot `door` de sa tuile ou un slot personnalisé de l’instance.
- Les coordonnées d’une porte ancrée doivent correspondre exactement au slot après rotation.
- Deux slots opposés sur la séparation de deux tuiles représentent une seule connexion logique.
- Une connexion logique ne peut contenir qu’une seule porte ancrée, même si chaque tuile possède son propre slot.
- Une porte libre ne contient pas d’`anchor` et utilise directement ses coordonnées normalisées.
- Un slot `door` de catalogue peut porter `requiresDoor: true`. Ce cas représente une ouverture imprimée d’une Zone de bâtiment vers l’extérieur ou vers une rue, comme une porte ouverte visible sur l’illustration. Toute mission qui utilise cette tuile doit alors placer un marqueur `door` sur cette connexion logique.
- Une porte requise par `requiresDoor: true` doit rester ancrée à un slot de la connexion concernée ; un marqueur libre proche visuellement ne suffit pas.

## Taille des intérieurs

- Un intérieur de bâtiment ne doit pas former une zone ouverte de plus de 4 cases sans séparation.
- Le catalogue peut décrire ces zones dans `interiorZones`.
- Chaque zone intérieure doit avoir un `id` et un `cellCount`, ou une liste `cells` dont la longueur sert de nombre de cases.
- `maxOpenCells` vaut 4 par défaut.
- Si `cellCount` dépasse `maxOpenCells`, la zone doit déclarer au moins un slot de porte dans `separatorDoorIds`, et la mission doit placer un marqueur `door` ancré sur l’un de ces slots.
- Un marqueur de porte libre ne suffit pas pour séparer un grand intérieur : la porte doit être ancrée au slot séparateur prévu par le catalogue.

## Grilles et gravats

Les marqueurs `gate` et `rubble` acceptent :

- un slot de catalogue du même type ;
- un placement libre sans `anchor` ;
- un milieu d’arête de la grille 3×3.

Les identifiants générés de la grille 3×3 suivent :

```text
grid-edge-h-<limite 0..3>-<case 1..3>
grid-edge-v-<limite 0..3>-<case 1..3>
```

Ces points sont fixes par rapport à la grille et ne tournent pas avec l’image de la tuile.

## Départ, sortie et invasion

Les marqueurs `start`, `exit` et `invasion` acceptent :

- un slot de catalogue du même type ;
- un placement libre sans `anchor` ;
- le centre exact de l’une des huit cases extérieures de la grille 3×3.

Les identifiants générés suivent :

```text
grid-cell-<ligne 1..3>-<colonne 1..3>
```

Pour ces trois types, la case référencée doit appartenir au périmètre de la grille 3×3. Ces points sont fixes par rapport à la grille. Une `invasion` doit en plus se trouver sur un côté extérieur du plateau.

## Objectifs et autres marqueurs centraux

Les marqueurs `objective`, `spawn` (Nécromancien), `npc`, `vault`, `crypt`, `crypt-yellow`, `noise`, `guard`, `statue` et `chi` utilisent par défaut le centre exact d’une case de la grille 3×3. Le premier occupe la case centrale, puis les suivants utilisent les autres centres disponibles.

Ils acceptent :

- un slot de catalogue du même type ;
- un placement libre sans `anchor` ;
- un centre de case identifié par `grid-cell-<ligne 1..3>-<colonne 1..3>`.

## Occupation et affichage

- Deux marqueurs du même type ne peuvent pas utiliser le même identifiant d’ancrage sur la même instance de tuile.
- Plusieurs marqueurs de types différents peuvent partager le même point logique.
- Lors du rendu, les icônes qui partagent exactement le même point sont décalées automatiquement pour rester visibles.
- Ce décalage est uniquement visuel : il ne modifie ni `x`, ni `y`, ni `anchor`.
- Le rendu de la CLI et celui de l’éditeur appliquent la même règle de décalage.

## Orientation et raccordement des tuiles

Chaque paire de tuiles adjacentes doit être contrôlée une fois. Un raccordement est ouvert uniquement si le passage existe réellement des deux côtés après rotation :

- rue contre rue : passage possible ;
- passage intérieur contre passage intérieur compatible : passage possible ;
- rue contre mur ou bâtiment fermé : passage impossible ;
- porte imprimée contre zone incompatible : passage impossible ;
- mur contre mur : passage impossible.

Un marqueur Porte ne répare jamais artificiellement deux bords incompatibles. Il faut alors tourner, déplacer ou remplacer une tuile.

Avant le rendu, l’IA doit conserver dans son raisonnement ou son brouillon un tableau contenant au minimum : la jonction, le côté A, le côté B, le type de raccordement et le verdict.

La CLI ne peut pas encore prouver automatiquement ces raccordements, car le catalogue ne décrit pas encore le graphe détaillé des rues, murs et Zones de chaque illustration. Cette vérification sémantique reste donc obligatoire pour l’IA.

## Audit obligatoire du réseau de déplacement

Le plan doit être traité comme un graphe :

- chaque Zone est un nœud ;
- chaque passage ouvert est une liaison ;
- une porte fermée est une liaison bloquée jusqu’à son ouverture ;
- un mur, des gravats ou un bord incompatible ne créent aucune liaison.

### Survivants

- Le départ doit permettre d’atteindre tous les objectifs obligatoires dans leur ordre.
- La sortie doit être accessible après le dernier objectif.
- Une clé ou un mécanisme ne peut pas être placé derrière la porte qu’il ouvre.
- Deux objectifs successifs doivent occuper des Zones distinctes, sauf exception narrative explicitement signalée.
- Les alliés, prisonniers, Gardes et éléments obligatoires doivent être accessibles selon les règles de la quête.

### Invasions

- Une Invasion standard doit appartenir à une Zone touchant un bord extérieur réel du plateau.
- Une jonction entre deux tuiles n’est jamais un bord extérieur.
- Une Zone d’Invasion active doit toujours disposer d’au moins un chemin ouvert vers le reste du plateau.
- Pendant la Préparation, chaque Zone d’Invasion active doit être vérifiée.
- Si toutes ses sorties vers le réseau jouable sont bloquées uniquement par des portes ordinaires, ouvrir la première porte située sur le chemin ouvert le plus court vers la Zone de départ des Survivants.
- Cette ouverture de Préparation ne produit aucun Bruit et ne provoque aucune génération de Zombies dans le bâtiment.
- Lorsqu’une Zone d’Invasion inactive est activée en cours de partie, effectuer immédiatement la même vérification avant d’y générer des Zombies.
- Une porte verrouillée, scellée, spéciale ou nommée par le scénario ne peut jamais être ouverte par cette règle. Si elle constitue l’unique sortie, déplacer plutôt le marqueur d’Invasion dans la Zone de rue ouverte la plus proche.
- Cette règle corrige uniquement un placement d’Invasion enfermé. Elle n’ouvre aucune autre porte et ne modifie pas les objectifs de la quête.
- Une Invasion doit être placée dans une Zone ouverte reliée au réseau jouable après cette correction, jamais dans un bâtiment fermé sans règle spéciale.
- Une Invasion intérieure exige une règle explicite de portail, conduit ou événement et ne doit pas être traitée comme une Invasion standard.
- Une Invasion activée plus tard doit être valide au moment exact de son activation.

### Nécromanciens

- Depuis chaque Invasion susceptible de générer un Nécromancien, il doit exister un chemin ouvert vers une autre Invasion valide.
- Ce chemin ne traverse ni porte fermée, ni mur, ni passage condamné.
- Une seule destination accessible est insuffisante, sauf si la quête interdit explicitement la fuite ou définit une autre règle de destination.
- L’IA doit contrôler chaque Invasion de départ, la route suivie, l’Invasion atteinte et l’absence de porte fermée traversée.

### Zombies

- Chaque Invasion active doit rejoindre le réseau principal des Survivants.
- Les Zombies ne doivent pas rester définitivement enfermés dans une composante séparée.
- Une arène fermée exige une règle explicite d’ouverture, d’activation ou de sortie.

### Portes et verrouillages

- Une porte ordinaire relie deux Zones réellement adjacentes.
- Une porte spéciale conserve sa propre règle et ne doit pas être traitée comme une porte ordinaire.
- Si une porte spéciale est l’unique liaison entre deux parties du plateau, son mécanisme d’ouverture doit être accessible depuis le côté du départ.
- Le nombre de portes annoncé par la quête doit correspondre exactement au plan.

## Placement narratif et lisibilité

- Le départ, les objectifs et la sortie doivent former un parcours cohérent sans allers-retours artificiels excessifs.
- Les objectifs consécutifs sont de préférence répartis entre plusieurs Zones, bâtiments ou tuiles.
- Aucun marqueur ne doit masquer une porte, une limite de Zone ou un passage important.
- Les marqueurs restent lisibles et droits après rotation des tuiles.
- Les règles spéciales imprimées sur une tuile ou associées à un terrain spécial restent applicables ; une IA ne doit pas les traiter comme un simple décor.

## Procédure de création imposée à l’IA

1. Charger `rules`, `context`, le catalogue et la collection utilisateur.
2. Choisir les tuiles sans employer ensemble les deux faces d’une même tuile physique.
3. Construire la grille sans marqueurs et fixer les rotations.
4. Vérifier chaque jonction de tuiles.
5. Construire le graphe des Zones et identifier sa composante principale.
6. Placer le départ, les objectifs et la sortie, puis vérifier leur parcours.
7. Placer les Invasions sur le périmètre extérieur et contrôler les routes des Zombies et Nécromanciens.
8. Pour chaque Invasion, appliquer la vérification de Préparation : chemin ouvert vers le plateau, ou ouverture de la première porte ordinaire la plus courte vers le départ, ou déplacement si seule une porte verrouillée, scellée, spéciale ou nommée par le scénario bloque la sortie.
9. Placer les portes et vérifier les verrouillages ainsi que leur nombre.
10. Ajouter les éléments spéciaux et leurs règles.
11. Exécuter `validate --strict`.
12. Produire l’image uniquement après réussite de la CLI et de l’audit logique.

## Checklist logique avant rendu

Une IA doit pouvoir répondre « oui » à chaque ligne applicable :

- Recto et verso d’une même tuile absents simultanément.
- Rotations explicitement définies.
- Toutes les jonctions adjacentes vérifiées.
- Départ → objectifs → sortie accessible.
- Chaque Invasion standard située sur un bord extérieur.
- Chaque Invasion reliée au réseau principal.
- Chaque Invasion offrant une route de fuite valide à un Nécromancien, sauf exception écrite.
- Zombies non enfermés dans une composante sans issue.
- Portes spéciales ouvrables depuis le bon côté.
- Nombre de portes identique à celui annoncé par la quête.
- Éléments spéciaux accompagnés de leurs règles.
- Aucun marqueur ne masquant une information importante.

## Catalogue et points d’ancrage

- `app/assets/config/default-catalog.json` est chargé automatiquement par la CLI.
- `--catalog <fichier>` applique ensuite les remplacements du catalogue fourni.
- Un slot doit avoir un `id`, un `type`, un `x` et un `y` valides.
- Un slot `door` peut avoir `requiresDoor: true` pour rendre le marqueur Porte obligatoire sur cette ouverture.
- `interiorZones` peut déclarer les grandes zones intérieures à contrôler. Exemple : `{ "id": "great-hall", "cellCount": 5, "separatorDoorIds": ["1r-door-02"] }`.
- Un slot de catalogue tourne avec la tuile.
- Les points générés `grid-edge-*` et `grid-cell-*` restent fixes dans la grille.
- Les anciens identifiants `grid-inset-*` restent acceptés par la CLI pour la compatibilité des missions déjà sauvegardées.
- Lorsqu’un marqueur possède un `anchor`, ses coordonnées doivent correspondre au point résolu. Ne jamais modifier seulement `x` ou `y` sans retirer ou mettre à jour `anchor`.

## Commandes

```sh
node cli/zombicide-map.mjs rules
node cli/zombicide-map.mjs context --json
node cli/zombicide-map.mjs catalog --json
node cli/zombicide-map.mjs validate mission.json --strict --json
node cli/zombicide-map.mjs render mission.json --output mission.svg
```

`context --json` fournit le contrat machine, les tuiles disponibles, les types de marqueurs, la politique de slots et le chemin de ce document.
