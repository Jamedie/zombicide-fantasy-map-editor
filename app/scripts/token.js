export const TOKEN_MARKERS = [
  { type: 'start', name: 'Départ', label: 'S', color: '#2d6eb6', product: null, category: 'base', limit: null },
  { type: 'objective', name: 'Objectif', label: '1', color: '#bd343b', product: null, category: 'base', limit: null },
  { type: 'invasion', name: 'Invasion', label: '1', color: '#a62d32', product: null, category: 'base', limit: null },
  { type: 'exit', name: 'Sortie', label: 'E', color: '#318053', product: null, category: 'base', limit: null },
  { type: 'door', name: 'Porte', label: 'D', color: '#666c72', product: null, category: 'base', limit: null },
  { type: 'spawn', name: 'Nécromancien', label: 'N', color: '#7f3f98', product: null, category: 'base', limit: null },
  { type: 'npc', name: 'NPC cible', label: 'N', color: '#7f3f98', product: null, category: 'base', limit: null },
  { type: 'vault', name: 'Coffre / objectif', label: 'C', color: '#a77b27', product: null, category: 'base', limit: null },
  { type: 'noise', name: 'Bruit', label: '!', color: '#217d86', product: null, category: 'base', limit: null },
  { type: 'gate', name: 'Grille', label: 'G', color: '#a77b27', product: null, category: 'custom', limit: null },
  { type: 'rubble', name: 'Gravats', label: 'X', color: '#b87416', product: null, category: 'custom', limit: null },
  { type: 'crypt', name: 'Zone de crypte violette', label: 'CR', color: '#4d4568', product: 'black-plague', category: 'unique', limit: 2 },
  { type: 'crypt-yellow', name: 'Zone de crypte jaune', label: 'CR', color: '#d7b33f', product: 'black-plague', category: 'unique', limit: 2 },
  { type: 'guard', name: 'Garde', label: 'G', color: '#24798a', product: 'white-death', category: 'unique', limit: null },
  { type: 'statue', name: 'Statue de Chi', label: 'ST', color: '#727981', product: 'eternal-empire', category: 'unique', limit: null },
  { type: 'chi', name: 'Chi', label: 'χ', color: '#55a6b4', product: 'eternal-empire', category: 'unique', limit: null }
];

export const TOKEN_MARKER_CATEGORIES = [
  { id: 'base', label: 'Tokens de base' },
  { id: 'custom', label: 'Tokens custom' },
  { id: 'unique', label: 'Tokens uniques' }
];

export const CATALOG_PREFERRED_MARKERS = new Set(['gate', 'rubble']);
export const EDGE_DEFAULT_MARKERS = new Set(['start', 'invasion', 'exit']);
export const EDGE_ANCHOR_MARKERS = new Set(['start', 'invasion', 'exit']);
export const CELL_CENTER_MARKERS = new Set(['objective', 'spawn', 'npc', 'vault', 'crypt', 'crypt-yellow', 'noise', 'guard', 'statue', 'chi']);

export const ZOMBICIDE_TOKENS = {
  MARKERS: TOKEN_MARKERS,
  MARKER_CATEGORIES: TOKEN_MARKER_CATEGORIES,
  CATALOG_PREFERRED_MARKERS,
  EDGE_DEFAULT_MARKERS,
  EDGE_ANCHOR_MARKERS,
  CELL_CENTER_MARKERS
};
