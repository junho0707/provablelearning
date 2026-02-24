import { z } from 'zod';
import { GROUP_SIZE_RANGES } from '@/lib/constants';

const classFields = z.object({
  course_id: z.string().uuid(),
  group_size_type: z.enum(['one_on_one', 'small', 'medium', 'large']),
  capacity: z.number().int().min(1).max(30),
  meeting_day: z.string().min(1, 'Meeting day is required'),
  meeting_time: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  google_meet_link: z.string().url().nullable().optional(),
});

export const createClassSchema = classFields.refine(
  (data) => {
    const range = GROUP_SIZE_RANGES[data.group_size_type];
    return data.capacity >= range.min && data.capacity <= range.max;
  },
  {
    message: 'Capacity must match group size type range',
    path: ['capacity'],
  }
);

export const updateClassSchema = classFields
  .partial()
  .extend({ id: z.string().uuid() })
  .refine(
    (data) => {
      // Only validate capacity range if both fields are provided
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
