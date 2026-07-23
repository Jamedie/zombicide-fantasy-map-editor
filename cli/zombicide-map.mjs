#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const VERSION = '0.1.0';
const TILE_SIZE = 240;
const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));
const RULES_FILE = path.resolve(CLI_DIR, '../docs/CLI_RULES.md');
let CATALOG_POLICY = { doorPlacement: 'catalog-preferred', freeCoordinates: true };
const PRODUCTS = {
  'black-plague': 'Black Plague', 'wulfsburg': 'Wulfsburg', 'green-horde': 'Green Horde',
  'friends-and-foes': 'Friends and Foes', 'white-death': 'White Death', 'eternal-empire': 'Eternal Empire',
  'tmnt-timecrash': 'TMNT Timecrash', custom: 'Tuiles importées'
};
const TILE_PRODUCT_RANGES = [
  { from: 1, to: 9, product: 'black-plague' }, { from: 10, to: 11, product: 'wulfsburg' },
  { from: 12, to: 20, product: 'green-horde' }, { from: 21, to: 25, product: 'friends-and-foes' },
  { from: 26, to: 34, product: 'white-death' }, { from: 35, to: 38, product: 'eternal-empire' },
  { from: 39, to: 42, product: 'tmnt-timecrash' }
];
const CATALOG = TILE_PRODUCT_RANGES.flatMap(range => Array.from({ length: range.to - range.from + 1 }, (_, offset) => range.from + offset).flatMap(number => ['R', 'V'].map(face => ({ number, face, product: range.product })))).map((entry, index) => ({
  id: `${entry.number}${entry.face}`.toLowerCase(), code: `${entry.number}${entry.face}`, name: `Tuile ${entry.number}${entry.face}`, product: entry.product, face: entry.face,
  image: path.resolve(CLI_DIR, `../app/assets/tiles/${entry.number}${entry.face}.webp`),
  source: 'https://zombicide.fandom.com/wiki/Fantasy_Tiles', slots: [], doorAnchors: []
}));
const MARKERS = {
  start: ['Départ', 'S', '#2d6eb6'], objective: ['Objectif', '1', '#bd343b'], invasion: ['Invasion', '1', '#a62d32'],
  exit: ['Sortie', 'E', '#318053'], door: ['Porte', 'D', '#666c72'], spawn: ['Nécromancien', 'N', '#7f3f98'],
  npc: ['NPC cible', 'N', '#7f3f98'],
  vault: ['Coffre / objectif', 'C', '#a77b27'], noise: ['Bruit', '!', '#217d86'],
  gate: ['Grille', 'G', '#a77b27'], rubble: ['Gravats', 'X', '#b87416'],
  guard: ['Garde', 'G', '#24798a'], statue: ['Statue', 'ST', '#727981'], chi: ['Chi', 'χ', '#55a6b4']
};

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value.startsWith('--')) result._.push(value);
    else {
      const [rawKey, inline] = value.slice(2).split('=', 2); const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      result[key] = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    }
  }
  return result;
}
function fail(message, code = 1) { console.error(`Erreur : ${message}`); process.exit(code); }
function readJson(file, label) {
  if (!file) fail(`${label} manquant.`);
  try { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }
  catch (error) { fail(`impossible de lire ${label} « ${file} » (${error.message}).`); }
}
function xml(value) { return String(value ?? '').replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character])); }
function imageDataUri(file) { return fs.existsSync(file) ? `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}` : null; }
function collectionFrom(file) {
  if (!file) return null;
  const data = readJson(file, 'collection');
  if (data.format !== 'zombicide-collection' || !Array.isArray(data.ownedProducts) || !Array.isArray(data.tileWhitelist) || !Array.isArray(data.tileBlacklist)) fail('format de collection invalide.');
  return data;
}
function applyCatalogFile(file) {
  if (!file) return;
  const data = readJson(file, 'catalogue');
  if (data.format !== 'zombicide-catalog' || !Array.isArray(data.tiles)) fail('format de catalogue invalide.');
  CATALOG_POLICY = { ...CATALOG_POLICY, ...(data.slotPolicy || {}) };
  for (const override of data.tiles) {
    const tile = CATALOG.find(entry => entry.id === override.id); if (!tile) continue;
    const incoming = Array.isArray(override.slots) ? override.slots : override.doorAnchors;
    if (!Array.isArray(incoming)) continue;
    const valid = incoming.every(anchor => anchor.id && inUnit(anchor.x) && inUnit(anchor.y));
    if (!valid) fail(`points de porte invalides pour la tuile ${override.id}.`);
    tile.slots = incoming.map(slot => ({ ...slot, type: slot.type || 'door' }));
    tile.doorAnchors = tile.slots.filter(slot => slot.type === 'door');
  }
}
function availability(tile, collection) {
  if (!collection) return { available: true, reason: 'Aucune collection appliquée' };
  if (collection.tileBlacklist.includes(tile.id)) return { available: false, reason: 'Exclue manuellement' };
  if (collection.tileWhitelist.includes(tile.id)) return { available: true, reason: 'Ajoutée manuellement' };
  if (collection.ownedProducts.includes(tile.product)) return { available: true, reason: `Disponible via ${PRODUCTS[tile.product]}` };
  return { available: false, reason: `${PRODUCTS[tile.product]} non possédée` };
}
function validateMission(mission, collection) {
  const errors = []; const warnings = [];
  if (mission?.format !== 'zombicide-map') errors.push({ code: 'FORMAT', message: 'format doit être « zombicide-map ».' });
  if (mission?.version !== 1) errors.push({ code: 'VERSION', message: 'version doit être 1.' });
  if (!mission?.name || typeof mission.name !== 'string') errors.push({ code: 'NAME', message: 'name est obligatoire.' });
  const columns = Number(mission?.grid?.columns); const rows = Number(mission?.grid?.rows);
  if (!Number.isInteger(columns) || columns < 1 || columns > 4) errors.push({ code: 'GRID_COLUMNS', message: 'grid.columns doit être compris entre 1 et 4.' });
  if (!Number.isInteger(rows) || rows < 1 || rows > 4) errors.push({ code: 'GRID_ROWS', message: 'grid.rows doit être compris entre 1 et 4.' });
  if (!Array.isArray(mission?.tiles)) errors.push({ code: 'TILES', message: 'tiles doit être un tableau.' });
  if (!Array.isArray(mission?.markers)) errors.push({ code: 'MARKERS', message: 'markers doit être un tableau.' });
  if (errors.some(issue => ['TILES', 'MARKERS'].includes(issue.code))) return { valid: false, errors, warnings };
  const instanceIds = new Set(); const cells = new Set(); const physicalTiles = new Map();
  for (const [index, tile] of mission.tiles.entries()) {
    const where = `tiles[${index}]`; const data = CATALOG.find(entry => entry.id === tile.catalogId);
    if (!tile.instanceId || instanceIds.has(tile.instanceId)) errors.push({ code: 'TILE_ID', path: where, message: 'instanceId absent ou dupliqué.' }); else instanceIds.add(tile.instanceId);
    if (!data) errors.push({ code: 'CATALOG_TILE', path: where, message: `tuile « ${tile.catalogId} » absente du catalogue.` });
    if (!Number.isInteger(tile.column) || !Number.isInteger(tile.row) || tile.column < 0 || tile.row < 0 || tile.column >= columns || tile.row >= rows) errors.push({ code: 'TILE_POSITION', path: where, message: 'position hors de la grille.' });
    const cell = `${tile.column}:${tile.row}`; if (cells.has(cell)) errors.push({ code: 'TILE_COLLISION', path: where, message: `la case ${cell} contient plusieurs tuiles.` }); else cells.add(cell);
    const reference = data?.code || tile.code || tile.catalogId || '';
    const number = String(reference).trim().match(/^(\d+)[rv]$/i)?.[1];
    const physicalKey = number ? `number-${Number(number)}` : `catalog-${tile.catalogId}`;
    if (physicalTiles.has(physicalKey)) errors.push({ code: 'TILE_DUPLICATE', path: where, message: `${reference} duplique ${physicalTiles.get(physicalKey)} : les faces R et V comptent comme la même tuile.` });
    else physicalTiles.set(physicalKey, reference);
    if (![0, 90, 180, 270].includes(tile.rotation)) errors.push({ code: 'ROTATION', path: where, message: 'rotation doit valoir 0, 90, 180 ou 270.' });
    if (data) { const access = availability(data, collection); if (!access.available) warnings.push({ code: 'UNAVAILABLE_TILE', path: where, message: `${data.code} indisponible : ${access.reason}.` }); }
    for (const anchor of tile.customDoorAnchors || []) if (!anchor.id || !inUnit(anchor.x) || !inUnit(anchor.y)) errors.push({ code: 'DOOR_ANCHOR', path: where, message: 'point de porte personnalisé invalide.' });
  }
  const markerIds = new Set(); const doorConnections = []; const markerAnchorUsage = new Map();
  for (const [index, marker] of mission.markers.entries()) {
    const where = `markers[${index}]`;
    if (!marker.id || markerIds.has(marker.id)) errors.push({ code: 'MARKER_ID', path: where, message: 'id absent ou dupliqué.' }); else markerIds.add(marker.id);
    if (!MARKERS[marker.type]) errors.push({ code: 'MARKER_TYPE', path: where, message: `type « ${marker.type} » inconnu.` });
    if (!instanceIds.has(marker.tile)) errors.push({ code: 'MARKER_TILE', path: where, message: `référence une instance de tuile inexistante (« ${marker.tile} »).` });
    if (!inUnit(marker.x) || !inUnit(marker.y)) errors.push({ code: 'MARKER_POSITION', path: where, message: 'x et y doivent être compris entre 0 et 1.' });
    if (marker.type === 'invasion' && inUnit(marker.x) && inUnit(marker.y)) {
      const tile = mission.tiles.find(entry => entry.instanceId === marker.tile);
      const edgeMargin = .18;
      const onOuterEdge = tile && (
        (tile.column === 0 && marker.x <= edgeMargin) ||
        (tile.column === columns - 1 && marker.x >= 1 - edgeMargin) ||
        (tile.row === 0 && marker.y <= edgeMargin) ||
        (tile.row === rows - 1 && marker.y >= 1 - edgeMargin)
      );
      if (!onOuterEdge) errors.push({ code: 'INVASION_OUTER_EDGE', path: where, message: 'une Invasion standard doit être placée sur un bord extérieur du plateau.' });
    }
    if (marker.type === 'door' && CATALOG_POLICY.doorPlacement === 'anchor-required' && !marker.anchor) errors.push({ code: 'DOOR_ANCHOR_REQUIRED', path: where, message: 'une porte doit référencer un slot autorisé du catalogue.' });
    if (marker.anchor) {
      const tile = mission.tiles.find(entry => entry.instanceId === marker.tile); const data = tile && CATALOG.find(entry => entry.id === tile.catalogId);
      const anchors = marker.type === 'door' ? [...(data?.doorAnchors || []), ...(tile?.customDoorAnchors || [])] : (data?.slots || []).filter(slot => slot.type === marker.type);
      const anchor = anchors.find(entry => entry.id === marker.anchor) || generatedMarkerAnchor(marker);
      if (!anchor) errors.push({ code: 'MARKER_ANCHOR', path: where, message: `slot « ${marker.anchor} » introuvable.` });
      else {
        if (marker.type !== 'door') {
          const usageKey = `${marker.tile}:${marker.type}:${marker.anchor}`;
          const duplicate = markerAnchorUsage.get(usageKey);
          if (duplicate) errors.push({ code: 'MARKER_ANCHOR_DUPLICATE', path: where, message: `le slot « ${marker.anchor} » est déjà utilisé par « ${duplicate.id} » pour le même type de marqueur.` });
          else markerAnchorUsage.set(usageKey, marker);
        }
        const expected = anchor.fixedToGrid ? { x: anchor.x, y: anchor.y } : rotatePoint(anchor.x, anchor.y, tile.rotation || 0);
        if (Math.abs(marker.x - expected.x) > .002 || Math.abs(marker.y - expected.y) > .002) errors.push({ code: 'SLOT_POSITION', path: where, message: `les coordonnées du marqueur ne correspondent pas au slot « ${marker.anchor} » après rotation.` });
        if (marker.type === 'door') {
          const connection = doorConnection(tile, expected, anchor.id);
          const duplicate = doorConnections.find(entry => sameDoorConnection(entry.connection, connection));
          if (duplicate) errors.push({ code: 'DOOR_CONNECTION_DUPLICATE', path: where, message: `la connexion entre tuiles possède déjà la porte « ${duplicate.marker.id} ».` });
          else doorConnections.push({ marker, connection });
        }
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings, summary: { tiles: mission.tiles.length, markers: mission.markers.length, grid: `${columns}×${rows}` } };
}
function inUnit(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function rotatePoint(x, y, rotation) { if (rotation === 90) return { x: 1 - y, y: x }; if (rotation === 180) return { x: 1 - x, y: 1 - y }; if (rotation === 270) return { x: y, y: 1 - x }; return { x, y }; }
function generatedMarkerAnchor(marker) {
  const gridEdge = String(marker.anchor || '').match(/^grid-edge-([hv])-([0-3])-([1-3])$/);
  if (gridEdge && ['gate', 'rubble'].includes(marker.type)) {
    const boundary = Number(gridEdge[2]); const cell = Number(gridEdge[3]);
    return gridEdge[1] === 'h'
      ? { id: marker.anchor, x: (cell - .5) / 3, y: boundary / 3, fixedToGrid: true }
      : { id: marker.anchor, x: boundary / 3, y: (cell - .5) / 3, fixedToGrid: true };
  }
  const gridCell = String(marker.anchor || '').match(/^grid-cell-([1-3])-([1-3])$/);
  if (gridCell) {
    const row = Number(gridCell[1]); const column = Number(gridCell[2]);
    const perimeter = row === 1 || row === 3 || column === 1 || column === 3;
    const edgeTypes = ['start', 'invasion', 'exit'];
    const centerTypes = ['objective', 'spawn', 'npc', 'vault', 'noise', 'guard', 'statue', 'chi'];
    if ((edgeTypes.includes(marker.type) && perimeter) || centerTypes.includes(marker.type)) {
      return { id: marker.anchor, x: (column - .5) / 3, y: (row - .5) / 3, fixedToGrid: true };
    }
  }
  const insetEdge = String(marker.anchor || '').match(/^grid-inset-(haut|droite|bas|gauche)-([1-3])$/);
  if (insetEdge && ['start', 'invasion', 'exit', 'spawn'].includes(marker.type)) {
    const center = (Number(insetEdge[2]) - .5) / 3; const inset = .11;
    const points = {
      haut: { x: center, y: inset },
      droite: { x: 1 - inset, y: center },
      bas: { x: center, y: 1 - inset },
      gauche: { x: inset, y: center }
    };
    return { id: marker.anchor, ...points[insetEdge[1]], fixedToGrid: true };
  }
  return null;
}
function doorConnection(tile, point, anchorId) {
  const edgeMargin = .08;
  if (point.x <= edgeMargin || point.x >= 1 - edgeMargin) return { axis: 'vertical', boundary: tile.column + (point.x > .5 ? 1 : 0), offset: tile.row + point.y };
  if (point.y <= edgeMargin || point.y >= 1 - edgeMargin) return { axis: 'horizontal', boundary: tile.row + (point.y > .5 ? 1 : 0), offset: tile.column + point.x };
  return { axis: 'internal', tile: tile.instanceId, anchor: anchorId };
}
function sameDoorConnection(first, second) {
  if (!first || !second || first.axis !== second.axis) return false;
  if (first.axis === 'internal') return first.tile === second.tile && first.anchor === second.anchor;
  return Math.abs(first.boundary - second.boundary) < .001 && Math.abs(first.offset - second.offset) <= .06;
}
function markerRenderPoint(mission, marker) {
  const tile = mission.tiles.find(entry => entry.instanceId === marker.tile); if (!tile) return null;
  if (marker.type === 'door' && marker.anchor) {
    const data = CATALOG.find(entry => entry.id === tile.catalogId);
    const anchor = [...(data?.doorAnchors || []), ...(tile.customDoorAnchors || [])].find(entry => entry.id === marker.anchor);
    if (anchor) {
      const connection = doorConnection(tile, rotatePoint(anchor.x, anchor.y, tile.rotation || 0), anchor.id);
      if (connection.axis === 'vertical') return { x: connection.boundary, y: connection.offset };
      if (connection.axis === 'horizontal') return { x: connection.offset, y: connection.boundary };
    }
  }
  return { x: tile.column + marker.x, y: tile.row + marker.y };
}
function spreadMarkerOffsets(count, spacing = .15) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const columns = Math.ceil(Math.sqrt(count)); const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns); const column = index % columns;
    const entriesInRow = Math.min(columns, count - row * columns);
    return { x: (column - (entriesInRow - 1) / 2) * spacing, y: (row - (rows - 1) / 2) * spacing };
  });
}
function markerDisplayPoints(mission) {
  const groups = new Map(); const displayPoints = new Map();
  mission.markers.forEach(marker => {
    const point = markerRenderPoint(mission, marker); if (!point) return;
    const key = `${Math.round(point.x * 1000)}:${Math.round(point.y * 1000)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ marker, point });
  });
  groups.forEach(entries => {
    const offsets = spreadMarkerOffsets(entries.length);
    const raw = entries.map((entry, index) => ({ x: entry.point.x + offsets[index].x, y: entry.point.y + offsets[index].y }));
    const margin = .07;
    const minX = Math.min(...raw.map(point => point.x)); const maxX = Math.max(...raw.map(point => point.x));
    const minY = Math.min(...raw.map(point => point.y)); const maxY = Math.max(...raw.map(point => point.y));
    const shiftX = minX < margin ? margin - minX : maxX > mission.grid.columns - margin ? mission.grid.columns - margin - maxX : 0;
    const shiftY = minY < margin ? margin - minY : maxY > mission.grid.rows - margin ? mission.grid.rows - margin - maxY : 0;
    entries.forEach((entry, index) => displayPoints.set(entry.marker.id, { x: raw[index].x + shiftX, y: raw[index].y + shiftY }));
  });
  return displayPoints;
}
function printValidation(result, asJson) {
  if (asJson) return console.log(JSON.stringify(result, null, 2));
  if (result.valid) console.log(`✓ Carte valide — grille ${result.summary.grid}, ${result.summary.tiles} tuile(s), ${result.summary.markers} marqueur(s).`);
  else console.log(`✗ Carte invalide — ${result.errors.length} erreur(s).`);
  for (const issue of result.errors) console.log(`  ERREUR [${issue.code}]${issue.path ? ` ${issue.path}` : ''} : ${issue.message}`);
  for (const issue of result.warnings) console.log(`  AVERTISSEMENT [${issue.code}]${issue.path ? ` ${issue.path}` : ''} : ${issue.message}`);
}
function missionSvg(mission, validation) {
  const width = mission.grid.columns * TILE_SIZE; const boardHeight = mission.grid.rows * TILE_SIZE;
  const counts = mission.markers.reduce((out, marker) => { out[marker.type] = (out[marker.type] || 0) + 1; return out; }, {});
  const legendWidth = mission.render?.showLegend !== false && mission.markers.length ? 190 : 0; const height = Math.max(boardHeight + 54, Object.keys(counts).length * 28 + 80);
  const tiles = mission.tiles.map(tile => { const data = CATALOG.find(entry => entry.id === tile.catalogId) || { code: tile.code || '?' }; const x = tile.column * TILE_SIZE; const y = tile.row * TILE_SIZE; const image = data.image && imageDataUri(data.image); const art = image ? `<image href="${image}" width="240" height="240" preserveAspectRatio="none"/>` : `<rect width="240" height="240" fill="#756e59"/><path d="M0 0H240V48H0zM0 120H240V174H0z" fill="#b8aa84" opacity=".72"/><path d="M0 48H240V120H0zM0 174H240V240H0z" fill="#303733" opacity=".9"/><path d="M0 0L240 240M240 0L0 240" stroke="#000" opacity=".12" stroke-width="3"/>`; return `<g transform="translate(${x} ${y})"><g transform="rotate(${tile.rotation} 120 120)">${art}<rect width="240" height="240" fill="none" stroke="#111" stroke-width="5"/></g>${mission.render?.showTileNames !== false ? `<rect x="8" y="8" width="42" height="25" rx="3" fill="#111" stroke="#fff"/><text x="29" y="26" text-anchor="middle" fill="#fff" font-size="13" font-weight="bold">${xml(data.code)}</text>` : ''}</g>`; }).join('');
  const displayPoints = markerDisplayPoints(mission);
  const markers = mission.markers.map(marker => { const point = displayPoints.get(marker.id) || markerRenderPoint(mission, marker); if (!point) return ''; const x = point.x * TILE_SIZE; const y = point.y * TILE_SIZE; const square = ['door', 'invasion', 'exit', 'gate'].includes(marker.type); const size = marker.type === 'door' ? 27 : 35; const rotate = marker.type === 'door' ? ` transform="rotate(45 ${x} ${y})"` : ''; const unrotate = marker.type === 'door' ? ` transform="rotate(-45 ${x} ${y})"` : ''; return `<g${rotate}><rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" rx="${square ? 3 : size / 2}" fill="${MARKERS[marker.type]?.[2] || '#555'}" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold"${unrotate}>${xml(marker.label)}</text></g>`; }).join('');
  const legend = legendWidth ? `<g transform="translate(${width + 18} 72)"><text fill="#d0a44a" font-size="10" font-weight="bold" letter-spacing="2">LÉGENDE</text>${Object.entries(counts).map(([type, count], index) => { const symbol = mission.markers.find(marker => marker.type === type)?.label || MARKERS[type]?.[1] || '?'; const centerY = 30 + index * 28; return `<circle cx="10" cy="${centerY}" r="9" fill="${MARKERS[type]?.[2] || '#555'}" stroke="#fff"/><text x="10" y="${centerY + 3}" text-anchor="middle" fill="#fff" font-size="8" font-weight="bold">${xml(symbol)}</text><text x="28" y="${centerY + 4}" fill="#eee" font-size="11">${xml(MARKERS[type]?.[0] || type)} × ${count}</text>`; }).join('')}</g>` : '';
  const warning = validation.warnings.length ? `<text x="${width + 18}" y="48" fill="#e5b95d" font-size="9">⚠ ${validation.warnings.length} avertissement(s) collection</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + legendWidth}" height="${height}" viewBox="0 0 ${width + legendWidth} ${height}"><rect width="100%" height="100%" fill="${xml(mission.render?.background || '#15181c')}"/><text x="14" y="35" fill="#f0c765" font-family="Georgia,serif" font-size="20" font-weight="bold">${xml(mission.name)}</text>${warning}<g transform="translate(0 54)">${tiles}${markers}</g>${legend}</svg>`;
}
function findEdge() {
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe')
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ]
      : ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}
