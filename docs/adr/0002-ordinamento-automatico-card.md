# Ordinamento automatico delle card, niente posizione manuale

Dentro ogni colonna le Attività sono ordinate da una regola fissa — **Urgenza (Alta→Bassa) → Scadenza crescente (senza scadenza in fondo) → Creazione (più recente prima)** — e non da una posizione scelta dall'utente. Di conseguenza il **drag&drop è abilitato solo tra colonne** (cambia lo Stato); il riordino manuale dentro una colonna non esiste.

## Considered Options

- **Posizione manuale persistita** (vero feeling Trello): l'utente compone l'ordine, campo `Position` da mantenere al drop. Scartato dal Creator a favore della regola automatica.
- **Ordinamento automatico (scelto)**: nessun campo posizione, ordine deterministico dai dati.

## Consequences

- Un lettore futuro (o un utente abituato a Trello) si aspetta di poter trascinare una card in alto nella stessa colonna: **non si può**. Il drop intra-colonna è disattivato di proposito per non promettere un riordino che il modello non mantiene (`/devil-advocate`, DA3). Questo ADR esiste per spiegare quell'assenza deliberata.
- L'Urgenza è sia indicatore visivo sia chiave di ordinamento primaria (decisione che ha superato la riapertura della domanda in fase di grilling).
