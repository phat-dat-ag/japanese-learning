# Japanese Learning backend stack

Prerequisites: Docker with Linux containers and Docker Compose v2 or newer,
plus initialized Git submodules (`git submodule update --init --recursive`).
Application SDKs are not needed to build the images.

1. Copy `.env.example` to `.env` and set all three database passwords.
   Keep existing passwords when reusing database volumes; changing `.env`
   does not change stored database credentials. Follow the quoting notes in
   `.env.example`.
2. Provide a matching RSA PEM pair (at least 2048 bits, unencrypted private key):
   `secrets/jwt/private.pem` and `secrets/jwt/public.pem`.
   Alternatively run `pwsh -File ./scripts/generate-jwt-keys.ps1` (requires
   PowerShell and the .NET 9 SDK; refuses to overwrite existing keys).
   Both files must be readable by the .NET container user, UID 1654, with
   directory traversal permission. They are mounted read-only only into .NET.
   `.env` and `secrets/` are gitignored. Restart .NET after replacing keys.
3. Start from this directory:

   ```sh
   docker compose up --build
   ```

   Use `docker compose up --build -d` for detached mode, `docker compose ps -a`
   for status, and `docker compose logs user-api vocabulary-api` for app logs.

| Service | Host address | Container address |
| --- | --- | --- |
| MySQL (vocabulary only) | localhost:3306 | mysql:3306 |
| SQL Server (users only) | localhost:1433 | sqlserver:1433 |
| .NET User/Auth | http://localhost:8081 | http://user-api:8080 |
| Quarkus Vocabulary/Flashcard | http://localhost:8082 | http://vocabulary-api:8080 |

Readiness and public keys:

- .NET SQL-backed readiness: http://localhost:8081/health
- Public JWKS: http://localhost:8081/.well-known/jwks.json
- Quarkus health: http://localhost:8082/q/health
- Quarkus liveness: http://localhost:8082/q/health/live
- Quarkus readiness: http://localhost:8082/q/health/ready

Database healthchecks execute authenticated SQL queries. MySQL must be healthy
before vocabulary Flyway runs. SQL Server must be healthy before the idempotent
`sqlserver-init` creates `JapaneseLearningUser` if absent, then user Flyway runs.
Each application waits for its database healthcheck and successful Flyway exit.
Flyway and the database initializer are one-shot containers with no automatic
restart; an exit code of 0 is expected. Migration failures block application startup.

Quarkus starts after the .NET container starts and retries initial JWKS access
for up to 60 seconds; container startup alone does not guarantee Auth readiness.
The .NET runtime has no HTTP probe utility, so check its `/health` endpoint
externally. Quarkus uses its runtime's existing curl for a readiness healthcheck.
Both applications retain their Dockerfile non-root users and share the default
Compose network. Quarkus obtains public keys only from
`http://user-api:8080/.well-known/jwks.json`. JWT issuer/audience values in `.env`
configure both services consistently. Authentication and role restrictions remain
enabled. Angular and an API gateway are not part of this stack.

Stop containers with `docker compose stop`, or remove containers and the network
with `docker compose down`. Database named volumes survive both operations.
`docker compose down -v` deletes those volumes and their database contents;
do not use it unless intentionally resetting all local data.

---

# GIT SUBMODULE CHEAT SHEET

## Clone Repository + All Submodules

    git clone --recurse-submodules <REPOSITORY-URL>

## Initialize Submodules After Cloning

    git submodule update --init --recursive

## Check Submodule Status

    git submodule status

## Update All Submodules

    git submodule update --remote

## Update a Specific Submodule

    git submodule update --remote <SUBMODULE>

## Work in a Submodule

    cd <SUBMODULE>

    git switch <BRANCH>

    git pull

## Create a Feature Branch

    git switch -c feature/<FEATURE-NAME>

## Push a Branch for the First Time

    git push -u origin <BRANCH>

## Commit and Push Changes

    git add .
    git commit -m "<COMMIT-MESSAGE>"
    git push

## Return to Root Repository

    cd ..

## Update Root Repository with Submodule Changes

    git status
    git add <SUBMODULE>
    git commit -m "chore: update <SUBMODULE> submodule"
    git push

## Recreate a Local Branch from Remote

    git fetch origin
    git switch -c <BRANCH> --track origin/<BRANCH>