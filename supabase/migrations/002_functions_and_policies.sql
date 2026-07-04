-- ============================================================
-- Migration: 002_functions_and_policies.sql
-- Helper functions + service-role-only access model.
--
-- Access model (v1): ALL client data access is mediated by the Express
-- backend using the service-role key (which bypasses RLS). RLS is enabled
-- on every table (001) with NO permissive policies for anon/authenticated,
-- so direct client access via the publishable key is denied by default.
-- Realtime delivery uses server-side broadcasts to channels whose names
-- embed unguessable UUIDs handed out only through authenticated API calls.
-- ============================================================

-- Atomic demand-signal increment used by the busyness priority queue (§2.4.3)
CREATE OR REPLACE FUNCTION increment_demand_signal(p_place_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE place
  SET demand_signal = demand_signal + 1,
      last_signal_at = now()
  WHERE id = p_place_id;
$$;

REVOKE EXECUTE ON FUNCTION increment_demand_signal(UUID) FROM anon, authenticated;
