# GymTracker

GymTracker è una Progressive Web App (PWA) semplice e installabile per registrare gli allenamenti con i pesi direttamente dal browser.

## Funzionalità

- Scheda di allenamento organizzata in sessioni, sezioni ed esercizi.
- Registrazione di carichi, ripetizioni e serie completate.
- Ripresa di un allenamento lasciato in corso.
- **Card "Ultimo allenamento"** in home: data, durata, serie, tonnellaggio e accesso al dettaglio.
- **Dettaglio seduta** (`#/s/:id`): totali, tabella per esercizio e confronto con la seduta precedente.
- **Analisi allenamento** (`#/stats`): frequenza e streak settimanale, confronto tra sessioni, progressione e PR per esercizio.
- **Grafici** (Chart.js): tonnellaggio per seduta, volume settimanale, split per gruppo muscolare, progressione 1RM/carico.
- Storico dei progressi per esercizio con selettore di metrica (carico massimo, 1RM stimato, tonnellaggio).
- Importazione ed esportazione dei dati in **backup versionato (schema v2)**, compatibile con i vecchi backup v1.
- Note scientifiche collegate alla scheda.
- Salvataggio locale tramite `localStorage`.
- Supporto offline tramite service worker.
- Tema chiaro/scuro in base alle preferenze del dispositivo.
- Interfaccia ottimizzata per smartphone e installabile come app.

## Struttura del progetto

| File | Ruolo |
| --- | --- |
| `index.html` | Markup e stili (CSS inline, tema chiaro/scuro). |
| `app.js` | Stato, routing, viste, grafici e azioni dell'app. |
| `analytics.js` | Modulo **puro** (nessun DOM): schema/migrazione backup e metriche. |
| `scheda.json` | Scheda di allenamento (sessioni, esercizi, note scientifiche). |
| `vendor/chart.umd.min.js` | [Chart.js 4.4.1](https://www.chartjs.org/) vendorizzato (MIT) per i grafici, funziona offline. |
| `sw.js` | Service worker (cache-first con aggiornamento in background). |
| `SCHEMA.md` | Documentazione dello schema backup v2 e della migrazione v1→v2. |
| `tests/` | Test Node (`node --test`): metriche, migrazione e smoke test delle viste. |

## Utilizzo

Apri `index.html` in un browser moderno oppure pubblica i file su un hosting statico.

Per eseguire il progetto con un server locale, dalla cartella del progetto puoi usare ad esempio:

```bash
npx serve .
```

Poi apri l'indirizzo indicato dal comando, normalmente `http://localhost:3000`.

## Test

I test girano con Node (nessuna dipendenza da installare):

```bash
node --test 'tests/*.test.mjs'
```

## Personalizzare la scheda

Modifica [`scheda.json`](./scheda.json) per aggiornare sessioni, esercizi e note scientifiche. La struttura del file contiene:

- le sessioni di allenamento;
- le sezioni di ogni sessione;
- gli esercizi, con serie, descrizione e badge;
- la sezione `scienza` con le note informative.

Per mantenere lo storico anche dopo la **rinomina** di un esercizio, aggiungi
un campo `id` stabile all'esercizio (vedi [SCHEMA.md](./SCHEMA.md)).

## Dati e privacy

I dati dell'allenamento vengono memorizzati localmente nel browser e non vengono inviati a un server. La cancellazione dei dati del sito o l'utilizzo di un browser diverso può rimuovere o non mostrare lo storico salvato.

Usa i comandi di esportazione e importazione presenti nell'app per trasferire o conservare una copia dei dati. I backup sono documentati in [SCHEMA.md](./SCHEMA.md): l'import accetta sia i vecchi file v1 sia i nuovi v2.

## Pubblicazione su GitHub Pages

Il progetto è composto da file statici e può essere pubblicato direttamente con GitHub Pages:

1. Vai nelle impostazioni del repository.
2. Apri **Pages** nella sezione **Code and automation**.
3. Seleziona il branch `main` e la cartella `/ (root)`.
4. Salva e apri l'URL fornito da GitHub.

## Licenza

Questo progetto non include attualmente una licenza esplicita. Chart.js (`vendor/chart.umd.min.js`) è distribuito sotto licenza MIT.
