-- What a learner is here for, captured on the profile so the tutor knows the goal before the first
-- session. Multi-valued: "keep up with class" and "prep for the SAT" are commonly both true.
--
-- Same vocabulary as `purchases.goal` (0004) rather than a second, parallel one — the First Session
-- goal is the single-pick version of this question, and two vocabularies would drift.
alter table learner_profiles
  add column purposes text[] not null default '{}';

alter table learner_profiles
  add constraint learner_profiles_purposes_valid
  check (purposes <@ array['strengths', 'test_prep', 'class_help']::text[]);
