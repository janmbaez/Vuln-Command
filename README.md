# VULN-COMMAND

VULN-COMMAND is a React + TypeScript vulnerability management dashboard for executive risk views, SLA tracking, CTEM maturity reporting, asset/team analysis, and CrowdStrike Falcon Spotlight workflows.

## Run Locally

```bash
pnpm install
pnpm --filter @workspace/vuln-mgmt dev
```

## Verify

```bash
pnpm run typecheck
pnpm --filter @workspace/vuln-mgmt build
```

## Docker Deployment

Build and run the production container locally:

```bash
pnpm docker:build
pnpm docker:up
```

Then open:

```text
http://localhost:8080
```

The container uses a multi-stage build:

- `node:22-alpine` installs workspace dependencies, typechecks, and builds the app.
- `nginxinc/nginx-unprivileged:1.27-alpine` serves the static app as a non-root user on port `8080`.
- Nginx provides SPA routing, a `/healthz` endpoint, security headers, static asset caching, and a `/cs-api` proxy target for CrowdStrike API calls when live mode is intentionally enabled.

Docker Compose reads these optional variables from your shell or `.env`:

```bash
APP_PORT=8080
BASE_PATH=/
VITE_ENABLE_CROWDSTRIKE_LIVE=false
VITE_AUTH_ENABLED=true
VITE_AUTH_PASSWORD_HASH=<generated-hash>
VITE_AUTH_SALT=<generated-salt>
```

Scale horizontally behind a reverse proxy or load balancer:

```bash
docker compose up --build --scale vuln-command=3
```

For multi-replica production deployments, keep this UI stateless and place shared persistence/API integrations behind a real backend service. The Docker image intentionally does not write vulnerability datasets to the container filesystem; browser storage remains the default for the static demo.

## Kubernetes Starter

A starter manifest is available at `deploy/k8s/vuln-command.yaml`.

Before applying it, replace the placeholder image:

```yaml
image: ghcr.io/OWNER/vuln-command:latest
```

Then deploy:

```bash
kubectl apply -f deploy/k8s/vuln-command.yaml
```

The manifest starts three replicas with readiness/liveness probes, resource limits, a read-only root filesystem, dropped Linux capabilities, and a ClusterIP service for ingress or load balancer attachment.

## Security Notes

- Do not commit real vulnerability exports, customer reports, sync logs, or `vuln-data.json`.
- The app includes a static password gate for demo deployments. It stores the login session in `sessionStorage`, expires idle sessions, and temporarily locks the form after repeated failures.
- Configure the password gate with `VITE_AUTH_PASSWORD_HASH` and `VITE_AUTH_SALT`; never store a plaintext password in `.env` or GitHub secrets.
- CrowdStrike Client Secret is session-only in the browser and is not written to `localStorage`.
- Public production builds disable live CrowdStrike API calls by default.
- To enable live CrowdStrike calls, deploy behind a trusted backend/proxy and set `VITE_ENABLE_CROWDSTRIKE_LIVE=true`.
- GitHub Pages/LinkedIn portfolio deployments should be demo-only and should not handle production API credentials.
- Static client-side login is not a replacement for server-side authentication. Keep sensitive datasets out of public builds.

## Login Setup

The demo login currently uses:

```text
Password: VulnCommand-WB9MHCf3!
```

This password is documented for demo access only. Once this repo is public, treat it as public too. For any private deployment, generate a new password and hash.

Create a salted SHA-256 hash for the deployment password:

```bash
AUTH_SALT='vuln-command-change-me' AUTH_PASSWORD='replace-me' node -e "const crypto=require('crypto'); console.log(crypto.createHash('sha256').update(process.env.AUTH_SALT + ':' + process.env.AUTH_PASSWORD).digest('hex'))"
```

For local development, copy `.env.example` to `artifacts/vuln-mgmt/.env` and set:

```bash
VITE_AUTH_ENABLED=true
VITE_AUTH_PASSWORD_HASH=<generated-hash>
VITE_AUTH_SALT=<generated-salt>
VITE_AUTH_SESSION_MINUTES=30
VITE_AUTH_MAX_ATTEMPTS=5
VITE_AUTH_LOCKOUT_MINUTES=10
```

The `.env` file should stay local and must not be committed. GitHub Pages should receive only the hash and salt through repository secrets.

To run locally without the password gate, set:

```bash
VITE_AUTH_ENABLED=false
```

## GitHub Pages Deployment

This repo includes `.github/workflows/deploy-vuln-command.yml`.

1. Push to `main`.
2. In GitHub, open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. The workflow builds `artifacts/vuln-mgmt` and publishes `artifacts/vuln-mgmt/dist/public`.

The workflow sets:

```bash
BASE_PATH=/<repository-name>/
VITE_ENABLE_CROWDSTRIKE_LIVE=false
VITE_AUTH_ENABLED=true
```

The workflow falls back to the documented demo password when no auth secrets are present. To use your own deployment password, add GitHub repository secrets:

- `VITE_AUTH_PASSWORD_HASH`
- `VITE_AUTH_SALT`

## Container Registry

This repo includes `.github/workflows/docker-image.yml`.

- Pull requests build the Docker image for validation.
- Pushes to `main` publish the image to GitHub Container Registry as `ghcr.io/<owner>/vuln-command`.
- The image uses the documented demo login unless `VITE_AUTH_PASSWORD_HASH` and `VITE_AUTH_SALT` secrets are configured.

## LinkedIn Sharing

After GitHub Pages publishes, share the Pages URL on LinkedIn with a short note that this is a sanitized portfolio/demo build. Do not attach real vulnerability reports or customer datasets.
