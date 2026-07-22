# Glossario — App IntelliFlow

> Questo documento descrive il dominio dal punto di vista dell'App — non di IntelliFlow. È scritto per l'agente AI che lavora in questo repository.

---

## IntelliFlow

La piattaforma che ospita questa App. IntelliFlow:
- provisiona il database, il routing e l'osservabilità
- riceve le Release via webhook da GitHub e avvia il deploy automatico
- monitora lo stato dell'App tramite Health Check

L'URL di IntelliFlow per questa App è in `.intelliflow/config`.

---

## App

Questa applicazione. Gira in un container Docker isolato con un database PostgreSQL dedicato. È raggiungibile tramite il sottodominio IntelliFlow assegnato al suo Slug.

---

## Creator

Chi possiede e dirige lo sviluppo di questa App. Non scrive codice direttamente: descrive a te (l'agente AI) cosa vuole realizzare.

---

## Macro-richiesta (Epic)

Una richiesta di sviluppo completa espressa dal Creator, dall'intervista iniziale fino alla release che la contiene. È tracciata come issue GitHub nel repo dell'App; le Feature che la compongono sono sue sub-issue.

---

## Feature

Una funzionalità autonoma individuata dentro una Macro-richiesta, descritta in linguaggio non tecnico e collaudabile dal Creator. È una sub-issue dell'epic; i Ticket che la realizzano sono sue sub-issue.

---

## Ticket

La più piccola unità di lavoro implementabile di una Feature: una slice verticale che, completata, produce un comportamento verificabile. Si chiude con il commit che la implementa.

---

## Index branch

Il branch di integrazione di una Macro-richiesta: raccoglie le Feature completate man mano che vengono mergiate, prima del rilascio in `main`. È effimero — nasce con la Macro-richiesta e si cancella dopo la release. Ne esiste al più uno attivo per volta.

---

## Collaudo

La fase in cui il Creator prova l'App avviata dall'agente, seguendo una checklist di azioni in linguaggio non tecnico. I feedback del Collaudo diventano nuove Feature della Macro-richiesta.

---

## Portal Contract

L'insieme di vincoli che questa App deve rispettare per funzionare in IntelliFlow. Definisce cosa IntelliFlow si aspetta dall'App (porta 8080, endpoint `/health`, struttura Dockerfile, meccanismo migrazioni) e cosa IntelliFlow garantisce all'App (database provisionato, connection string iniettata, routing HTTP).

Il contratto è documentato in `.intelliflow/portal-contracts/core.md`. Non violare questi vincoli.

---

## Capability

Una risorsa o servizio che IntelliFlow mette a disposizione di questa App. Ogni Capability attiva ha un file in `.intelliflow/capabilities/` che ne descrive i guardrail. La **presenza del file è la dichiarazione** che questa App usa quella Capability — non esiste un manifest separato.

Capability attive in questa App: vedere i file in `.intelliflow/capabilities/`.

## Agente AI

Questo repository è pensato per **Claude Code**. Il punto di ingresso è `AGENTS.md` nella root, letto nativamente; i comandi invocabili stanno in `.claude/skills/`. Un agente diverso può comunque lavorare nel repo (regime base, vedi `AGENTS.md`), ma non ha qui una configurazione dedicata.

Il contenuto canonico delle Capability vive sempre in `.intelliflow/capabilities/`, non duplicato per agente. Claude Code ha in aggiunta i wrapper in `.claude/skills/` per l'invocazione via slash-command (`/postgres-database`), ma il contenuto effettivo resta in `.intelliflow/capabilities/`.

---

## Release

L'atto di pubblicare una nuova versione di questa App. Una Release si crea aggiungendo un tag Git con versione semantica valida (`vX.Y.Z`). Il tag avvia automaticamente la pipeline CI/CD su GitHub, che costruisce l'immagine Docker e notifica IntelliFlow.

Prima di ogni Release, segui la checklist in `.intelliflow/portal-contracts/release.md`.

---

## Health Check

L'endpoint `GET /health` che IntelliFlow usa per sapere se l'App è operativa. Non rimuoverlo mai.

---

## Slug

L'identificatore URL-safe di questa App, assegnato da IntelliFlow alla creazione. Determina il sottodominio (`{slug}.portal.local`) e il nome del database. Non è modificabile dopo la creazione.

---

## Glossario italiano → inglese

Il Creator descrive l'App in italiano; identificatori, commenti e XML doc nel codice sono sempre in inglese (vedi lo standard di lingua in `AGENTS.md`). Perché la stessa idea non prenda rese diverse in punti diversi del codice — il caso concreto che ha motivato questa sezione: `StorageKey` in un punto, `CaricatoOid` in un altro, per lo stesso concetto — ogni termine di dominio va risolto **una sola volta** e registrato qui prima di riusarlo nel codice.

| Termine italiano | Identificatore inglese |
|---|---|
| _(nessun termine ancora registrato — la tabella si popola durante lo sviluppo)_ | |

Aggiungi una riga per ogni nuovo termine quando lo risolvi con il Creator o quando emerge da una conversazione. Prima di introdurre un nuovo identificatore nel codice, controlla se il termine italiano corrispondente è già qui.
