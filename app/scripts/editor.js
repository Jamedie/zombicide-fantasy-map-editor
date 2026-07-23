const PRODUCTS = [
  { id: 'black-plague', name: 'Black Plague' },
  { id: 'wulfsburg', name: 'Wulfsburg' },
  { id: 'green-horde', name: 'Green Horde' },
  { id: 'friends-and-foes', name: 'Friends and Foes' },
  { id: 'white-death', name: 'White Death' },
  { id: 'eternal-empire', name: 'Eternal Empire' },
  { id: 'tmnt-timecrash', name: 'TMNT Timecrash' },
  { id: 'custom', name: 'Tuiles importées' }
];

const TILE_PRODUCT_RANGES = [
  { from: 1, to: 9, product: 'black-plague' },
  { from: 10, to: 11, product: 'wulfsburg' },
  { from: 12, to: 20, product: 'green-horde' },
  { from: 21, to: 25, product: 'friends-and-foes' },
  { from: 26, to: 34, product: 'white-death' },
  { from: 35, to: 38, product: 'eternal-empire' },
  { from: 39, to: 42, product: 'tmnt-timecrash' }
];
const BASE_CATALOG = TILE_PRODUCT_RANGES.flatMap(range => Array.from({ length: range.to - range.from + 1 }, (_, offset) => range.from + offset).flatMap(number => ['R', 'V'].map(face => ({ number, face, product: range.product })))).map((entry, index) => ({
  id: `${entry.number}${entry.face}`.toLowerCase(), code: `${entry.number}${entry.face}`, name: `Tuile ${entry.number}${entry.face}`, product: entry.product, face: entry.face,
  image: `assets/tiles/${entry.number}${entry.face}.webp`,
  source: 'https://zombicide.fandom.com/wiki/Fantasy_Tiles',
  doorAnchors: []
}));

const MARKERS = [
  { type: 'start', name: 'Départ', label: 'S' }, { type: 'objective', name: 'Objectif', label: '1' },
  { type: 'invasion', name: 'Invasion', label: '1' }, { type: 'exit', name: 'Sortie', label: 'E' },
  { type: 'door', name: 'Porte', label: 'D' }, { type: 'spawn', name: 'Nécromancien', label: 'N' },
  { type: 'npc', name: 'NPC cible', label: 'N' },
  { type: 'vault', name: 'Coffre / objectif', label: 'C' }, { type: 'noise', name: 'Bruit', label: '!' },
  { type: 'gate', name: 'Grille', label: 'G' }, { type: 'rubble', name: 'Gravats', label: 'X' },
  { type: 'guard', name: 'Garde', label: 'G' }, { type: 'statue', name: 'Statue', label: 'ST' },
  { type: 'chi', name: 'Chi', label: 'χ' }
];

const TILE_SIZE = 240;
const DOOR_EDGE_MARGIN = .08;
const DOOR_CONNECTION_TOLERANCE = .06;
const CATALOG_PREFERRED_MARKERS = new Set(['gate', 'rubble']);
const EDGE_DEFAULT_MARKERS = new Set(['start', 'invasion', 'exit']);
const EDGE_ANCHOR_MARKERS = new Set(['start', 'invasion', 'exit']);
const CELL_CENTER_MARKERS = new Set(['objective', 'spawn', 'npc', 'vault', 'noise', 'guard', 'statue', 'chi']);
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

const customCatalog = storage.get('zombicide-custom-catalog', []);
const catalog = [...BASE_CATALOG, ...customCatalog];
let defaultCatalogOverrides = {};
let catalogOverrides = storage.get('zombicide-catalog-overrides', {});
let profiles = storage.get('zombicide-collection-profiles', null) || [newCollection('Ma collection')];
let activeProfile = Math.min(storage.get('zombicide-active-profile', 0), profiles.length - 1);
let mission = storage.get('zombicide-autosave', null) || newMission();
let selected = null;
let targetedCell = null;
let zoom = .85;
let markerDrag = null;

