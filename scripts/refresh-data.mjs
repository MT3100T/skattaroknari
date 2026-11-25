import { mkdir, writeFile } from 'node:fs/promises';

const api = 'https://skattaroknari.exactfolio2.chatgpt.site/api';
const directory = process.argv[2] ?? 'site/data';
const currentYear = new Date().getUTCFullYear();

const checks = {
  'exchange-rate': data => Number.isFinite(data.rate) && data.rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(data.through),
  trygdeavgift: data => Number.isFinite(data.rate) && data.rate > 0,
  'taks-rates': data => Boolean(data.church || data.deduction || Object.keys(data.fees ?? {}).length || Number.isFinite(data.foreignRate)),
};

for (let year = 2026; year <= currentYear + 1; year++) {
  await Promise.all(Object.entries(checks).map(async ([name, valid]) => {
    const folder = `${directory}/${year}`;
    try {
      const response = await fetch(`${api}/${name}?year=${year}`, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (String(data.year) !== String(year) || !valid(data)) throw new Error('No rates available');
      await mkdir(folder, { recursive: true });
      await writeFile(`${folder}/${name}.json`, JSON.stringify(data) + '\n');
    } catch (error) {
      console.warn(`${year} ${name}: ${error.message}. Keeping the previous file if available.`);
    }
  }));
}
