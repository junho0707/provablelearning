import { createClient } from '@/lib/supabase/server';
import { BookingWindowForm } from './form';

export default async function AdminBookingsPage() {
  const supabase = await createClient();

  const { data: window } = await supabase
    .from('booking_window')
    .select('window_start, window_end, updated_at')
    .eq('id', true)
    .single();

  // Upcoming confirmed bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, parent_name, parent_email, datetime, meeting_type, student_name, class_name, status, booking_type')
    .eq('status', 'confirmed')
    .gte('datetime', new Date().toISOString())
    .order('datetime', { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Consultation Bookings</h1>
        <p className="text-slate-500">Manage booking windows and upcoming consultations.</p>
      </div>

      <div className="border border-slate-200 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Booking Window</h2>
        <p className="text-sm text-slate-500 mb-4">
          Set the date range during which parents can book consultation slots (9am&ndash;2pm ET, weekdays).
          Clear both dates to disable bookings.
        </p>
        <BookingWindowForm
          windowStart={window?.window_start || ''}
          windowEnd={window?.window_end || ''}
        />
      </div>

      <div className="border border-slate-200 rounded-xl p-6">
        <h2 className="font-semibold mb-4">
          Upcoming Consultations ({bookings?.length || 0})
        </h2>
        {!bookings || bookings.length === 0 ? (
          <p className="text-sm text-slate-500">No upcoming consultations.</p>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => {
              const dt = new Date(b.datetime);
              return (
                <div key={b.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{b.parent_name}</p>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${b.booking_type === 'refund' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {b.booking_type === 'refund' ? 'Refund' : 'Initial'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{b.parent_email}</p>
                    {b.student_name && (
                      <p className="text-sm text-slate-600 mt-0.5">
                        Re: {b.student_name}
                        {b.class_name && ` - ${b.class_name}`}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">
                      {dt.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-slate-500">
                      {dt.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {b.meeting_type === 'meet' ? 'Google Meet' : 'Phone'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
