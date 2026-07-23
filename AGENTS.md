# Instructions obligatoires pour les agents

Ces instructions s’appliquent à toute IA ou tout agent qui utilise `cli/zombicide-map.mjs` ou qui crée, modifie, valide ou rend un fichier `zombicide-map`.

1. Avant la première commande CLI de chaque tâche, lire intégralement [`docs/CLI_RULES.md`](docs/CLI_RULES.md) ou exécuter `npm run rules`.
2. Exécuter `node cli/zombicide-map.mjs context --json` avec les mêmes options `--collection` et `--catalog` que les commandes suivantes.
3. Ne jamais inventer une tuile, un type de marqueur ou un identifiant de slot absent du contexte ou des règles.
4. Après chaque modification d’une mission, exécuter `validate --strict`.
5. Ne lancer `render` que si la validation réussit.
6. Une validation CLI réussie ne prouve pas à elle seule que le réseau de déplacement est jouable. Effectuer aussi l’audit logique Survivants, Zombies, Nécromanciens, jonctions et verrouillages décrit dans `docs/CLI_RULES.md`.
7. Les règles de [`docs/CLI_RULES.md`](docs/CLI_RULES.md) sont canoniques. Si le README, un exemple ou une ancienne mission les contredit, suivre ce document et signaler l’incompatibilité.
