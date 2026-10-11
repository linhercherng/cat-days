import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBackup, parseBackup, MAX_BACKUP_BYTES} from '../src/backup.js';
import {makeCloudBackup, parseCloudBackup} from '../src/cloud-backup.js';
import {emptyState, MAX_TEXT} from '../src/schema.js';

const at = '2026-10-11T00:00:00.000Z';
const bytes = value => Buffer.byteLength(JSON.stringify(value, null, 2), 'utf8');
const note = id => ({id, date:'2026-10-11', text:'x', mood:'', moodText:'', createdAt:at, updatedAt:at});
const draft = {id:'new', slot:'new', noteId:null, date:'', text:'貓🙂', mood:'', moodText:'', updatedAt:at};
function fixture(version, size, unicode = false) {
  const value = {app:'cat-days', version, exportedAt:at,
    notes:Array.from({length:270}, (_,i) => note(`n${i}`)), drafts:[draft]};
  if (version === 2) value.tombstones = [{id:'deleted', version:2, deletedAt:at}];
  let remaining = size - bytes(value);
  for (const item of value.notes) {
    const length = Math.min(remaining, MAX_TEXT - 1);
    // Each 貓🙂 takes 7 UTF-8 bytes but only 3 JavaScript code units.
    const groups = unicode ? Math.min(Math.floor(length / 7), Math.floor((MAX_TEXT - 1) / 3)) : 0;
    const text = '貓🙂'.repeat(groups) + 'x'.repeat(length - groups * 7);
    item.text += text;
    remaining -= length;
    if (!remaining) break;
  }
  assert.equal(remaining, 0);
  assert.equal(bytes(value), size);
  return value;
}
function source(value) {
  return {
    current:{...emptyState(), notes:value.notes, drafts:value.drafts},
    read() {return this.current;},
    records() {return [...value.notes, ...(value.tombstones || [])];}
  };
}

for (const version of [1,2]) {
  const parse = version === 1 ? parseBackup : parseCloudBackup;
  const make = store => version === 1 ? makeBackup(store.read()) : makeCloudBackup(store);
  test(`V${version} export and import agree at the UTF-8 size boundary`, () => {
    for (const unicode of [false,true]) {
      for (const size of [MAX_BACKUP_BYTES - 1, MAX_BACKUP_BYTES, MAX_BACKUP_BYTES + 1]) {
        const value = fixture(version, size, unicode), store = source(value);
        const before = JSON.stringify(store.current);
        const raw = JSON.stringify(value, null, 2);
        if (size <= MAX_BACKUP_BYTES) {
          const exported = make(store);
          assert.equal(bytes(exported), size);
          const restored = parse(JSON.stringify(exported, null, 2));
          assert.deepEqual(restored.notes, value.notes);
          assert.deepEqual(restored.drafts, value.drafts);
          if (version === 2) assert.deepEqual(restored.tombstones, value.tombstones);
        } else {
          assert.throws(() => make(store), /5 MiB/);
          assert.throws(() => parse(raw));
        }
        assert.equal(JSON.stringify(store.current), before);
      }
    }
  });
  test(`V${version} counts formatted JSON bytes, not compact JSON or string length`, () => {
    const value = fixture(version, MAX_BACKUP_BYTES + 1, true);
    assert.ok(Buffer.byteLength(JSON.stringify(value)) < MAX_BACKUP_BYTES);
    assert.ok(JSON.stringify(value, null, 2).length < MAX_BACKUP_BYTES);
    assert.throws(() => make(source(value)), /5 MiB/);
  });
}

test('V2 export refuses snapshots its own parser cannot restore', () => {
  const value = {app:'cat-days', version:2, notes:[note('a')], drafts:[], tombstones:[]};
  for (const invalid of [
    {...value, notes:[note('a'), note('a')]},
    {...value, tombstones:[{id:'a', version:1, deletedAt:at}]},
    {...value, tombstones:[{id:'b', version:0, deletedAt:at}]},
    {...value, notes:Array.from({length:5001}, (_,i) => note(`n${i}`))}
  ]) assert.throws(() => makeCloudBackup(source(invalid)));
});