function newCollection(name) {
  return { format: 'zombicide-collection', version: 1, name, ownedProducts: ['black-plague'], tileWhitelist: [], tileBlacklist: [] };
}
function newMission() {
  return { format: 'zombicide-map', version: 1, name: 'Nouvelle quête', grid: { columns: 3, rows: 2 }, tiles: [], markers: [], render: { showTileNames: true, showLegend: true, background: '#24282d' } };
}
function profile() { return profiles[activeProfile]; }
function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function productName(id) { return PRODUCTS.find(product => product.id === id)?.name || 'Boîte inconnue'; }
function catalogTile(id) { return catalog.find(tile => tile.id === id); }
function placedTile(id) { return mission.tiles.find(tile => tile.instanceId === id); }
function physicalTileKey(tileOrId) {
  const tile = typeof tileOrId === 'string' ? catalogTile(tileOrId) : tileOrId;
  const data = tile?.catalogId ? catalogTile(tile.catalogId) : tile;
  const reference = data?.code || tile?.code || tile?.catalogId || tile?.id || '';
  const match = String(reference).trim().match(/^(\d+)[rv]$/i);
  return match ? `number-${Number(match[1])}` : `catalog-${data?.id || tile?.catalogId || tile?.id || reference}`;
}
function duplicatePhysicalTiles(tiles) {
  const firstByKey = new Map(); const duplicates = [];
  for (const tile of tiles) {
    const key = physicalTileKey(tile);
    if (firstByKey.has(key)) duplicates.push([firstByKey.get(key), tile]);
    else firstByKey.set(key, tile);
  }
  return duplicates;
}
function markerType(type) { return MARKERS.find(marker => marker.type === type); }
function esc(text) { const node = document.createElement('div'); node.textContent = String(text ?? ''); return node.innerHTML; }
function xml(text) { return String(text ?? '').replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char])); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function saveAll() {
  storage.set('zombicide-collection-profiles', profiles);
  storage.set('zombicide-active-profile', activeProfile);
  storage.set('zombicide-autosave', mission);
  storage.set('zombicide-catalog-overrides', catalogOverrides);
}
function availability(tileOrId) {
  const tile = typeof tileOrId === 'string' ? catalogTile(tileOrId) : tileOrId;
  if (!tile) return { available: false, reason: 'Absente du catalogue' };
  if (profile().tileBlacklist.includes(tile.id)) return { available: false, reason: 'Exclue manuellement' };
  if (profile().tileWhitelist.includes(tile.id)) return { available: true, reason: 'Ajoutée manuellement' };
  if (profile().ownedProducts.includes(tile.product)) return { available: true, reason: `Disponible via ${productName(tile.product)}` };
  return { available: false, reason: `${productName(tile.product)} non possédée` };
}
function catalogConfiguration(tileId) {
  return Object.prototype.hasOwnProperty.call(catalogOverrides, tileId) ? catalogOverrides[tileId] : (defaultCatalogOverrides[tileId] || catalogTile(tileId) || {});
}
function catalogSlots(tile, type) {
  const configuration = catalogConfiguration(tile.catalogId);
  const base = Array.isArray(configuration.slots)
    ? configuration.slots
    : (configuration.doorAnchors || []).map(anchor => ({ ...anchor, type: 'door' }));
  return base.filter(slot => slot.type === type).map(slot => ({ ...slot, source: 'catalog', ...rotateNormalizedPoint(slot.x, slot.y, tile.rotation || 0) }));
}
function gridEdgeAnchors(tile) {
  const anchors = [];
  for (let boundary = 0; boundary <= 3; boundary++) {
    for (let cell = 0; cell < 3; cell++) {
      const horizontal = { x: (cell + .5) / 3, y: boundary / 3 };
      const vertical = { x: boundary / 3, y: (cell + .5) / 3 };
      anchors.push({
        id: `grid-edge-h-${boundary}-${cell + 1}`,
        type: 'grid-edge',
        source: 'grid-edge',
        label: `Horizontale ${boundary + 1} · case ${cell + 1}`,
        ...horizontal
      });
      anchors.push({
        id: `grid-edge-v-${boundary}-${cell + 1}`,
        type: 'grid-edge',
        source: 'grid-edge',
        label: `Verticale ${boundary + 1} · case ${cell + 1}`,
        ...vertical
      });
    }
  }
  return anchors;
}
function gridCellAnchors(perimeterOnly = false) {
  const order = perimeterOnly
    ? [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1]]
    : [[2, 2], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1]];
  return order.map(([row, column]) => ({
    id: `grid-cell-${row}-${column}`,
    type: 'grid-cell',
    source: perimeterOnly ? 'grid-perimeter' : 'grid-cell',
    label: `Case ${row}.${column}`,
    x: (column - .5) / 3,
    y: (row - .5) / 3
  }));
}
function tileAnchors(tile) {
  const custom = (tile.customDoorAnchors || []).map(anchor => ({ ...anchor, type: 'door', ...rotateNormalizedPoint(anchor.x, anchor.y, tile.rotation || 0) }));
  return [...catalogSlots(tile, 'door'), ...custom];
}
function catalogTileAnchors(tileId) { return catalogConfiguration(tileId).doorAnchors ?? []; }
function markerAnchors(tile, type) {
  if (type === 'door') return tileAnchors(tile);
  const configured = catalogSlots(tile, type);
  if (CATALOG_PREFERRED_MARKERS.has(type)) return [...configured, ...gridEdgeAnchors(tile)];
  if (EDGE_ANCHOR_MARKERS.has(type)) return [...configured, ...gridCellAnchors(true)];
  if (CELL_CENTER_MARKERS.has(type)) return [...configured, ...gridCellAnchors()];
  return configured;
}
function markerAtAnchor(tile, type, anchor, exceptMarkerId) {
  return mission.markers.find(marker => marker.id !== exceptMarkerId && marker.tile === tile.instanceId && marker.type === type && marker.anchor === anchor.id);
}
function rotateNormalizedPoint(x, y, rotation) {
  if (rotation === 90) return { x: 1 - y, y: x };
  if (rotation === 180) return { x: 1 - x, y: 1 - y };
  if (rotation === 270) return { x: y, y: 1 - x };
  return { x, y };
}
function doorConnection(tile, anchor) {
  if (!tile || !anchor) return null;
  if (anchor.x <= DOOR_EDGE_MARGIN || anchor.x >= 1 - DOOR_EDGE_MARGIN) {
    return { axis: 'vertical', boundary: tile.column + (anchor.x > .5 ? 1 : 0), offset: tile.row + anchor.y };
  }
  if (anchor.y <= DOOR_EDGE_MARGIN || anchor.y >= 1 - DOOR_EDGE_MARGIN) {
    return { axis: 'horizontal', boundary: tile.row + (anchor.y > .5 ? 1 : 0), offset: tile.column + anchor.x };
  }
  return { axis: 'internal', tile: tile.instanceId, anchor: anchor.id };
}
function sameDoorConnection(first, second) {
  if (!first || !second || first.axis !== second.axis) return false;
  if (first.axis === 'internal') return first.tile === second.tile && first.anchor === second.anchor;
  return Math.abs(first.boundary - second.boundary) < .001 && Math.abs(first.offset - second.offset) <= DOOR_CONNECTION_TOLERANCE;
}
function markerDoorConnection(marker) {
  if (marker?.type !== 'door') return null;
  const tile = placedTile(marker.tile);
  const anchor = tile && tileAnchors(tile).find(entry => entry.id === marker.anchor);
  return doorConnection(tile, anchor);
}
function doorMarkerAtConnection(tile, anchor, exceptMarkerId) {
  const connection = doorConnection(tile, anchor);
  return mission.markers.find(marker => marker.id !== exceptMarkerId && marker.type === 'door' && sameDoorConnection(connection, markerDoorConnection(marker)));
}
function duplicateDoorConnections() {
  const seen = []; const duplicates = [];
  for (const marker of mission.markers.filter(entry => entry.type === 'door')) {
    const connection = markerDoorConnection(marker); if (!connection) continue;
    const existing = seen.find(entry => sameDoorConnection(entry.connection, connection));
    if (existing) duplicates.push([existing.marker, marker]);
    else seen.push({ marker, connection });
  }
  return duplicates;
}
function markerBoardPoint(marker) {
  const tile = placedTile(marker.tile); if (!tile) return null;
  const connection = markerDoorConnection(marker);
  if (connection?.axis === 'vertical') return { x: connection.boundary, y: connection.offset };
  if (connection?.axis === 'horizontal') return { x: connection.offset, y: connection.boundary };
  return { x: tile.column + marker.x, y: tile.row + marker.y };
}
function spreadMarkerOffsets(count, spacing = .15) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const columns = Math.ceil(Math.sqrt(count)); const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns); const column = index % columns;
    const entriesInRow = Math.min(columns, count - row * columns);
    return {
      x: (column - (entriesInRow - 1) / 2) * spacing,
      y: (row - (rows - 1) / 2) * spacing
    };
  });
}
function markerDisplayPoints() {
  const groups = new Map(); const displayPoints = new Map();
  mission.markers.forEach(marker => {
    const point = markerBoardPoint(marker); if (!point) return;
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
function syncAnchoredMarkers(tile) {
  mission.markers.forEach(marker => {
    if (marker.tile !== tile.instanceId || !marker.anchor) return;
    const anchor = markerAnchors(tile, marker.type).find(entry => entry.id === marker.anchor);
    if (anchor) { marker.x = anchor.x; marker.y = anchor.y; }
  });
}
function reconcileMarkerAnchors(catalogId) {
  const instances = mission.tiles.filter(tile => tile.catalogId === catalogId);
  const instanceIds = new Set(instances.map(tile => tile.instanceId));
  mission.markers.forEach(marker => {
    if (!instanceIds.has(marker.tile) || !marker.anchor) return;
    const tile = placedTile(marker.tile);
    if (!markerAnchors(tile, marker.type).some(anchor => anchor.id === marker.anchor)) marker.anchor = undefined;
  });
  instances.forEach(syncAnchoredMarkers);
}
function item() {
  if (!selected) return null;
  return selected.kind === 'tile' ? placedTile(selected.id) : mission.markers.find(marker => marker.id === selected.id);
}
function assetUrl(source) { try { return new URL(source, document.baseURI).href; } catch { return source || ''; } }
function markerHtml(type, label, extraClass = '') {
  return `<span class="marker-swatch marker-${type} type-${type} ${extraClass}"><span>${esc(label)}</span></span>`;
}

function render() {
  document.documentElement.style.setProperty('--zoom', zoom);
  renderTabs();
  renderCollection();
  renderLibrary();
  renderMarkerLibrary();
  renderBoard();
  renderInspector();
  renderLegend();
  renderWarnings();
  document.querySelector('#mission-name').value = mission.name;
  document.querySelector('#grid-columns').value = mission.grid.columns;
  document.querySelector('#grid-rows').value = mission.grid.rows;
  document.querySelector('#show-tile-names').checked = mission.render.showTileNames;
  document.querySelector('#show-legend').checked = mission.render.showLegend;
  document.querySelector('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  document.querySelector('#mission-status').textContent = `${mission.tiles.length} tuile${mission.tiles.length > 1 ? 's' : ''} • ${mission.markers.length} marqueur${mission.markers.length > 1 ? 's' : ''}`;
  document.querySelector('#placement-status').textContent = targetedCell
    ? `Case ${targetedCell.column + 1}.${targetedCell.row + 1} ciblée • Cliquez une tuile dans la bibliothèque`
    : 'Cliquez une case vide pour la cibler • Sans cible, la première case libre est utilisée';
  saveAll();
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button === tab));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab));
  });
}
function renderCollection() {
  document.querySelector('#profile-select').innerHTML = profiles.map((entry, index) => `<option value="${index}" ${index === activeProfile ? 'selected' : ''}>${esc(entry.name)}</option>`).join('');
  document.querySelector('#product-list').innerHTML = PRODUCTS.map(product => {
    const count = catalog.filter(tile => tile.product === product.id).length;
    if (!count && product.id === 'custom') return '';
    return `<label class="product-choice"><input type="checkbox" data-product="${product.id}" ${profile().ownedProducts.includes(product.id) ? 'checked' : ''}/>${esc(product.name)}<span>${count} faces</span></label>`;
  }).join('');
}
function renderLibrary() {
  const search = document.querySelector('#tile-search').value.trim().toLowerCase();
  const showUnavailable = document.querySelector('#show-unavailable').checked;
  const filtered = catalog.filter(tile => {
    const matches = `${tile.code} ${tile.name} ${productName(tile.product)} ${tile.face}`.toLowerCase().includes(search);
    return matches && (showUnavailable || availability(tile).available);
  });
  document.querySelector('#tile-count').textContent = `${filtered.length}/${catalog.length}`;
  document.querySelector('#tile-library').innerHTML = filtered.map(tile => {
    const access = availability(tile); const mode = profile().tileBlacklist.includes(tile.id) ? 'blacklist' : profile().tileWhitelist.includes(tile.id) ? 'whitelist' : 'auto';
    return `<article class="tile-card ${access.available ? '' : 'unavailable'}" draggable="${access.available}" data-catalog-id="${tile.id}" title="${esc(access.reason)}">
      ${tile.image ? `<img class="tile-preview" src="${esc(assetUrl(tile.image))}" alt="Aperçu ${esc(tile.code)}" loading="lazy" />` : '<div class="tile-preview"></div>'}
      <div class="tile-meta"><div class="tile-title"><span>${esc(tile.code)} · Face ${esc(tile.face)}</span><i class="availability-dot"></i></div><span class="tile-product">${esc(productName(tile.product))}</span></div>
      <select class="tile-exception" data-exception="${tile.id}" aria-label="Exception ${esc(tile.code)}"><option value="auto" ${mode === 'auto' ? 'selected' : ''}>Selon ma collection</option><option value="whitelist" ${mode === 'whitelist' ? 'selected' : ''}>Forcer disponible</option><option value="blacklist" ${mode === 'blacklist' ? 'selected' : ''}>Forcer indisponible</option></select>
    </article>`;
  }).join('') || '<p class="legend-empty">Aucune tuile ne correspond à ces critères.</p>';
}
function renderMarkerLibrary() {
  document.querySelector('#marker-library').innerHTML = MARKERS.map(marker => `<button class="marker-choice" data-marker-type="${marker.type}">${markerHtml(marker.type, marker.label)}<span>${esc(marker.name)}</span></button>`).join('');
}
function renderBoard() {
  const board = document.querySelector('#board');
  const displayPoints = markerDisplayPoints();
  board.style.setProperty('--cols', mission.grid.columns);
  board.style.setProperty('--rows', mission.grid.rows);
  board.style.width = `${mission.grid.columns * TILE_SIZE}px`;
  board.style.height = `${mission.grid.rows * TILE_SIZE}px`;
  board.innerHTML = Array.from({ length: mission.grid.columns * mission.grid.rows }, (_, index) => {
    const column = index % mission.grid.columns; const row = Math.floor(index / mission.grid.columns);
    const targeted = targetedCell?.column === column && targetedCell?.row === row;
    return `<div class="grid-cell ${targeted ? 'targeted' : ''}" data-column="${column}" data-row="${row}">${targeted ? '' : `${column + 1}.${row + 1}`}</div>`;
  }).join('');
  mission.tiles.forEach(tile => {
    const data = catalogTile(tile.catalogId) || { code: tile.code || '?', name: 'Tuile inconnue' };
    const node = document.createElement('div');
    node.className = `placed-tile ${selected?.kind === 'tile' && selected.id === tile.instanceId ? 'selected' : ''} ${availability(tile.catalogId).available ? '' : 'unavailable'}`;
    node.dataset.tileInstance = tile.instanceId; node.draggable = true;
    node.style.left = `${tile.column * TILE_SIZE}px`; node.style.top = `${tile.row * TILE_SIZE}px`;
    node.style.transform = `rotate(${tile.rotation}deg)`;
    node.innerHTML = data.image
      ? `<img class="tile-art" src="${esc(assetUrl(data.image))}" alt="Tuile ${esc(data.code)}" draggable="false" />${mission.render.showTileNames ? `<span class="tile-ref">${esc(data.code)}</span>` : ''}`
      : `<div class="tile-art"></div>${mission.render.showTileNames ? `<span class="tile-ref">${esc(data.code)}</span>` : ''}`;
    board.append(node);
  });
  mission.markers.forEach(marker => {
    const tile = placedTile(marker.tile); if (!tile) return;
    const point = displayPoints.get(marker.id) || markerBoardPoint(marker);
    const node = document.createElement('div');
    node.className = `marker-node marker-${marker.type} type-${marker.type} ${selected?.kind === 'marker' && selected.id === marker.id ? 'selected' : ''}`;
    node.dataset.markerId = marker.id; node.style.left = `${point.x * TILE_SIZE}px`; node.style.top = `${point.y * TILE_SIZE}px`;
    node.innerHTML = `<span>${esc(marker.label)}</span>`; board.append(node);
  });
}
function renderInspector() {
  const current = item(); const empty = document.querySelector('#empty-inspector'); const tilePanel = document.querySelector('#tile-inspector'); const markerPanel = document.querySelector('#marker-inspector');
  empty.hidden = !!current; tilePanel.hidden = selected?.kind !== 'tile' || !current; markerPanel.hidden = selected?.kind !== 'marker' || !current;
  if (!current) return;
  if (selected.kind === 'tile') {
    const data = catalogTile(current.catalogId) || { code: current.code || '?', name: 'Tuile inconnue', product: '' };
    document.querySelector('#selected-tile-name').textContent = `${data.code} · ${data.name}`;
    document.querySelector('#selected-tile-product').textContent = `${productName(data.product)} — ${availability(data).reason}`;
    document.querySelector('#selected-tile-thumb').style.cssText = data.image ? `background-image:url("${assetUrl(data.image)}")` : '';
    document.querySelector('#tile-rotation').value = current.rotation;
    document.querySelector('#replace-tile').hidden = availability(data).available;
  } else {
    const type = markerType(current.type);
    document.querySelector('#selected-marker-icon').innerHTML = markerHtml(current.type, current.label);
    document.querySelector('#selected-marker-name').textContent = type?.name || current.type;
    document.querySelector('#marker-label').value = current.label;
    document.querySelector('#marker-x').value = Math.round(current.x * 100);
    document.querySelector('#marker-y').value = Math.round(current.y * 100);
    const anchoredDoor = current.type === 'door' && !!current.anchor;
    document.querySelector('#marker-x').disabled = anchoredDoor;
    document.querySelector('#marker-y').disabled = anchoredDoor;
    const supportsAnchors = current.type === 'door' || CATALOG_PREFERRED_MARKERS.has(current.type) || EDGE_ANCHOR_MARKERS.has(current.type) || CELL_CENTER_MARKERS.has(current.type);
    const anchorField = document.querySelector('#anchor-field'); anchorField.hidden = !supportsAnchors;
    if (supportsAnchors) {
      const tile = placedTile(current.tile); const anchors = tile ? markerAnchors(tile, current.type) : [];
      if (current.type === 'door') {
        const anchorOptions = anchors.map(anchor => {
          const used = doorMarkerAtConnection(tile, anchor, current.id);
          return `<option value="${anchor.id}" ${current.anchor === anchor.id ? 'selected' : ''} ${used ? 'disabled' : ''}>${esc(anchor.label || anchor.id)}${used ? ' · emplacement utilisé' : ''}</option>`;
        }).join('');
        document.querySelector('#marker-anchor').innerHTML = `<option value="" ${current.anchor ? '' : 'selected'}>Placement libre</option>${anchorOptions}`;
      } else {
        const currentAnchor = anchors.find(anchor => anchor.id === current.anchor);
        const sources = new Set(anchors.map(anchor => anchor.source));
        const options = [
          `<option value="" ${current.anchor ? '' : 'selected'}>Placement libre</option>`,
          sources.has('catalog') ? `<option value="mode:catalog" ${currentAnchor?.source === 'catalog' ? 'selected' : ''}>Emplacement défini sur la tuile</option>` : '',
          sources.has('grid-edge') ? `<option value="mode:grid-edge" ${currentAnchor?.source === 'grid-edge' ? 'selected' : ''}>Milieu des arêtes de la grille 3×3</option>` : '',
          sources.has('grid-perimeter') ? `<option value="mode:grid-perimeter" ${currentAnchor?.source === 'grid-perimeter' ? 'selected' : ''}>Centre d’une case extérieure</option>` : '',
          sources.has('grid-cell') ? `<option value="mode:grid-cell" ${currentAnchor?.source === 'grid-cell' ? 'selected' : ''}>Centre d’une case de la grille 3×3</option>` : ''
        ];
        document.querySelector('#marker-anchor').innerHTML = options.join('');
      }
    }
  }
}
function renderLegend() {
  const counts = mission.markers.reduce((result, marker) => { result[marker.type] = (result[marker.type] || 0) + 1; return result; }, {});
  document.querySelector('#legend').innerHTML = Object.entries(counts).map(([type, count]) => { const meta = markerType(type); return `<div class="legend-row">${markerHtml(type, meta?.label || '?')}<span>${esc(meta?.name || type)}</span><span>× ${count}</span></div>`; }).join('') || '<span class="legend-empty">La légende apparaîtra avec vos marqueurs.</span>';
}
function renderWarnings() {
  const issues = mission.tiles.filter(tile => !availability(tile.catalogId).available);
  const duplicates = duplicatePhysicalTiles(mission.tiles);
  const duplicateDoors = duplicateDoorConnections();
  const messages = [];
  if (issues.length) messages.push(`<strong>${issues.length} tuile${issues.length > 1 ? 's' : ''} indisponible${issues.length > 1 ? 's' : ''}</strong> dans « ${esc(profile().name)} » : ${issues.map(tile => esc(catalogTile(tile.catalogId)?.code || tile.catalogId)).join(', ')}.`);
  if (duplicates.length) messages.push(`<strong>Doublon interdit</strong> : ${duplicates.map(([first, second]) => `${esc(catalogTile(first.catalogId)?.code || first.code)} / ${esc(catalogTile(second.catalogId)?.code || second.code)}`).join(', ')}. Les faces R et V comptent comme la même tuile.`);
  if (duplicateDoors.length) messages.push(`<strong>Connexion de porte en double</strong> : deux marqueurs utilisent la même jonction entre tuiles.`);
  const bar = document.querySelector('#warning-bar'); bar.hidden = messages.length === 0;
  bar.innerHTML = messages.length ? `⚠ ${messages.join(' ')}` : '';
}
function toast(message, error = false) {
  const node = document.querySelector('#toast'); node.textContent = message; node.hidden = false; node.classList.toggle('error', error); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.hidden = true, 2600);
}

