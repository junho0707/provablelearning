import { z } from 'zod';

const courseFields = z.object({
  subject: z.enum(['digital_rw', 'digital_math']),
  level: z.enum(['essentials', 'advanced']),
  name: z.string().min(1, 'Name is required').max(200),
  start_date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  end_date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  max_reenroll: z.number().int().min(1).max(10).default(3),
});

export const createCourseSchema = courseFields.refine(
  (data) => new Date(data.start_date) < new Date(data.end_date),
  { message: 'Start date must be before end date', path: ['end_date'] }
);

export const updateCourseSchema = courseFields
  .partial()
  .extend({ id: z.string().uuid() })
  .refine(
    (data) => {
      // Only validate date order if both dates are provided
      if (data.start_date && data.end_date) {
        return new Date(data.start_date) < new Date(data.end_date);
      }
      return true;
    },
    { message: 'Start date must be before end date', path: ['end_date'] }
  );

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
