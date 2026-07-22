# Workflow di sviluppo dell'App

Il **lifecycle** con cui una richiesta del Creator diventa una release. È separato dalle skill: le skill (`/grilling`, `/to-spec`, `/implement`, …) dicono *come si pensa e si scrive*; questo file dice *come il lavoro attraversa tracker e branch*. `/grab` e `/pr` eseguono gli step qui descritti; gli hook in `.claude/settings.json` fanno rispettare i gate. I comandi del tracker (GitHub Issues, sub-issue, dipendenze, label) stanno in `docs/agents/issue-tracker.md`.

> **Presenza di questo file = regime autonomo**, garantito solo con Claude Code. Il portal contract (`.intelliflow/portal-contracts/git-workflow.md`) definisce i vincoli hard per qualunque agente; da un agente diverso applica le convenzioni ma resta nel regime base: conferma del Creator per ogni merge.

## Gerarchia del lavoro

| Livello | Che cos'è | Dove vive |
|---|---|---|
| **Macro-richiesta (epic)** | Una richiesta completa del Creator | Issue GitHub |
| **Feature** | Una funzionalità dentro la macro-richiesta | Sub-issue dell'epic |
| **Ticket** | La più piccola unità implementabile (slice verticale) | Sub-issue della feature |

Le dipendenze (tra feature e tra ticket) usano le **dependency native** di GitHub (`blocked_by`): non iniziare mai un item con blocker aperti.

## Modello di esecuzione: orchestratore + subagent

Il run è **una sessione orchestratrice** su **Opus/effort high**: tiene goal, pre-autorizzazione, filo del lifecycle e stato (ricostruibile da GitHub). Non scrive codice a mano — **delega a subagent Sonnet-medium**. Gli hook `pre-commit-guard`/`pre-push-guard` **scattano anche sui subagent** (ereditano `settings.json`), quindi il divieto di commit su `main`/`index/**` e di push su `main` vale identico: delegare non indebolisce l'enforcement.

- **Creazione dell'albero di issue** → fan-out di subagent **un livello per volta, con barriera** (epic → feature → ticket: il padre serve prima dei figli). La sessione base materializza la gerarchia in un **artefatto strutturato** (`title`/`body`/`labels`/`parent`/`blocked_by`); i subagent lo consumano sparando le `gh` in parallelo dentro ogni livello. Dà idempotenza (una `gh` fallita si ritenta dalla riga). Ottimizzazione di frangia: le chiamate al tracker sono ~5% dei turni.
- **Implementazione** → **seriale** (una branch di lavoro per volta), **un subagent per feature** in ordine di frontiera. Default **Sonnet-medium**, **escalation a Opus** sui ticket duri (auth/IAM, nuovo concetto di dominio, modifiche multi-layer). L'orchestratore fa `/grab`, spawna il subagent (implementa in TDD, committa `Closes #{ticket}`), poi `/pr`.

Il subagent parte con contesto vuoto ma **ricostruisce lo stato dall'issue** (spec nel body) e da `CONTEXT.md`/`AGENTS.md`, come dopo una compaction. L'orchestratore deve spawnarlo **con la postura del run** (pre-autorizzato; checkpoint delle skill → self-review) o fargliela rilevare dai segnali del run (index/epic branch o issue epic aperta): senza, il worker rilegge le regole generiche di conferma (CLAUDE.md globale) e si ferma a metà. Chi giudica "duro" è l'orchestratore, prima di spawnare; nel dubbio Sonnet — il park (3 CI rosse) intercetta i ticket sottostimati.

## Sequenza end-to-end

