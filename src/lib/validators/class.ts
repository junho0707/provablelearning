import { z } from 'zod';
import { GROUP_SIZE_RANGES } from '@/lib/constants';

const classFields = z.object({
  name: z.string().min(1, 'Name is required'),
  subject: z.enum(['digital_rw', 'digital_math', 'digital_rw_math']).nullable().optional(),
  level: z.enum(['essentials', 'advanced', 'all_levels']).nullable().optional(),
  group_size_type: z.enum(['one_on_one', 'small', 'large']),
  capacity: z.number().int().min(1).max(20),
  meeting_day: z.string().min(1, 'Meeting day is required'),
  meeting_time: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  meeting_day_2: z.string().nullable().optional(),
  meeting_time_2: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').nullable().optional(),
  class_start_date: z.string().nullable().optional(), // Required for LG, optional for SG/1:1
  class_end_date: z.string().nullable().optional(),
  enrollment_window_start: z.string().nullable().optional(),
  enrollment_window_end: z.string().nullable().optional(),
  google_meet_link: z.string().url().nullable().optional(),
  google_classroom_id: z.string().nullable().optional(),
});

export const createClassSchema = classFields
  .refine(
    (data) => {
      const range = GROUP_SIZE_RANGES[data.group_size_type];
      return data.capacity >= range.min && data.capacity <= range.max;
    },
    {
      message: 'Capacity must match group size type range',
      path: ['capacity'],
    }
  )
  .refine(
    (data) => {
      // LG requires start/end dates
      if (data.group_size_type === 'large') {
        return !!data.class_start_date && !!data.class_end_date;
      }
      return true;
    },
    {
      message: 'Large group classes require start and end dates',
      path: ['class_start_date'],
    }
  )
  .refine(
    (data) => {
      // LG requires meeting_day_2 + meeting_time_2
      if (data.group_size_type === 'large') {
        return !!data.meeting_day_2 && !!data.meeting_time_2;
      }
      return true;
    },
    {
      message: 'Large group classes require a second meeting day and time',
      path: ['meeting_day_2'],
    }
  )
  .refine(
    (data) => {
      // LG requires subject + level
      if (data.group_size_type === 'large') {
        return !!data.subject && !!data.level;
      }
      return true;
    },
    {
      message: 'Large group classes require subject and level',
      path: ['subject'],
    }
  )
  .refine(
    (data) => {
      // SG/1:1 should NOT have subject/level (subject-agnostic)
      if (data.group_size_type !== 'large') {
        return !data.subject && !data.level;
      }
      return true;
    },
    {
      message: 'Small group and 1:1 classes are subject-agnostic (subject/level set on enrollment)',
      path: ['subject'],
    }
  )
  .refine(
    (data) => {
      // If both enrollment window dates are set, end must be >= start
      if (data.enrollment_window_start && data.enrollment_window_end) {
        return data.enrollment_window_end >= data.enrollment_window_start;
      }
      return true;
    },
    {
      message: 'Enrollment window end date must be on or after the start date',
      path: ['enrollment_window_end'],
    }
  );

export const updateClassSchema = classFields
  .partial()
  .extend({ id: z.string().uuid() })
  .refine(
    (data) => {
      if (data.group_size_type && data.capacity !== undefined) {
        const range = GROUP_SIZE_RANGES[data.group_size_type];
        return data.capacity >= range.min && data.capacity <= range.max;
      }
      return true;
    },
    { message: 'Capacity must match group size type range', path: ['capacity'] }
  );

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
