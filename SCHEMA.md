# Schema dei dati GymTracker

Questo documento descrive il formato dei backup e lo schema interno dello storico.
Versione schema: **2** (introdotta il 17/10/2026).

## Perché una versione esplicita

Il formato v1 (`{v:1, raw, log}`) indicizzava le serie per **nome visualizzato**
dell'esercizio: rinominare un esercizio nella scheda spezzava lo storico, non
c'era metadato sull'export e la scheda veniva duplicata in ogni backup.
Il formato v2 separa meta, scheda e storico, e introduce **id stabili**.

## Backup v2 (file esportato dall'app)

```json
{
  "schema": "gymtracker.backup",
  "v": 2,
  "exportedAt": "2026-10-17T20:00:00.000Z",
  "counts": { "workouts": 12, "sets": 320, "exercises": 14 },
  "schedule": {
    "source": "bundled",
    "fingerprint": "9f2c1a3b",
    "data": { }
  },
  "history": [
    {
      "id": 1792242153868,
      "sessionId": "sessionB",
      "sessionLabel": "Sessione B",
      "date": "2026-10-17T13:02:33.868Z",
      "durationMin": 4,
      "exercises": [
        {
          "id": "stacco-rumeno-rdl",
          "name": "Stacco rumeno (RDL)",
          "sets": [ { "kg": 45, "reps": 8 }, { "kg": 45, "reps": 8 } ]
        }
      ]
    }
  ]
}
```

| Campo | Significato |
| --- | --- |
| `schema` | Costante `gymtracker.backup`, identifica il file a colpo d'occhio. |
| `v` | Versione dello schema. `>= 2` → formato nuovo. |
| `exportedAt` | Timestamp ISO UTC dell'export. |
| `counts` | Contatori diagnostici (`workouts`, `sets`, `exercises` unici). |
| `schedule` | Solo se la scheda è **custom** (`source: "imported"` + `data`). Con scheda bundled viene omesso (`{"source":"bundled"}`) per non duplicare `scheda.json` in ogni backup. `fingerprint` è un hash FNV-1a della scheda. |
| `history` | Sedute ordinate per data decrescente. |

### Seduta (`history[]`)

| Campo | Tipo | Note |
| --- | --- | --- |
| `id` | number | Timestamp di salvataggio, univoco. Usato dal routing `#/s/:id`. |
| `sessionId` | string | Id della sessione nella scheda (`sessionA`, `sessionB`, …). |
| `sessionLabel` | string | Etichetta **al momento della seduta** (snapshot: leggibile anche se la scheda cambia). |
| `date` | string ISO | Inizio seduta. |
| `durationMin` | number | Durata in minuti (dall'avvio al termine). |
| `exercises[]` | array | Esercizi nell'ordine in cui sono stati registrati. |

### Esercizio (`exercises[]`)

| Campo | Tipo | Note |
| --- | --- | --- |
| `id` | string | **Id stabile**: slug del nome (`"Stacco rumeno (RDL)"` → `stacco-rumeno-rdl`), oppure `id` esplicito dichiarato nella scheda. |
| `name` | string | Nome visualizzato al momento della seduta. |
| `sets[]` | array | `{kg:number, reps:number}`. `kg = 0` indica corpo libero (visualizzato come `BW`, escluso dal tonnellaggio). |

## Id stabili degli esercizi

- `id = slug(nome)`: lowercase → rimozione accenti (NFD) → caratteri non
  alfanumerici diventano `-`. Implementato in `analytics.js` (`GTA.slug`).
- Per **rinominare un esercizio senza perdere lo storico** aggiungi un campo
  `id` esplicito nella scheda (vale solo per esercizi non superset):

  ```json
  { "id": "rdl", "name": "Stacco rumeno", "detail": "5 × 6–8 rip …" }
  ```

  Le sedute registrate in precedenza con lo slug del vecchio nome restano
  comunque visualizzabili: lo storico matcha per `id` **o** per nome.
- Nei superset (`"A + B"`) le parti separate non possono condividere lo stesso
  `id` esplicito: viene sempre usato lo slug di ciascun nome.

## Migrazione v1 → v2

Avviene **automaticamente al primo avvio** (`GTA.migrateLogV1`) e viene
risalvata in `localStorage`. Anche l'import dei backup accetta i vecchi file v1.

| v1 | v2 |
| --- | --- |
| `sid` | `sessionId` |
| `label` | `sessionLabel` |
| `min` | `durationMin` |
| `sets: { "Nome": [{kg,reps}] }` | `exercises: [{id: slug(Nome), name, sets}]` |
| `raw` (copia della scheda) | `schedule: {source:"imported", data}` |
| (assente) | `schema`, `v`, `exportedAt`, `counts` |

Le serie con `reps <= 0` vengono scartate; `kg`/`reps` stringa o con virgola
decimale vengono normalizzati a numero.

## Chiavi localStorage

| Chiave | Contenuto |
| --- | --- |
| `gt_log` | Storico sedute (schema v2, ordinato per data decrescente). |
| `gt_draft` | Allenamento in corso (transiente, indicizzato per nome, non fa parte dello schema persistente). |
| `gt_raw` | Scheda custom importata (formato file scheda, invariato). |

## Test

- `tests/analytics.test.mjs`: migrazione, slug, metriche (tonnellaggio, e1RM
  Epley, settimane, streak, PR, confronto sedute).
- `tests/app.smoke.test.mjs`: esegue `app.js` con un DOM stub in Node e
  verifica boot, migrazione e rendering delle viste.

```bash
node --test 'tests/*.test.mjs'
```
