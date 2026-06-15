import * as os from 'os';

const COLLECTOR_URL = 'http://localhost:3000/api/collect/metrics';
const DSN_KEY = process.env.DSN_KEY || '';

let prevCpus = os.cpus();

function getCpuPercent(): number {
  const cpus = os.cpus();
  let idleDiff = 0, totalDiff = 0;
  for (let i = 0; i < cpus.length; i++) {
    const prev = prevCpus[i].times;
    const curr = cpus[i].times;
    const prevTotal = Object.values(prev).reduce((a, b) => a + b, 0);
    const currTotal = Object.values(curr).reduce((a, b) => a + b, 0);
    idleDiff += curr.idle - prev.idle;
    totalDiff += currTotal - prevTotal;
  }
  prevCpus = cpus;
  if (totalDiff === 0) return 0;
  return Math.round((1 - idleDiff / totalDiff) * 1000) / 10;
}

export function startMetricsReporter(): void {
  if (!DSN_KEY) return;

  setInterval(async () => {
    const cpuPercent = getCpuPercent();
    const memUsedMb = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);

    await fetch(COLLECTOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-servermentor-dsn': DSN_KEY,
      },
      body: JSON.stringify([
        { name: 'cpu_usage_percent', value: cpuPercent, tags: { host: os.hostname() } },
        { name: 'memory_used_mb', value: memUsedMb, tags: { host: os.hostname() } },
      ]),
    });
  }, 10000);
}