-- Funzione di supporto: rileva se la sessione corrente è nata da un
-- flusso OTP (recovery password, magic link, inviti). Nel progetto
-- oggi l'unico flusso OTP attivo è il recovery password, quindi
-- equivale a "sessione di recupero password" — vedi nota nel
-- middleware Express requireAuth per lo stesso vincolo.
create or replace function public.is_recovery_session()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
    where entry ->> 'method' = 'otp'
  );
$$;

-- Booking
drop policy if exists "Consenti l'inserimento/modifica solo per il proprio Tenant" on public."Booking";
create policy "Consenti l'inserimento/modifica solo per il proprio Tenant"
on public."Booking"
as permissive
for insert
to authenticated
with check (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = "tenantId")
  AND (NOT is_recovery_session())
);

drop policy if exists "Consenti la modifica solo per il proprio Tenant" on public."Booking";
create policy "Consenti la modifica solo per il proprio Tenant"
on public."Booking"
as permissive
for update
to authenticated
using (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = "tenantId")
  AND (NOT is_recovery_session())
)
with check (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = "tenantId")
  AND (NOT is_recovery_session())
);

drop policy if exists "Isolamento Multi-Tenant" on public."Booking";
create policy "Isolamento Multi-Tenant"
on public."Booking"
as permissive
for select
to authenticated
using (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = "tenantId")
  AND (NOT is_recovery_session())
);

-- Room
drop policy if exists "Consente la lettura solo per il proprio Tenant" on public."Room";
create policy "Consente la lettura solo per il proprio Tenant"
on public."Room"
as permissive
for select
to authenticated
using (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = "tenantId")
  AND (NOT is_recovery_session())
);

drop policy if exists "Consenti l'inserimento solo per il proprio Tenant" on public."Room";
create policy "Consenti l'inserimento solo per il proprio Tenant"
on public."Room"
as permissive
for insert
to authenticated
with check (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = "tenantId")
  AND (NOT is_recovery_session())
);

drop policy if exists "Consenti la modifica solo per il proprio Tenant" on public."Room";
create policy "Consenti la modifica solo per il proprio Tenant"
on public."Room"
as permissive
for update
to authenticated
using (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = "tenantId")
  AND (NOT is_recovery_session())
)
with check (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = "tenantId")
  AND (NOT is_recovery_session())
);

-- Tenant
drop policy if exists "Gli user vedono solo il proprio co-working" on public."Tenant";
create policy "Gli user vedono solo il proprio co-working"
on public."Tenant"
as permissive
for select
to authenticated
using (
  (((auth.jwt() -> 'user_metadata'::text) ->> 'tenantId'::text) = id)
  AND (NOT is_recovery_session())
);

-- User
drop policy if exists "L'user può gestire solo il suo profilo" on public."User";
create policy "L'user può gestire solo il suo profilo"
on public."User"
as permissive
for all
to authenticated
using (
  ((auth.uid())::text = id)
  AND (NOT is_recovery_session())
)
with check (
  ((auth.uid())::text = id)
  AND (NOT is_recovery_session())
);