function firstFreeCell() {
  for (let row = 0; row < mission.grid.rows; row++) for (let column = 0; column < mission.grid.columns; column++) if (!mission.tiles.some(tile => tile.column === column && tile.row === row)) return { column, row };
  return null;
}
function addTile(catalogId, column, row) {
  const data = catalogTile(catalogId); if (!data || !availability(data).available) return toast('Cette tuile n’est pas disponible dans la collection.', true);
  const target = column == null ? (targetedCell || firstFreeCell()) : { column, row };
  if (!target) return toast('La grille est pleine. Ajoutez une ligne ou une colonne.', true);
  const occupant = mission.tiles.find(tile => tile.column === target.column && tile.row === target.row);
  const duplicate = mission.tiles.find(tile => tile !== occupant && physicalTileKey(tile) === physicalTileKey(data));
  if (duplicate) {
    const number = data.code.match(/^\d+/)?.[0] || data.code;
    return toast(`La tuile ${number} est déjà utilisée : les faces R et V comptent comme la même tuile.`, true);
  }
  if (occupant && !confirm(`Remplacer ${catalogTile(occupant.catalogId)?.code || 'la tuile'} ?`)) return;
  if (occupant) removeTile(occupant.instanceId);
  const tile = { instanceId: uid('tile'), catalogId, code: data.code, face: data.face, column: target.column, row: target.row, rotation: 0, customDoorAnchors: [] };
  mission.tiles.push(tile); selected = { kind: 'tile', id: tile.instanceId }; targetedCell = null; render();
}
function moveTile(instanceId, column, row) {
  const moving = placedTile(instanceId); if (!moving) return;
  const occupant = mission.tiles.find(tile => tile.column === column && tile.row === row && tile !== moving);
  if (occupant) { const old = { column: moving.column, row: moving.row }; moving.column = column; moving.row = row; occupant.column = old.column; occupant.row = old.row; }
  else { moving.column = column; moving.row = row; }
  render();
}
function removeTile(instanceId) {
  mission.tiles = mission.tiles.filter(tile => tile.instanceId !== instanceId);
  mission.markers = mission.markers.filter(marker => marker.tile !== instanceId);
  if (selected?.id === instanceId) selected = null;
}
function firstOpenMarkerPosition(tile, candidates) {
  const existing = mission.markers.filter(marker => marker.tile === tile.instanceId);
  return candidates.find(candidate => existing.every(marker => Math.hypot(marker.x - candidate.x, marker.y - candidate.y) >= .13))
    || candidates[existing.length % candidates.length];
}
function edgeMarkerPosition(tile, type) {
  const centers = [1 / 6, .5, 5 / 6]; const inset = 1 / 6;
  const candidates = [];
  if (type !== 'invasion' || tile.row === 0) centers.forEach(x => candidates.push({ x, y: inset }));
  if (type !== 'invasion' || tile.column === mission.grid.columns - 1) centers.forEach(y => candidates.push({ x: 1 - inset, y }));
  if (type !== 'invasion' || tile.row === mission.grid.rows - 1) [...centers].reverse().forEach(x => candidates.push({ x, y: 1 - inset }));
  if (type !== 'invasion' || tile.column === 0) [...centers].reverse().forEach(y => candidates.push({ x: inset, y }));
  return firstOpenMarkerPosition(tile, candidates.length ? candidates : [{ x: .167, y: inset }]);
}
function centralMarkerPosition(tile) {
  return firstOpenMarkerPosition(tile, gridCellAnchors().map(({ x, y }) => ({ x, y })));
}
function addMarker(type) {
  let tile = selected?.kind === 'tile' ? item() : mission.tiles[0]; if (!tile) return toast('Placez d’abord une tuile sur la grille.', true);
  if (type === 'invasion' && tile.column > 0 && tile.column < mission.grid.columns - 1 && tile.row > 0 && tile.row < mission.grid.rows - 1) {
    tile = mission.tiles.find(entry => entry.column === 0 || entry.column === mission.grid.columns - 1 || entry.row === 0 || entry.row === mission.grid.rows - 1) || tile;
  }
  const meta = markerType(type); const sameType = mission.markers.filter(marker => marker.type === type).length;
  const defaultPosition = EDGE_DEFAULT_MARKERS.has(type) ? edgeMarkerPosition(tile, type) : centralMarkerPosition(tile);
  let marker = { id: uid(type), type, tile: tile.instanceId, ...defaultPosition, label: ['objective', 'invasion'].includes(type) ? String(sameType + 1) : meta.label };
  if (type === 'door') {
    const anchor = tileAnchors(tile).find(entry => !doorMarkerAtConnection(tile, entry));
    if (anchor) marker = { ...marker, x: anchor.x, y: anchor.y, anchor: anchor.id };
  } else if (CATALOG_PREFERRED_MARKERS.has(type)) {
    const anchor = markerAnchors(tile, type).find(entry => !markerAtAnchor(tile, type, entry));
    if (anchor) marker = { ...marker, x: anchor.x, y: anchor.y, anchor: anchor.id };
  } else if (EDGE_ANCHOR_MARKERS.has(type)) {
    const anchor = nearestMarkerAnchor(tile, type, defaultPosition.x, defaultPosition.y);
    if (anchor && !markerAtAnchor(tile, type, anchor)) marker = { ...marker, x: anchor.x, y: anchor.y, anchor: anchor.id };
  } else if (CELL_CENTER_MARKERS.has(type)) {
    const anchor = nearestMarkerAnchor(tile, type, defaultPosition.x, defaultPosition.y);
    if (anchor && !markerAtAnchor(tile, type, anchor)) marker = { ...marker, x: anchor.x, y: anchor.y, anchor: anchor.id };
  }
  mission.markers.push(marker); selected = { kind: 'marker', id: marker.id }; render();
}
function rotateTile(amount) { const tile = selected?.kind === 'tile' ? item() : null; if (!tile) return; tile.rotation = (tile.rotation + amount + 360) % 360; syncAnchoredMarkers(tile); render(); }
function nearestAnchor(tile, x, y, maxDistance = Infinity) {
  return tileAnchors(tile).map(anchor => ({ anchor, distance: Math.hypot(anchor.x - x, anchor.y - y) })).sort((a, b) => a.distance - b.distance).find(entry => entry.distance <= maxDistance)?.anchor;
}
function nearestMarkerAnchor(tile, type, x, y, maxDistance = Infinity) {
  return markerAnchors(tile, type).map(anchor => ({ anchor, distance: Math.hypot(anchor.x - x, anchor.y - y) })).sort((a, b) => a.distance - b.distance).find(entry => entry.distance <= maxDistance)?.anchor;
}
function setMarkerPosition(marker, clientX, clientY) {
  const rect = document.querySelector('#board').getBoundingClientRect();
  const boardX = (clientX - rect.left) * (mission.grid.columns * TILE_SIZE) / rect.width;
  const boardY = (clientY - rect.top) * (mission.grid.rows * TILE_SIZE) / rect.height;
  const column = clamp(Math.floor(boardX / TILE_SIZE), 0, mission.grid.columns - 1); const row = clamp(Math.floor(boardY / TILE_SIZE), 0, mission.grid.rows - 1);
  const tile = mission.tiles.find(entry => entry.column === column && entry.row === row); if (!tile) return;
  let x = clamp(boardX / TILE_SIZE - column, 0, 1); let y = clamp(boardY / TILE_SIZE - row, 0, 1);
  if (marker.type === 'door') {
    const anchor = nearestAnchor(tile, x, y, .12);
    if (anchor && !doorMarkerAtConnection(tile, anchor, marker.id)) {
      x = anchor.x; y = anchor.y; marker.anchor = anchor.id;
    } else marker.anchor = undefined;
  }
  else if (CATALOG_PREFERRED_MARKERS.has(marker.type) || EDGE_ANCHOR_MARKERS.has(marker.type) || CELL_CENTER_MARKERS.has(marker.type)) {
    const anchor = nearestMarkerAnchor(tile, marker.type, x, y, .12);
    if (anchor && !markerAtAnchor(tile, marker.type, anchor, marker.id)) {
      x = anchor.x; y = anchor.y; marker.anchor = anchor.id;
    } else marker.anchor = undefined;
  } else marker.anchor = undefined;
  marker.tile = tile.instanceId;
  marker.x = x; marker.y = y;
}

