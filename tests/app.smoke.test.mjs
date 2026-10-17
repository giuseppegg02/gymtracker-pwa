/* Smoke test: esegue app.js con un DOM minimo stub in Node e verifica
   che le viste principali renderizzino (boot, migrazione, home, analisi,
   dettaglio seduta, storico esercizio). I grafici sono saltati (no Chart). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
require(path.join(root, 'analytics.js')); // popola global.GTA

/* Backup v1 di partenza (come gymtracker-backup-2026-10-17.json). */
const v1log = [{
  id: 1792242153868, sid: 'sessionB', label: 'Sessione B',
  date: '2026-10-17T13:02:33.868Z', min: 4,
  sets: {
    'Stacco rumeno (RDL)': Array.from({ length: 5 }, () => ({ kg: 45, reps: 8 })),
    'Overhead press bilanciere': [{ kg: 25, reps: 8 }, { kg: 25, reps: 6 }],
  },
}];

const makeEl = () => ({
  innerHTML: '', textContent: '', value: '', placeholder: '', accept: '', files: [],
  style: {}, dataset: {},
  classList: { toggle() {}, add() {}, remove() {} },
  addEventListener() {}, click() {},
  querySelector() { return null }, closest() { return null },
});

/* Esegue app.js da zero con l'hash dato e uno storage opzionale preseedato. */
function bootApp({ hash = '', storage = {} } = {}) {
  const els = new Map();
  const store = new Map(Object.entries(storage));
  global.document = {
    querySelector(sel) { if (!els.has(sel)) els.set(sel, makeEl()); return els.get(sel) },
    getElementById(id) { return els.get('#' + id) || null },
    addEventListener() {},
  };
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  global.location = { hash, replace(h) { this.hash = h } };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  global.addEventListener = () => {};
  global.scrollTo = () => {};
  global.scrollY = 0;
  global.fetch = async url => ({
    json: async () => JSON.parse(fs.readFileSync(path.join(root, String(url).replace('./', '')), 'utf8')),
  });
  const appPath = path.join(root, 'app.js');
  delete require.cache[require.resolve(appPath)];
  require(appPath);
  return { els, store, settle: () => new Promise(r => setTimeout(r, 30)) };
}

test('boot con log v1: migra in localStorage e la home mostra l\'ultimo allenamento', async () => {
  const { els, store, settle } = bootApp({ storage: { gt_log: JSON.stringify(v1log) } });
  await settle();
  const home = els.get('#app').innerHTML;
  assert.match(home, /Sessione A/);
  assert.match(home, /Sessione B/);
  assert.match(home, /Ultimo allenamento/);
  assert.match(home, /4 min · 7 serie · 2 esercizi/);
  assert.match(home, /data-go="#\/s\/1792242153868"/);
  const migrated = JSON.parse(store.get('gt_log'));
  assert.ok(Array.isArray(migrated[0].exercises), 'log migrato a v2 (exercises array)');
  assert.equal(migrated[0].sessionId, 'sessionB');
  assert.ok(!('sets' in migrated[0]) && !('sid' in migrated[0]));
  assert.ok(store.has('gt_draft') === false);
});

test('boot senza dati: home senza card ultimo allenamento, analisi con stato vuoto', async () => {
  const { els, settle } = bootApp({ hash: '#/stats' });
  await settle();
  assert.match(els.get('#app').innerHTML, /Nessun allenamento salvato/);
});

test('vista analisi: frequenza, grafici, confronto sessioni e progressione esercizio', async () => {
  const { els, settle } = bootApp({ hash: '#/stats', storage: { gt_log: JSON.stringify(v1log) } });
  await settle();
  const h = els.get('#app').innerHTML;
  assert.match(h, /Ultimo allenamento/);
  assert.match(h, /Frequenza/);
  assert.match(h, /Tonnellaggio per seduta/);
  assert.match(h, /Volume settimanale/);
  assert.match(h, /Split per gruppo muscolare/);
  assert.match(h, /Sessione B<\/b>/);
  assert.match(h, /Prima seduta registrata per questa sessione\./);
  assert.match(h, /<select id="exsel"/);
  assert.match(h, /miglior carico/);
  assert.match(h, /Stacco rumeno \(RDL\)/);
  assert.equal(els.get('#hd').innerHTML.includes('Analisi allenamento'), true);
});

test('vista dettaglio seduta: totali, delta e tabella esercizi', async () => {
  const { els, settle } = bootApp({ hash: '#/s/1792242153868', storage: { gt_log: JSON.stringify(v1log) } });
  await settle();
  const h = els.get('#app').innerHTML;
  assert.match(h, /kg totali/);
  assert.match(h, /Stacco rumeno \(RDL\)/);
  assert.match(h, /Overhead press bilanciere/);
  assert.match(h, /45×8/);
  assert.match(h, /BW×6|25×6/);
});

test('vista storico esercizio: metriche e lista sedute', async () => {
  const { els, settle } = bootApp({ hash: '#/h/Stacco rumeno (RDL)', storage: { gt_log: JSON.stringify(v1log) } });
  await settle();
  const h = els.get('#app').innerHTML;
  assert.match(h, /Carico max/);
  assert.match(h, /1RM stimato/);
  assert.match(h, /Tonnellaggio/);
  assert.match(h, /miglior carico/);
  assert.match(h, /1 sedute|sedute/);
});

test('scheda bundled: normalize separa i superset e assegna id stabili', async () => {
  const { els, settle } = bootApp({ storage: { gt_log: JSON.stringify(v1log) } });
  await settle();
  const scheda = JSON.parse(fs.readFileSync(path.join(root, 'scheda.json'), 'utf8'));
  const sup = scheda.sessionA.sections[1].exercises.find(e => String(e.name).includes(' + '));
  assert.ok(sup, 'la scheda contiene un superset');
  const home = els.get('#app').innerHTML;
  assert.match(home, /Sessione A/);
  // id stabili: gli storici v1 (nome) continuano a combaciare dopo la normalizzazione
  const GTA = global.GTA;
  assert.equal(GTA.slug('Stacco rumeno (RDL)'), 'stacco-rumeno-rdl');
});
