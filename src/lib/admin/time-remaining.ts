/** "3h 20m" / "45m" — the format spec/14 §5 gives for the SMS worklist ("send this to X in 3h 20m"). */
export function formatTimeRemaining(minutesRemaining: number): string {
  if (minutesRemaining <= 0) return "now";
  const hours = Math.floor(minutesRemaining / 60);
  const minutes = minutesRemaining % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