function normalizeMission(data) {
  if (!data || !Array.isArray(data.tiles) || !Array.isArray(data.markers) || !data.grid) throw new Error('Structure de mission invalide');
  const normalized = {
    format: 'zombicide-map', version: 1, name: data.name || data.title || 'Mission importée',
    grid: { columns: clamp(Number(data.grid.columns) || 3, 1, 4), rows: clamp(Number(data.grid.rows) || 2, 1, 4) },
    tiles: data.tiles.map((tile, index) => ({ instanceId: tile.instanceId || tile.instance || `tile-import-${index}`, catalogId: tile.catalogId || String(tile.id || '').toLowerCase(), code: tile.code, face: tile.face, column: Number(tile.column) || 0, row: Number(tile.row) || 0, rotation: Number(tile.rotation) || 0, customDoorAnchors: tile.customDoorAnchors || [] })),
    markers: data.markers.map((marker, index) => ({ id: marker.id || `marker-import-${index}`, type: marker.type, tile: marker.tile, x: clamp(Number(marker.x) || 0, 0, 1), y: clamp(Number(marker.y) || 0, 0, 1), label: marker.label || markerType(marker.type)?.label || '?', anchor: marker.anchor })),
    render: { showTileNames: data.render?.showTileNames !== false, showLegend: data.render?.showLegend !== false, background: data.render?.background || '#24282d' }
  };
  const duplicate = duplicatePhysicalTiles(normalized.tiles)[0];
  if (duplicate) {
    const codes = duplicate.map(tile => catalogTile(tile.catalogId)?.code || tile.code || tile.catalogId);
    throw new Error(`Mission invalide : ${codes.join(' et ')} représentent la même tuile.`);
  }
  return normalized;
}
function download(name, content, type) {
  const link = document.createElement('a'); const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type })); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const imageDataCache = new Map();
