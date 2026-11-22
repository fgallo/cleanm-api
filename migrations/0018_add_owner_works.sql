-- The hours of a job are hours of cleaning, shared by the people who do it:
-- its helpers (job_helpers) and the owner of the business, on the visits the
-- owner works on. How many they are, and how long the visit takes them at the
-- house, is derived from that in the queries, never stored.
--
-- True unless said otherwise: a job with nobody assigned is done by the
-- owner, which is how every job without a helper read until now.
ALTER TABLE jobs
  ADD COLUMN owner_works boolean NOT NULL DEFAULT true;

-- Whether the owner works on the jobs the series generates.
ALTER TABLE recurring_series
  ADD COLUMN owner_works boolean NOT NULL DEFAULT true;
