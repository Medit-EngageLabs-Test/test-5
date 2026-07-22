# Real-time della board via SignalR, singola istanza, nessun backplane

La board è condivisa e le conversazioni sono fra utenti, quindi più client guardano lo stesso stato insieme: propaghiamo gli aggiornamenti (Attività create/spostate/modificate/eliminate, Commenti e Allegati aggiunti/rimossi) in tempo reale con un **hub SignalR**, scartato il polling perché il Creator ha chiesto il live vero.

## Status

accepted

## Considered Options

- **Polling / refetch periodico** — nessuna infrastruttura extra, "quasi live" con ritardo. Scartato: il Creator vuole aggiornamenti istantanei.
- **SignalR (scelto)** — WebSocket con fallback automatico dei trasporti.

## Consequences

- Il portal contract (`.intelliflow/portal-contracts/core.md`) **non documenta** il supporto WebSocket dell'ingress: ci affidiamo alla **negoziazione automatica dei trasporti** di SignalR (WebSocket → Server-Sent Events → long-polling), così il real-time funziona anche senza WS, solo meno efficiente. Rischio accettato in fase di design (`/devil-advocate`, DA2).
- Assunzione di **singola istanza** del container: nessun backplane. Se un domani l'App scala a più istanze, serve un **backplane Redis** (e una verifica esplicita del supporto WebSocket con l'Operator). Questo è il debito che questo ADR esiste per rendere visibile.
