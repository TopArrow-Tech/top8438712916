import {availableDatasetName} from '../features/datasets/names';
import {createParser} from '../parsers/adaptive';
import { readLines } from '../parsers/chunks';
import { save, scan, remove, list } from '../storage/db';
import { createMatcher, accumulator } from '../analytics/query';
import type { Command, Response, Dataset, LogRow } from '../types';
const send = (m: Response) => self.postMessage(m);
let cancelled = false, importing = false, queryToken = 0;
async function importLogs(c: Extract<Command, {
    type: 'import';
}>) {
    if (importing)
        throw Error('已有导入任务');
    importing = true;
    cancelled = false;
    const start = performance.now();
    const d: Dataset = { parserConfig:c.config, id: c.id, name: c.name??c.files.map(f => f.name).join('、'), size: c.files.reduce((n, f) => n + f.size, 0), created: Date.now(), state: 'importing', count: 0, failed: 0, empty: 0, elapsed: 0, errors: [] };
    let rows: LogRow[] = [], progress = 0, batchSize = 0;
    try {
        d.name=availableDatasetName(d.name,await list());
        const parse=createParser(c.config);
        await save(d);
        let base = 0, bytes = 0;
        if (!d.size)
            throw Error('文件为空，请选择包含访问日志的文件');
        for (const file of c.files) {
            const lines = await readLines(file, async (raw, localLine) => {
                const line = base + localLine;
                try {
                    const row = parse(raw, d.id, line);
                    if (row) {
                        row.source = file.name;
                        rows.push(row);
                        d.count++;
                        batchSize += raw.length * 4;
                    }
                    else
                        d.empty++;
                }
                catch (e) {
                    d.failed++;
                    if (d.errors.length < 30)
                        d.errors.push({ line, reason: (e as Error).message, sample: raw.slice(0, 500) });
                }
                if (rows.length >= 2000 || batchSize >= 4 * 1024 * 1024) {
                    await save(d, rows);
                    rows = [];
                    batchSize = 0;
                    send({ type: 'progress', dataset: d, progress });
                }
            }, p => { progress = (bytes + file.size * p) / d.size; send({ type: 'progress', dataset: d, progress }); }, () => cancelled, 2 * 1024 * 1024, /\.gz$/i.test(file.name));
            base += lines;
            bytes += file.size;
        }
        if (cancelled)
            throw Error('CANCELLED');
        if (!d.count)
            throw Error(d.failed ? '没有可解析的访问日志，请查看错误样本并检查 Nginx 日志格式' : '文件没有有效日志，仅包含空行');
        await save(d, rows);
        d.state = 'ready';
    }
    catch (e) {
        d.state = (e as Error).message === 'CANCELLED' ? 'cancelled' : 'failed';
        d.message = d.state === 'cancelled' ? '已取消，未保留部分数据' : `导入失败：${(e as Error).message}`;
        try {
            await remove(d.id);
            d.count = 0;
        }
        catch {
            d.message += '；清理未完成，请在导入记录中删除后重试';
        }
    }
    finally {
        d.elapsed = performance.now() - start;
        try {
            await save(d);
        }
        catch (e) {
            d.state = 'failed';
            d.message = `无法保存最终导入结果：${(e as Error).message}。请检查磁盘空间后重新导入。`;
            try { await remove(d.id); d.count = 0; } catch { d.message += ' 部分数据清理未完成，请删除此记录。'; }
        }
        finally {
            importing = false;
            send({ type: 'done', dataset: d });
        }
    }
}
self.onmessage = async ({ data: c }: MessageEvent<Command>) => {
    try {
        if (c.type === 'cancel') {
            cancelled = true;
            return;
        }
        if (c.type === 'import') {
            await importLogs(c);
            return;
        }
        if (c.type === 'delete') {
            await remove(c.id);
            send({ type: 'deleted', id: c.id });
            return;
        }
        if (c.type === 'query') {
            queryToken = c.token;
            const a = accumulator(c.grain), candidates: LogRow[] = [];
            const matches=createMatcher(c.filters);
            const limit = c.page * 50;
            let total = 0;
            const compare = (x: LogRow, y: LogRow) => (c.sort === 'desc' ? y.timestamp - x.timestamp : x.timestamp - y.timestamp) || x.line - y.line;
            await scan(c.id, r => {
                if (matches(r)) {
                    a.add(r);
                    total++;
                    let low = 0, high = candidates.length;
                    while (low < high) {
                        const mid = (low + high) >>> 1;
                        if (compare(candidates[mid], r) <= 0)
                            low = mid + 1;
                        else
                            high = mid;
                    }
                    if (low < limit) {
                        candidates.splice(low, 0, r);
                        if (candidates.length > limit)
                            candidates.pop();
                    }
                }
            }, () => c.token !== queryToken);
            if (c.token === queryToken)
                send({ type: 'result', token: c.token, summary: a.finish(), rows: candidates.slice((c.page - 1) * 50), total });
        }
    }
    catch (e) {
        send({ type: 'error', message: `操作失败：${(e as Error).message}。请检查本机可用空间及应用运行状态。` });
    }
};
