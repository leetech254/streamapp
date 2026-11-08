const test = require('node:test');
const assert = require('node:assert/strict');

const THEMES = new Set(['#ffd700', '#00f3ff', '#00ff41', '#ff3131', '#bc13fe']);

function normalizePreferences(input = {}) {
  return {
    vip: input.vip === true,
    theme: THEMES.has(String(input.theme || '').toLowerCase()) ? String(input.theme).toLowerCase() : '#ffd700'
  };
}

class FakePreferenceBackend {
  constructor() {
    this.accounts = new Map();
  }

  read(accountId) {
    const current = this.accounts.get(accountId) || { vip: false, theme: '#ffd700', revision: 0 };
    return { ...current };
  }

  write(accountId, patch, expectedRevision = null) {
    const current = this.read(accountId);
    if (expectedRevision !== null && expectedRevision !== current.revision) {
      const error = new Error('Preference revision is stale');
      error.code = 'PREFERENCE_CONFLICT';
      error.current = current;
      throw error;
    }
    const next = normalizePreferences({ ...current, ...patch });
    const stored = { ...next, revision: current.revision + 1 };
    this.accounts.set(accountId, stored);
    return { ...stored };
  }
}

function createSession(backend, accountId) {
  return {
    read: () => backend.read(accountId),
    update: (patch, expectedRevision = null) => backend.write(accountId, patch, expectedRevision)
  };
}

test('two authenticated sessions observe the same account VIP/theme state', () => {
  const backend = new FakePreferenceBackend();
  const sessionA = createSession(backend, 'account-a');
  const sessionB = createSession(backend, 'account-a');

  const saved = sessionA.update({ vip: true, theme: '#bc13fe' });
  assert.deepEqual(sessionB.read(), saved);
  assert.equal(sessionB.read().vip, true);
  assert.equal(sessionB.read().theme, '#bc13fe');
});

test('different accounts cannot read or overwrite one another preferences', () => {
  const backend = new FakePreferenceBackend();
  const accountA = createSession(backend, 'account-a');
  const accountB = createSession(backend, 'account-b');

  accountA.update({ vip: true, theme: '#00f3ff' });
  assert.deepEqual(accountB.read(), { vip: false, theme: '#ffd700', revision: 0 });

  accountB.update({ vip: false, theme: '#00ff41' });
  assert.deepEqual(accountA.read(), { vip: true, theme: '#00f3ff', revision: 1 });
});

test('stale multi-session writes are rejected without losing the newer state', () => {
  const backend = new FakePreferenceBackend();
  const sessionA = createSession(backend, 'account-a');
  const sessionB = createSession(backend, 'account-a');
  const revisionA = sessionA.read().revision;

  sessionB.update({ vip: true, theme: '#ff3131' }, revisionA);
  assert.throws(() => sessionA.update({ vip: false, theme: '#00f3ff' }, revisionA), error => {
    assert.equal(error.code, 'PREFERENCE_CONFLICT');
    assert.equal(error.current.vip, true);
    assert.equal(error.current.theme, '#ff3131');
    return true;
  });
  assert.deepEqual(sessionA.read(), { vip: true, theme: '#ff3131', revision: 1 });
});

test('invalid theme values are normalized and VIP is strictly boolean', () => {
  const backend = new FakePreferenceBackend();
  const session = createSession(backend, 'account-a');

  const saved = session.update({ vip: 'true', theme: 'javascript:alert(1)' });
  assert.equal(saved.vip, false);
  assert.equal(saved.theme, '#ffd700');
});
