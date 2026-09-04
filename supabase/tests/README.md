# Database tests

These run against a plain Postgres 16 + PostGIS instance — no Supabase needed —
by stubbing the handful of `auth` objects the schema depends on.

```bash
createdb toolr_test
psql -v ON_ERROR_STOP=1 -d toolr_test -f supabase/tests/_local_auth_stub.sql
psql -v ON_ERROR_STOP=1 -d toolr_test -f supabase/migrations/20260101000000_initial_schema.sql
psql -v ON_ERROR_STOP=1 -d toolr_test -f supabase/migrations/20260101000100_rpcs.sql
psql -d toolr_test -1 -f supabase/tests/guest_boundary.sql
psql -d toolr_test -1 -f supabase/tests/transaction_loop.sql
```

**These belong in CI.** Two of the assertions are the ones that matter most:

- no non-owner can read `tool_locations` (a leak there is a burglary tool);
- a guest session cannot insert a `borrow_request`.

If a future migration breaks either, the build should go red before the change
reaches a user.
