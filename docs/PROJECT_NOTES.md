Je te recommande une application web locale, avec éventuellement un emballage desktop plus tard :
React + TypeScript pour l’interface.
Konva pour manipuler les tuiles et marqueurs sur un canevas : déplacement, sélection, rotation et export d’image sont pris en charge nativement. Documentation Konva
JSON comme format de sauvegarde.
Tauri dans un second temps si tu veux obtenir un véritable .exe avec ouverture/enregistrement natif des fichiers. Architecture Tauri
Je déconseille XML : JSON sera plus facile à éditer, valider, versionner avec Git et surtout générer pour Codex.
L’outil aurait deux modes principaux :
Bibliothèque de tuiles
Pour chaque tuile Fantasy 1 à 38 :
image recto/verso ;
dimensions ;
points d’accroche prédéfinis pour les portes ;
zones autorisées pour les objectifs, départs, invasions, etc. ;
orientation éventuelle de chaque point ;
métadonnées de licence et source.

Éditeur de mission
grille libre, par exemple 3 × 2 ou 3 × 3 ;
glisser-déposer des tuiles ;
rotation des tuiles ;
palette de marqueurs ;
portes aimantées aux emplacements valides ;
numérotation automatique des objectifs et invasions ;
légende générée automatiquement ;
sauvegarde JSON ;
export PNG et éventuellement JPEG.

Un fichier de mission pourrait ressembler à ceci :
{
"format": "zombicide-map",
"version": 1,
"name": "Le Monastère",
"grid": {
"columns": 3,
"rows": 2
},
"tiles": [
{
"id": "tile-6",
"face": "R",
"column": 0,
"row": 0,
"rotation": 0
}
],
"markers": [
{
"id": "start-1",
"type": "start",
"tile": "tile-3",
"x": 0.82,
"y": 0.82,
"label": "S"
},
{
"id": "door-1",
"type": "door",
"tile": "tile-6",
"anchor": "door-south-02"
}
],
"render": {
"showTileNames": true,
"showLegend": true,
"background": "#151515"
}
}
Les coordonnées libres seraient normalisées entre 0 et 1. Les portes utiliseraient plutôt un identifiant d’ancrage stable. Ainsi, si une tuile est tournée, l’outil peut automatiquement tourner et repositionner ses portes.
Pour que Codex puisse ensuite s’en servir proprement, j’ajouterais également un petit CLI :
zombicide-map validate quete-01.json
zombicide-map render quete-01.json --output quete-01-plan.png
Le workflow final serait alors :
Codex produit le JSON
↓
Le CLI vérifie la carte
↓
Le moteur génère le PNG
↓
Tu ouvres le JSON dans l’éditeur
↓
Tu ajustes visuellement puis réexportes
Le point important est de conserver notre propre modèle JSON, plutôt que de sauvegarder directement l’état interne de Konva. Cela rend les cartes indépendantes de la technologie utilisée pour l’interface.
Je commencerais par un MVP limité à :
import manuel de quelques images de tuiles ;
grille redimensionnable ;
déplacement et rotation ;
marqueurs identiques à ceux de tes exemples ;
définition manuelle des emplacements de portes ;
sauvegarde/chargement JSON ;
export PNG avec légende.

Oui, il faut intégrer la notion de « collection possédée » dès le départ, car elle devra aussi contraindre Codex lors de la génération.
Dans l’interface, j’ajouterais un écran « Ma collection » avec les différentes boîtes :
Black Plague
Wulfsburg
Green Horde
Friends and Foes
White Death
Eternal Empire
futures extensions ajoutées à la bibliothèque
Cocher ou décocher une boîte rendrait automatiquement ses tuiles disponibles ou indisponibles.
Il faudrait cependant permettre des exceptions manuelles, car quelqu’un peut avoir récupéré une tuile séparément ou ne plus en posséder une :
liste blanche : forcer une tuile comme disponible ;
liste noire : interdire une tuile même si sa boîte est cochée ;
réinitialisation des exceptions ;
affichage de la raison : « disponible via Black Plague », « exclue manuellement », etc.
La priorité serait :
Liste noire
↓
Liste blanche
↓
Boîtes possédées
↓
Indisponible
Je stockerais cela dans un fichier séparé de la carte, par exemple collection.json :
{
"format": "zombicide-collection",
"version": 1,
"ownedProducts": [
"black-plague",
"wulfsburg"
],
"tileWhitelist": [
"12R"
],
"tileBlacklist": [
"8V"
]
}
Dans l’éditeur de carte :
seules les tuiles disponibles apparaissent par défaut dans la palette ;
un bouton permet d’afficher les tuiles indisponibles, grisées ;
une recherche permet de filtrer par numéro, boîte ou face ;
une carte chargée contenant une tuile non possédée affiche un avertissement clair ;
l’outil peut proposer une tuile disponible en remplacement ;
l’export reste possible après avertissement, pour ne pas bloquer inutilement l’utilisateur.
Pour Codex, la commande pourrait devenir :
zombicide-map generate mission.md `  --collection collection.json`
--output quete-01.json
Et la validation vérifierait la collection :
zombicide-map validate quete-01.json `
--collection collection.json
Exemple de résultat :
Carte valide, sauf :

- Tuile 18V indisponible dans la collection actuelle
- Tuile 8V explicitement placée sur liste noire
  Il faudra donc distinguer trois types de données :
  catalogue.json → produits, tuiles, faces et images
  collection.json → boîtes et tuiles possédées
  quete-01.json → composition d’une carte particulière
  Cette séparation permettra d’avoir plusieurs profils de collection — par exemple « Ma collection », « Collection de Paul » ou « Toutes les boîtes » — sans modifier les fichiers de mission. C’est une fonctionnalité que j’intégrerais directement au MVP, au moins sous forme de sélection des boîtes et de filtrage des tuiles.
