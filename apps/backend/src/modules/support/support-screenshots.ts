/** Max attachments per support ticket (matches mobile UI). */
export const MAX_SUPPORT_SCREENSHOTS = 3;

export function ticketScreenshotUrls(ticket: {
  screenshotUrl: string;
  screenshotUrls?: string[];
}): string[] {
  const fromArray = (ticket.screenshotUrls ?? []).map((u) => u.trim()).filter(Boolean);
  if (fromArray.length > 0) return fromArray.slice(0, MAX_SUPPORT_SCREENSHOTS);
  const legacy = ticket.screenshotUrl?.trim();
  return legacy ? [legacy] : [];
}

export function primaryScreenshotUrl(urls: string[]): string {
  return urls[0] ?? '';
}
