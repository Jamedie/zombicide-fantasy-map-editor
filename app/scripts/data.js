export const PRODUCTS = [
  { id: 'black-plague', name: 'Black Plague', from: 1, to: 9 },
  { id: 'wulfsburg', name: 'Wulfsburg', from: 10, to: 11 },
  { id: 'green-horde', name: 'Green Horde', from: 12, to: 20 },
  { id: 'friends-and-foes', name: 'Friends and Foes', from: 21, to: 25 },
  { id: 'no-rest-for-wicked', name: 'No Rest for the Wicked' },
  { id: 'white-death', name: 'White Death', from: 26, to: 34 },
  { id: 'eternal-empire', name: 'Eternal Empire', from: 35, to: 38 },
  { id: 'tmnt-timecrash', name: 'TMNT Timecrash', from: 39, to: 42 },
  { id: 'custom', name: 'Tuiles importées' }
];

export const PRODUCT_NAMES = Object.fromEntries(PRODUCTS.map(product => [product.id, product.name]));
export const TILE_PRODUCT_RANGES = PRODUCTS.filter(product => Number.isInteger(product.from) && Number.isInteger(product.to));
export const TILE_SIZE = 240;
export const DOOR_EDGE_MARGIN = .08;
export const DOOR_CONNECTION_TOLERANCE = .06;
export const MAX_INTERIOR_OPEN_CELLS = 4;
export const DEFAULT_CATALOG_POLICY = { doorPlacement: 'catalog-preferred', freeCoordinates: true };
export const TILE_SOURCE = 'https://zombicide.fandom.com/wiki/Fantasy_Tiles';

export function productName(id, fallback = 'Boîte inconnue') {
  if (!id) return 'Base';
  return PRODUCT_NAMES[id] || fallback;
}

export function createBaseCatalog({ imagePath = ({ number, face }) => `assets/tiles/${number}${face}.webp` } = {}) {
  return TILE_PRODUCT_RANGES.flatMap(product =>
    Array.from({ length: product.to - product.from + 1 }, (_, offset) => product.from + offset)
      .flatMap(number => ['R', 'V'].map(face => ({ number, face, product: product.id })))
  ).map(entry => ({
    id: `${entry.number}${entry.face}`.toLowerCase(),
    code: `${entry.number}${entry.face}`,
    name: `Tuile ${entry.number}${entry.face}`,
    product: entry.product,
    face: entry.face,
    image: imagePath(entry),
    source: TILE_SOURCE,
    slots: [],
    doorAnchors: [],
    interiorZones: []
  }));
}
