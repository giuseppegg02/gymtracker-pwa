/* GymTracker — modulo analytics: schema/migrazione backup + metriche.
   Funzioni PURE: nessun DOM, nessun Chart, testabili con node --test. */
(function (global) {
  'use strict';

  /* ---------- utilità ---------- */
  const slug = s => String(s == null ? '' : s).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  };

  /* 1RM stimato (Epley): kg × (1 + rip/30). Serie con kg<=0 (corpo libero) → 0. */
  const e1rm = (kg, reps) => {
    kg = num(kg); reps = num(reps);
    return kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0;
  };

  const tonnageOfSets = sets => (sets || []).reduce((a, s) => a + Math.max(0, num(s.kg)) * Math.max(0, num(s.reps)), 0);

  const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));

  /* ---------- schema/migrazione backup ---------- */
  /* v1 workout: {id, sid, label, date, min, sets:{nome:[{kg,reps}]}}
     v2 workout: {id, sessionId, sessionLabel, date, durationMin, exercises:[{id,name,sets}]} */
  function migrateWorkoutV1(w) {
    if (!w || typeof w !== 'object') return null;
    if (Array.isArray(w.exercises)) return w;                       // già v2
    const exercises = [];
    for (const [name, sets] of Object.entries(w.sets || {})) {
      const clean = (Array.isArray(sets) ? sets : [])
        .map(s => ({ kg: num(s && s.kg), reps: Math.round(num(s && s.reps)) }))
        .filter(s => s.reps > 0);
      if (clean.length) exercises.push({ id: slug(name), name, sets: clean });
    }
    return {
      id: w.id != null ? w.id : Date.now(),
      sessionId: w.sid || w.sessionId || 'unknown',
      sessionLabel: w.label || w.sessionLabel || w.sid || 'Sessione',
      date: w.date || new Date(0).toISOString(),
      durationMin: Math.max(0, Math.round(num(w.min != null ? w.min : w.durationMin))),
      exercises,
    };
  }

  function migrateLogV1(log) {
    if (!Array.isArray(log)) return [];
    return log.map(migrateWorkoutV1).filter(Boolean).sort(byDateDesc);
  }

  /* Normalizza un backup (v1 o v2) → {history, schedule}. Lancia Error se non è un backup. */
  function migrateBackup(b) {
    if (!b || typeof b !== 'object') throw new Error('non è un backup di GymTracker');
    const isV2 = Number.isFinite(b.v) && b.v >= 2;
    if (!isV2 && !Array.isArray(b.log)) throw new Error('non è un backup di GymTracker (campo log mancante)');
    if (isV2 && !Array.isArray(b.history)) throw new Error('backup v2 malformato (campo history mancante)');
    const history = (isV2 ? b.history : b.log).map(w => migrateWorkoutV1(w)).filter(Boolean).sort(byDateDesc);
    let schedule;
    if (isV2) schedule = b.schedule && b.schedule.data ? b.schedule : { source: 'bundled' };
    else schedule = b.raw ? { source: 'imported', data: b.raw } : { source: 'bundled' };
    return { history, schedule, v: 2 };
  }

  /* Contatori per i meta del backup. */
  function backupCounts(history) {
    const ids = new Set();
    let sets = 0;
    for (const w of history) for (const e of w.exercises || []) {
      ids.add(e.id); sets += (e.sets || []).length;
    }
    return { workouts: history.length, sets, exercises: ids.size };
  }

  /* Fingerprint FNV-1a (32 bit) di una stringa: identifica la scheda senza duplicate dati. */
  function fingerprint(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  /* ---------- metriche ---------- */

  /* Statistiche di una seduta. badgeOf(exId) opzionale → mappa badge per gruppo muscolare. */
  function sessionStats(w, badgeOf) {
    let sets = 0, reps = 0, ton = 0;
    const badges = {};
    for (const e of (w && w.exercises) || []) {
      for (const s of e.sets || []) {
        sets++; reps += Math.max(0, num(s.reps));
        const t = Math.max(0, num(s.kg)) * Math.max(0, num(s.reps));
        ton += t;
        const b = badgeOf ? (badgeOf(e.id) || 'Altro') : 'Altro';
        if (!badges[b]) badges[b] = { tonnage: 0, sets: 0 };
        badges[b].tonnage += t; badges[b].sets++;
      }
    }
    return {
      exercises: ((w && w.exercises) || []).length,
      sets, reps,
      tonnage: ton,
      durationMin: (w && w.durationMin) || 0,
      byBadge: badges,
    };
  }

  /* Settimana (lunedì) che contiene la data. */
  function weekStart(date) {
    const t = new Date(date);
    if (isNaN(t)) return null;
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return t;
  }

  const pad2 = n => String(n).padStart(2, '0');
  /* Chiave locale 'YYYY-MM-DD' (toISOString sposterebbe la data al fuso UTC). */
  const dayKey = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

  /* Ultime `count` settimane (la più recente per ultima): workout/serie/kg per settimana. */
  function weeklyBuckets(log, count, now) {
    count = count || 12;
    const cur = weekStart(now || new Date());
    if (!cur) return [];
    const buckets = [];
    const idx = new Map();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(cur); d.setDate(d.getDate() - i * 7);
      const key = dayKey(d);
      idx.set(key, buckets.length);
      buckets.push({ weekStart: key, workouts: 0, sets: 0, tonnage: 0 });
    }
    for (const w of log || []) {
      const ws = weekStart(w.date); if (!ws) continue;
      const i = idx.get(dayKey(ws));
      if (i == null) continue;
      const st = sessionStats(w);
      buckets[i].workouts++; buckets[i].sets += st.sets; buckets[i].tonnage += st.tonnage;
    }
    return buckets;
  }

  /* Frequenza: allenamenti questa settimana, ultime 4 settimane, streak, giorni dall'ultima seduta. */
  function frequency(log, now) {
    now = now ? new Date(now) : new Date();
    const w1 = weeklyBuckets(log, 1, now);
    const w4 = weeklyBuckets(log, 4, now);
    const thisWeek = w1.length ? w1[0].workouts : 0;
    const last4 = w4.reduce((a, b) => a + b.workouts, 0);
    /* Streak: settimane consecutive con >=1 allenamento; la settimana in corso, se vuota,
       non rompe lo streak. */
    const weeks = weeklyBuckets(log, 104, now);
    let streak = 0, started = false;
    for (let i = weeks.length - 1; i >= 0; i--) {
      const has = weeks[i].workouts > 0;
      if (!started) {
        if (has) { started = true; streak = 1; }
        continue;
      }
      if (has) streak++; else break;
    }
    const last = lastWorkout(log);
    const daysSinceLast = last ? Math.floor((now - new Date(last.date)) / 86400000) : null;
    return { thisWeek, last4, streak, daysSinceLast, avgPerWeek: log && log.length ? Math.round((last4 / 4) * 10) / 10 : 0 };
  }

  const lastWorkout = log => (log && log.length ? [...log].sort(byDateDesc)[0] : null);

  /* Serie cronologica (crescente) per un esercizio, per id stabile o nome. */
  function exerciseSeries(log, exId, exName) {
    const out = [];
    for (const w of [...(log || [])].sort(byDateDesc).reverse()) {
      const e = (w.exercises || []).find(e => e.id === exId || (exName && e.name === exName));
      if (!e) continue;
      let maxKg = 0, maxE1 = 0, bestReps = 0;
      for (const s of e.sets || []) {
        maxKg = Math.max(maxKg, num(s.kg));
        maxE1 = Math.max(maxE1, e1rm(s.kg, s.reps));
        bestReps = Math.max(bestReps, num(s.reps));
      }
      out.push({
        date: w.date, id: w.id, sessionId: w.sessionId, label: w.sessionLabel,
        sets: (e.sets || []).length, maxKg, e1RM: maxE1, bestReps,
        tonnage: tonnageOfSets(e.sets),
      });
    }
    return out;
  }

  /* PR + progressione: ultimo vs precedente, migliori valori. */
  function exercisePR(series) {
    if (!series || !series.length) return null;
    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;
    const bestKg = series.reduce((a, b) => (b.maxKg > a.maxKg ? b : a));
    const bestE1 = series.reduce((a, b) => (b.e1RM > a.e1RM ? b : a));
    const pct = (a, b) => (b && b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
    return {
      sessions: series.length, last, prev, bestKg, bestE1,
      deltaKg: prev ? last.maxKg - prev.maxKg : null,
      deltaE1RM: prev ? pct(last.e1RM, prev.e1RM) : null,
      deltaTonnage: prev ? pct(last.tonnage, prev.tonnage) : null,
    };
  }

  /* Confronto ultima vs precedente seduta della stessa sessione (A/B). */
  function compareSessions(log, sessionId) {
    const list = (log || []).filter(w => w.sessionId === sessionId).sort(byDateDesc);
    const last = list[0] || null;
    const prev = list[1] || null;
    if (!last) return null;
    const a = sessionStats(last), b = prev ? sessionStats(prev) : null;
    const pct = (x, y) => (y && y > 0 ? Math.round(((x - y) / y) * 1000) / 10 : null);
    return {
      last, prev, lastStats: a, prevStats: b,
      delta: b ? {
        tonnage: a.tonnage - b.tonnage, tonnagePct: pct(a.tonnage, b.tonnage),
        sets: a.sets - b.sets,
        durationMin: a.durationMin - b.durationMin,
      } : null,
    };
  }

  /* Elenco esercizi unici (id stabile) presenti nello storico, in ordine alfabetico. */
  function uniqueExercises(log) {
    const map = new Map();
    for (const w of log || []) for (const e of w.exercises || [])
      if (!map.has(e.id)) map.set(e.id, { id: e.id, name: e.name });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }

  const api = {
    slug, num, e1rm, tonnageOfSets,
    migrateWorkoutV1, migrateLogV1, migrateBackup, backupCounts, fingerprint,
    sessionStats, weekStart, weeklyBuckets, frequency, lastWorkout,
    exerciseSeries, exercisePR, compareSessions, uniqueExercises,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.GTA = api;
  else global.GTA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
