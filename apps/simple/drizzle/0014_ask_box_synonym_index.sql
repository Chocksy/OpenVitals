-- Phase 17, trigger 5: the ask box searches `hkb_terms` by name and by
-- synonym. The name index landed with 0013; this is the synonym half, so
-- "POTS" and "EDS" reach the terms whose primary label spells them out.
CREATE INDEX IF NOT EXISTS "hkb_terms_synonyms_trgm_idx" ON "hkb_terms" USING gin (lower("synonyms"::text) gin_trgm_ops);
