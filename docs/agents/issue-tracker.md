# Issue tracker: GitHub Issues

Il lavoro di quest'App vive come **issue GitHub del repo dell'App stesso**: nessuno stato esterno. Usa la CLI `gh` per tutte le operazioni; il repo viene inferito da `git remote -v`.

## Lingua

Titoli, descrizioni e commenti delle issue sono scritti **in italiano**, nel linguaggio del Creator (non tecnico dove possibile). I termini tecnici e gli identificatori di codice restano nella forma originale.

## Gerarchia

| Livello | Come si rappresenta |
|---|---|
| **Macro-richiesta (epic)** | Issue normale; le feature sono sue sub-issue |
| **Feature** | Sub-issue dell'epic; il body ospita la spec (`/to-spec`) |
| **Ticket** | Sub-issue della feature; slice verticale implementabile |

### Creare la gerarchia

```bash
# 1. Crea l'issue (epic, feature o ticket)
gh issue create --title "..." --body "..."          # usa un heredoc per body multilinea

# 2. Collega il figlio al padre come sub-issue nativa.
#    Serve il DATABASE ID del figlio (campo .id), non il numero né il node_id:
CHILD_DB_ID=$(gh api repos/{owner}/{repo}/issues/{child-number} --jq .id)
gh api repos/{owner}/{repo}/issues/{parent-number}/sub_issues \
  --method POST -F sub_issue_id="$CHILD_DB_ID"
```

### Dipendenze (blocker)

Le dipendenze tra feature (e tra ticket) usano le **issue dependency native**:

```bash
# "child è bloccata da blocker" — anche qui serve il database id del blocker:
BLOCKER_DB_ID=$(gh api repos/{owner}/{repo}/issues/{blocker-number} --jq .id)
gh api repos/{owner}/{repo}/issues/{child-number}/dependencies/blocked_by \
  --method POST -F issue_id="$BLOCKER_DB_ID"
```

Un item è **sbloccato** quando tutti i suoi blocker sono chiusi. Il conteggio live è in `issue_dependencies_summary.blocked_by` (conta solo i blocker aperti):

```bash
gh api repos/{owner}/{repo}/issues/{number} --jq '.issue_dependencies_summary.blocked_by'
```

### Frontiera

Le sub-issue aperte di un padre, senza blocker aperti, nell'ordine delle sub-issue:

```bash
gh api repos/{owner}/{repo}/issues/{parent-number}/sub_issues \
  --jq '[.[] | select(.state == "open")] | .[].number'
# poi scarta quelle con blocked_by > 0
```

**Eccezione — ticket della feature in lavorazione**: sul feature branch i ticket restano aperti fino al merge nella index (vedi `docs/agents/workflow.md`), quindi la loro frontiera si legge dal **git log del branch**: un blocker con commit `Closes #{ticket}` già presente sul branch conta come fatto.

## Label

**Ogni label va garantita con creazione idempotente prima di applicarla** — `--force` aggiorna la label se esiste già, senza errore:

```bash
gh label create parked      --force --color D93F0B --description "Feature parcheggiata dopo 3 CI rossi"
gh label create bug         --force --color d73a4a --description "Feedback di collaudo: malfunzionamento"
gh label create enhancement --force --color a2eeef --description "Feedback di collaudo: richiesta nuova"
```

Applica e rimuovi con `gh issue edit <n> --add-label "..."` / `--remove-label "..."`. Il vocabolario completo (triage incluso) è in `docs/agents/triage-labels.md`.

## Operazioni comuni

- **Leggi una issue**: `gh issue view <n> --comments`
- **Lista issue aperte**: `gh issue list --state open --json number,title,labels`
- **Commenta**: `gh issue comment <n> --body "..."`
- **Chiudi** (riconciliazione manuale): `gh issue close <n> --comment "..."`

## Chiusure

Semantica, piazzamento dei riferimenti `Closes` e momento delle chiusure sono definiti in `docs/agents/workflow.md` («Commit e chiusure: issue chiusa = mergiata nella index»); la chiusura esplicita di feature e ticket la fa `/pr` al merge nella index. Fuori da `/pr`, chiusure e riaperture manuali sono solo la passata di riconciliazione finale e l'abort del run.

## Repo pubblici: conferma una tantum (transitoria)

Le issue ospitano contenuti di design (epic, spec, ticket). Su un **repo pubblico** quei contenuti sono leggibili da chiunque: prima della **prima** pubblicazione chiedi al Creator una conferma esplicita, una sola volta per repo — è una delle interruzioni legittime del run autonomo (vedi la pre-autorizzazione in `docs/agents/workflow.md`). La registrazione durevole della conferma è la label `public-design-ok` sul repo:

```bash
gh repo view --json visibility --jq .visibility        # PUBLIC / PRIVATE
gh label list --json name --jq '.[] | select(.name == "public-design-ok") | .name'
```

- Repo privato, o label presente → pubblica senza chiedere.
- Repo pubblico senza label → chiedi al Creator; al suo ok registra la conferma creando la label, poi pubblica:

  ```bash
  gh label create public-design-ok --force --color 0E8A16 \
    --description "Il Creator ha autorizzato la pubblicazione di contenuti di design su questo repo pubblico"
  ```

Policy **transitoria**: la direzione è rendere privati i repo delle App (piano GitHub Team); quando accadrà decadrà da sola (repo privato → nessuna domanda).

## Quando una skill dice "pubblica sull'issue tracker"

- La **bozza dell'epic** approvata dal Creator → issue epic. Prima di crearla, esegui il check dei repo pubblici (sezione sopra): è la prima pubblicazione di contenuti di design del run.
- **`/to-spec`** pubblica la spec di una feature → sub-issue dell'epic (o body della sub-issue già esistente).
- **`/to-tickets`** pubblica le slice → una sub-issue della feature per ticket, con le dipendenze `blocked_by` per i blocchi dichiarati.

## Quando una skill dice "recupera il ticket"

Esegui `gh issue view <n> --comments`.
