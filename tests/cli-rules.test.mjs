import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'cli/zombicide-map.mjs');
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zombicide-cli-rules-'));

function mission(overrides = {}) {
  return {
    format: 'zombicide-map',
    version: 1,
    name: 'Test des règles CLI',
    grid: { columns: 1, rows: 1 },
    tiles: [{ instanceId: 'tile-1', catalogId: '1r', code: '1R', face: 'R', column: 0, row: 0, rotation: 0, customDoorAnchors: [] }],
    markers: [],
    render: { showTileNames: true, showLegend: true, background: '#24282d' },
    ...overrides
  };
}

function validate(name, data) {
  const file = path.join(TEMP_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data));
  const result = spawnSync(process.execPath, [CLI, 'validate', file, '--json'], { cwd: ROOT, encoding: 'utf8' });
  return { status: result.status, output: JSON.parse(result.stdout) };
}

function validateWithCatalog(name, data, catalog) {
  const missionFile = path.join(TEMP_DIR, `${name}.json`);
  const catalogFile = path.join(TEMP_DIR, `${name}-catalog.json`);
  fs.writeFileSync(missionFile, JSON.stringify(data));
  fs.writeFileSync(catalogFile, JSON.stringify(catalog));
  const result = spawnSync(process.execPath, [CLI, 'validate', missionFile, '--catalog', catalogFile, '--json'], { cwd: ROOT, encoding: 'utf8' });
  return { status: result.status, output: JSON.parse(result.stdout) };
}

function validateStrictWithCollection(name, data, collection) {
  const missionFile = path.join(TEMP_DIR, `${name}.json`);
  const collectionFile = path.join(TEMP_DIR, `${name}-collection.json`);
  fs.writeFileSync(missionFile, JSON.stringify(data));
  fs.writeFileSync(collectionFile, JSON.stringify(collection));
  const result = spawnSync(process.execPath, [CLI, 'validate', missionFile, '--collection', collectionFile, '--strict', '--json'], { cwd: ROOT, encoding: 'utf8' });
  return { status: result.status, output: JSON.parse(result.stdout) };
}

