-- DB migration: add title and poster_path to items table
-- Run once after updating the app (or include in your app init migration flow)

ALTER TABLE items ADD COLUMN title TEXT;
ALTER TABLE items ADD COLUMN poster_path TEXT;
