import {timeBounds} from './timeRange';
import type { Filters, LogRow, Summary } from '../types';
export const emptyFilters: Filters = { from: '', to: '', ip: '', method: '', path: '', status: '', ua: '', keyword: '' };
export function createMatcher(f:Filters){const bounds=timeBounds(f.from,f.to);return(r:LogRow)=>r.timestamp >= bounds.from && r.timestamp < bounds.toExclusive && (!f.ip || r.ip === f.ip) && (!f.method || r.method === f.method) && (!f.path || (f.pathExact ? r.path === f.path : r.path.includes(f.path))) && (!f.status || (f.status.endsWith('xx') ? Math.floor(r.status / 100) === +f.status[0] : r.status === +f.status)) && (!f.ua || r.ua.toLowerCase().includes(f.ua.toLowerCase())) && (!f.keyword || r.raw.toLowerCase().includes(f.keyword.toLowerCase()));}
export function matches(r:LogRow,f:Filters){return createMatcher(f)(r);}
export function accumulator(grain: number) {
    let timedCount = 0, totalTime = 0;
    let count = 0, bytes = 0, min = Infinity, max = -Infinity;
    const ips = new Map<string, number>(), paths = new Map<string, number>(), buckets = new Map<number, number>();
    const statuses: Record<string, number> = {}, methods: Record<string, number> = {};
    const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    return { add(r: LogRow) { if(r.requestTime!=null){timedCount++;totalTime+=r.requestTime;} count++; bytes += r.bytes; min = Math.min(min, r.timestamp); max = Math.max(max, r.timestamp); inc(ips, r.ip); inc(paths, r.path); statuses[r.status] = (statuses[r.status] ?? 0) + 1; methods[r.method] = (methods[r.method] ?? 0) + 1; const t = Math.floor(r.timestamp / grain) * grain; buckets.set(t, (buckets.get(t) ?? 0) + 1); }, finish(): Summary { const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 10); let effective = grain; const span = max - min; if (Number.isFinite(span) && span / grain > 10000)
            effective = grain * Math.ceil(span / grain / 10000); const rebucket = new Map<number, number>(); for (const [time, n] of buckets) {
            const t = Math.floor(time / effective) * effective;
            rebucket.set(t, (rebucket.get(t) ?? 0) + n);
        } return { timedCount, averageRequestTime:timedCount?totalTime/timedCount:null, grain: effective, count, bytes, ips: ips.size, min, max, statuses, methods, topIPs: top(ips), topPaths: top(paths), buckets: [...rebucket].sort((a, b) => a[0] - b[0]) }; } };
}
export function fillBuckets(s: Summary, grain: number): [
    number,
    number
][] { if (!s.count)
    return []; grain = s.grain ?? grain; const map = new Map(s.buckets), start = Math.floor(s.min / grain) * grain, end = Math.floor(s.max / grain) * grain; const out: [
    number,
    number
][] = []; for (let t = start; t <= end; t += grain)
    out.push([t, map.get(t) ?? 0]); return out; }
