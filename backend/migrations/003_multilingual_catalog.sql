-- Add bilingual catalog fields while retaining the legacy English columns for
-- existing API clients and historical records.
ALTER TABLE products
  ADD COLUMN name_en VARCHAR(255),
  ADD COLUMN name_om VARCHAR(255),
  ADD COLUMN description_en TEXT,
  ADD COLUMN description_om TEXT;

ALTER TABLE categories
  ADD COLUMN name_en VARCHAR(255),
  ADD COLUMN name_om VARCHAR(255),
  ADD COLUMN description_en TEXT,
  ADD COLUMN description_om TEXT;

UPDATE products
SET name_en = COALESCE(name_en, name),
    description_en = COALESCE(description_en, description)
WHERE name_en IS NULL OR description_en IS NULL;

UPDATE categories
SET name_en = COALESCE(name_en, name),
    description_en = COALESCE(description_en, description)
WHERE name_en IS NULL OR description_en IS NULL;

ALTER TABLE products
  ALTER COLUMN name_en SET NOT NULL;

ALTER TABLE categories
  ALTER COLUMN name_en SET NOT NULL;

-- Rollback, if required after application compatibility has been confirmed:
-- ALTER TABLE products DROP COLUMN name_en, DROP COLUMN name_om,
--   DROP COLUMN description_en, DROP COLUMN description_om;
-- ALTER TABLE categories DROP COLUMN name_en, DROP COLUMN name_om,
--   DROP COLUMN description_en, DROP COLUMN description_om;
