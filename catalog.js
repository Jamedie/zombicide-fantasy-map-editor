const PRODUCTS = [
  ['black-plague', 'Black Plague', 1, 9], ['wulfsburg', 'Wulfsburg', 10, 11],
  ['green-horde', 'Green Horde', 12, 20], ['friends-and-foes', 'Friends and Foes', 21, 25],
  ['white-death', 'White Death', 26, 34], ['eternal-empire', 'Eternal Empire', 35, 38],
  ['tmnt-timecrash', 'TMNT Timecrash', 39, 42]
].map(([id, name, from, to]) => ({ id, name, from, to }));

const SLOT_TYPES = {
  door: { label: 'Porte', symbol: 'D' }, objective: { label: 'Objectif', symbol: 'O' },
  start: { label: 'Départ', symbol: 'S' }, invasion: { label: 'Invasion', symbol: 'I' },
  exit: { label: 'Sortie', symbol: 'E' }, statue: { label: 'Statue', symbol: 'ST' },
  chi: { label: 'Chi', symbol: 'χ' }, vault: { label: 'Coffre', symbol: 'C' },
  spawn: { label: 'Nécromancien', symbol: 'N' }, guard: { label: 'Garde', symbol: 'G' },
  noise: { label: 'Bruit', symbol: '!' }
};

const baseCatalog = PRODUCTS.flatMap(product => Array.from({ length: product.to - product.from + 1 }, (_, offset) => product.from + offset).flatMap(number => ['R', 'V'].map(face => ({
  id: `${number}${face}`.toLowerCase(), code: `${number}${face}`, face, product: product.id,
  image: `assets/tiles/${number}${face}.webp`, source: 'https://zombicide.fandom.com/wiki/Fantasy_Tiles'
}))));
const customCatalog = readStorage('zombicide-custom-catalog', []);
const catalog = [...baseCatalog, ...customCatalog];
let overrides = readStorage('zombicide-catalog-overrides', {});
let selectedTileId = readStorage('zombicide-catalog-editor-tile', catalog[0]?.id || null);
let selectedSlotId = null;
let dragState = null;
let suppressStageClick = false;
let addSlotMode = false;

function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save() { localStorage.setItem('zombicide-catalog-overrides', JSON.stringify(overrides)); localStorage.setItem('zombicide-catalog-editor-tile', JSON.stringify(selectedTileId)); }
function tileById(id) { return catalog.find(tile => tile.id === id); }
function productName(id) { return PRODUCTS.find(product => product.id === id)?.name || 'Tuiles importées'; }
function slots(tileId) {
  const data = overrides[tileId] || {};
  if (Array.isArray(data.slots)) return data.slots;
  return (data.doorAnchors || []).map(anchor => ({ ...anchor, type: 'door', orientation: anchor.orientation || 'horizontal' }));
}
function setSlots(tileId, values) { overrides[tileId] = { ...(overrides[tileId] || {}), slots: values, doorAnchors: values.filter(slot => slot.type === 'door') }; }
function esc(value) { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function assetUrl(source) { try { return new URL(source, document.baseURI).href; } catch { return source || ''; } }
function toast(message, error = false) { const node = document.querySelector('#catalog-toast'); node.textContent = message; node.hidden = false; node.classList.toggle('error', error); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.hidden = true, 2400); }
function slotMeta(type) { return SLOT_TYPES[type] || { label: type, symbol: '?' }; }

