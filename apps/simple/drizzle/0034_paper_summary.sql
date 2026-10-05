-- The plain-words line per paper (lib/research-watch.ts explainPapers), written
-- once from the stored abstract and kept, so no page render calls a model.
ALTER TABLE "paper_watch" ADD COLUMN "summary" text;
