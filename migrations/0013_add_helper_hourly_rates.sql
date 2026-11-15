-- What a helper is paid for an hour of work. The helper carries the usual
-- rate. A job carries its own only when that visit pays differently, and a
-- series carries the one its jobs are generated with: null on either means
-- the helper's usual rate applies.
ALTER TABLE helpers
  ADD COLUMN hourly_rate_cents integer CHECK (hourly_rate_cents >= 0);

ALTER TABLE jobs
  ADD COLUMN helper_hourly_rate_cents integer
    CHECK (helper_hourly_rate_cents >= 0);

ALTER TABLE recurring_series
  ADD COLUMN helper_hourly_rate_cents integer
    CHECK (helper_hourly_rate_cents >= 0);
