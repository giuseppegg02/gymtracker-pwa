import test from 'node:test';
import assert from 'node:assert/strict';
import GTA from '../analytics.js';

/* Backup v1 reale (gymtracker-backup-2026-10-17.json), ridotto ma fedele. */
const backupV1 = {
  v: 1,
  raw: { sessionB: { label: 'Sessione B', sections: [] } },
  log: [{
    id: 1792242153868, sid: 'sessionB', label: 'Sessione B',
    date: '2026-10-17T13:02:33.868Z', min: 4,
    sets: {
      'Stacco rumeno (RDL)': [
        { kg: 45, reps: 8 }, { kg: 45, reps: 8 }, { kg: 45, reps: 8 }, { kg: 45, reps: 8 }, { kg: 45, reps: 8 },
      ],
      'Overhead press bilanciere': [
        { kg: 25, reps: 8 }, { kg: 25, reps: 8 }, { kg: 25, reps: 8 }, { kg: '25', reps: '6' },
      ],
      'Trazioni alla sbarra (pronazione)': [{ kg: 70, reps: 6 }],
      'Lateral raise manubri': [{ kg: '7,5', reps: 10 }, { kg: 7.5, reps: 10 }],
      'Zavorrata fatta male': [{ kg: 80, reps: 0 }],
    },
  }],
};

test('slug: stabile, senza accenti né punteggiatura', () => {
  assert.equal(GTA.slug('Stacco rumeno (RDL)'), 'stacco-rumeno-rdl');
  assert.equal(GTA.slug('Curl manubri su panca inclinata (45-60°)'), 'curl-manubri-su-panca-inclinata-45-60');
  assert.equal(GTA.slug('Leg curl SEDUTO'), 'leg-curl-seduto');
});

test('migrateWorkoutV1: v1 → v2 (id da nome, set invalidi droppati, numeri normalizzati)', () => {
  const w = GTA.migrateWorkoutV1(backupV1.log[0]);
  assert.equal(w.sessionId, 'sessionB');
  assert.equal(w.sessionLabel, 'Sessione B');
  assert.equal(w.durationMin, 4);
  assert.equal(w.date, '2026-10-17T13:02:33.868Z');
  assert.equal(w.exercises.length, 4);
  const rdl = w.exercises.find(e => e.id === 'stacco-rumeno-rdl');
  assert.equal(rdl.sets.length, 5);
  const ohp = w.exercises.find(e => e.id === 'overhead-press-bilanciere');
  assert.deepEqual(ohp.sets[3], { kg: 25, reps: 6 });
  const lat = w.exercises.find(e => e.id === 'lateral-raise-manubri');
  assert.deepEqual(lat.sets[0], { kg: 7.5, reps: 10 });
  assert.ok(!w.exercises.some(e => e.id === 'zavorrata-fatta-male'), 'set con reps=0 scartati');
  assert.ok(!('sets' in w) && !('sid' in w));
});

test('migrateLogV1: ordina per data desc e tollera array vuoti/nulli', () => {
  const log = GTA.migrateLogV1([
    { sid: 'sessionA', label: 'A', date: '2026-01-01T10:00:00.000Z', sets: { 'Esercizio X': [{ kg: 10, reps: 10 }] } },
    null,
    { sid: 'sessionB', label: 'B', date: '2026-02-01T10:00:00.000Z', sets: { 'Esercizio Y': [{ kg: 20, reps: 8 }] } },
  ]);
  assert.equal(log.length, 2);
  assert.equal(log[0].sessionId, 'sessionB');
  assert.equal(log[1].sessionId, 'sessionA');
  assert.deepEqual(GTA.migrateLogV1('x'), []);
});

test('migrateBackup: accetta v1 (raw → schedule) e v2, rifiuta payload estranei', () => {
  const b = GTA.migrateBackup(backupV1);
  assert.equal(b.v, 2);
  assert.equal(b.history.length, 1);
  assert.equal(b.schedule.source, 'imported');
  assert.equal(b.schedule.data.sessionB.label, 'Sessione B');

  const v2 = GTA.migrateBackup({
    schema: 'gymtracker.backup', v: 2,
    history: backupV1.log.map(w => GTA.migrateWorkoutV1(w)),
    schedule: { source: 'bundled' },
  });
  assert.equal(v2.history.length, 1);
  assert.equal(v2.schedule.source, 'bundled');

  assert.throws(() => GTA.migrateBackup(null));
  assert.throws(() => GTA.migrateBackup({ hello: 'world' }));
  assert.throws(() => GTA.migrateBackup({ v: 2, history: 'nope' }));
});

test('backupCounts + fingerprint', () => {
  const { history } = GTA.migrateBackup(backupV1);
  assert.deepEqual(GTA.backupCounts(history), { workouts: 1, sets: 12, exercises: 4 });
  assert.match(GTA.fingerprint('ciao'), /^[0-9a-f]{8}$/);
  assert.equal(GTA.fingerprint('x'), GTA.fingerprint('x'));
});

test('e1rm (Epley) e tonnage: corpo libero escluso dal tonnellaggio', () => {
  assert.equal(GTA.e1rm(100, 10), 100 * (1 + 10 / 30));
  assert.equal(GTA.e1rm(0, 12), 0, 'kg=0 → corpo libero, nessun e1RM');
  assert.equal(GTA.tonnageOfSets([{ kg: 40, reps: 10 }, { kg: 0, reps: 12 }, { kg: 20, reps: 5 }]), 500);
});

