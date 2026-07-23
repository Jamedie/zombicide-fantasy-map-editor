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

try {
  const contextResult = spawnSync(process.execPath, [CLI, 'context', '--json'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(contextResult.status, 0);
  const context = JSON.parse(contextResult.stdout);
  assert.ok(context.constraints.semanticAudit.tileJunctions);
  assert.ok(context.requiredAgentWorkflow.some(step => step.includes('semantic')));

  const valid = validate('valid-generated-anchors', mission({
    markers: [
      { id: 'rubble-1', type: 'rubble', tile: 'tile-1', anchor: 'grid-edge-h-1-2', x: .5, y: 1 / 3, label: 'X' },
      { id: 'start-1', type: 'start', tile: 'tile-1', anchor: 'grid-cell-1-1', x: 1 / 6, y: 1 / 6, label: 'S' },
      { id: 'door-free', type: 'door', tile: 'tile-1', x: .2, y: .2, label: 'D' },
      { id: 'objective-1', type: 'objective', tile: 'tile-1', x: .5, y: .5, label: '1' },
      { id: 'guard-1', type: 'guard', tile: 'tile-1', x: .5, y: .5, label: 'G' }
    ]
  }));
  assert.equal(valid.status, 0);
  assert.equal(valid.output.valid, true);

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

  console.log('✓ Règles CLI testées : ancres générées, portes libres, doublons, invasions et coordonnées.');
} finally {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
