export type UserRole = 'parent' | 'student' | 'admin';

export type GroupSizeType = 'one_on_one' | 'small' | 'medium' | 'large';

export type EnrollmentStatus = 'pending' | 'active' | 'completed' | 'refunded' | 'canceled';

export type CancellationStatus = 'cancelled' | 'rescheduled' | 'credit_issued' | 'expired';

export type MakeupBookingStatus = 'booked' | 'attended' | 'no_show' | 'cancelled';

export type WaitlistStatus = 'waiting' | 'notified' | 'expired' | 'converted';

export type MakeupWaitlistStatus = 'waiting' | 'notified' | 'expired' | 'booked';

export type Subject = 'digital_rw' | 'digital_math';

export type CourseLevel = 'essentials' | 'advanced';

export type StudentActiveStatus = 'active' | 'inactive';

export interface User {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  grade_level: number | null;
  active_status: StudentActiveStatus;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  subject: Subject;
  level: CourseLevel;
  name: string;
  start_date: string;
  end_date: string;
  max_reenroll: number;
  created_at: string;
}

export interface Class {
  id: string;
  course_id: string;
  group_size_type: GroupSizeType;
  capacity: number;
  meeting_day: string;
  meeting_time: string;
  google_meet_link: string | null;
  active: boolean;
  created_at: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  class_id: string;
  course_id: string;
  stripe_session_id: string | null;
  status: EnrollmentStatus;
  agreement_version: string | null;
  agreement_timestamp: string | null;
  created_at: string;
}

export interface WaitlistEntry {
  id: string;
  student_id: string;
  class_id: string;
  created_at: string;
  notified_at: string | null;
  status: WaitlistStatus;
}

export interface PerformanceLog {
  id: string;
  student_id: string;
  course_id: string;
  week_number: number;
  session_number: number;
  attendance: boolean;
  homework_completed: boolean;
  notes: string | null;
  created_at: string;
}

export interface Credit {
  id: string;
  student_id: string;
  group_size_type: GroupSizeType;
  amount: number;
  remaining_amount: number;
  reason: string;
  expires_at: string | null;
  created_at: string;
}

export interface AdminLog {
  id: string;
  admin_id: string;
  action: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface OfficeHours {
  id: string;
  meet_link: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  active: boolean;
  created_at: string;
}

export interface RefundRequest {
  id: string;
  enrollment_id: string;
  parent_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface MakeupBooking {
  id: string;
  cancellation_id: string;
  student_id: string;
  host_class_id: string;
  host_course_id: string;
  session_number: number;
  session_date: string;
  status: MakeupBookingStatus;
  created_at: string;
}