```
grilling (/grill-with-docs)            intervista al Creator, nessun branch
   → /devil-advocate                   contro-esame del design (obbligatorio);
                                       ogni finding chiuso da un ruling del Creator
   → bozza epic                        lista feature in linguaggio Creator
   → GATE 1: "ok" del Creator          da qui il run è autonomo
                                       (l'ok = pre-autorizzazione del run, vedi sotto)
   → definizione                       epic subito (registra l'ok del GATE 1),
                                       poi /to-spec e /to-tickets per ogni feature;
                                       TUTTE le feature prima di implementare
   → /grab <epic>                      crea index/{n}-{slug} da main
                                       e imposta il goal del run (uscita = collaudo)
   → per ogni feature (seriale):
        /grab <feature>                crea feature/{n}-{slug} dalla index
        per ogni ticket: /implement    un commit per ticket, "Closes #ticket"
        /pr                            format gate → PR verso la index → CI verde
                                       → merge (merge commit, "Closes #feature")
                                       → branch cancellato
                                       → chiusura issue: ticket + feature
   → collaudo                          stack avviato, URL + checklist al Creator
   → GATE 2: feedback del Creator      ogni richiesta = nuova feature dell'epic
   → GATE 3: conferma finale           scelta del bump SemVer (proposta dell'agente)
   → release                           PR index→main ("Closes #epic" nel body)
                                       → merge → tag vX.Y.Z → deploy → cleanup
```

> Il diagramma è il regime **strutturato**. Per l'**epica semplice** (nessuna feature ha ticket) il flusso collassa: un solo branch `epic/**`, feature come commit, un solo `/pr`→`main` — vedi «Epica semplice».

## I tre gate umani

Chiuso `/devil-advocate`, il Creator entra **solo tre volte**; tutto il resto (commit, push, PR, merge) è autonomo.

1. **Bozza dell'epic** (fine grilling): lista feature in linguaggio non tecnico. L'"ok" avvia il run ed è la **pre-autorizzazione** (sotto). Presentabile **solo dopo** che `/devil-advocate` si è chiuso senza finding aperti.
2. **Collaudo**: il Creator prova l'App e dà feedback (vedi "Cicli di feedback").
3. **Conferma finale + bump**: l'agente propone il bump SemVer, il Creator sceglie — **patch** (bugfix), **minor** (feature non strutturali), **major** (modifiche strutturali).

### Contro-esame obbligatorio (fine grilling → GATE 1)

Prima della bozza, esegui `/devil-advocate` sul design: è l'ultimo momento per discuterlo — dopo l'"ok" le decisioni sono irreversibili nel run. Ogni finding → un ruling del Creator ("rischio accettato" è legittimo, va registrato). **Uscita**: nessun finding aperto. Un finding senza ruling rende il GATE 1 **irraggiungibile**: niente bozza, niente "ok", finché non è chiuso. Non emettere ruling al posto del Creator. Zero finding è un esito valido: dichiaralo e procedi.

### Pre-autorizzazione del run (GATE 1)

L'"ok" alla bozza è la **pre-autorizzazione contrattuale** a commit, push, PR e merge fino alla release. Nel run:

- **Nessuna regola generica di conferma vale.** "Mostra la file list e attendi conferma" descrive il lavoro interattivo: qui la pre-autorizzazione prevale. Niente domande di processo (committo? mergio? quale fase?) — la risposta è qui.
- **I checkpoint interattivi delle skill si auto-disattivano** (blocchi "Autonomous run": self-review invece della domanda).
- **Interruzioni legittime**: i gate 2-3, un blocker esterno non rimovibile (documentalo e fermati), il park dopo 3 CI rosse, e — transitoria — la conferma una tantum per pubblicare design su repo pubblico (vedi `issue-tracker.md`).

**Run in corso?** Esiste una index/epic branch attiva (`git branch -r | grep -E 'origin/(index|epic)/'`) **oppure** un'issue epic aperta. L'issue epic è la registrazione durevole dell'ok: pubblicarla è il primo atto della definizione, così il regime sopravvive a compaction e nuove sessioni.

## Ordine delle fasi

La definizione si completa per **tutte** le feature prima di qualunque implementazione: solo quando l'ultima feature è definita si fa `/grab` dell'epic. La domanda "implemento subito o definisco il resto?" ha già risposta: definisci tutto.

