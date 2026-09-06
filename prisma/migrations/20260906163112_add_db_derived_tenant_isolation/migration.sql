-- Sessione 8 — versionamento dell'hardening applicato manualmente in Sessione 7.
-- Contesto: role e tenantId vivevano in user_metadata, campo scrivibile dal
-- client. Le policy lo leggevano via auth.jwt(); anon e authenticated avevano
-- tutti i privilegi su public, rendendo PostgREST una seconda porta sui dati
-- che aggirava ruolo, paywall e crediti implementati in Express.
-- NB: migrazione Supabase-only (usa lo schema auth e i ruoli anon/authenticated).

-- 1. Abilitazione RLS.
-- NUOVO: non presente nell'SQL di S7 né in alcuna migrazione precedente.
-- Era stata accesa dal pannello Supabase. Senza questo blocco, un ripristino
-- ricreerebbe le policy su tabelle con RLS spenta: policy inerti, dati aperti.
ALTER TABLE public."Tenant"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Room"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Booking" ENABLE ROW LEVEL SECURITY;

-- 2. Revoca dei privilegi di default di Supabase su public.
-- Il frontend non usa PostgREST per i dati: nessun privilegio necessario.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- 3. Rimozione delle policy di scrittura.
-- Le scritture restano su Express, dove vivono ruolo, paywall e crediti.
-- Con RLS attiva l'assenza di policy È negazione.
DROP POLICY IF EXISTS "L'user può gestire solo il suo profilo" ON public."User";
DROP POLICY IF EXISTS "Consenti l'inserimento solo per il proprio Tenant" ON public."Room";
DROP POLICY IF EXISTS "Consenti la modifica solo per il proprio Tenant" ON public."Room";
DROP POLICY IF EXISTS "Consenti l'inserimento/modifica solo per il proprio Tenant" ON public."Booking";
DROP POLICY IF EXISTS "Consenti la modifica solo per il proprio Tenant" ON public."Booking";

-- 4. Funzione current_tenant_id().
-- Deriva il tenant dalla tabella User partendo da auth.uid(), che viene dal
-- claim sub ed è firmato, invece che da user_metadata.
-- STABLE           -> valutata una volta per query, non per riga
-- SECURITY DEFINER -> legge User senza passare dalle sue RLS (niente ricorsione)
-- SET search_path  -> impedisce a chi chiama di dirottare "User" su una tabella propria
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId" FROM "User" WHERE id = (SELECT auth.uid())::text
$$;

-- Le funzioni nascono con EXECUTE a PUBLIC: più largo del necessario.
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

-- 5. Policy SELECT derivate dal DB.
-- Struttura identica alle originali: cambia solo la sorgente del tenant.
-- is_recovery_session() invariata (guardia sessione di recupero password).
DROP POLICY IF EXISTS "L'user legge solo il suo profilo" ON public."User";
CREATE POLICY "L'user legge solo il suo profilo" ON public."User"
FOR SELECT
USING ((auth.uid())::text = id AND NOT is_recovery_session());

DROP POLICY IF EXISTS "Isolamento Multi-Tenant" ON public."Booking";
CREATE POLICY "Isolamento Multi-Tenant" ON public."Booking"
FOR SELECT
USING ("tenantId" = current_tenant_id() AND NOT is_recovery_session());

DROP POLICY IF EXISTS "Consente la lettura solo per il proprio Tenant" ON public."Room";
CREATE POLICY "Consente la lettura solo per il proprio Tenant" ON public."Room"
FOR SELECT
USING ("tenantId" = current_tenant_id() AND NOT is_recovery_session());

DROP POLICY IF EXISTS "Gli user vedono solo il proprio co-working" ON public."Tenant";
CREATE POLICY "Gli user vedono solo il proprio co-working" ON public."Tenant"
FOR SELECT
USING (id = current_tenant_id() AND NOT is_recovery_session());