function render() {
  if (!tileById(selectedTileId)) selectedTileId = catalog[0]?.id || null;
  renderFilters(); renderTileList(); renderStage(); renderInspector(); syncToolVisibility(); setAddSlotMode(addSlotMode); save();
}
function renderFilters() {
  const filter = document.querySelector('#catalog-product-filter');
  if (!filter.dataset.ready) { filter.innerHTML = '<option value="">Toutes les boîtes</option>' + PRODUCTS.map(product => `<option value="${product.id}">${esc(product.name)}</option>`).join(''); filter.dataset.ready = 'true'; }
  const configured = catalog.filter(tile => slots(tile.id).length).length;
  document.querySelector('#configured-count').textContent = `${configured}/${catalog.length}`;
}
function filteredTiles() {
  const query = document.querySelector('#catalog-search').value.trim().toLowerCase(); const product = document.querySelector('#catalog-product-filter').value;
  return catalog.filter(tile => (!product || tile.product === product) && `${tile.code} ${productName(tile.product)}`.toLowerCase().includes(query));
}
function renderTileList() {
  document.querySelector('#catalog-tile-list').innerHTML = filteredTiles().map(tile => `<button class="catalog-list-tile ${tile.id === selectedTileId ? 'active' : ''} ${slots(tile.id).length ? 'configured' : ''}" data-tile-id="${tile.id}" title="${esc(productName(tile.product))}"><img src="${esc(assetUrl(tile.image))}" alt="${esc(tile.code)}" loading="lazy"/><span>${esc(tile.code)}</span></button>`).join('') || '<p class="catalog-slot-empty">Aucune tuile trouvée.</p>';
}
function renderStage() {
  const tile = tileById(selectedTileId); if (!tile) return;
  document.querySelector('#catalog-current-title').textContent = `${tile.code} · Face ${tile.face}`;
  document.querySelector('#catalog-current-product').textContent = productName(tile.product).toUpperCase();
  document.querySelector('#catalog-stage').innerHTML = `<img src="${esc(assetUrl(tile.image))}" alt="Tuile ${esc(tile.code)}"/>${slots(tile.id).map(slot => {
    const meta = slotMeta(slot.type); const vertical = slot.type === 'door' && slot.orientation === 'vertical';
    return `<button class="catalog-slot slot-${slot.type} ${vertical ? 'vertical' : ''} ${slot.id === selectedSlotId ? 'selected' : ''}" data-slot-id="${esc(slot.id)}" style="left:${slot.x * 100}%;top:${slot.y * 100}%" title="${esc(meta.label)} · ${esc(slot.id)}"><span>${esc(meta.symbol)}</span></button>`;
  }).join('')}`;
}
function renderInspector() {
  const currentSlots = slots(selectedTileId); document.querySelector('#current-slot-count').textContent = String(currentSlots.length);
  document.querySelector('#catalog-slot-list').innerHTML = currentSlots.map(slot => { const meta = slotMeta(slot.type); return `<button class="slot-list-button ${slot.id === selectedSlotId ? 'active' : ''}" data-list-slot="${esc(slot.id)}"><i class="slot-orientation-icon">${esc(meta.symbol)}</i><span>${esc(meta.label)}</span><small>${esc(slot.id)}</small></button>`; }).join('') || '<p class="catalog-slot-empty">Aucun slot : un agent ne dispose d’aucun emplacement prédéfini sur cette face.</p>';
  const slot = currentSlots.find(entry => entry.id === selectedSlotId); document.querySelector('#empty-slot-inspector').hidden = !!slot; document.querySelector('#slot-inspector-form').hidden = !slot;
  if (slot) {
    document.querySelector('#slot-id').value = slot.id; document.querySelector('#slot-type').value = slot.type;
    document.querySelector('#slot-orientation').value = slot.orientation || 'horizontal'; document.querySelector('#slot-orientation-field').hidden = slot.type !== 'door';
    document.querySelector('#slot-x').value = Math.round(slot.x * 1000) / 10; document.querySelector('#slot-y').value = Math.round(slot.y * 1000) / 10;
  }
}
function syncToolVisibility() { document.querySelector('#new-slot-orientation').closest('label').hidden = document.querySelector('#new-slot-type').value !== 'door'; }
function setAddSlotMode(active) {
  addSlotMode = active;
  const button = document.querySelector('#add-slot-tool');
  const stage = document.querySelector('#catalog-stage');
  button.setAttribute('aria-pressed', String(active));
  button.querySelector('strong').textContent = active ? 'Annuler' : 'Ajouter';
  stage.classList.toggle('adding-slot', active);
  document.querySelector('#catalog-tool-status').textContent = active
    ? `Mode ajout : cliquez pour placer un slot ${slotMeta(document.querySelector('#new-slot-type').value).label.toLowerCase()} • Échap pour annuler`
    : 'Mode déplacement • Glissez un slot pour le déplacer';
}
function nextSlotId(tile, type) { let number = 1; const existing = new Set(slots(tile.id).map(slot => slot.id)); while (existing.has(`${tile.id}-${type}-${String(number).padStart(2, '0')}`)) number++; return `${tile.id}-${type}-${String(number).padStart(2, '0')}`; }
function updateSelectedSlot(patch) { setSlots(selectedTileId, slots(selectedTileId).map(slot => slot.id === selectedSlotId ? { ...slot, ...patch } : slot)); render(); }
function selectSlot(id) {
  selectedSlotId = id;
  document.querySelectorAll('.catalog-slot').forEach(node => node.classList.toggle('selected', node.dataset.slotId === id));
  renderInspector();
}
function positionFromPointer(event, stage) { const rect = stage.getBoundingClientRect(); return { x: Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * 1000) / 1000, y: Math.round(clamp((event.clientY - rect.top) / rect.height, 0, 1) * 1000) / 1000 }; }
function exportCatalog() {
  const data = { format: 'zombicide-catalog', version: 2, source: 'https://zombicide.fandom.com/wiki/Fantasy_Tiles', slotPolicy: { doorPlacement: 'anchor-required', otherPlacement: 'catalog-preferred', freeDoorCoordinates: false }, tiles: catalog.map(tile => ({ id: tile.id, code: tile.code, product: tile.product, face: tile.face, image: tile.image, slots: slots(tile.id), doorAnchors: slots(tile.id).filter(slot => slot.type === 'door') })) };
  const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); link.href = url; link.download = 'catalogue-zombicide-fantasy.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector('#catalog-search').addEventListener('input', renderTileList);