function imageAsDataUrl(source) {
  if (!source || source.startsWith('data:')) return Promise.resolve(source);
  if (imageDataCache.has(source)) return Promise.resolve(imageDataCache.get(source));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d').drawImage(image, 0, 0); const data = canvas.toDataURL('image/webp', .92); imageDataCache.set(source, data); resolve(data); };
    image.onerror = () => reject(new Error(`Image introuvable : ${source}`));
    image.src = source;
  });
}
async function embedTileImages(svg) {
  const sources = [...new Set(mission.tiles.map(tile => catalogTile(tile.catalogId)?.image).filter(Boolean))];
  for (const source of sources) svg = svg.split(xml(source)).join(await imageAsDataUrl(source));
  return svg;
}
function safeName(name) { return (name || 'mission').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }
function missionSvg() {
  const width = mission.grid.columns * TILE_SIZE; const boardHeight = mission.grid.rows * TILE_SIZE; const legendWidth = mission.render.showLegend && mission.markers.length ? 190 : 0; const height = boardHeight + 54;
  const tiles = mission.tiles.map(tile => { const data = catalogTile(tile.catalogId) || { code: tile.code || '?', name: 'Tuile inconnue' }; const x = tile.column * TILE_SIZE; const y = tile.row * TILE_SIZE; const art = data.image ? `<image href="${xml(data.image)}" width="${TILE_SIZE}" height="${TILE_SIZE}" preserveAspectRatio="none"/>` : `<rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="#756e59"/><path d="M0 0H240V48H0zM0 120H240V174H0z" fill="#b8aa84" opacity=".72"/><path d="M0 48H240V120H0zM0 174H240V240H0z" fill="#303733" opacity=".9"/><path d="M0 0L240 240M240 0L0 240" stroke="#000" opacity=".12" stroke-width="3"/>`;
    return `<g transform="translate(${x} ${y})"><g transform="rotate(${tile.rotation} 120 120)">${art}<rect width="240" height="240" fill="none" stroke="#111" stroke-width="5"/></g>${mission.render.showTileNames ? `<rect x="8" y="8" width="42" height="25" rx="3" fill="#111" stroke="#fff"/><text x="29" y="26" text-anchor="middle" fill="#fff" font-size="13" font-weight="bold">${xml(data.code)}</text>` : ''}</g>`;
  }).join('');
  const colors = { start: '#2d6eb6', objective: '#bd343b', invasion: '#a62d32', exit: '#318053', door: '#666c72', spawn: '#7f3f98', npc: '#7f3f98', vault: '#a77b27', noise: '#217d86', gate: '#a77b27', rubble: '#b87416', guard: '#24798a', statue: '#727981', chi: '#55a6b4' };
  const displayPoints = markerDisplayPoints();
  const markers = mission.markers.map(marker => { const point = displayPoints.get(marker.id) || markerBoardPoint(marker); if (!point) return ''; const x = point.x * TILE_SIZE; const y = point.y * TILE_SIZE; const square = ['door', 'invasion', 'exit', 'gate'].includes(marker.type); const size = marker.type === 'door' ? 27 : 35; const rotation = marker.type === 'door' ? ` transform="rotate(45 ${x} ${y})"` : ''; const textRotation = marker.type === 'door' ? ` transform="rotate(-45 ${x} ${y})"` : ''; return `<g${rotation}><rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" rx="${square ? 3 : size / 2}" fill="${colors[marker.type] || '#555'}" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold"${textRotation}>${xml(marker.label)}</text></g>`; }).join('');
  const counts = mission.markers.reduce((out, marker) => { out[marker.type] = (out[marker.type] || 0) + 1; return out; }, {}); const legend = legendWidth ? `<g transform="translate(${width + 18} 26)"><text fill="#d0a44a" font-size="10" font-weight="bold" letter-spacing="2">LÉGENDE</text>${Object.entries(counts).map(([type, count], index) => { const symbol = mission.markers.find(marker => marker.type === type)?.label || markerType(type)?.label || '?'; const centerY = 30 + index * 28; return `<circle cx="10" cy="${centerY}" r="9" fill="${colors[type] || '#555'}" stroke="#fff"/><text x="10" y="${centerY + 3}" text-anchor="middle" fill="#fff" font-size="8" font-weight="bold">${xml(symbol)}</text><text x="28" y="${centerY + 4}" fill="#eee" font-size="11">${xml(markerType(type)?.name || type)} × ${count}</text>`; }).join('')}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + legendWidth}" height="${height}" viewBox="0 0 ${width + legendWidth} ${height}"><rect width="100%" height="100%" fill="#15181c"/><text x="14" y="35" fill="#f0c765" font-family="Georgia,serif" font-size="20" font-weight="bold">${xml(mission.name)}</text><g transform="translate(0 54)">${tiles}${markers}</g>${legend}</svg>`;
}

