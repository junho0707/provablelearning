-- Enums for ProvableLearning
CREATE TYPE user_role AS ENUM ('parent', 'student', 'admin');
CREATE TYPE group_size_type AS ENUM ('one_on_one', 'small', 'medium', 'large');
CREATE TYPE enrollment_status AS ENUM ('pending', 'active', 'completed', 'refunded', 'canceled');
CREATE TYPE waitlist_status AS ENUM ('waiting', 'notified', 'expired', 'converted');
CREATE TYPE subject_type AS ENUM ('digital_rw', 'digital_math');
CREATE TYPE module_level AS ENUM ('essentials', 'advanced');
CREATE TYPE student_active_status AS ENUM ('active', 'inactive');
