export function formatMessageTime(date: string | Date) {
  if (!date) return "";

  const msgDate = new Date(date);
  // const now = new Date();

  // Create copies to compare dates (ignoring time)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const msgDateOnly = new Date(msgDate);
  msgDateOnly.setHours(0, 0, 0, 0);

  // Format the time part (e.g., "22:57")
  const timeString = msgDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false, // Set to true if you want "10:57 PM"
  });

  // Logic for the text prefix
  if (msgDateOnly.getTime() === today.getTime()) {
    return `today at ${timeString}`;
  } else if (msgDateOnly.getTime() === yesterday.getTime()) {
    return `yesterday at ${timeString}`;
  } else {
    // Older dates: "04/02/2026 at 22:57"
    const dateString = msgDate.toLocaleDateString("en-GB"); // en-GB gives DD/MM/YYYY
    return `${dateString} at ${timeString}`;
  }
}
