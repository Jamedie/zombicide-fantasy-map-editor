const TOKEN_MARKERS = [
  { type: 'start', name: 'Départ', label: 'S', product: null, category: 'base' },
  { type: 'objective', name: 'Objectif', label: '1', product: null, category: 'base' },
  { type: 'invasion', name: 'Invasion', label: '1', product: null, category: 'base' },
  { type: 'exit', name: 'Sortie', label: 'E', product: null, category: 'base' },
  { type: 'door', name: 'Porte', label: 'D', product: null, category: 'base' },
  { type: 'spawn', name: 'Nécromancien', label: 'N', product: null, category: 'base' },
  { type: 'npc', name: 'NPC cible', label: 'N', product: null, category: 'base' },
  { type: 'vault', name: 'Coffre / objectif', label: 'C', product: null, category: 'base' },
  { type: 'noise', name: 'Bruit', label: '!', product: null, category: 'base' },
  { type: 'gate', name: 'Grille', label: 'G', product: null, category: 'custom' },
  { type: 'rubble', name: 'Gravats', label: 'X', product: null, category: 'custom' },
  { type: 'crypt', name: 'Zone de crypte', label: 'CR', product: 'black-plague', category: 'unique' },
  { type: 'guard', name: 'Garde', label: 'G', product: 'white-death', category: 'unique' },
  { type: 'statue', name: 'Statue de Chi', label: 'ST', product: 'eternal-empire', category: 'unique' },
  { type: 'chi', name: 'Chi', label: 'χ', product: 'eternal-empire', category: 'unique' }
];

const TOKEN_MARKER_CATEGORIES = [
  { id: 'base', label: 'Tokens de base' },
  { id: 'custom', label: 'Tokens custom' },
  { id: 'unique', label: 'Tokens uniques' }
];

window.ZOMBICIDE_TOKENS = {
  MARKERS: TOKEN_MARKERS,
  MARKER_CATEGORIES: TOKEN_MARKER_CATEGORIES,
  CATALOG_PREFERRED_MARKERS: new Set(['gate', 'rubble']),
  EDGE_DEFAULT_MARKERS: new Set(['start', 'invasion', 'exit']),
  EDGE_ANCHOR_MARKERS: new Set(['start', 'invasion', 'exit']),
  CELL_CENTER_MARKERS: new Set(['objective', 'spawn', 'npc', 'vault', 'crypt', 'noise', 'guard', 'statue', 'chi'])
};
