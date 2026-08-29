ALTER TABLE "hkb_evidence" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "hkb_evidence" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hkb_evidence" ADD COLUMN "paper" jsonb;--> statement-breakpoint
UPDATE "hkb_evidence" SET "status" = 'rejected', "review_note" = 'rare-disease frequency mapped onto a common condition; not applicable', "reviewed_at" = now() WHERE "status" = 'proposed' AND "source" LIKE 'HPOA%';--> statement-breakpoint
UPDATE "hkb_evidence" SET "status" = 'rejected', "review_note" = 'rare-disease frequency mapped onto a common condition; not applicable', "reviewed_at" = now() WHERE "id" = 'hpoa_hypothyroidism_HP_0000716';
