import { describe, it, expect } from 'vitest';
import { parseLine, parseTime } from '../parsers/combined';
import { readLines } from '../parsers/chunks';
import { accumulator, matches, emptyFilters, fillBuckets } from '../analytics/query';
const line = (ip = '127.0.0.1', status = 200, path = '/api/users?page=1') => `${ip} - - [02/Nov/2026:14:23:15 +0800] "get ${path} HTTP/1.1" ${status} 1024 "-" "Mozilla/5.0 测试 \\"quoted\\""`;
describe('Combined 解析', () => {
    it('保留原始字段和查询参数并规范方法', () => { const raw = line(), r = parseLine(raw, 'a', 1)!; expect(r).toMatchObject({ ip: '127.0.0.1', method: 'GET', path: '/api/users', query: 'page=1', bytes: 1024, raw }); expect(r.ua).toContain('"quoted"'); });
    it('支持 IPv6 和 499', () => expect(parseLine(line('2001:db8::1', 499), 'a', 1)).toMatchObject({ ip: '2001:db8::1', status: 499 }));
    it('正确解析时区', () => { expect(parseTime('02/Nov/2026:14:23:15 +0800')).toBe(Date.parse('2026-11-02T06:23:15Z')); expect(parseTime('02/Nov/2026:01:23:15 -0500')).toBe(Date.parse('2026-11-02T06:23:15Z')); });
    it('拒绝非法时间', () => { for (const t of ['31/Feb/2026:14:23:15 +0800', '02/Nov/2026:24:23:15 +0800', '02/Nov/2026:14:23:15 +0860'])
        expect(() => parseTime(t)).toThrow(); });
    it('忽略空行，拒绝缺字段、无效状态码及未支持的扩展', () => { expect(parseLine('  ', 'a', 1)).toBeNull(); for (const s of ['invalid', line('x', 999), line() + ' 0.135 0.12'])
        expect(() => parseLine(s, 'a', 1)).toThrow(); });
    it('支持请求为横线', () => expect(parseLine('::1 - - [02/Nov/2026:14:23:15 +0800] "-" 400 - "-" "-"', 'a', 1)).toMatchObject({ method: '-', bytes: 0 }));
});
describe('流式文件读取', () => {
    it('跨块 UTF-8、CRLF、无结尾换行与行号', async () => { const got: [
        string,
        number
    ][] = []; await readLines(new Blob(['中文\r\n第二行\n末行']), async (s, n) => { got.push([s, n]); }, () => { }, () => false, 2); expect(got).toEqual([['中文', 1], ['第二行', 2], ['末行', 3]]); });
    it('流式 gzip', async () => { const stream = new Blob([line() + '\n' + line()]).stream().pipeThrough(new CompressionStream('gzip')); const blob = await new Response(stream).blob(); let n = 0; await readLines(blob, () => { n++; }, () => { }, () => false, 7, true); expect(n).toBe(2); });
    it('gzip 损坏会失败', async () => { await expect(readLines(new Blob(['bad']), () => { }, () => { }, () => false, 2, true)).rejects.toThrow(); });
    it('可取消读取', async () => { let n = 0; await expect(readLines(new Blob(['a\nb\nc']), () => { n++; }, () => { }, () => n === 1, 1)).rejects.toThrow('CANCELLED'); expect(n).toBe(1); });
    it('错误行不影响其它行', async () => { let ok = 0, failed = 0; await readLines(new Blob([line() + '\nbad\n' + line()]), (s, n) => { try {
        if (parseLine(s, 'a', n))
            ok++;
    }
    catch {
        failed++;
    } }, () => { }, () => false, 37); expect([ok, failed]).toEqual([2, 1]); });
});
describe('真实统计与筛选', () => {
    it('精确计算 IP、状态码、路径及响应量', () => { const a = accumulator(60000); for (const s of [line(), line('::1', 499), line('::1', 503, '/other')])
        a.add(parseLine(s, 'a', 1)!); expect(a.finish()).toMatchObject({ count: 3, ips: 2, bytes: 3072, statuses: { 200: 1, 499: 1, 503: 1 }, topIPs: [['::1', 2], ['127.0.0.1', 1]], topPaths: [['/api/users', 2], ['/other', 1]] }); });
    it('组合筛选和状态码分组', () => { const r = parseLine(line('::1', 499), 'a', 1)!; expect(matches(r, { ...emptyFilters, ip: '::1', method: 'GET', status: '4xx', path: '/api', ua: 'mozilla', keyword: '测试', from: '2026-11-02T06:00:00Z', to: '2026-11-02T07:00:00Z' })).toBe(true); expect(matches(r, { ...emptyFilters, status: '5xx' })).toBe(false); expect(matches(r, { ...emptyFilters, ip: '::2' })).toBe(false); });
    it('时间桶补零', () => { const a = accumulator(60000); const r = parseLine(line(), 'a', 1)!; a.add(r); a.add({ ...r, timestamp: r.timestamp + 120000 }); expect(fillBuckets(a.finish(), 60000).map(x => x[1])).toEqual([1, 0, 1]); });
    it('10 万行独立校验', () => { const a = accumulator(60000); for (let i = 0; i < 100000; i++)
        a.add(parseLine(line(`10.0.0.${i % 100}`, i % 5 === 0 ? 499 : 200, `/api/${i % 10}?n=${i}`), 'a', i + 1)!); const s = a.finish(); expect([s.count, s.ips, s.bytes, s.statuses['499'], s.statuses['200']]).toEqual([100000, 100, 102400000, 20000, 80000]); expect(s.topPaths).toHaveLength(10); expect(s.topPaths.every(x => x[1] === 10000)).toBe(true); });
});
it('图表路径钻取精确匹配，手动搜索支持包含匹配', () => { const r = parseLine(line(), 'a', 1)!; expect(matches(r, { ...emptyFilters, path: '/api', pathExact: true })).toBe(false); expect(matches(r, { ...emptyFilters, path: '/api', pathExact: false })).toBe(true); });
it('大跨度时间序列自动合并并补零，保持请求总数', () => { const a = accumulator(60000); const r = parseLine(line(), 'a', 1)!; a.add(r); a.add({ ...r, timestamp: r.timestamp + 60000 * 30000 }); const s = a.finish(), b = fillBuckets(s, 60000); expect(s.grain).toBeGreaterThan(60000); expect(b.length).toBeLessThanOrEqual(10001); expect(b.reduce((n, [, v]) => n + v, 0)).toBe(2); });
