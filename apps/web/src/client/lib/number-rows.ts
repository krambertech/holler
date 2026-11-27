export interface NumberRow {
  label: string;
  count: number;
  slackUserIds: string[];
}

const MOST_ROWS = 8;

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * power >= raw) ?? 10;
  return step * power;
}

const format = (n: number) => new Intl.NumberFormat().format(n);

export function numberRows(values: { value: number; slackUserId: string | null }[]): NumberRow[] {
  if (values.length === 0) return [];
  const distinct = [...new Set(values.map((v) => v.value))].sort((a, b) => a - b);
  if (distinct.length <= MOST_ROWS) {
    return distinct.map((value) => {
      const picked = values.filter((v) => v.value === value);
      return {
        label: format(value),
        count: picked.length,
        slackUserIds: picked.flatMap((v) => (v.slackUserId ? [v.slackUserId] : [])),
      };
    });
  }
  const min = distinct[0] ?? 0;
  const max = distinct.at(-1) ?? 0;
  const whole = values.every((v) => Number.isInteger(v.value));
  const width = niceStep((max - min) / (MOST_ROWS - 2));
  const start = Math.floor(min / width) * width;
  const rows: NumberRow[] = [];
  for (let low = start; low <= max; low += width) {
    const high = low + width;
    const last = high > max;
    const picked = values.filter(
      (v) => v.value >= low && (v.value < high || (last && v.value <= high)),
    );
    const top = whole && Number.isInteger(width) ? high - 1 : high;
    rows.push({
      label: `${format(low)}–${format(top)}`,
      count: picked.length,
      slackUserIds: picked.flatMap((v) => (v.slackUserId ? [v.slackUserId] : [])),
    });
  }
  return rows;
}
