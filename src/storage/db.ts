import type { Dataset, LogRow } from '../types';
let token: Promise<string> | undefined;
async function api(route: string, body?: unknown) { token ??= fetch('/api/session').then(async (r) => { if (!r.ok)
    throw Error('无法连接本地存储'); return (await r.json()).token; }); const r = await fetch('/api/' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-LogScope-Token': await token }, body: body ? JSON.stringify(body) : undefined }); const value = await r.json(); if (!r.ok)
    throw Error(value.error || '本地存储失败'); return value; }
export async function save(dataset: Dataset, rows: LogRow[] = []) { await api('save', { dataset, rows }); }
export async function list(): Promise<Dataset[]> { return api('list'); }
export async function scan(id: string, visit: (row: LogRow) => void, cancelled = () => false) { let after = 0; while (!cancelled()) {
    const rows: LogRow[] = await api(`scan?id=${encodeURIComponent(id)}&after=${after}`);
    if (!rows.length)
        break;
    for (const row of rows)
        visit(row);
    after = rows[rows.length - 1].line;
} }
export async function remove(id: string) { await api('delete', { id }); }
