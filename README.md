# GymTracker

GymTracker è una Progressive Web App (PWA) semplice e installabile per registrare gli allenamenti con i pesi direttamente dal browser.

## Funzionalità

- Scheda di allenamento organizzata in sessioni, sezioni ed esercizi.
- Registrazione di carichi, ripetizioni e serie completate.
- Ripresa di un allenamento lasciato in corso.
- Storico dei progressi per esercizio.
- Importazione ed esportazione dei dati in formato JSON.
- Note scientifiche collegate alla scheda.
- Salvataggio locale tramite `localStorage`.
- Supporto offline tramite service worker.
- Tema chiaro/scuro in base alle preferenze del dispositivo.
- Interfaccia ottimizzata per smartphone e installabile come app.

## Utilizzo

Apri `index.html` in un browser moderno oppure pubblica i file su un hosting statico.

Per eseguire il progetto con un server locale, dalla cartella del progetto puoi usare ad esempio:

```bash
npx serve .
```

Poi apri l'indirizzo indicato dal comando, normalmente `http://localhost:3000`.

## Personalizzare la scheda

Modifica [`scheda.json`](./scheda.json) per aggiornare sessioni, esercizi e note scientifiche. La struttura del file contiene:

- le sessioni di allenamento;
- le sezioni di ogni sessione;
- gli esercizi, con serie, descrizione e badge;
- la sezione `scienza` con le note informative.

## Dati e privacy

I dati dell'allenamento vengono memorizzati localmente nel browser e non vengono inviati a un server. La cancellazione dei dati del sito o l'utilizzo di un browser diverso può rimuovere o non mostrare lo storico salvato.

Usa i comandi di esportazione e importazione presenti nell'app per trasferire o conservare una copia dei dati.

## Pubblicazione su GitHub Pages

Il progetto è composto da file statici e può essere pubblicato direttamente con GitHub Pages:

1. Vai nelle impostazioni del repository.
2. Apri **Pages** nella sezione **Code and automation**.
3. Seleziona il branch `main` e la cartella `/ (root)`.
4. Salva e apri l'URL fornito da GitHub.

## Licenza

Questo progetto non include attualmente una licenza esplicita.
