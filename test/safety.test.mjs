import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRASH_DAYS, trashExpired, trashDaysLeft, isTrashed, backupDue, makeBackup, readBackup, cleanDoc, planRestore, uniqueNames,
} from '../src/safety.js';

const DAY = 864e5;
const T0 = Date.UTC(2026, 0, 1);
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] };
const doc = (id, extra = {}) => ({ id, title: `Doc ${id}`, content, settings: {}, created: T0, updated: T0, ...extra });

test('recycle bin keeps documents for 30 days', () => {
  const d = doc('a', { deleted: T0 });
  assert.equal(isTrashed(d), true);
  assert.equal(isTrashed(doc('b')), false);
  assert.equal(trashDaysLeft(d, T0), TRASH_DAYS);
  assert.equal(trashDaysLeft(d, T0 + DAY / 2), TRASH_DAYS);
  assert.equal(trashDaysLeft(d, T0 + 29.5 * DAY), 1);
  assert.equal(trashExpired(d, T0 + 29.9 * DAY), false);
  assert.equal(trashExpired(d, T0 + 30 * DAY), true);
  assert.equal(trashDaysLeft(d, T0 + 40 * DAY), 0);
  assert.equal(trashExpired(doc('b'), T0 + 999 * DAY), false);
});

test('backup reminder only when storage is not protected and there is something to lose', () => {
  const now = T0 + 100 * DAY;
  assert.equal(backupDue({ persisted: true, lastBackup: 0, docCount: 3, now }), false);
  assert.equal(backupDue({ persisted: false, lastBackup: 0, docCount: 0, now }), false);
  assert.equal(backupDue({ persisted: false, lastBackup: 0, docCount: 1, now }), true);
  assert.equal(backupDue({ persisted: false, lastBackup: now - 13 * DAY, docCount: 1, now }), false);
  assert.equal(backupDue({ persisted: false, lastBackup: now - 14 * DAY, docCount: 1, now }), true);
});

test('backup round trip keeps documents, including ones in the recycle bin', () => {
  const docs = [doc('a', { jobDescription: 'Data engineer' }), doc('b', { deleted: T0 })];
  const { docs: back, skipped, exported } = readBackup(JSON.stringify(makeBackup(docs, T0)));
  assert.deepEqual(back, docs);
  assert.equal(skipped, 0);
  assert.equal(exported, T0);
});

test('restore rejects files that are not backups', () => {
  for (const text of ['', 'not json', '{}', '[]', JSON.stringify({ kind: 'other', docs: [] }), JSON.stringify({ kind: 'dynoword-backup' })]) {
    assert.throws(() => readBackup(text), /NOT_A_BACKUP/);
  }
});

test('restore skips damaged entries and drops unexpected fields', () => {
  const text = JSON.stringify({
    kind: 'dynoword-backup', version: 1,
    docs: [
      doc('ok', { evil: '<script>', settings: [1], title: '' }),
      { id: '../../etc', content },
      { id: 'x', content: { type: 'paragraph' } },
      { id: 'y' },
      null,
      'text',
    ],
  });
  const { docs, skipped } = readBackup(text);
  assert.equal(skipped, 5);
  assert.deepEqual(docs, [{ id: 'ok', title: 'Untitled document', content, settings: {}, created: T0, updated: T0 }]);
  assert.equal(cleanDoc(doc('t', { title: 'x'.repeat(500) })).title.length, 300);
  assert.equal(cleanDoc(doc('n', { updated: 'soon' })).updated, 0);
});

test('restore never overwrites a newer copy on this device', () => {
  const existing = [doc('same'), doc('newer-here', { updated: T0 + 5 }), doc('older-here')];
  const incoming = [doc('same'), doc('newer-here'), doc('older-here', { updated: T0 + 5 }), doc('missing')];
  const { write, upToDate } = planRestore(incoming, existing);
  assert.deepEqual(write.map((d) => d.id), ['older-here', 'missing']);
  assert.equal(upToDate, 2);
});

test('file names inside a backup are safe and unique', () => {
  assert.deepEqual(
    uniqueNames(['Résumé', 'résumé', 'a/b:c*?', '', '...', 'CON', 'Résumé'], 'docx'),
    ['Résumé.docx', 'résumé (2).docx', 'abc.docx', 'Document.docx', 'Document (2).docx', 'CON.docx', 'Résumé (3).docx'],
  );
});
