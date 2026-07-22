# Domain Docs

Come le skill devono consumare la documentazione di dominio di questo repository.

## Prima di esplorare, leggi questi file

- **`CONTEXT.md`** alla radice del repo — il glossario dell'App
- **`docs/adr/`** — leggi gli ADR che toccano l'area su cui stai lavorando

Se uno di questi file non esiste, **procedi silenziosamente**. Non segnalarne l'assenza e non suggerire di crearli in anticipo. La producer skill (`/grill-with-docs`) li crea in modo lazy quando i termini o le decisioni vengono effettivamente risolti.

## Usa il vocabolario del glossario

Quando il tuo output nomina un concetto di dominio (in un titolo di issue, una proposta di refactor, un'ipotesi, un nome di test), usa il termine come definito in `CONTEXT.md`. Non derivare verso sinonimi che il glossario evita esplicitamente.

Se il concetto che ti serve non è nel glossario, è un segnale — o stai inventando linguaggio che il progetto non usa (riconsideralo) o c'è una lacuna reale (annotala per `/grill-with-docs`).

## Segnala conflitti con gli ADR

Se il tuo output contraddice un ADR esistente, esplicitalo invece di sovrascriverlo silenziosamente:

> _Contraddice ADR-0002 — ma vale la pena riaprire perché…_