document.querySelector('#tile-search').addEventListener('input', renderLibrary);
document.querySelector('#show-unavailable').addEventListener('change', renderLibrary);
document.querySelector('#tile-library').addEventListener('dragstart', event => { const card = event.target.closest('[data-catalog-id]'); if (card && !card.classList.contains('unavailable')) event.dataTransfer.setData('catalogId', card.dataset.catalogId); });
document.querySelector('#tile-library').addEventListener('click', event => { const card = event.target.closest('[data-catalog-id]'); if (card && !event.target.closest('select')) addTile(card.dataset.catalogId); });
document.querySelector('#tile-library').addEventListener('change', event => {
  const id = event.target.dataset.exception; if (!id) return;
  profile().tileWhitelist = profile().tileWhitelist.filter(value => value !== id); profile().tileBlacklist = profile().tileBlacklist.filter(value => value !== id);
  if (event.target.value === 'whitelist') profile().tileWhitelist.push(id); if (event.target.value === 'blacklist') profile().tileBlacklist.push(id); render();
});
document.querySelector('#marker-library').addEventListener('click', event => { const button = event.target.closest('[data-marker-type]'); if (button) addMarker(button.dataset.markerType); });
document.querySelector('#product-list').addEventListener('change', event => { const id = event.target.dataset.product; if (!id) return; profile().ownedProducts = [...document.querySelectorAll('[data-product]:checked')].map(input => input.dataset.product); render(); });
document.querySelector('#profile-select').addEventListener('change', event => { activeProfile = Number(event.target.value); render(); });
document.querySelector('#new-profile').addEventListener('click', () => { const name = prompt('Nom du nouveau profil :', `Collection ${profiles.length + 1}`)?.trim(); if (!name) return; profiles.push(newCollection(name)); activeProfile = profiles.length - 1; render(); });
document.querySelector('#delete-profile').addEventListener('click', () => { if (profiles.length === 1) return toast('Il faut conserver au moins un profil.', true); if (!confirm(`Supprimer « ${profile().name} » ?`)) return; profiles.splice(activeProfile, 1); activeProfile = Math.max(0, activeProfile - 1); render(); });
document.querySelector('#reset-exceptions').addEventListener('click', () => { profile().tileWhitelist = []; profile().tileBlacklist = []; render(); toast('Exceptions réinitialisées.'); });
document.querySelector('#export-collection').addEventListener('click', () => download(`${safeName(profile().name)}.collection.json`, JSON.stringify(profile(), null, 2), 'application/json'));
document.querySelector('#import-collection').addEventListener('change', async event => { try { const data = JSON.parse(await event.target.files[0].text()); if (data.format !== 'zombicide-collection') throw new Error(); profiles.push({ ...newCollection(data.name || 'Collection importée'), ...data }); activeProfile = profiles.length - 1; render(); toast('Collection importée.'); } catch { toast('Fichier de collection invalide.', true); } event.target.value = ''; });
document.querySelector('#import-tile-images').addEventListener('change', async event => {
  for (const file of event.target.files) { const image = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); }); const base = file.name.replace(/\.[^.]+$/, ''); const code = base.match(/\d+[rv]/i)?.[0]?.toUpperCase() || `C${customCatalog.length + 1}`; const tile = { id: `custom-${uid('tile')}`, code, face: /v$/i.test(code) ? 'V' : 'R', name: base, product: 'custom', image, doorAnchors: [] }; customCatalog.push(tile); catalog.push(tile); profile().tileWhitelist.push(tile.id); }
  storage.set('zombicide-custom-catalog', customCatalog); event.target.value = ''; render(); toast('Visuel(s) ajouté(s) au catalogue local.');
});

