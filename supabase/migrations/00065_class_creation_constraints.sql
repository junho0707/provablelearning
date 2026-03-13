-- CHECK constraints from 00064 (use new enum values, must be in separate transaction)

-- LG requires both meeting days
ALTER TABLE classes ADD CONSTRAINT chk_lg_requires_two_days
  CHECK (
    group_size_type != 'large'
    OR (meeting_day_2 IS NOT NULL AND meeting_time_2 IS NOT NULL)
  );

-- 1:1 requires level = 'all_levels'
ALTER TABLE classes ADD CONSTRAINT chk_one_on_one_all_levels
  CHECK (
    group_size_type != 'one_on_one'
    OR level = 'all_levels'
  );

-- SG/LG cannot use digital_rw_math subject or all_levels level
ALTER TABLE classes ADD CONSTRAINT chk_group_no_rw_math
  CHECK (
    group_size_type = 'one_on_one'
    OR (subject != 'digital_rw_math' AND level != 'all_levels')
  );
