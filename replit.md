# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

### Vulnerability Management Plan (`artifacts/vuln-mgmt`)

- **Type**: react-vite, frontend-only (no backend)
- **Preview path**: `/`
- **Purpose**: Interactive executive dashboard for vulnerability management presentations

**Pages:**
- `/` — Executive Summary with dynamic KPIs computed from real data
- `/vulnerabilities` — Filterable/sortable inventory with detail panel + delete
- `/metrics` — MTTR and trend charts
- `/risk` — Risk heatmap
- `/remediation` — Remediation plan milestones
- `/assets` — Asset risk profiles
- `/ctem` — CTEM Maturity Model (5 pillars, self-assessment, radar chart, roadmap)
- `/import` — CrowdStrike Falcon Spotlight CSV import + manual entry form

**Key Architecture:**
- `src/context/VulnerabilityContext.tsx` — Global state with localStorage persistence, CrowdStrike CSV parser, SLA constants exported
- `src/data/vulnerabilities.ts` — Vulnerability types + 150 real seed records from CrowdStrike Falcon CSV
- `src/data/metrics.ts` — Trend/KPI mock data
- Dashboard KPIs dynamically computed from context data (not hardcoded)
- SLA: Critical = 30 days, High = 60 days, Medium = 90 days, Low = 180 days
- CrowdStrike import maps exact columns: `Hostname`, `Vulnerability ID`, `ExPRT rating`, `Exploit status`, `Remediation`, `Status`, `Days open`
- "Reopened" status → "In Progress"; "Days open" format "65 days" parsed to integer
- CVSS derived from ExPRT rating + Exploit status (no CVSS column in CrowdStrike Spotlight)
- Team types extended: AppSec, CloudSec, NetSec, EndpointSec, Infrastructure, Database, Messaging
- AssetType extended to include Database

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
