# Triage Labels

Le skill usano cinque ruoli canonici di triage. Questo file mappa quei ruoli alle label GitHub effettivamente usate nel repo dell'App, più le label proprie del workflow.

## Ruoli canonici

| Ruolo canonico | Label GitHub | Significato |
|---|---|---|
| `needs-triage` | `needs-triage` | Da valutare prima di lavorarci |
| `needs-info` | `needs-info` | In attesa di informazioni dal Creator |
| `ready-for-agent` | `ready-for-agent` | Completamente specificata, pronta per l'agente |
| `ready-for-human` | `ready-for-human` | Richiede intervento umano |
| `wontfix` | `wontfix` | Non verrà portata avanti |

## Label del workflow

| Label | Significato |
|---|---|
| `parked` | Feature parcheggiata dopo 3 run CI rossi consecutivi (vedi `workflow.md`) |
| `bug` | Feedback di collaudo: malfunzionamento di qualcosa che doveva funzionare |
| `enhancement` | Feedback di collaudo: richiesta di qualcosa di nuovo |

## Creazione idempotente

Le label **non esistono di default** in un repo nuovo: garantiscile prima di applicarle, sempre con `--force` (aggiorna senza errore se esistono già):

```bash
gh label create <nome> --force --color <esadecimale> --description "..."
gh issue edit <n> --add-label "<nome>"
```

Quando una skill menziona un ruolo (es. "applica la label AFK-ready"), usa la stringa corrispondente della colonna "Label GitHub".
