# OCF staging setup checklist

## Current state

No staging database, Render service, Cloudflare Pages project, endpoint, or staging secret has been verified or created as part of this preparation. Values in `render.yaml.example` and `backend/.env.example` are templates only.

## Required provider setup

1. **Neon:** Use a project and branch dedicated to staging. Do not use, clone credentials from, or point staging at the production database or branch. For one-time migration and data scripts, use Neon’s **Direct** endpoint; the staging guard rejects pooled endpoints because the runner relies on a session-level advisory lock. Record the exact lowercase Direct endpoint hostname and database name. Keep the connection URL in a protected secret store; do not put it in source control or share it in chat.
2. **Render:** Create the backend as a Free web service from the intended repository and branch, using `backend` as the root directory and the build/start/health-check settings in `render.yaml.example`. The public Render service URL is not known yet.
3. **Cloudflare Pages:** Create the static frontend project from the intended repository and branch, with the repository root as the static output. Its production Pages origin is not known yet. In `index.html`, `window.__OCF_API_URL__` currently points to a Render backend; verify that it is the intended staging service before publishing the staging frontend. The backend `FRONTEND_URL` must be the exact Pages origin, with no path or trailing slash.

## Environment configuration

Configure the Render backend only after the Neon staging database and Pages origin are known:

| Variable | Value/source |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | The dedicated Neon **staging** connection URL only |
| `JWT_SECRET` | Generate through Render's protected environment settings |
| `JWT_EXPIRES_IN` | `7d` |
| `FRONTEND_URL` | Exact verified Cloudflare Pages origin |

The one-time staging migration and data scripts use a separate, explicit guard. When a migration or other one-time staging operation is separately approved, provide these values only to that local process from a protected local secret source:

| Variable | Value/source |
| --- | --- |
| `OCF_STAGING_ONLY` | Exact literal `YES` |
| `OCF_STAGING_DATABASE_URL` | Dedicated Neon staging **Direct** connection URL; never the production URL or a pooled URL |
| `OCF_STAGING_ALLOWED_DATABASE_HOST` | Exact lowercase Neon Direct hostname, verified independently in the Neon console |
| `OCF_STAGING_ALLOWED_DATABASE_NAME` | Exact database name, verified independently in the Neon console |

Do not set these one-time guard values by copying the production `DATABASE_URL`, and do not rely on `backend/.env` for the one-time runner. The runner does not load dotenv. The production command remains `npm run migrate` (`node migrations/migrate.js`); staging migrations remain separate as `npm run migrate:staging` (`node scripts/migrate-staging.js`).

## Before any staging initialization

- Confirm the Neon project, hostname, database name, and connection URL all belong to the new staging database.
- Confirm the Render runtime `DATABASE_URL` points to that same staging database and that `FRONTEND_URL` is the exact Pages origin.
- Confirm the Pages frontend is configured to call the verified Render service URL.
- Generate a unique staging admin password privately only when admin bootstrap is separately approved. The bootstrap script also requires `STAGING_ADMIN_EMAIL`; it refuses to create an admin unless the users table is empty.
- Decide whether to seed the sample staging catalog. The seed script refuses to run unless its application tables are empty.
- Take no migration, seed, admin-bootstrap, or deployment action until the provider values are independently checked and that next action is explicitly approved.

## Missing information

- Confirmation that separate Neon, Render, and Cloudflare accounts/projects are available and which repository branch should be used.
- The staging Neon hostname, database name, and protected connection URL (the URL must not be sent in chat).
- The Render service URL after service creation.
- The Cloudflare Pages project and exact public origin after project creation.
- The staging administrator email; a unique password should be generated privately at the separately approved bootstrap step.
- Whether the sample catalog should be seeded after migrations.