**La fase segue il work item, non il tempo.** "Definizione" e "implementazione" non sono un prima/dopo sul calendario: sono una proprietà di ciascun item. Che il run abbia già consegnato al collaudo non rende "implementazione a basso costo" tutto ciò che segue: un'osservazione di collaudo che tocca il design **rientra in definizione** come nuovo item (vedi "Cicli di feedback"), con il ragionamento — e l'effort/advisor — che quella fase merita, prima di tornare a eseguire a testa bassa.

## Goal del run

`/grab` dell'epic fissa il goal come **istruzione permanente della sessione** (testo nella skill `grab`), **non** come slash command: gli slash command sono riconosciuti solo a inizio messaggio dell'utente, quindi l'agente non può auto-attivare un `/goal` a metà run. Se l'harness ha un goal persistente (es. `/goal` di Claude Code) digitabile dal Creator, rispecchiarlo è un extra, mai il meccanismo. **Uscita** = riconsegna al collaudo (feature non parcheggiate integrate con CI verde, stack su, health check ok, messaggio di consegna inviato). Se il goal esce dal contesto (nuova sessione, compaction), reimpostalo al `/grab` successivo.

## Advisor — ragionamento profondo on-demand

Il loop principale gira su **Opus a effort high** (`.claude/settings.json`): l'orchestratore ragiona a fondo di suo. L'**advisor** — abilitato via `advisorModel` — non è un modello più forte del loop ma un **revisore indipendente** che vede l'intero transcript: lo consulti ai punti-decisione per una seconda lettura dell'approccio, non a ogni turno. È complementare alla code-review di fine turno, che rivede il **diff** (vedi "Collaudo").

Consulta l'advisor:

- **prima di impegnarti su un approccio** non banale (scelta di design, struttura di una feature);
- **quando un errore ricorre** o un run CI resta rosso senza causa chiara;
- **prima di dichiarare finita** una fase (riconsegna al collaudo, release).

Disciplina «una tantum»: ogni chiamata rispedisce **l'intero contesto all'advisor, non cachato** — costa. Consultalo ai bivi, non come narrazione continua. Il loop gira già a effort alto: l'advisor non moltiplica il ragionamento del loop, offre un **punto di vista esterno** — perciò vale ai bivi, non come controllo continuo.

## Convenzione branch

Regola: **un branch su ogni nodo con figli, un commit su ogni foglia**. Al `/grab` dell'epic il regime si sceglie **dalla forma dell'albero**: nessuna feature ha ticket → *semplice*; almeno una ce l'ha → *strutturata*.

- **Strutturata**: `index/{n}-{slug}` da `main` (una sola attiva, effimera); `feature/{n}-{slug}` **dalla index** al `/grab` della feature — ogni feature ha il suo branch, anche con un ticket solo (sulla index non si committa). `/pr` mergia feature→index; PR finale index→`main`.
- **Semplice**: un solo branch `epic/{n}-{slug}` da `main` (nome scelto perché gli hook vietano i commit solo su `main`/`index/**`). Ogni feature è **un commit** (`Closes #{feature}`), senza `/grab` né `/pr` per-feature; un solo `/pr` `epic/**`→`main` alla fine (= Release).
- **Comune**: lavoro **seriale**, una sola branch attiva per volta; `{slug}` = titolo kebab-case, max 5 parole; branch effimeri, cancellati dopo il merge; mai commit diretti su `main`/`index/**` (`pre-commit-guard`), mai push diretto su `main` salvo tag `v*` (`pre-push-guard`).

## Epica semplice: le differenze di flusso

Da qui in giù il documento descrive il regime **strutturato**. Nell'epica semplice, **dove questo elenco contraddice le sezioni seguenti** (Commit e chiusure, Gate CI, Collaudo, Release, Abort) **vale questo elenco**; il resto (tre gate, `CONTEXT.md`, orchestratore+subagent) è identico.