test('sessionStats: serie/ripetizioni/tonnellaggio e split per badge', () => {
  const { history } = GTA.migrateBackup(backupV1);
  const badges = { 'stacco-rumeno-rdl': 'Legs', 'overhead-press-bilanciere': 'Push' };
  const st = GTA.sessionStats(history[0], id => badges[id]);
  assert.equal(st.exercises, 4);
  assert.equal(st.sets, 12);
  assert.equal(st.tonnage, 5 * 45 * 8 + (3 * 25 * 8 + 25 * 6) + 70 * 6 + 2 * 7.5 * 10);
  assert.equal(st.byBadge.Legs.tonnage, 5 * 45 * 8);
  assert.equal(st.byBadge.Altro.sets, 3);
});

test('weeklyBuckets: raggruppa per settimana (lunedì) e ignora date fuori finestra', () => {
  const log = [
    { date: '2026-10-17T13:00:00.000Z', sessionId: 'sessionB', exercises: [{ id: 'e', name: 'E', sets: [{ kg: 40, reps: 10 }] }] }, // sabato → sett. lun 12
    { date: '2026-10-12T13:00:00.000Z', sessionId: 'sessionA', exercises: [{ id: 'e', name: 'E', sets: [{ kg: 30, reps: 10 }] }] }, // lunedì → stessa settimana
    { date: '2020-01-01T13:00:00.000Z', sessionId: 'sessionA', exercises: [] },
  ];
  const now = '2026-10-19T12:00:00.000Z'; // lunedì: settimana corrente = lun 19
  const b = GTA.weeklyBuckets(log, 4, now);
  assert.equal(b.length, 4);
  assert.deepEqual(b.map(x => x.workouts), [0, 0, 2, 0]);
  assert.equal(b[2].tonnage, 700);
});

test('frequency: questa settimana, ultime 4, streak (la settimana in corso non rompe)', () => {
  const mk = date => ({ date, sessionId: 'sessionA', exercises: [{ id: 'e', name: 'E', sets: [{ kg: 10, reps: 10 }] }] });
  const now = '2026-10-19T12:00:00.000Z'; // lunedì mattina: settimana appena iniziata
  const f = GTA.frequency([
    mk('2026-10-17T13:00:00.000Z'), // sabato → sett. lun 12
    mk('2026-10-14T13:00:00.000Z'), // mercoledì → stessa settimana
    mk('2026-10-05T13:00:00.000Z'), // settimana precedente
    mk('2026-09-28T13:00:00.000Z'),
  ], now);
  assert.equal(f.thisWeek, 0, 'settimana corrente appena iniziata, nessun allenamento');
  assert.equal(f.last4, 4);
  assert.equal(f.streak, 3, 'sett. corrente vuota non rompe lo streak');
  assert.equal(f.daysSinceLast, 1);
});

test('exerciseSeries + PR: cronologia, progressione e delta ultima/precedente', () => {
  const mk = (date, kg, reps) => ({
    date, sessionId: 'sessionA', exercises: [{ id: 'panca', name: 'Panca', sets: [{ kg, reps }] }],
  });
  const series = GTA.exerciseSeries([
    mk('2026-10-10T10:00:00.000Z', 60, 8),
    mk('2026-09-10T10:00:00.000Z', 55, 8),
    mk('2026-08-10T10:00:00.000Z', 50, 8),
  ], 'panca');
  assert.deepEqual(series.map(s => s.maxKg), [50, 55, 60]);
  const pr = GTA.exercisePR(series);
  assert.equal(pr.bestKg.maxKg, 60);
  assert.equal(pr.last.maxKg, 60);
  assert.equal(pr.deltaKg, 5);
  assert.ok(Math.abs(pr.deltaE1RM - (pr.last.e1RM / pr.prev.e1RM - 1) * 100) < 0.011);
  assert.equal(GTA.exercisePR([]), null);
});

test('compareSessions: ultima vs precedente della stessa sessione', () => {
  const mk = (date, kg) => ({
    date, sessionId: 'sessionB', exercises: [{ id: 'e', name: 'E', sets: [{ kg, reps: 10 }] }],
  });
  const c = GTA.compareSessions([mk('2026-10-17T10:00:00.000Z', 50), mk('2026-10-10T10:00:00.000Z', 40)], 'sessionB');
  assert.equal(c.delta.tonnage, 100);
  assert.equal(c.delta.tonnagePct, 25);
  const only = GTA.compareSessions([mk('2026-10-17T10:00:00.000Z', 50)], 'sessionB');
  assert.equal(only.prev, null);
  assert.equal(only.delta, null);
  assert.equal(GTA.compareSessions([], 'sessionB'), null);
});

test('uniqueExercises: dedup per id in ordine alfabetico', () => {
  const log = [
    { date: '2026-10-01', exercises: [{ id: 'b', name: 'Bicep' }, { id: 'a', name: 'Affondo' }] },
    { date: '2026-10-08', exercises: [{ id: 'b', name: 'Bicep' }] },
  ];
  assert.deepEqual(GTA.uniqueExercises(log), [{ id: 'a', name: 'Affondo' }, { id: 'b', name: 'Bicep' }]);
});
