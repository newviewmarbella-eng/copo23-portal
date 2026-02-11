# Supabase management (CLI + migrations + Edge Functions)

This repository is prepared to manage Supabase using the Supabase CLI and GitHub Actions.

## Prerequisites

Set these environment variables locally (or via CI secrets):

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY` (required by `verify_pin` to read `public.accounting_members` when RLS is enabled)

## Local workflow

```bash
supabase login --token "$SUPABASE_ACCESS_TOKEN"
supabase link --project-ref "$SUPABASE_PROJECT_REF"
```

Apply migrations:

```bash
supabase db push
```

Deploy edge functions:

```bash
supabase functions deploy accounting_api --no-verify-jwt
supabase functions deploy verify_pin --no-verify-jwt
```

## Edge API contract

`accounting_api` uses POST with `action`:

- `upload-url`
- `save-invoice`
- `list`
- `download-url`
- `export-pdf`

`verify_pin` validates accounting PIN access.

## Storage bucket

Required bucket: `copo23-invoices`

- Bucket is created (or enforced) by migration.
- It is private (`public = false`).
- Access is intended through edge functions using signed URLs.

## CI deployment

Use workflow `.github/workflows/supabase-deploy.yml` and run it manually via `workflow_dispatch`.

### verify_pin secrets

`verify_pin` now uses the service-role client to validate any active PIN (`viewer`/`editor`/`manager`) and return the member `author`. If `SUPABASE_SERVICE_ROLE_KEY` is missing from Edge Function secrets, the function returns HTTP 500 with a clear configuration error.