- **Implementazione**: ogni feature è un commit su `epic/**` (seriale, un subagent Sonnet-medium per feature). Nessun feature branch, nessuna index.
- **Nessun `/pr` intermedio**: lo stato si legge dal git log (`Closes #{feature}` presente = fatta). I `blocked_by` non si sbloccano in corsa → regime adatto solo a epic con poche/zero dipendenze tra feature.
- **Nessun gate CI incrementale**: senza index né PR intermedie la CI non gira durante il run. Unico gate = la **PR finale** `epic/**`→`main`; la batteria `AGENT-CHECKLIST.md` §3, una volta prima di quella PR, è la verifica pre-release. Compromesso esplicito (App minime): niente rete CI in corsa, zero overhead per-commit.
- **Park non si applica** (niente CI per-feature da contare): una PR finale rossa si corregge su `epic/**` e si ri-pusha.
- **Chiusure**: le feature si chiudono al `/pr` finale (o in riconciliazione), non in corsa.
- **Collaudo**: dallo stesso `epic/**`.
- **Release**: il `/pr` `epic/**`→`main` (con `Closes #{epic}`; i `Closes #{feature}` sono già nei commit) è insieme chiusura e PR di release; poi tag e deploy.
- **Abort**: cancella `epic/{n}-{slug}` senza release, riapri le feature chiuse; l'epic resta aperto.

## Commit e chiusure (strutturato): issue chiusa = mergiata nella index

Un'issue (ticket o feature) è **chiusa quando è mergiata nella index**: è ciò che sblocca i `blocked_by` senza attendere la release.

- **Un ticket = un commit** sul feature branch, `Closes #{ticket}`. Sul branch lo stato si legge dal git log; i ticket restano aperti finché la feature non è mergiata.
- **Merge commit sempre, mai squash/rebase** (lo squash perde i `Closes`). Il merge commit feature→index porta `Closes #{feature}`.
- Al merge, **`/pr` chiude esplicitamente feature e ticket** (commento al merge). I `Closes` restano come link e rete di sicurezza su `main`.
- La PR index→`main` porta `Closes #{epic}`: l'epic si chiude alla release; la riconciliazione finale chiude i superstiti.

## Manutenzione di CONTEXT.md

A chiusura di ogni fase (merge feature, fine collaudo, release) consolida `CONTEXT.md`: nuovi termini di dominio (col glossario italiano→inglese, formato in `CONTEXT.md`) e decisioni sul linguaggio ubiquo. Se non è emerso nulla, non toccarlo.

## Gate CI (verde prima di ogni merge)

La CI gira sulle PR verso `main` **e verso `index/**`**. Nessun merge con CI rossa o pendente: `/pr` pusha, osserva (`gh run watch`, hook `post-push-ci-watch`) e mergia solo a verde. Enforcement lato agente (niente protezione server-side).

**Fail-fast locale (prima del push).** L'hook `fast-gate` esegue in locale il sotto-insieme veloce dei check della CI — format + build + unit test (backend), format + lint (frontend) — **solo sul lato toccato dal diff**, e blocca il push se falliscono. È **additivo**, non sostitutivo: la CI verde prima del merge resta il gate primario. I push di sola documentazione non vengono bloccati. Scopo: i giri di CI rossi — e la costosa rilettura dei loro log — non entrano nel percorso del run.

**Sintesi degli output CI, non il log integrale.** Quando leggi lo stato di un run CI, porta nel thread una **sintesi** — verde/rosso e i nomi dei test/step falliti — non il log completo. Il log integrale gonfia il contesto (e quindi il throughput del run) senza aggiungere segnale: apri il dettaglio del solo passo fallito, e solo se serve a diagnosticare.

## Politica di fallimento (park)

Massimo **3 run CI rossi consecutivi** sulla stessa feature. Al terzo: label `parked` (idempotente), commento con la diagnosi, PR in **draft** (non mergiare), e prosegui con la prossima feature **non bloccata** (chi dipende dalla parcheggiata resta bloccato). La consegna al collaudo dichiara feature completate e parcheggiate.

## Collaudo

**Code-review obbligatoria prima della consegna.** Prima di avviare lo stack e consegnare al Creator, esegui `/code-review` sul diff dell'intero turno di sviluppo (la index rispetto a `main`), con i subagent di revisione su **`opus` a effort medio/alto** (non `xhigh`). I rilievi bloccanti si risolvono prima della consegna; il ciclo review→fix rispetta la politica di park. La review rivede il **diff** (Standards + Spec); è complementare all'advisor, che durante il run rivede l'approccio. Si esegue **una volta per turno di sviluppo** (prima consegna e ogni ciclo di feedback), non per singola feature — il gate per-feature resta la CI verde.