const board = document.querySelector('#board');
board.addEventListener('dragstart', event => { const tile = event.target.closest('[data-tile-instance]'); if (tile) event.dataTransfer.setData('tileInstance', tile.dataset.tileInstance); });
board.addEventListener('dragover', event => { const cell = event.target.closest('.grid-cell'); if (cell) { event.preventDefault(); cell.classList.add('dragover'); } });
board.addEventListener('dragleave', event => event.target.closest('.grid-cell')?.classList.remove('dragover'));
board.addEventListener('drop', event => { const cell = event.target.closest('.grid-cell'); if (!cell) return; event.preventDefault(); document.querySelectorAll('.grid-cell').forEach(node => node.classList.remove('dragover')); const column = Number(cell.dataset.column); const row = Number(cell.dataset.row); const instance = event.dataTransfer.getData('tileInstance'); const catalogId = event.dataTransfer.getData('catalogId'); if (instance) moveTile(instance, column, row); else if (catalogId) addTile(catalogId, column, row); });
board.addEventListener('click', event => {
  const marker = event.target.closest('[data-marker-id]'); if (marker) { targetedCell = null; selected = { kind: 'marker', id: marker.dataset.markerId }; return render(); }
  const tileNode = event.target.closest('[data-tile-instance]'); if (tileNode) { const tile = placedTile(tileNode.dataset.tileInstance); targetedCell = null; selected = { kind: 'tile', id: tile.instanceId }; return render(); }
  const cell = event.target.closest('.grid-cell');
  if (cell) {
    const target = { column: Number(cell.dataset.column), row: Number(cell.dataset.row) };
    const sameCell = targetedCell?.column === target.column && targetedCell?.row === target.row;
    targetedCell = sameCell ? null : target;
    selected = null;
    return render();
  }
  selected = null; render();
});
board.addEventListener('pointerdown', event => { const node = event.target.closest('[data-marker-id]'); if (!node) return; event.preventDefault(); const marker = mission.markers.find(entry => entry.id === node.dataset.markerId); selected = { kind: 'marker', id: marker.id }; markerDrag = { marker, pointerId: event.pointerId }; node.setPointerCapture(event.pointerId); });
board.addEventListener('pointermove', event => { if (!markerDrag) return; setMarkerPosition(markerDrag.marker, event.clientX, event.clientY); renderBoard(); });
board.addEventListener('pointerup', () => { if (markerDrag) { markerDrag = null; render(); } });

