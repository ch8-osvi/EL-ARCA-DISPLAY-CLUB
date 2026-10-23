export const ELTOQUE_REFRESH_MS = 60 * 60 * 1000;
export const ELTOQUE_STALE_MS = 2 * ELTOQUE_REFRESH_MS;

export function parseElToqueResponse(body: unknown, now = new Date()) {
  const data = body as { date?: unknown; hour?: unknown; minutes?: unknown; seconds?: unknown; tasas?: { USD?: unknown } };
  const rate = data?.tasas?.USD;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 1) throw new Error('USD/CUP inválido');
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('Fecha ausente o inválida');
  const day = Date.parse(data.date + 'T00:00:00Z');
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== data.date || Math.abs(Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00Z') - day) > 86400000) throw new Error('Fecha de elTOQUE fuera del período esperado');
  for (const [value, max] of [[data.hour, 23], [data.minutes, 59], [data.seconds, 59]] as const) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new Error('Hora de elTOQUE inválida');
  }
  // Provider time zone is unspecified: preserve its clock separately from fetchedAt.
  return { rate, providerDate: `${data.date} ${String(data.hour).padStart(2, '0')}:${String(data.minutes).padStart(2, '0')}:${String(data.seconds).padStart(2, '0')}`, periodFrom: new Date(now.getTime() - 86400000), periodTo: now };
}