try {
  const contextResult = spawnSync(process.execPath, [CLI, 'context', '--json'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(contextResult.status, 0);
  const context = JSON.parse(contextResult.stdout);
  assert.ok(context.constraints.semanticAudit.tileJunctions);
  assert.ok(context.constraints.semanticAudit.invasions.includes('shortest route'));
  assert.ok(context.constraints.interiorZoneSize);
  assert.ok(context.requiredAgentWorkflow.some(step => step.includes('semantic')));
  assert.ok(context.constraints.markerCatalog.some(marker => marker.type === 'start' && marker.product === null && marker.category === 'base'));
  assert.ok(context.constraints.markerCatalog.some(marker => marker.type === 'rubble' && marker.product === null && marker.category === 'custom'));
  assert.ok(context.constraints.markerCatalog.some(marker => marker.type === 'crypt' && marker.product === 'black-plague' && marker.category === 'unique' && marker.limit === 2));
  assert.ok(context.constraints.markerCatalog.some(marker => marker.type === 'crypt-yellow' && marker.product === 'black-plague' && marker.category === 'unique' && marker.limit === 2));
  assert.ok(context.constraints.markerCatalog.some(marker => marker.type === 'chi' && marker.product === 'eternal-empire' && marker.category === 'unique'));

  const valid = validate('valid-generated-anchors', mission({
    markers: [
      { id: 'rubble-1', type: 'rubble', tile: 'tile-1', anchor: 'grid-edge-h-1-2', x: .5, y: 1 / 3, label: 'X' },
      { id: 'start-1', type: 'start', tile: 'tile-1', anchor: 'grid-cell-1-1', x: 1 / 6, y: 1 / 6, label: 'S' },
      { id: 'door-free', type: 'door', tile: 'tile-1', x: .2, y: .2, label: 'D' },
      { id: 'objective-1', type: 'objective', tile: 'tile-1', x: .5, y: .5, label: '1' },
      { id: 'guard-1', type: 'guard', tile: 'tile-1', x: .5, y: .5, label: 'G' },
      { id: 'crypt-1', type: 'crypt', tile: 'tile-1', anchor: 'grid-cell-2-2', x: .5, y: .5, label: 'CR' }
    ]
  }));
  assert.equal(valid.status, 0);
  assert.equal(valid.output.valid, true);
  assert.ok(context.constraints.markers.includes('crypt'));

  const unavailableMarker = validateStrictWithCollection('unavailable-marker', mission({
    markers: [
      { id: 'chi-1', type: 'chi', tile: 'tile-1', anchor: 'grid-cell-2-2', x: .5, y: .5, label: 'χ' }
    ]
  }), {
    format: 'zombicide-collection',
    version: 1,
    name: 'Black Plague seulement',
    ownedProducts: ['black-plague'],
    tileWhitelist: [],
    tileBlacklist: []
  });
  assert.equal(unavailableMarker.status, 2);
  assert.ok(unavailableMarker.output.warnings.some(warning => warning.code === 'UNAVAILABLE_MARKER'));

  const markerLimit = validateStrictWithCollection('marker-limit', mission({
    markers: [
      { id: 'crypt-yellow-1', type: 'crypt-yellow', tile: 'tile-1', anchor: 'grid-cell-1-1', x: 1 / 6, y: 1 / 6, label: 'CR' },
      { id: 'crypt-yellow-2', type: 'crypt-yellow', tile: 'tile-1', anchor: 'grid-cell-1-2', x: .5, y: 1 / 6, label: 'CR' },
      { id: 'crypt-yellow-3', type: 'crypt-yellow', tile: 'tile-1', anchor: 'grid-cell-1-3', x: 5 / 6, y: 1 / 6, label: 'CR' }
    ]
  }), {
    format: 'zombicide-collection',
    version: 1,
    name: 'Black Plague',
    ownedProducts: ['black-plague'],
    tileWhitelist: [],
    tileBlacklist: []
  });
  assert.equal(markerLimit.status, 2);
  assert.ok(markerLimit.output.warnings.some(warning => warning.code === 'MARKER_LIMIT'));

  const duplicateAnchor = validate('duplicate-anchor', mission({
    markers: [
      { id: 'rubble-1', type: 'rubble', tile: 'tile-1', anchor: 'grid-edge-h-1-2', x: .5, y: 1 / 3, label: 'X' },
      { id: 'rubble-2', type: 'rubble', tile: 'tile-1', anchor: 'grid-edge-h-1-2', x: .5, y: 1 / 3, label: 'X' }
    ]
  }));
  assert.equal(duplicateAnchor.status, 2);
  assert.ok(duplicateAnchor.output.errors.some(error => error.code === 'MARKER_ANCHOR_DUPLICATE'));

  const duplicateTile = validate('duplicate-physical-tile', mission({
    grid: { columns: 2, rows: 1 },
    tiles: [
      { instanceId: 'tile-r', catalogId: '1r', code: '1R', face: 'R', column: 0, row: 0, rotation: 0, customDoorAnchors: [] },
      { instanceId: 'tile-v', catalogId: '1v', code: '1V', face: 'V', column: 1, row: 0, rotation: 0, customDoorAnchors: [] }
    ]
  }));
  assert.equal(duplicateTile.status, 2);
  assert.ok(duplicateTile.output.errors.some(error => error.code === 'TILE_DUPLICATE'));

  const internalInvasion = validate('internal-invasion', mission({
    markers: [{ id: 'invasion-1', type: 'invasion', tile: 'tile-1', x: .5, y: .5, label: '1' }]
  }));
  assert.equal(internalInvasion.status, 2);
  assert.ok(internalInvasion.output.errors.some(error => error.code === 'INVASION_OUTER_EDGE'));

  const mismatchedAnchor = validate('mismatched-anchor', mission({
    markers: [{ id: 'start-1', type: 'start', tile: 'tile-1', anchor: 'grid-cell-1-1', x: .5, y: .5, label: 'S' }]
  }));
  assert.equal(mismatchedAnchor.status, 2);
  assert.ok(mismatchedAnchor.output.errors.some(error => error.code === 'SLOT_POSITION'));

  const requiredDoorCatalog = {
    format: 'zombicide-catalog',
    version: 2,
    tiles: [{
      id: '1r',
      slots: [{ id: '1r-door-required', type: 'door', x: .333, y: .833, orientation: 'vertical', requiresDoor: true }]
    }]
  };
  const missingRequiredDoor = validateWithCatalog('missing-required-door', mission(), requiredDoorCatalog);
  assert.equal(missingRequiredDoor.status, 2);
  assert.ok(missingRequiredDoor.output.errors.some(error => error.code === 'REQUIRED_DOOR_MISSING'));

  const presentRequiredDoor = validateWithCatalog('present-required-door', mission({
    markers: [{ id: 'door-required', type: 'door', tile: 'tile-1', anchor: '1r-door-required', x: .333, y: .833, label: 'D' }]
  }), requiredDoorCatalog);
  assert.equal(presentRequiredDoor.status, 0);
  assert.equal(presentRequiredDoor.output.valid, true);

  const largeInteriorCatalog = {
    format: 'zombicide-catalog',
    version: 2,
    tiles: [{
      id: '1r',
      slots: [{ id: '1r-door-separator', type: 'door', x: .5, y: .667, orientation: 'horizontal' }],
      interiorZones: [{ id: 'great-hall', label: 'Grande salle', cellCount: 5, separatorDoorIds: ['1r-door-separator'] }]
    }]
  };
  const largeInteriorMissingDoor = validateWithCatalog('large-interior-missing-door', mission(), largeInteriorCatalog);
  assert.equal(largeInteriorMissingDoor.status, 2);
  assert.ok(largeInteriorMissingDoor.output.errors.some(error => error.code === 'INTERIOR_ZONE_TOO_LARGE'));

  const largeInteriorWithDoor = validateWithCatalog('large-interior-with-door', mission({
    markers: [{ id: 'door-separator', type: 'door', tile: 'tile-1', anchor: '1r-door-separator', x: .5, y: .667, label: 'D' }]
  }), largeInteriorCatalog);
  assert.equal(largeInteriorWithDoor.status, 0);
  assert.equal(largeInteriorWithDoor.output.valid, true);

  console.log('✓ Règles CLI testées : ancres générées, portes libres, portes obligatoires, intérieurs trop grands, doublons, invasions et coordonnées.');
} finally {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
