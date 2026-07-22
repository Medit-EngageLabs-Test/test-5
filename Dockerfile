# ── Stage 1: Build Angular frontend ──────────────────────────────────────────
FROM node:26-alpine AS frontend
WORKDIR /src
COPY App/frontend/package*.json ./
RUN npm install
COPY App/frontend/ .
# Regenerate the role constants from the App's role declaration, so the image
# always compiles against the roles.json it ships with (see /app/iam/roles.json
# in the runtime stage).
COPY .intelliflow/iam/roles.json /iam/roles.json
RUN node scripts/generate-app-roles.mjs /iam/roles.json && npx ng build --configuration production

# ── Stage 2: Build .NET backend + generate migrations SQL ─────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Version injected by deploy.yml (GitVersion, computed from the release tag).
# Local/CI builds without the arg fall back to a recognizable dev version.
ARG APP_VERSION=0.0.0-dev

# Restore tools (dotnet-ef) — manifest lives at root .config/dotnet-tools.json
COPY .config ./.config
RUN dotnet tool restore

# Restore dependencies (App.Platform is referenced by App)
COPY App/App.csproj ./App/
COPY App.Platform/App.Platform.csproj ./App.Platform/
RUN dotnet restore App/App.csproj

# Copy source and Angular build output
COPY App.Platform/ ./App.Platform/
COPY App/ ./App/
RUN rm -rf App/wwwroot
COPY --from=frontend /wwwroot ./App/wwwroot

# Publish
RUN dotnet publish App/App.csproj -c Release -o /out --no-restore /p:Version=$APP_VERSION

# Generate idempotent migrations SQL — applied by IntelliFlow at deploy time
# Run from App/ so dotnet ef can find the local tool via App/.config/dotnet-tools.json.
# --configuration Release matches the publish step; mkdir -p ensures the output dir exists.
RUN mkdir -p /out/db && \
    cd App && dotnet ef migrations script \
    --idempotent \
    --project App.csproj \
    --configuration Release \
    --output /out/db/migrations.sql \
    --no-build

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /out .
COPY .intelliflow ./.intelliflow
COPY .intelliflow/iam/roles.json ./iam/roles.json

ENTRYPOINT ["dotnet", "App.dll"]
