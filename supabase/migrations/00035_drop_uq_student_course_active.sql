-- Allow students to enroll in multiple classes of the same course.
-- The dupClass check in app code + uq on (student_id, class_id) already prevents
-- same-class duplicates, and the time-conflict check prevents scheduling overlaps.
DROP INDEX IF EXISTS uq_student_course_active;
