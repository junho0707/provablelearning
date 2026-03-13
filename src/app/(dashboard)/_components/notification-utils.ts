export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function getNotifDotColor(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('payment') || lower.includes('due') || lower.includes('deadline')) return 'bg-warning';
  if (lower.includes('spot') || lower.includes('available') || lower.includes('confirmed') || lower.includes('enrolled')) return 'bg-success';
  return 'bg-navy-400';
}