function renderPng(svg, output, width, height) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zombicide-map-')); const svgFile = path.join(tempDir, 'render.svg'); fs.writeFileSync(svgFile, svg);
  if (process.platform === 'darwin') {
    const result = spawnSync('sips', ['-s', 'format', 'png', svgFile, '--out', path.resolve(output)], { encoding: 'utf8', timeout: 30000 });
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (result.status !== 0 || !fs.existsSync(path.resolve(output))) fail(`échec du rendu PNG${result.stderr ? ` (${result.stderr.trim()})` : ''}.`);
    return;
  }
  const edge = findEdge(); if (!edge) fail('Microsoft Edge/Chrome est requis pour le rendu PNG. Utilisez une sortie .svg.');
  const result = spawnSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tempDir, 'chrome-profile')}`, `--window-size=${width},${height}`, `--screenshot=${path.resolve(output)}`, pathToFileURL(svgFile).href], { encoding: 'utf8', timeout: 30000 });
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (result.status !== 0 || !fs.existsSync(path.resolve(output))) fail(`échec du rendu PNG${result.stderr ? ` (${result.stderr.trim()})` : ''}.`);
}
function printHelp() {
  console.log(`zombicide-map ${VERSION}\n\nAvant de générer ou modifier une mission avec une IA :\n  zombicide-map rules\n  zombicide-map context --json\n\nUsage :\n  zombicide-map rules [--json]\n  zombicide-map context [--collection collection.json] [--catalog catalogue.json] [--json]\n  zombicide-map catalog [--collection collection.json] [--catalog catalogue.json] [--json]\n  zombicide-map validate mission.json [--collection collection.json] [--catalog catalogue.json] [--json] [--strict]\n  zombicide-map render mission.json --output carte.svg|carte.png [--collection collection.json] [--catalog catalogue.json]\n\nDocumentation canonique : docs/CLI_RULES.md\n`);
}

const args = parseArgs(process.argv.slice(2)); const [command, input] = args._;
if (!command || ['help', '-h'].includes(command) || args.help) { printHelp(); process.exit(0); }
if (command === 'version' || args.version) { console.log(VERSION); process.exit(0); }
applyCatalogFile(path.resolve(CLI_DIR, '../config/default-catalog.json'));
applyCatalogFile(args.catalog);
const collection = collectionFrom(args.collection);

if (command === 'rules') {
  const rules = fs.readFileSync(RULES_FILE, 'utf8');
  if (args.json) console.log(JSON.stringify({ tool: 'zombicide-map', version: VERSION, rulesDocument: RULES_FILE, rules }, null, 2));
  else console.log(rules);
} else if (command === 'catalog') {
  const rows = CATALOG.map(tile => ({ ...tile, ...availability(tile, collection), productName: PRODUCTS[tile.product] }));
  if (args.json) console.log(JSON.stringify(rows, null, 2)); else for (const tile of rows) console.log(`${tile.available ? '✓' : '×'} ${tile.code.padEnd(4)} ${tile.name.padEnd(25)} ${tile.reason}`);
} else if (command === 'context') {
  const available = CATALOG.filter(tile => availability(tile, collection).available).map(tile => ({ id: tile.id, code: tile.code, face: tile.face, product: tile.product, slots: tile.slots, doorAnchors: tile.doorAnchors }));
  const context = { tool: 'zombicide-map', version: VERSION, rulesDocument: RULES_FILE, requiredAgentWorkflow: ['Read docs/CLI_RULES.md or run `zombicide-map rules` before using the CLI.', 'Run `zombicide-map context --json` before generating or editing mission JSON.', 'Run `zombicide-map validate <mission.json> --strict` after every change.', 'Complete the semantic movement-network audit from docs/CLI_RULES.md; CLI success alone does not prove playability.', 'Render only after both CLI validation and semantic audit succeed.'], constraints: { grid: { columns: 'integer 1..4', rows: 'integer 1..4' }, rotations: [0, 90, 180, 270], uniquePhysicalTiles: 'a tile number can appear only once; R and V are the same physical tile', uniqueDoorConnections: 'paired door slots on opposite sides of the same tile junction represent one connection and accept only one anchored door marker', uniqueMarkerAnchorPerType: true, semanticAudit: { tileJunctions: 'every adjacent tile pair must expose compatible passages on both sides after rotation; a door marker cannot repair an incompatible junction', survivors: 'start -> ordered mandatory objectives -> exit must be reachable; keys and mechanisms must be reachable before the doors they open', invasions: 'standard invasions must touch a real outer board side and connect to the playable network', necromancers: 'each eligible invasion needs an open route to another valid invasion unless the quest explicitly overrides escape rules', zombies: 'every active invasion must connect to the survivor network; no permanently sealed component without an explicit scenario rule', doors: 'ordinary doors join adjacent zones; special-door mechanisms must be reachable from the start side', readability: 'markers must not hide doors, zone limits, or important passages' }, defaultMarkerPlacement: { door: 'prefer a catalog door slot; free placement is allowed', gate: 'prefer a catalog gate slot, otherwise a grid-edge anchor; free placement is allowed', rubble: 'prefer a catalog rubble slot, otherwise a grid-edge anchor; free placement is allowed', start: 'center of one of the eight perimeter cells of the tile 3x3 grid; free placement is allowed', invasion: 'center of a perimeter cell located on an outer board side; free placement must also stay on an outer side', exit: 'center of one of the eight perimeter cells of the tile 3x3 grid; free placement is allowed', objective: 'center of a tile grid cell by default; free placement is allowed', spawn: 'center of a tile grid cell by default; free placement is allowed', other: 'center of a tile grid cell by default; free placement is allowed', overlappingMarkers: 'logical coordinates stay unchanged; rendering spreads icons that share a point' }, normalizedMarkerCoordinates: true, generatedAnchors: { gridEdge: 'grid-edge-(h|v)-(0..3)-(1..3), for gate/rubble', gridCell: 'grid-cell-(row 1..3)-(column 1..3); perimeter cells only for start/invasion/exit, all cells for central markers', legacyInsetGridEdge: 'grid-inset-* remains accepted when reading older missions' }, slotPolicy: CATALOG_POLICY, markers: Object.keys(MARKERS), availableTiles: available }, missionContract: { format: 'zombicide-map', version: 1, name: 'string', grid: { columns: 3, rows: 2 }, tiles: [{ instanceId: 'unique string', catalogId: 'available tile id; tile number unique across R/V faces', code: 'catalog code', face: 'R|V', column: 0, row: 0, rotation: 0, customDoorAnchors: [] }], markers: [{ id: 'unique string', type: 'one of constraints.markers', tile: 'tile instanceId', anchor: 'optional stable catalog or generated anchor id', x: 'derived from anchor when anchored, otherwise normalized coordinate 0..1', y: 'derived from anchor when anchored, otherwise normalized coordinate 0..1', label: 'string' }], render: { showTileNames: true, showLegend: true, background: '#24282d' } } };
  if (args.json) console.log(JSON.stringify(context, null, 2)); else { console.log('CONTEXTE ZOMBICIDE MAP POUR MODÈLE IA'); console.log(JSON.stringify(context, null, 2)); console.log('\nAprès génération : zombicide-map validate <mission.json> --collection <collection.json> --json'); }
} else if (command === 'validate') {
  const result = validateMission(readJson(input, 'mission'), collection); printValidation(result, args.json); process.exit(result.valid && (!args.strict || result.warnings.length === 0) ? 0 : 2);
} else if (command === 'render') {
  const mission = readJson(input, 'mission'); const result = validateMission(mission, collection); if (!result.valid) { printValidation(result, args.json); process.exit(2); }
  const output = args.output; if (!output || !/\.(svg|png)$/i.test(output)) fail('--output doit se terminer par .svg ou .png.');
  const svg = missionSvg(mission, result); const absolute = path.resolve(output); fs.mkdirSync(path.dirname(absolute), { recursive: true });
  if (/\.svg$/i.test(output)) fs.writeFileSync(absolute, svg); else renderPng(svg, absolute, mission.grid.columns * TILE_SIZE + (mission.render?.showLegend !== false && mission.markers.length ? 190 : 0), Math.max(mission.grid.rows * TILE_SIZE + 54, new Set(mission.markers.map(marker => marker.type)).size * 28 + 80));
  console.log(`✓ Carte générée : ${absolute}`); for (const warning of result.warnings) console.log(`  AVERTISSEMENT [${warning.code}] : ${warning.message}`);
} else fail(`commande inconnue « ${command} ». Utilisez « zombicide-map help ».`);
