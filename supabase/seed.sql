-- Seed practice Questions for the launch content slice (TASK-PRACTICE-001).
-- Every lesson_slug here MUST match a lesson node in roadmap/roadmap.json (used as the lesson
-- slug); the slug-integrity test guards against orphans. Production question edits are made via
-- admin CRUD (TASK-ADMIN-001); this seed makes a launch lesson practiceable and gives the pipeline
-- fixtures.

insert into questions (lesson_slug, position, type, prompt, choices, answer, tolerance, explanation) values
('fractions-definition', 1, 'mcq',
 'In the fraction 3/4, what does the denominator (4) tell you?',
 '[{"id":"a","label":"How many parts you have"},{"id":"b","label":"How many equal parts the whole is split into"},{"id":"c","label":"The total you started with"},{"id":"d","label":"Nothing — it is just decoration"}]',
 'b', null,
 'The denominator (the bottom number) says how many equal parts the whole is divided into. The numerator (top) counts how many of those parts you have.'),

('fractions-definition', 2, 'numeric',
 'A pizza is cut into 8 equal slices and you eat 3. Written as a fraction of the whole pizza, what is the denominator?',
 null, '8', 0,
 'The whole is split into 8 equal parts, so the denominator is 8. You ate 3 of them, giving the fraction 3/8.'),

('fractions-definition', 3, 'free',
 'In your own words, why do the parts of a fraction have to be equal in size?',
 null, null, null,
 'A fraction is an exact measurement of part of a whole, so each part must be the same size. If the pieces were uneven, "one piece" would not reliably mean the same amount — one slice could be far more than another, and the fraction would no longer describe a fair share of the whole.');
