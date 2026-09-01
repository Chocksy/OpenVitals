-- Phase 28a item 4: the grading policy gave every RCT a B regardless of size.
-- PMID 39798266 randomised 46 people at one centre for 60 days; the fixed
-- policy (RCT_B_FLOOR = 100) reads that as C. saveInterventions uses
-- onConflictDoNothing, so the row on file never re-grades on its own.
UPDATE hkb_interventions
SET grade = 'C',
    population = 'patients with primary hypothyroidism with suboptimal response to stable levothyroxine therapy, n = 46'
WHERE id = 'int_hashimoto_whole_system_ayurveda_protocol_39798266';
--> statement-breakpoint
-- Same paper, second row (the WSAPH acronym made a second id). One paper, one row.
DELETE FROM hkb_interventions
WHERE id = 'int_hashimoto_whole_system_ayurveda_protocol_wsaph_39798266';