document.querySelector('#catalog-product-filter').addEventListener('change', renderTileList);
document.querySelector('#new-slot-type').addEventListener('change', syncToolVisibility);
document.querySelector('#new-slot-type').addEventListener('change', () => { if (addSlotMode) setAddSlotMode(true); });
document.querySelector('#add-slot-tool').addEventListener('click', () => setAddSlotMode(!addSlotMode));
document.querySelector('#catalog-tile-list').addEventListener('click', event => { const button = event.target.closest('[data-tile-id]'); if (!button) return; setAddSlotMode(false); selectedTileId = button.dataset.tileId; selectedSlotId = null; render(); });

const stage = document.querySelector('#catalog-stage');
stage.addEventListener('click', event => {
  if (suppressStageClick) { suppressStageClick = false; return; }
  const slotButton = event.target.closest('[data-slot-id]'); if (slotButton) { selectSlot(slotButton.dataset.slotId); return; }
  if (!addSlotMode) return;
  const tile = tileById(selectedTileId); if (!tile) return; const point = positionFromPointer(event, stage); const type = document.querySelector('#new-slot-type').value;
  const slot = { id: nextSlotId(tile, type), type, x: point.x, y: point.y, ...(type === 'door' ? { orientation: document.querySelector('#new-slot-orientation').value } : {}) };
  setSlots(tile.id, [...slots(tile.id), slot]); selectedSlotId = slot.id; setAddSlotMode(false); render(); toast(`Slot ${slotMeta(type).label.toLowerCase()} créé.`);
});
stage.addEventListener('pointerdown', event => {
  const slotButton = event.target.closest('[data-slot-id]'); if (!slotButton) return; event.preventDefault(); selectSlot(slotButton.dataset.slotId);
  dragState = { id: slotButton.dataset.slotId, startX: event.clientX, startY: event.clientY, node: slotButton, moved: false }; stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', event => {
  if (!dragState) return; const point = positionFromPointer(event, stage); if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 3) dragState.moved = true;
  setSlots(selectedTileId, slots(selectedTileId).map(slot => slot.id === dragState.id ? { ...slot, ...point } : slot));
  dragState.node.style.left = `${point.x * 100}%`; dragState.node.style.top = `${point.y * 100}%`;
  document.querySelector('#slot-x').value = Math.round(point.x * 1000) / 10; document.querySelector('#slot-y').value = Math.round(point.y * 1000) / 10;
});
stage.addEventListener('pointerup', event => { if (!dragState) return; suppressStageClick = dragState.moved; dragState = null; if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId); save(); renderTileList(); renderInspector(); });
stage.addEventListener('pointercancel', () => { dragState = null; render(); });

