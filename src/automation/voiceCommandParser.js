export function normalizeVoiceCommand(transcript) {
  if (!transcript) {
    return "";
  }

  let cleaned = transcript.trim();
  cleaned = cleaned.replace(/^(nova|hey nova|ok nova|hey)\s+/i, "");
  cleaned = cleaned.replace(/^,/, "").trim();

  const lower = cleaned.toLowerCase();

  if (/^open\s+(calculator|calc|notepad|chrome|vscode|settings|spotify|whatsapp|youtube)/i.test(cleaned)) {
    return `<OPEN_APP>${cleaned.replace(/^open\s+/i, "").trim()}</OPEN_APP>`;
  }

  if (/^search\s+(for\s+)?/i.test(cleaned)) {
    const query = cleaned.replace(/^search\s+(for\s+)?/i, "").trim();
    return `<OPEN_URL>https://www.google.com/search?q=${encodeURIComponent(query)}</OPEN_URL>`;
  }

  if (/^go to\s+/i.test(cleaned)) {
    const url = cleaned.replace(/^go to\s+/i, "").trim();
    return `<OPEN_URL>${url}</OPEN_URL>`;
  }

  if (/^play\s+/i.test(cleaned)) {
    const query = cleaned.replace(/^play\s+/i, "").trim();
    return `<OPEN_URL>https://www.youtube.com/results?search_query=${encodeURIComponent(query)}</OPEN_URL>`;
  }

  if (/^what is/i.test(cleaned)) {
    const query = cleaned.replace(/^what is\s+/i, "").trim();
    return `<OPEN_URL>https://www.google.com/search?q=${encodeURIComponent(query)}</OPEN_URL>`;
  }

  return cleaned;
}
