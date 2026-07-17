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
  { type: 'vault', name: 'Coffre / objectif', label: 'C' }, { type: 'noise', name: 'Bruit', label: '!' }
];

const TILE_SIZE = 240;
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

const customCatalog = storage.get('zombicide-custom-catalog', []);
const catalog = [...BASE_CATALOG, ...customCatalog];
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
function tileAnchors(tile) {
  const base = catalogOverrides[tile.catalogId]?.doorAnchors ?? catalogTile(tile.catalogId)?.doorAnchors ?? [];
  return [...base, ...(tile.customDoorAnchors || [])].map(anchor => ({ ...anchor, ...rotateNormalizedPoint(anchor.x, anchor.y, tile.rotation || 0) }));
}
function catalogTileAnchors(tileId) { return catalogOverrides[tileId]?.doorAnchors ?? catalogTile(tileId)?.doorAnchors ?? []; }
function rotateNormalizedPoint(x, y, rotation) {
  if (rotation === 90) return { x: 1 - y, y: x };
  if (rotation === 180) return { x: 1 - x, y: 1 - y };
  if (rotation === 270) return { x: y, y: 1 - x };
  return { x, y };
}
function syncAnchoredMarkers(tile) {
  const anchors = tileAnchors(tile);
  mission.markers.forEach(marker => { if (marker.tile !== tile.instanceId || !marker.anchor) return; const anchor = anchors.find(entry => entry.id === marker.anchor); if (anchor) { marker.x = anchor.x; marker.y = anchor.y; } });
}
function reconcileMarkerAnchors(catalogId) {
  const validIds = new Set(catalogTileAnchors(catalogId).map(anchor => anchor.id));
  const instances = mission.tiles.filter(tile => tile.catalogId === catalogId);
  const instanceIds = new Set(instances.map(tile => tile.instanceId));
  mission.markers.forEach(marker => { if (instanceIds.has(marker.tile) && marker.anchor && !validIds.has(marker.anchor)) marker.anchor = undefined; });
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
    const node = document.createElement('div');
    node.className = `marker-node marker-${marker.type} type-${marker.type} ${selected?.kind === 'marker' && selected.id === marker.id ? 'selected' : ''}`;
    node.dataset.markerId = marker.id; node.style.left = `${(tile.column + marker.x) * TILE_SIZE}px`; node.style.top = `${(tile.row + marker.y) * TILE_SIZE}px`;
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
    document.querySelector('#marker-x').disabled = current.type === 'door';
    document.querySelector('#marker-y').disabled = current.type === 'door';
    const anchorField = document.querySelector('#anchor-field'); anchorField.hidden = current.type !== 'door';
    if (current.type === 'door') {
      const tile = placedTile(current.tile); const anchors = tile ? tileAnchors(tile) : [];
      document.querySelector('#marker-anchor').innerHTML = anchors.length ? anchors.map(anchor => `<option value="${anchor.id}" ${current.anchor === anchor.id ? 'selected' : ''}>${esc(anchor.id)}</option>`).join('') : '<option value="">Aucun slot configuré</option>';
    }
  }
}
function renderLegend() {
  const counts = mission.markers.reduce((result, marker) => { result[marker.type] = (result[marker.type] || 0) + 1; return result; }, {});
  document.querySelector('#legend').innerHTML = Object.entries(counts).map(([type, count]) => { const meta = markerType(type); return `<div class="legend-row">${markerHtml(type, meta?.label || '?')}<span>${esc(meta?.name || type)}</span><span>× ${count}</span></div>`; }).join('') || '<span class="legend-empty">La légende apparaîtra avec vos marqueurs.</span>';
}
function renderWarnings() {
  const issues = mission.tiles.filter(tile => !availability(tile.catalogId).available);
  const bar = document.querySelector('#warning-bar'); bar.hidden = issues.length === 0;
  if (issues.length) bar.innerHTML = `⚠ <strong>${issues.length} tuile${issues.length > 1 ? 's' : ''} indisponible${issues.length > 1 ? 's' : ''}</strong> dans « ${esc(profile().name)} » : ${issues.map(tile => esc(catalogTile(tile.catalogId)?.code || tile.catalogId)).join(', ')}. L’export reste autorisé.`;
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
function addMarker(type) {
  const tile = selected?.kind === 'tile' ? item() : mission.tiles[0]; if (!tile) return toast('Placez d’abord une tuile sur la grille.', true);
  const meta = markerType(type); const sameType = mission.markers.filter(marker => marker.type === type).length;
  if (type === 'door' && !tileAnchors(tile).length) return toast(`Aucun slot de porte configuré pour ${catalogTile(tile.catalogId)?.code || 'cette tuile'}.`, true);
  let marker = { id: uid(type), type, tile: tile.instanceId, x: .5, y: .5, label: ['objective', 'invasion'].includes(type) ? String(sameType + 1) : meta.label };
  if (type === 'door') { const anchor = tileAnchors(tile)[0]; if (anchor) marker = { ...marker, x: anchor.x, y: anchor.y, anchor: anchor.id }; }
  mission.markers.push(marker); selected = { kind: 'marker', id: marker.id }; render();
}
function rotateTile(amount) { const tile = selected?.kind === 'tile' ? item() : null; if (!tile) return; tile.rotation = (tile.rotation + amount + 360) % 360; syncAnchoredMarkers(tile); render(); }
function nearestAnchor(tile, x, y, maxDistance = Infinity) {
  return tileAnchors(tile).map(anchor => ({ anchor, distance: Math.hypot(anchor.x - x, anchor.y - y) })).sort((a, b) => a.distance - b.distance).find(entry => entry.distance <= maxDistance)?.anchor;
}
function setMarkerPosition(marker, clientX, clientY) {
  const rect = document.querySelector('#board').getBoundingClientRect();
  const boardX = (clientX - rect.left) * (mission.grid.columns * TILE_SIZE) / rect.width;
  const boardY = (clientY - rect.top) * (mission.grid.rows * TILE_SIZE) / rect.height;
  const column = clamp(Math.floor(boardX / TILE_SIZE), 0, mission.grid.columns - 1); const row = clamp(Math.floor(boardY / TILE_SIZE), 0, mission.grid.rows - 1);
  const tile = mission.tiles.find(entry => entry.column === column && entry.row === row); if (!tile) return;
  let x = clamp(boardX / TILE_SIZE - column, 0, 1); let y = clamp(boardY / TILE_SIZE - row, 0, 1);
  if (marker.type === 'door') { const anchor = nearestAnchor(tile, x, y); if (!anchor) return; x = anchor.x; y = anchor.y; marker.anchor = anchor.id; }
  else marker.anchor = undefined;
  marker.tile = tile.instanceId;
  marker.x = x; marker.y = y;
}

function normalizeMission(data) {
  if (!data || !Array.isArray(data.tiles) || !Array.isArray(data.markers) || !data.grid) throw new Error('Structure de mission invalide');
  return {
    format: 'zombicide-map', version: 1, name: data.name || data.title || 'Mission importée',
    grid: { columns: clamp(Number(data.grid.columns) || 3, 1, 4), rows: clamp(Number(data.grid.rows) || 2, 1, 4) },
    tiles: data.tiles.map((tile, index) => ({ instanceId: tile.instanceId || tile.instance || `tile-import-${index}`, catalogId: tile.catalogId || String(tile.id || '').toLowerCase(), code: tile.code, face: tile.face, column: Number(tile.column) || 0, row: Number(tile.row) || 0, rotation: Number(tile.rotation) || 0, customDoorAnchors: tile.customDoorAnchors || [] })),
    markers: data.markers.map((marker, index) => ({ id: marker.id || `marker-import-${index}`, type: marker.type, tile: marker.tile, x: clamp(Number(marker.x) || 0, 0, 1), y: clamp(Number(marker.y) || 0, 0, 1), label: marker.label || markerType(marker.type)?.label || '?', anchor: marker.anchor })),
    render: { showTileNames: data.render?.showTileNames !== false, showLegend: data.render?.showLegend !== false, background: data.render?.background || '#24282d' }
  };
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
  const tiles = mission.tiles.map(tile => { const data = catalogTile(tile.catalogId) || { code: tile.code || '?', name: 'Tuile inconnue' }; const x = tile.column * TILE_SIZE; const y = tile.row * TILE_SIZE; const art = data.image ? `<image href="${xml(data.image)}" width="${TILE_SIZE}" height="${TILE_SIZE}" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="#756e59"/><path d="M0 0H240V48H0zM0 120H240V174H0z" fill="#b8aa84" opacity=".72"/><path d="M0 48H240V120H0zM0 174H240V240H0z" fill="#303733" opacity=".9"/><path d="M0 0L240 240M240 0L0 240" stroke="#000" opacity=".12" stroke-width="3"/>`;
    return `<g transform="translate(${x} ${y})"><g transform="rotate(${tile.rotation} 120 120)">${art}<rect width="240" height="240" fill="none" stroke="#111" stroke-width="5"/></g>${mission.render.showTileNames ? `<rect x="8" y="8" width="42" height="25" rx="3" fill="#111" stroke="#fff"/><text x="29" y="26" text-anchor="middle" fill="#fff" font-size="13" font-weight="bold">${xml(data.code)}</text>` : ''}</g>`;
  }).join('');
  const colors = { start: '#2d6eb6', objective: '#bd343b', invasion: '#a62d32', exit: '#318053', door: '#666c72', spawn: '#7f3f98', vault: '#a77b27', noise: '#217d86' };
  const markers = mission.markers.map(marker => { const tile = placedTile(marker.tile); if (!tile) return ''; const x = (tile.column + marker.x) * TILE_SIZE; const y = (tile.row + marker.y) * TILE_SIZE; const square = ['door', 'invasion', 'exit'].includes(marker.type); const size = marker.type === 'door' ? 27 : 35; const rotation = marker.type === 'door' ? ` transform="rotate(45 ${x} ${y})"` : ''; const textRotation = marker.type === 'door' ? ` transform="rotate(-45 ${x} ${y})"` : ''; return `<g${rotation}><rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" rx="${square ? 3 : size / 2}" fill="${colors[marker.type] || '#555'}" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold"${textRotation}>${xml(marker.label)}</text></g>`; }).join('');
  const counts = mission.markers.reduce((out, marker) => { out[marker.type] = (out[marker.type] || 0) + 1; return out; }, {}); const legend = legendWidth ? `<g transform="translate(${width + 18} 26)"><text fill="#d0a44a" font-size="10" font-weight="bold" letter-spacing="2">LÉGENDE</text>${Object.entries(counts).map(([type, count], index) => `<circle cx="10" cy="${30 + index * 28}" r="9" fill="${colors[type] || '#555'}" stroke="#fff"/><text x="28" y="${34 + index * 28}" fill="#eee" font-size="11">${xml(markerType(type)?.name || type)} × ${count}</text>`).join('')}</g>` : '';
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
document.querySelector('#replace-tile').addEventListener('click', () => { const tile = item(); if (!tile) return; const replacement = catalog.find(candidate => availability(candidate).available && candidate.id !== tile.catalogId); if (!replacement) return toast('Aucune tuile de remplacement disponible.', true); tile.catalogId = replacement.id; tile.code = replacement.code; tile.face = replacement.face; toast(`Remplacée par ${replacement.code}.`); render(); });
document.querySelector('#marker-label').addEventListener('input', event => { const marker = item(); if (marker) { marker.label = event.target.value; renderBoard(); renderLegend(); saveAll(); } });
['x', 'y'].forEach(axis => document.querySelector(`#marker-${axis}`).addEventListener('change', event => { const marker = item(); if (marker && marker.type !== 'door') { marker[axis] = clamp(Number(event.target.value) / 100, 0, 1); marker.anchor = undefined; render(); } }));
document.querySelector('#marker-anchor').addEventListener('change', event => { const marker = item(); const tile = marker && placedTile(marker.tile); const anchor = tile && tileAnchors(tile).find(entry => entry.id === event.target.value); if (marker) { marker.anchor = anchor?.id; if (anchor) { marker.x = anchor.x; marker.y = anchor.y; } render(); } });
document.querySelector('#show-tile-names').addEventListener('change', event => { mission.render.showTileNames = event.target.checked; render(); });
document.querySelector('#show-legend').addEventListener('change', event => { mission.render.showLegend = event.target.checked; render(); });
document.addEventListener('keydown', event => { if (/input|select|textarea/i.test(event.target.tagName)) return; const current = item(); if (!current) return; if (event.key.toLowerCase() === 'r' && selected.kind === 'tile') return rotateTile(90); if (['Delete', 'Backspace'].includes(event.key)) return selected.kind === 'tile' ? document.querySelector('#delete-selected').click() : document.querySelector('#delete-marker').click(); if (selected.kind === 'marker' && current.type !== 'door' && event.key.startsWith('Arrow')) { event.preventDefault(); current.x = clamp(current.x + (event.key === 'ArrowLeft' ? -.01 : event.key === 'ArrowRight' ? .01 : 0), 0, 1); current.y = clamp(current.y + (event.key === 'ArrowUp' ? -.01 : event.key === 'ArrowDown' ? .01 : 0), 0, 1); current.anchor = undefined; render(); } });

document.querySelector('#new-map').addEventListener('click', () => { if (mission.tiles.length && !confirm('Créer une nouvelle mission ? La sauvegarde locale actuelle sera remplacée.')) return; mission = newMission(); selected = null; targetedCell = null; render(); });
document.querySelector('#export-json').addEventListener('click', () => { const clean = JSON.parse(JSON.stringify(mission)); download(`${safeName(mission.name)}.json`, JSON.stringify(clean, null, 2), 'application/json'); toast('Mission JSON exportée.'); });
document.querySelector('#import-mission').addEventListener('change', async event => { try { mission = normalizeMission(JSON.parse(await event.target.files[0].text())); selected = null; targetedCell = null; render(); toast('Mission chargée.'); } catch (error) { toast(error.message || 'Mission invalide.', true); } event.target.value = ''; });
document.querySelector('#export-image').addEventListener('click', async () => { try { const svg = await embedTileImages(missionSvg()); const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = image.width * 2; canvas.height = image.height * 2; const context = canvas.getContext('2d'); context.scale(2, 2); context.drawImage(image, 0, 0); canvas.toBlob(blob => { download(`${safeName(mission.name)}.png`, blob, 'image/png'); toast('Plan PNG exporté.'); }, 'image/png'); URL.revokeObjectURL(image.src); }; image.onerror = () => toast('Impossible de générer le PNG.', true); image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); } catch (error) { toast(error.message || 'Impossible de préparer les images.', true); } });

render();