document.querySelector('#catalog-slot-list').addEventListener('click', event => { const button = event.target.closest('[data-list-slot]'); if (button) selectSlot(button.dataset.listSlot); });
document.querySelector('#slot-type').addEventListener('change', event => {
  const current = slots(selectedTileId).find(slot => slot.id === selectedSlotId); const tile = tileById(selectedTileId); if (!current || !tile) return; const newId = nextSlotId(tile, event.target.value);
  setSlots(tile.id, slots(tile.id).map(slot => slot.id === selectedSlotId ? { ...slot, id: newId, type: event.target.value, ...(event.target.value === 'door' ? { orientation: slot.orientation || 'horizontal' } : {}) } : slot)); selectedSlotId = newId; render();
});
document.querySelector('#slot-orientation').addEventListener('change', event => updateSelectedSlot({ orientation: event.target.value }));
document.querySelector('#slot-x').addEventListener('change', event => updateSelectedSlot({ x: clamp(Number(event.target.value) / 100, 0, 1) }));
document.querySelector('#slot-y').addEventListener('change', event => updateSelectedSlot({ y: clamp(Number(event.target.value) / 100, 0, 1) }));
document.querySelector('#delete-catalog-slot').addEventListener('click', () => { if (!selectedSlotId) return; setSlots(selectedTileId, slots(selectedTileId).filter(slot => slot.id !== selectedSlotId)); selectedSlotId = null; render(); toast('Slot supprimé.'); });
document.querySelector('#clear-tile-slots').addEventListener('click', () => { const tile = tileById(selectedTileId); if (!tile || !slots(tile.id).length) return; if (!confirm(`Effacer tous les slots de ${tile.code} ?`)) return; setSlots(tile.id, []); selectedSlotId = null; render(); toast('Slots effacés.'); });
document.querySelector('#catalog-export').addEventListener('click', exportCatalog);
document.querySelector('#catalog-import').addEventListener('change', async event => {
  try {
    const data = JSON.parse(await event.target.files[0].text()); if (data.format !== 'zombicide-catalog' || !Array.isArray(data.tiles)) throw new Error();
    for (const entry of data.tiles) {
      if (!tileById(entry.id)) continue; const incoming = Array.isArray(entry.slots) ? entry.slots : (entry.doorAnchors || []).map(slot => ({ ...slot, type: 'door' }));
      const valid = incoming.every(slot => slot.id && SLOT_TYPES[slot.type || 'door'] && Number.isFinite(slot.x) && Number.isFinite(slot.y) && slot.x >= 0 && slot.x <= 1 && slot.y >= 0 && slot.y <= 1);
      if (valid) setSlots(entry.id, incoming.map(slot => ({ ...slot, type: slot.type || 'door', ...(slot.type === 'door' || !slot.type ? { orientation: slot.orientation || 'horizontal' } : {}) })));
    }
    selectedSlotId = null; render(); toast('Catalogue importé.');
  } catch { toast('Catalogue invalide.', true); }
  event.target.value = '';
});
document.addEventListener('keydown', event => { if (['INPUT', 'SELECT'].includes(event.target.tagName)) return; if (event.key === 'Escape' && addSlotMode) setAddSlotMode(false); if ((event.key === 'Delete' || event.key === 'Backspace') && selectedSlotId) document.querySelector('#delete-catalog-slot').click(); });
render();
