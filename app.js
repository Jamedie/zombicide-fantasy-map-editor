const TILE_TYPES = [
  { id: 'village', name: 'Village', code: '1V' }, { id: 'ruins', name: 'Ruines', code: '8R' }, { id: 'tower', name: 'Tour', code: '3V' }
];
const MARKER_TYPES = [
  ['start', 'Départ', 'S'], ['objective', 'Objectif', 'O'], ['npc', 'NPC cible', 'N'], ['invasion', 'Invasion', '#'], ['exit', 'Sortie', 'E'], ['item', 'Objet', '05'], ['guard', 'Garde', 'G'], ['door', 'Porte', 'D']
];
const state = { title: 'Nouvelle mission', tiles: [], markers: [], selected: null };
const board = document.querySelector('#board');
const tileLibrary = document.querySelector('#tile-library');
const markerLibrary = document.querySelector('#marker-library');
const form = document.querySelector('#properties-form');
let drag = null;

function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, Math.round(n))); }
function itemById() { return [...state.tiles, ...state.markers].find(item => item.id === state.selected); }
function renderLibraries() {
  tileLibrary.innerHTML = TILE_TYPES.map(t => `<button class="tile-choice" draggable="true" data-tile="${t.id}"><div class="tile-thumb"></div><span>${t.code} · ${t.name}</span></button>`).join('');
  markerLibrary.innerHTML = MARKER_TYPES.map(([id, name, label]) => `<button class="marker-choice" data-marker="${id}"><span class="map-marker marker-${id} marker-sample"><span>${label}</span></span>${name}</button>`).join('');
}
function render() {
  document.querySelector('#map-title').value = state.title;
  board.innerHTML = '';
  state.tiles.forEach(tile => { const el = document.createElement('div'); el.className = `map-tile ${tile.id === state.selected ? 'selected' : ''}`; el.dataset.id = tile.id; el.style.left = `${tile.x}px`; el.style.top = `${tile.y}px`; el.style.transform = `rotate(${tile.rotation}deg)`; el.innerHTML = `<span class="tile-code">${tile.code}</span><span class="tile-name">${tile.name}</span>`; board.append(el); });
  state.markers.forEach(marker => { const el = document.createElement('div'); el.className = `map-marker marker-${marker.kind} ${marker.id === state.selected ? 'selected' : ''}`; el.dataset.id = marker.id; el.style.left = `${marker.x}px`; el.style.top = `${marker.y}px`; el.innerHTML = `<span>${marker.label}</span>`; board.append(el); });
  updateInspector();
}
function updateInspector() {
  const item = itemById(); const empty = document.querySelector('#empty-inspector');
  empty.hidden = !!item; form.hidden = !item; document.querySelector('#delete-selected').disabled = !item;
  document.querySelector('#selection-label').textContent = item ? `${item.kind === 'tile' ? 'Tuile' : 'Marqueur'} sélectionné` : 'Aucune sélection';
  if (!item) return;
  document.querySelector('#property-type').value = item.kind === 'tile' ? `Tuile · ${item.name}` : `Marqueur · ${MARKER_TYPES.find(m => m[0] === item.kind)[1]}`;
  document.querySelector('#property-label').value = item.label || ''; document.querySelector('#property-x').value = item.x; document.querySelector('#property-y').value = item.y;
  document.querySelector('#label-field').hidden = item.kind === 'tile'; document.querySelector('#tile-code-field').hidden = item.kind !== 'tile'; document.querySelector('#rotation-field').hidden = item.kind !== 'tile';
  if (item.kind === 'tile') { document.querySelector('#property-code').value = item.code; document.querySelector('#property-rotation').value = item.rotation; }
}
function addTile(typeId, x = 305, y = 180) { const type = TILE_TYPES.find(t => t.id === typeId); const tile = { id:uid(), kind:'tile', name:type.name, code:type.code, tileType:type.id, x:clamp(x,0,610), y:clamp(y,0,360), rotation:0 }; state.tiles.push(tile); state.selected = tile.id; render(); }
function addMarker(kind, x = 420, y = 300) { const type = MARKER_TYPES.find(m => m[0] === kind); const marker = { id:uid(), kind, label:type[2], x:clamp(x,0,850), y:clamp(y,0,600) }; state.markers.push(marker); state.selected = marker.id; render(); }
function point(event) { const rect = board.getBoundingClientRect(); return { x:(event.clientX - rect.left) * board.clientWidth / rect.width, y:(event.clientY - rect.top) * board.clientHeight / rect.height }; }
renderLibraries(); render();
tileLibrary.addEventListener('dragstart', e => { const id = e.target.closest('[data-tile]')?.dataset.tile; if (id) e.dataTransfer.setData('tile', id); });
tileLibrary.addEventListener('click', e => { const id = e.target.closest('[data-tile]')?.dataset.tile; if (id) addTile(id); });
markerLibrary.addEventListener('click', e => { const id = e.target.closest('[data-marker]')?.dataset.marker; if (id) addMarker(id); });
board.addEventListener('dragover', e => { e.preventDefault(); board.classList.add('dragover'); }); board.addEventListener('dragleave', () => board.classList.remove('dragover'));
board.addEventListener('drop', e => { e.preventDefault(); board.classList.remove('dragover'); const id = e.dataTransfer.getData('tile'); if (id) { const p = point(e); addTile(id,p.x-145,p.y-145); } });
board.addEventListener('pointerdown', e => { const target = e.target.closest('[data-id]'); if (!target) { state.selected = null; render(); return; } const item = [...state.tiles,...state.markers].find(i => i.id === target.dataset.id); state.selected = item.id; const p=point(e); drag={ item, dx:p.x-item.x, dy:p.y-item.y }; target.setPointerCapture(e.pointerId); render(); });
board.addEventListener('pointermove', e => { if (!drag) return; const p=point(e), max=drag.item.kind === 'tile' ? [610,360] : [850,600]; drag.item.x=clamp(p.x-drag.dx,0,max[0]); drag.item.y=clamp(p.y-drag.dy,0,max[1]); render(); }); board.addEventListener('pointerup', () => drag=null);
document.querySelector('#map-title').addEventListener('input', e => state.title=e.target.value);
form.addEventListener('input', e => { const item=itemById(); if (!item) return; const field=e.target.id; if (field==='property-label') item.label=e.target.value; if (field==='property-code') item.code=e.target.value.toUpperCase(); if (field==='property-x') item.x=Number(e.target.value); if (field==='property-y') item.y=Number(e.target.value); if (field==='property-rotation') item.rotation=Number(e.target.value); render(); });
document.querySelector('#delete-selected').addEventListener('click', () => { state.tiles=state.tiles.filter(i=>i.id!==state.selected); state.markers=state.markers.filter(i=>i.id!==state.selected); state.selected=null; render(); });
document.querySelector('#duplicate-selected').addEventListener('click', () => { const item=itemById(); if (!item) return; const copy={...item,id:uid(),x:item.x+24,y:item.y+24}; (copy.kind==='tile'?state.tiles:state.markers).push(copy); state.selected=copy.id; render(); });
document.addEventListener('keydown', e => { const item=itemById(); if (!item || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Delete','Backspace'].includes(e.key)) return; if (e.key==='Delete'||e.key==='Backspace') return document.querySelector('#delete-selected').click(); e.preventDefault(); item.x+=e.key==='ArrowLeft'?-5:e.key==='ArrowRight'?5:0; item.y+=e.key==='ArrowUp'?-5:e.key==='ArrowDown'?5:0; render(); });
document.querySelector('#new-map').addEventListener('click', () => { if (!confirm('Effacer la carte en cours ?')) return; state.title='Nouvelle mission'; state.tiles=[]; state.markers=[]; state.selected=null; render(); });
function download(name, content, type) { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
document.querySelector('#export-json').addEventListener('click', () => download(`${state.title || 'mission'}.json`,JSON.stringify({version:1,title:state.title,tiles:state.tiles,markers:state.markers},null,2),'application/json'));
document.querySelector('#import-file').addEventListener('change', async e => { const file=e.target.files[0]; if (!file) return; try { const map=JSON.parse(await file.text()); if (!Array.isArray(map.tiles)||!Array.isArray(map.markers)) throw Error(); state.title=map.title||'Mission importée'; state.tiles=map.tiles; state.markers=map.markers; state.selected=null; render(); } catch { alert('Fichier de mission invalide.'); } e.target.value=''; });
document.querySelector('#export-image').addEventListener('click', () => {
  const colors = { start:'#2c69b8', objective:'#c6353c', npc:'#6542a1', invasion:'#b4252b', exit:'#278249', item:'#bd8e0c', guard:'#138094', door:'#65676b' };
  const tiles = state.tiles.map(t => `<g transform="translate(${t.x} ${t.y}) rotate(${t.rotation} 145 145)"><rect width="290" height="290" fill="#746f5e" stroke="#17191c" stroke-width="8"/><path d="M0 0H290V58H0z M0 146H290V215H0z" fill="#b9ad8c" opacity=".75"/><path d="M0 58H290V146H0z M0 215H290V290H0z" fill="#373b39" opacity=".85"/><rect x="10" y="10" width="55" height="32" rx="4" fill="#15171b" stroke="white" stroke-width="2"/><text x="37" y="33" text-anchor="middle" fill="white" font-family="sans-serif" font-size="18" font-weight="bold">${t.code}</text><text x="12" y="277" fill="white" font-family="sans-serif" font-size="12">${t.name}</text></g>`).join('');
  const markers = state.markers.map(m => { const square=['door','invasion','exit'].includes(m.kind); const w=m.kind==='door'?35:square?42:54; const h=m.kind==='door'?35:square?48:54; const x=m.x+w/2; const y=m.y+h/2; return `<g ${m.kind==='door'?`transform="rotate(45 ${x} ${y})"`:''}><rect x="${m.x}" y="${m.y}" width="${w}" height="${h}" rx="${square?4:27}" fill="${colors[m.kind]}" stroke="white" stroke-width="4"/><text x="${x}" y="${y+6}" text-anchor="middle" fill="white" font-family="sans-serif" font-size="16" font-weight="bold" ${m.kind==='door'?`transform="rotate(-45 ${x} ${y})"`:''}>${m.label}</text></g>`; }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650" viewBox="0 0 900 650"><rect width="900" height="650" fill="#2f3438"/>${tiles}${markers}</svg>`;
  const image = new Image(); image.onload = () => { const canvas=document.createElement('canvas'); canvas.width=900; canvas.height=650; canvas.getContext('2d').drawImage(image,0,0); canvas.toBlob(blob => download(`${state.title||'mission'}.jpg`,blob,'image/jpeg'),'image/jpeg',.92); URL.revokeObjectURL(image.src); }; image.src=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
});
