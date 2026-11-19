# Security Policy

App Finanzas is a personal finance app intended for private use by individuals, family and friends. It does not connect to bank accounts; users manually enter the information they want to track.

## Public Repository Safety

This repository is safe to keep public because:

- Real Supabase credentials are not committed.
- `.env` and local environment files are ignored.
- Only `.env.example` is committed, with placeholder values.
- The app uses the Supabase anon key on the client, which is expected for Supabase apps.
- Sensitive database tables are protected with Row Level Security.
- The service role key must never be used in the mobile app or committed to the repository.

## Data Protection Model

- Supabase Auth identifies each user.
- Every private table stores `user_id`.
- RLS policies compare `auth.uid()` with `user_id`.
- Users can only read, create, update and delete their own rows.
- The local PIN protects the app on the device, but does not replace Supabase Auth or RLS.

## Secrets Handling

Required local variables:

```sh
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Do not commit:

- `.env`
- service role keys
- database passwords
- test account passwords
- production user data
- exported CSV backups with real financial data

## Reporting a Vulnerability

For now this is a personal project. Report security issues privately to the repository owner instead of opening a public issue with exploit details.

## Future Hardening

The next major hardening step is end-to-end or client-side encryption for financial amounts and notes. That requires a recovery strategy for the encryption key before it should be enabled.

