// Excel stores dates as day counts ("serials") and marks them only through the cell's number
// format. These helpers recognize date formats and print serials as readable dates.

// Built-in number formats that are dates or times ([MS-OI29500] / ECMA-376 18.8.30), including
// the East Asian locale ids 27-36 and 50-58.
const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

// Removes quoted text, escaped characters and [colour]/[condition] sections, which can contain
// letters that are not date codes ("[Red]", "\d", "days").
const codes = (format) => String(format ?? '')
  .replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?!h+\]|m+\]|s+\])[^\]]*\]/gi, '').replace(/_.|\*./g, '');

export function isDateFormat(id, format) {
  if (BUILT_IN_DATES.has(id)) return true;
  if (!format) return false;
  // Only the first section matters for positive numbers; "General" has no date codes.
  return /[dmyhs]/i.test(codes(format).split(';')[0]) && !/^general$/i.test(format.trim());
}

const pad = (value) => String(value).padStart(2, '0');

// Serial to text. The 1900 system counts from 1899-12-30 because Excel keeps Lotus's
// nonexistent 1900-02-29 (serial 60); serials before it are shifted by one day.
export function excelDateText(serial, date1904 = false, format = '') {
  if (!Number.isFinite(serial) || serial < 0) return String(serial);
  const cleaned = codes(format).split(';')[0];
  const hasTime = /[hs]/i.test(cleaned) || (!format && serial % 1 !== 0);
  const hasDay = /[dy]/i.test(cleaned) || (!hasTime && /m/i.test(cleaned)) || !format;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const days = !date1904 && serial < 61 ? serial + 1 : serial;
  const time = new Date(base + Math.round(days * 86_400_000 / 1000) * 1000);
  const day = `${time.getUTCFullYear()}-${pad(time.getUTCMonth() + 1)}-${pad(time.getUTCDate())}`;
  const seconds = /s/i.test(cleaned) ? `:${pad(time.getUTCSeconds())}` : '';
  const clock = `${pad(time.getUTCHours())}:${pad(time.getUTCMinutes())}${seconds}`;
  if (hasDay && hasTime && serial >= 1) return `${day} ${clock}`;
  if (hasTime && (serial < 1 || !hasDay)) return clock;
  return day;
}
