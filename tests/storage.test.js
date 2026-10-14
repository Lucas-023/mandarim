import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, memoryBackend, emptyState, migrate, SCHEMA_VERSION, uid } from '../src/core/storage.js';
import { awardXp, totalXp } from '../src/core/xp.js';

test('estado novo começa sem nenhum dado inventado', () => {
  const s = emptyState();
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(s.xpEvents, []);
  assert.deepEqual(s.skillEvidence, []);
  assert.deepEqual(s.placementAttempts, []);
  assert.equal(s.profile.placementDone, false);
});

test('os dados sobrevivem a recarregar a aplicação', () => {
  const backend = memoryBackend();
  const store = new Store(backend);
  store.update((s) => awardXp(s, { type: 'dialog_study', key: 'd1' }));
  const reloaded = new Store(backend);
  assert.equal(totalXp(reloaded.state), 15);
});

test('estado corrompido não quebra a aplicação', () => {
  const store = new Store(memoryBackend('{isso não é json'));
  assert.equal(totalXp(store.state), 0);
  assert.equal(store.state.schemaVersion, SCHEMA_VERSION);
});

test('migração preenche campos novos em estados antigos', () => {
  const old = { schemaVersion: 0, xpEvents: [{ id: 'x', key: 'k', type: 'review_session', amount: 10, at: '2026-01-01T00:00:00Z' }], profile: { declaredLevel: 'hsk1' } };
  const migrated = migrate(old);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.xpEvents.length, 1);
  assert.deepEqual(migrated.cardDrafts, []);
  assert.equal(migrated.settings.dailyGoalXp, 50);
  assert.equal(migrated.profile.minutesPerDay, 20);
});

test('reset apaga tudo (requisito de privacidade)', () => {
  const backend = memoryBackend();
  const store = new Store(backend);
  store.update((s) => awardXp(s, { type: 'dialog_study', key: 'd1' }));
  store.reset();
  assert.equal(totalXp(store.state), 0);
  assert.equal(totalXp(new Store(backend).state), 0);
});

test('falha de escrita é reportada em vez de silenciada', () => {
  const store = new Store({
    read: () => null,
    write: () => {
      throw new Error('QuotaExceededError');
    },
    clear: () => {},
  });
  assert.equal(store.save(), false);
  assert.match(store.lastSaveError.message, /Quota/);
});

test('listeners são notificados ao salvar', () => {
  const store = new Store(memoryBackend());
  let calls = 0;
  const off = store.subscribe(() => (calls += 1));
  store.save();
  off();
  store.save();
  assert.equal(calls, 1);
});

test('uid não colide em sequência', () => {
  const ids = new Set(Array.from({ length: 500 }, () => uid('t')));
  assert.equal(ids.size, 500);
});

test('exportJson devolve o estado inteiro legível', () => {
  const store = new Store(memoryBackend());
  const parsed = JSON.parse(store.exportJson());
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
});