document.querySelector('#mission-name').addEventListener('input', event => { mission.name = event.target.value; saveAll(); });
['columns', 'rows'].forEach(axis => document.querySelector(`#grid-${axis}`).addEventListener('change', event => { const value = Number(event.target.value); const outside = mission.tiles.filter(tile => axis === 'columns' ? tile.column >= value : tile.row >= value); if (outside.length && !confirm(`${outside.length} tuile(s) hors de la nouvelle grille seront supprimées. Continuer ?`)) return render(); outside.forEach(tile => removeTile(tile.instanceId)); mission.grid[axis] = value; if (targetedCell && (targetedCell.column >= mission.grid.columns || targetedCell.row >= mission.grid.rows)) targetedCell = null; render(); }));
document.querySelector('#zoom-out').addEventListener('click', () => { zoom = clamp(zoom - .1, .45, 1.25); render(); });
document.querySelector('#zoom-in').addEventListener('click', () => { zoom = clamp(zoom + .1, .45, 1.25); render(); });
document.querySelector('#tile-rotation').addEventListener('change', event => { const tile = item(); if (tile) { tile.rotation = Number(event.target.value); syncAnchoredMarkers(tile); render(); } });
document.querySelector('#rotate-left').addEventListener('click', () => rotateTile(-90)); document.querySelector('#rotate-right').addEventListener('click', () => rotateTile(90));
document.querySelector('#delete-selected').addEventListener('click', () => { if (selected?.kind === 'tile') removeTile(selected.id); render(); });
document.querySelector('#delete-marker').addEventListener('click', () => { if (selected?.kind === 'marker') mission.markers = mission.markers.filter(marker => marker.id !== selected.id); selected = null; render(); });
document.querySelector('#replace-tile').addEventListener('click', () => { const tile = item(); if (!tile) return; const usedKeys = new Set(mission.tiles.filter(entry => entry !== tile).map(physicalTileKey)); const replacement = catalog.find(candidate => availability(candidate).available && candidate.id !== tile.catalogId && !usedKeys.has(physicalTileKey(candidate))); if (!replacement) return toast('Aucune tuile de remplacement disponible.', true); tile.catalogId = replacement.id; tile.code = replacement.code; tile.face = replacement.face; toast(`Remplacée par ${replacement.code}.`); render(); });
document.querySelector('#marker-label').addEventListener('input', event => { const marker = item(); if (marker) { marker.label = event.target.value; renderBoard(); renderLegend(); saveAll(); } });
['x', 'y'].forEach(axis => document.querySelector(`#marker-${axis}`).addEventListener('change', event => { const marker = item(); if (marker) { marker[axis] = clamp(Number(event.target.value) / 100, 0, 1); marker.anchor = undefined; render(); } }));
document.querySelector('#marker-anchor').addEventListener('change', event => {
  const marker = item(); const tile = marker && placedTile(marker.tile);
  if (!marker || !tile) return;
  if (!event.target.value && (marker.type === 'door' || CATALOG_PREFERRED_MARKERS.has(marker.type) || EDGE_ANCHOR_MARKERS.has(marker.type) || CELL_CENTER_MARKERS.has(marker.type))) {
    marker.anchor = undefined;
    return render();
  }
  if (marker.type !== 'door' && event.target.value.startsWith('mode:')) {
    const source = event.target.value.slice(5);
    const anchor = markerAnchors(tile, marker.type)
      .filter(entry => entry.source === source)
      .map(entry => ({ entry, distance: Math.hypot(entry.x - marker.x, entry.y - marker.y) }))
      .sort((first, second) => first.distance - second.distance)
      .find(candidate => !markerAtAnchor(tile, marker.type, candidate.entry, marker.id))?.entry;
    if (!anchor) {
      renderInspector();
      return toast('Aucun emplacement disponible pour ce mode de placement.', true);
    }
    marker.anchor = anchor.id; marker.x = anchor.x; marker.y = anchor.y;
    return render();
  }
  const anchor = markerAnchors(tile, marker.type).find(entry => entry.id === event.target.value);
  if (!anchor) return;
  const occupied = marker.type === 'door'
    ? doorMarkerAtConnection(tile, anchor, marker.id)
    : markerAtAnchor(tile, marker.type, anchor, marker.id);
  if (occupied) {
    renderInspector();
    return toast('Cet emplacement est déjà utilisé par un marqueur du même type.', true);
  }
  marker.anchor = anchor.id; marker.x = anchor.x; marker.y = anchor.y; render();
});
document.querySelector('#show-tile-names').addEventListener('change', event => { mission.render.showTileNames = event.target.checked; render(); });
document.querySelector('#show-legend').addEventListener('change', event => { mission.render.showLegend = event.target.checked; render(); });
document.addEventListener('keydown', event => { if (/input|select|textarea/i.test(event.target.tagName)) return; const current = item(); if (!current) return; if (event.key.toLowerCase() === 'r' && selected.kind === 'tile') return rotateTile(90); if (['Delete', 'Backspace'].includes(event.key)) return selected.kind === 'tile' ? document.querySelector('#delete-selected').click() : document.querySelector('#delete-marker').click(); if (selected.kind === 'marker' && event.key.startsWith('Arrow')) { event.preventDefault(); current.x = clamp(current.x + (event.key === 'ArrowLeft' ? -.01 : event.key === 'ArrowRight' ? .01 : 0), 0, 1); current.y = clamp(current.y + (event.key === 'ArrowUp' ? -.01 : event.key === 'ArrowDown' ? .01 : 0), 0, 1); current.anchor = undefined; render(); } });

document.querySelector('#new-map').addEventListener('click', () => { if (mission.tiles.length && !confirm('Créer une nouvelle mission ? La sauvegarde locale actuelle sera remplacée.')) return; mission = newMission(); selected = null; targetedCell = null; render(); });
document.querySelector('#export-json').addEventListener('click', () => { const clean = JSON.parse(JSON.stringify(mission)); download(`${safeName(mission.name)}.json`, JSON.stringify(clean, null, 2), 'application/json'); toast('Mission JSON exportée.'); });
document.querySelector('#import-mission').addEventListener('change', async event => { try { mission = normalizeMission(JSON.parse(await event.target.files[0].text())); selected = null; targetedCell = null; render(); toast('Mission chargée.'); } catch (error) { toast(error.message || 'Mission invalide.', true); } event.target.value = ''; });
document.querySelector('#export-image').addEventListener('click', async () => { try { const svg = await embedTileImages(missionSvg()); const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = image.width * 2; canvas.height = image.height * 2; const context = canvas.getContext('2d'); context.scale(2, 2); context.drawImage(image, 0, 0); canvas.toBlob(blob => { download(`${safeName(mission.name)}.png`, blob, 'image/png'); toast('Plan PNG exporté.'); }, 'image/png'); URL.revokeObjectURL(image.src); }; image.onerror = () => toast('Impossible de générer le PNG.', true); image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); } catch (error) { toast(error.message || 'Impossible de préparer les images.', true); } });

async function initialize() {
  try {
    const response = await fetch('config/default-catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.format !== 'zombicide-catalog' || !Array.isArray(data.tiles)) throw new Error();
    defaultCatalogOverrides = Object.fromEntries(data.tiles.map(tile => [tile.id, {
      slots: Array.isArray(tile.slots) ? tile.slots : [],
      doorAnchors: Array.isArray(tile.doorAnchors) ? tile.doorAnchors : (tile.slots || []).filter(slot => slot.type === 'door')
    }]));
  } catch {
    console.warn('Configuration par défaut indisponible. Lancez le projet avec npm run dev.');
  }
  render();
}

initialize();
