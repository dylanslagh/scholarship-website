-- Drop the Family Financial Information columns (2027 season).
--
-- The board doesn't weigh financial need — in practice every eligible applicant
-- is awarded — so the questions came off the form. The application code stopped
-- writing these columns in the same change; this file only cleans up the table.
--
-- NOT applied automatically, and deliberately not part of any deploy: dropping a
-- column is irreversible and the live database is shared by production and
-- preview. Nothing breaks if it is never run — the columns simply sit empty.
--
-- Apply with (one command per statement; the --file import API can reject these):
--   npx wrangler d1 execute andresen-scholarships --local  --command "ALTER TABLE applications DROP COLUMN financing_plan;"
--   ...and the same --remote once you're happy with the local result.

ALTER TABLE applications DROP COLUMN financing_plan;
ALTER TABLE applications DROP COLUMN work_during_school;
ALTER TABLE applications DROP COLUMN other_scholarships;
ALTER TABLE applications DROP COLUMN pct_parents;
ALTER TABLE applications DROP COLUMN parent_income;
ALTER TABLE applications DROP COLUMN num_dependents;
ALTER TABLE applications DROP COLUMN dependent_ages;
ALTER TABLE applications DROP COLUMN parent_occupations;