Quando tutte le feature (non parcheggiate) sono mergiate nella index:

1. checkout della branch di lavoro, migrazioni sul db di sviluppo;
2. stack in background (compose, backend, frontend — runbook in `AGENT-CHECKLIST.md` §8);
3. **health check verificato** prima di dichiarare pronto;
4. `roles.json` verificato contro i ruoli usati dal codice (`AGENT-CHECKLIST.md` §4 riga 8);
5. messaggio al Creator: URL + **checklist di collaudo per feature in linguaggio non tecnico** + feature parcheggiate + debito dipendenze major (`release.md` §2);
6. stack acceso per tutta la durata dei feedback.

## Cicli di feedback

Ogni richiesta distinta del Creator = **nuova feature (sub-issue) dell'epic**, `bug` o `enhancement`, stesso ciclo `/to-tickets` → `/grab` → `/implement` → `/pr`. Rientra nella pre-autorizzazione (nessuna nuova conferma). Al `/grab` con index attiva, se il goal non è nel contesto, reimpostalo. `/to-spec` è **saltata di default**; valvola: se il feedback genera >~3 ticket o nuovi concetti di dominio, torna al giro completo di definizione.

**Triage a bias ottimista.** Nel dubbio, tratta il feedback come una **modifica piccola** e procedi (esecuzione diretta, definizione leggera): la valvola sopra è tarata su questo bias. Il rischio è sottovalutare un feedback, ed è **auto-corretto dal loop di collaudo** — ciò che sottovaluti, il Creator lo ri-segnala al giro dopo. L'auto-correzione vale per i feedback **osservabili dal Creator** (quasi tutti: prova l'App girante); implicazioni che il Creator non può vedere (modello di dominio, sicurezza, migrazioni) non si ri-segnalano da sole — se le intravedi, non applicare il bias.

## Release

Solo alla **conferma esplicita** del Creator, col bump scelto (GATE 3):

1. PR della branch di lavoro (`index/**` o `epic/**`) → `main` con `Closes #{epic}`; CI verde obbligatoria;
2. merge commit; la branch di lavoro viene cancellata;
3. tag `vX.Y.Z` e push (permesso dagli hook): parte il deploy;
4. **nessun bump nei sorgenti**: la versione la calcola GitVersion dal tag;
5. monitora la pipeline (hook `post-push-ci-watch`); l'App deve tornare `Running`;
6. **riconciliazione finale**: chiudi a mano le issue rimaste aperte (ticket/feature/epic) con un commento alla release;
7. cleanup: nessun branch oltre `main`.

## Abort del run

Se il Creator abbandona, la branch di lavoro viene cancellata **senza release**; le chiusure fatte ai merge vanno annullate:

1. **Riapri tutte le issue chiuse dell'albero dell'epic** (feature e ticket): attraversa tutte le feature, anche quelle aperte (un `/pr` interrotto può aver lasciato ticket chiusi sotto una feature aperta).
   ```bash
   gh api --paginate repos/{owner}/{repo}/issues/{epic-n}/sub_issues --jq '.[].number'
   gh issue reopen {n} --comment "Riaperta: run abortito, branch di lavoro cancellata senza release."
   ```
2. Cancella feature branch e index/epic branch (locale e remoto).
3. Lascia decadere il goal (l'istruzione permanente cessa con l'abort; se rispecchiato in `/goal`, `/goal clear`).
4. Commenta l'epic con l'esito. **L'epic resta aperto**: una ripresa riparte dalla definizione esistente.

## Dopo una compaction

Leggi questo file, poi il tracker (issue aperte dell'epic, blocker) e i branch (`git branch -a`). Lo stato è **interamente ricostruibile da GitHub** (issue + branch + PR): non tenere stato altrove.
