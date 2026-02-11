# Supabase management (CLI + migrations + Edge Functions)

This repository is prepared to manage Supabase using the Supabase CLI and GitHub Actions.

## Prerequisites

Set these environment variables locally (or via CI secrets):

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY` (required by `verify_pin` to read `public.app_pins` with RLS enabled)

## Run migrations

```bash
supabase login --token "$SUPABASE_ACCESS_TOKEN"
supabase link --project-ref "$SUPABASE_PROJECT_REF"
echo "y" | supabase db push
```

## Deploy Edge Functions

Run function deploys only after migrations succeed:

```bash
supabase functions deploy accounting_api --no-verify-jwt
supabase functions deploy verify_pin --no-verify-jwt
```

## Test `verify_pin`

```bash
curl -i -X POST https://<project>.supabase.co/functions/v1/verify_pin \
  -H "Content-Type: application/json" \
  -d '{"pin":"1111"}'
```

Expected response includes `valid: true`, `role: "viewer"`, `author: "Robbert"`.

## CI deployment

Use workflow `.github/workflows/supabase-deploy.yml` and run it manually via `workflow_dispatch`.
