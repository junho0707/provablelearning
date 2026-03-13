import { CalendarEmbed } from '@/components/calendar-embed';

export default function AdminCalendarPage() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!calendarId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Calendar</h1>
          <p className="text-slate-500">Schedule overview for all classes.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-slate-500">
            Google Calendar ID not configured. Set the <code className="bg-slate-100 px-1 rounded">GOOGLE_CALENDAR_ID</code> environment variable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Calendar</h1>
        <p className="text-slate-500">Schedule overview for all classes.</p>
      </div>
      <CalendarEmbed calendarId={calendarId} height="75vh" />
    </div>
  );
}
