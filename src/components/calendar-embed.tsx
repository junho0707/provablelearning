/**
 * Google Calendar embed — renders an iframe.
 * Works in both server and client components since it's just an iframe.
 */
export function CalendarEmbed({
  calendarId,
  height = '500px',
  title = 'Class Schedule',
}: {
  calendarId: string;
  height?: string;
  title?: string;
}) {
  const embedUrl = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=America/New_York&mode=MONTH`;

  return (
    <div className="border rounded-lg overflow-hidden" style={{ height }}>
      <iframe
        src={embedUrl}
        style={{ border: 0, width: '100%', height: '100%' }}
        title={title}
      />
    </div>
  );
}
