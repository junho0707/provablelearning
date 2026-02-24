export default function AdminCalendarPage() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!calendarId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Calendar</h1>
        <p className="text-gray-500">
          Google Calendar ID not configured. Set the <code>GOOGLE_CALENDAR_ID</code> environment variable.
        </p>
      </div>
    );
  }

  const embedUrl = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=America/New_York`;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Calendar</h1>
      <div className="border rounded-lg overflow-hidden" style={{ height: '75vh' }}>
        <iframe
          src={embedUrl}
          style={{ border: 0, width: '100%', height: '100%' }}
          title="Class Schedule Calendar"
        />
      </div>
    </div>
  );
}
