import { z } from 'zod';

const makeupSessionFields = z.object({
  subject: z.enum(['digital_rw', 'digital_math']),
  level: z.enum(['essentials', 'advanced']),
  group_size_type: z.enum(['small', 'medium']),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  session_time: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  capacity: z.number().int().min(1).max(30),
  google_meet_link: z.string().url().nullable().optional(),
  location: z.string().nullable().optional(),
});

export const createMakeupSessionSchema = makeupSessionFields;

export const updateMakeupSessionSchema = makeupSessionFields
  .partial()
  .extend({ id: z.string().uuid() });

export type CreateMakeupSessionInput = z.infer<typeof createMakeupSessionSchema>;
export type UpdateMakeupSessionInput = z.infer<typeof updateMakeupSessionSchema>;
