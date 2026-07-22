# App Template

Scaffold generato da [IntelliFlow](https://intelliflow.medit) per lo sviluppo di applicazioni ospitate sulla piattaforma.

## Sviluppo in Codespace

Il modo più semplice per iniziare è aprire un **GitHub Codespace**: l'ambiente è già configurato con .NET 10, Node.js, Angular CLI e Claude Code.

1. Apri il Codespace dal pulsante **Code → Codespaces** su GitHub.
2. Attendi il completamento del setup (qualche minuto alla prima apertura).
3. Autentica Claude Code — usa il pannello laterale dell'estensione, oppure lancia `claude` dal terminale e segui il prompt di login. L'autenticazione persiste tra i rebuild del container (volume dedicato su `~/.claude`).
4. Avvia l'applicazione dal menu **Terminal → Run Task → Run All** (oppure i task separati **Run Backend** e **Run Frontend**).
   - Backend disponibile su `http://localhost:5281`
   - Frontend disponibile su `http://localhost:4200`

## Sviluppo locale

Prerequisiti: .NET 10 SDK, Node.js LTS, Angular CLI 21, Docker.

```bash
# Avvia il database
docker compose -f docker-compose.dev.yml up -d

# Ripristina le dipendenze
dotnet restore App/App.sln
dotnet tool restore
cd App/frontend && npm install

# Avvia backend e frontend in terminali separati
dotnet run --project App/App.csproj
npm run start   # da App/frontend/
```

## Autenticazione in sviluppo

Senza `OIDC_ISSUER` l'App parte **senza autenticazione** (un warning viene loggato all'avvio): va bene per lavorare sulle funzionalità di business senza dover fare login ad ogni riavvio. Se `OIDC_ISSUER` è impostata, anche `OIDC_CLIENT_ID` e `OIDC_CLIENT_SECRET` diventano obbligatorie: il contratto OIDC viene iniettato sempre insieme, quindi mancarne una fa fallire l'avvio invece di degradare silenziosamente.

Per testare il flusso di login reale (BFF cookie + OIDC code flow, vedi `.intelliflow/portal-contracts/core.md`) contro il tenant Entra External ID di sviluppo/staging, configura tutte e tre le variabili tramite [User Secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets) — **mai** in `appsettings.json` o nel repository:

```bash
cd App
dotnet user-secrets set "OIDC_ISSUER" "https://{tenant}.ciamlogin.com/{tenant-id}/v2.0"
dotnet user-secrets set "OIDC_CLIENT_ID" "{app-registration-client-id}"
dotnet user-secrets set "OIDC_CLIENT_SECRET" "{client-secret}"
```

Chiedi al team/Operator i valori dell'App Registration di sviluppo sul tenant Entra External ID dedicato a staging/dev. Il client secret del tenant di produzione è invece iniettato ed è gestito interamente dal portale — non va mai copiato qui.
