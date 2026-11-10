import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, Upload, Search, Database, LayoutDashboard, ChevronRight, Trash2, FileText, PanelLeftClose, Sun, Moon, HelpCircle, X } from 'lucide-react';
import { Chart } from '../components/Chart';
import { list } from '../storage/db';
import { emptyFilters, fillBuckets } from '../analytics/query';
import type { Dataset, Filters, Response, Summary, LogRow, Command } from '../types';
import './style.css';
import {datasetLabels} from '../features/datasets/names';
import {TimeRangeFields} from '../features/search/TimeRangeFields';
import {formatUpstreamTime} from '../parsers/timings';
import {ImportDialog} from '../features/import/ImportDialog';
const fmt = (n: number) => new Intl.NumberFormat('zh-CN').format(n);
const bytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const duration = (n: number | null | undefined) => n == null ? '无数据' : `${(n*1000).toFixed(1)} ms`;
function App() {
    const [timeRevision,setTimeRevision]=useState(0);
    const [pendingFiles,setPendingFiles]=useState<File[]>([]);
    const worker = useRef<Worker>();
    const input = useRef<HTMLInputElement>(null);
    const serial = useRef(0);
    const [sets, setSets] = useState<Dataset[]>([]), [id, setId] = useState(''), [page, setPage] = useState('总览仪表盘'), [filters, setFilters] = useState<Filters>({ ...emptyFilters }), [summary, setSummary] = useState<Summary>(), [rows, setRows] = useState<LogRow[]>([]), [total, setTotal] = useState(0), [number, setNumber] = useState(1), [sort, setSort] = useState<'desc' | 'asc'>('desc'), [grain, setGrain] = useState(3600000), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(false), [detail, setDetail] = useState<LogRow>(), [report, setReport] = useState<Dataset>(), [light, setLight] = useState(false), [collapsed, setCollapsed] = useState(false), [help, setHelp] = useState(false);
    const refresh = () => list().then(setSets).catch(e => setError(String(e.message)));
    useEffect(() => { const w = new Worker(new URL('../workers/log.worker.ts', import.meta.url), { type: 'module' }); worker.current = w; refresh().then(() => list()).then(ds => setId(ds.find(d => d.state === 'ready')?.id ?? '')).catch(() => { }); w.onmessage = ({ data: m }: MessageEvent<Response>) => { if (m.type === 'progress') {
        setProgress(m.progress);
        setSets(ds => [m.dataset, ...ds.filter(d => d.id !== m.dataset.id)]);
    } if (m.type === 'done') {
        setBusy(false);
        refresh();
        setReport(m.dataset);
        if (m.dataset.state === 'ready') {
            setId(m.dataset.id);
            setFilters({ ...emptyFilters });setTimeRevision(n=>n+1);
            setNumber(1);
            setPage('总览仪表盘');
        }
        else
            setError(m.dataset.message ?? '导入失败');
    } if (m.type === 'result' && m.token === serial.current) {
        setSummary(m.summary);
        setRows(m.rows);
        setTotal(m.total);
        setLoading(false);
    } if (m.type === 'deleted') {
        refresh();
        setId(current => current === m.id ? '' : current);
    } if (m.type === 'error') {
        setError(m.message);
        setLoading(false);
        setBusy(false);
    } }; w.onerror = () => { setError('分析线程中断，请刷新应用后重试'); setBusy(false); setLoading(false); }; return () => w.terminate(); }, []);
    useEffect(() => { setSummary(undefined); setRows([]); setTotal(0); if (!id)
        return; setLoading(true); const timer = setTimeout(() => send({ type: 'query', id, filters, page: number, sort, grain, token: ++serial.current }), 180); return () => { clearTimeout(timer); serial.current++; }; }, [id, filters, number, sort, grain]);
    const send = (m: Command) => worker.current?.postMessage(m);
    const change = (key: keyof Filters, value: string) => { setFilters(f => ({ ...f, [key]: value, ...(key === 'path' ? { pathExact: false } : {}) })); setNumber(1); };
    const drill = (key: keyof Filters, value: string) => { if (key === 'path') {
        setFilters(f => ({ ...f, path: value, pathExact: true }));
        setNumber(1);
    }
    else
        change(key, value); setPage('日志检索'); };
    const importFiles = (files: File[]) => { if (busy)
        return; const bad = files.find(f => !/\.(log|txt|gz)$/i.test(f.name)); if (bad) {
        setError(`不支持 ${bad.name}，请选择 .log、.txt 或 .gz 文件`);
        return;
    } if (!files.length)
        return; setPendingFiles(files); };
    const openAnalysis = (dataset: Dataset) => {
        if (dataset.state !== 'ready') return;
        setId(dataset.id);
        setFilters({...emptyFilters});setTimeRevision(n=>n+1);
        setNumber(1);
        setError('');
        setPage('总览仪表盘');
        window.scrollTo({top:0});
    };
    const labels=datasetLabels(sets);
    const active = sets.find(d => d.id === id);
    const nav = ['总览仪表盘', '日志检索', '导入记录', '设置'];
    const bar = (data: [
        string,
        number
    ][], key: keyof Filters) => ({ tooltip: { trigger: 'axis' }, grid: { left: 105, right: 28, top: 12, bottom: 26 }, xAxis: { type: 'value', splitLine: { lineStyle: { color: '#263244' } } }, yAxis: { type: 'category', inverse: true, data: data.map(x => x[0]), axisLabel: { width: 95, overflow: 'truncate' } }, series: [{ type: 'bar', data: data.map(x => x[1]), barMaxWidth: 18, itemStyle: { color: key === 'ip' ? '#25c6b3' : '#6495ff', borderRadius: [0, 4, 4, 0] } }] });
    return <div className={light ? 'shell light' : 'shell'} style={{ gridTemplateColumns: collapsed ? '72px 1fr' : '220px 1fr' }}><aside><div className="brand"><Activity /><span hidden={collapsed}>LogScope<small>NGINX 日志分析</small></span></div><div className="navlabel">{!collapsed && '工作空间'}</div>{nav.map((n, i) => { const Icon = [LayoutDashboard, Search, Database, Activity][i]; return <button className={'nav ' + (page === n ? 'selected' : '')} key={n} title={n} onClick={() => setPage(n)}><Icon size={19}/>{!collapsed && n}</button>; })}<div className="sidebar-bottom"><span className="privacy">● {!collapsed && '数据仅保存在本机'}</span><button className="nav" onClick={() => setCollapsed(!collapsed)} title="折叠导航"><PanelLeftClose size={18}/>{!collapsed && '收起侧栏'}</button></div></aside><section className="workspace"><header><div className="crumb">工作空间 <ChevronRight size={14}/> <strong>{page}</strong></div><div className="actions"><button title="切换主题" onClick={() => setLight(!light)}>{light ? <Moon size={17}/> : <Sun size={17}/>}</button><button title="帮助" onClick={() => setHelp(true)}><HelpCircle size={17}/></button><button className="primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={16}/> 导入日志</button></div></header><main onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); importFiles([...e.dataTransfer.files]); }}><input ref={input} hidden type="file" multiple accept=".log,.txt,.gz" onChange={e => { importFiles([...e.target.files ?? []]); e.target.value = ''; }}/>
 <div className="page-heading"><div><div className="eyebrow">本地日志工作台 / LOGSCOPE</div><h1>{page}</h1><p>{page === '总览仪表盘' ? '从真实访问日志中了解流量、接口与请求状态。' : '导入、检索与管理你的本地日志数据。'}</p></div><span className="badge">离线 · 本地分析</span></div>
 {error && <div className="alert">{error}<button onClick={() => setError('')}><X size={16}/></button></div>}
 {busy && <section className="panel import-progress"><strong>正在导入并解析 · {Math.round(progress * 100)}% 已读取</strong><p>解析与写入完成后才会生成统计，多文件合并为一个数据集。</p><progress value={progress} max={1}/><button onClick={() => send({ type: 'cancel' })}>取消导入</button></section>}
 {(page === '总览仪表盘' || page === '日志检索') && <><section className="filterbar"><label>当前数据集<select value={id} onChange={e => { setId(e.target.value); setNumber(1); }}><option value="">选择数据集</option>{sets.filter(d => d.state === 'ready').map(d => <option key={d.id} value={d.id}>{labels.get(d.id)}</option>)}</select></label><TimeRangeFields key={id+':'+timeRevision} from={filters.from} to={filters.to} onApply={(from,to)=>{setFilters(f=>({...f,from,to}));setNumber(1);}}/><button onClick={() => { setFilters({ ...emptyFilters });setTimeRevision(n=>n+1); setNumber(1); }}>重置筛选</button></section>
 {!id ? <section className="empty panel"><div className="upload-icon"><Upload size={30}/></div><h2>让日志中的信息清晰可见</h2><p>将 Nginx 访问日志拖到这里，或点击选择文件。<br />支持 .log、.txt、.gz 和多个文件联合分析，全程在本机处理。</p><button className="primary" disabled={busy} onClick={() => input.current?.click()}>选择日志文件</button><small>不上传第三方 · 无需账号 · 保留原始日志</small></section> : <>
 <p className="applied-time" aria-live="polite">{filters.from||filters.to?`已应用时间：${filters.from.replace('T',' ')||'不限'} 至 ${filters.to.replace('T',' ')||'不限'}（本机时区，含结束时间）`:'已应用时间：全部时间'}</p><div className="data-caption"><span>● {active?labels.get(active.id):''}</span><span>{loading ? '正在计算真实数据…' : `当前筛选 ${fmt(summary?.count ?? 0)} 条请求 · 时间显示为本机时区`}</span></div>
 {page === '总览仪表盘' && summary && <><div className="metrics">{[['总请求数', fmt(summary.count), '当前筛选范围'], ['独立 IP 数', fmt(summary.ips), '按原始 IP 精确去重'], ['4xx / 5xx 请求', fmt(Object.entries(summary.statuses).filter(([s]) => +s >= 400).reduce((n, [, v]) => n + v, 0)), '请求失败状态'], ['总响应字节数', bytes(summary.bytes), `平均请求耗时：${duration(summary.averageRequestTime)}${summary.timedCount?`（${fmt(summary.timedCount)} 条）`:''}`]].map(([label, value, hint]) => <section className="panel metric" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></section>)}</div><div className="chart-grid"><section className="panel wide"><div className="panel-title"><h3>请求量趋势</h3><select value={grain} onChange={e => setGrain(+e.target.value)}>{[[60000, '1 分钟'], [300000, '5 分钟'], [900000, '15 分钟'], [3600000, '1 小时'], [86400000, '1 天']].map(([v, n]) => <option value={v} key={v}>{n}</option>)}</select></div><Chart option={{ tooltip: { trigger: 'axis' }, grid: { left: 55, right: 24, top: 20, bottom: 60 }, xAxis: { type: 'time' }, yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#263244' } } }, dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 5 }], series: [{ type: 'line', data: fillBuckets(summary, grain), showSymbol: true, symbolSize: 5, lineStyle: { color: '#6495ff' }, itemStyle: { color: '#6495ff' }, areaStyle: { color: '#6495ff', opacity: 0.08 } }] }} onClick={p => { if (p.value) {
                setFilters(f => ({ ...f, from: localTime(p.value[0]), to: localTime(p.value[0] + (summary.grain ?? grain) - 1) }));
                setNumber(1);
                setPage('日志检索');
            } }}/><small>点击时间点查看日志；时间跨度较大时自动合并时间桶，最多展示约 10,000 个点。</small></section><section className="panel"><div className="panel-title"><h3>状态码分布</h3><span>点击钻取</span></div><Chart option={{ tooltip: { trigger: 'item' }, legend: { bottom: 0, textStyle: { color: '#8795ac' } }, color: ['#25c6b3', '#6495ff', '#f4b860', '#ef707c'], series: [{ type: 'pie', radius: ['48%', '72%'], center: ['50%', '43%'], label: { show: false }, data: Object.entries(summary.statuses).map(([name, value]) => ({ name, value })) }] }} onClick={p => drill('status', p.name)}/></section><section className="panel"><div className="panel-title"><h3>Top 10 访问 IP</h3><span>按请求次数</span></div><Chart option={bar(summary.topIPs, 'ip') as any} onClick={p => drill('ip', p.name)}/></section><section className="panel"><div className="panel-title"><h3>Top 10 请求路径</h3><span>忽略查询参数</span></div><Chart option={bar(summary.topPaths, 'path') as any} onClick={p => drill('path', p.name)}/></section></div></>}
 {page === '日志检索' && <section className="panel"><div className="search-fields">{(['ip', 'method', 'path', 'status', 'ua', 'keyword'] as const).map((k, i) => <label key={k}>{['IP（精确）', 'HTTP 方法', filters.pathExact ? '路径（精确）' : '路径包含', '状态码 / 4xx', 'User-Agent', '原始日志关键词'][i]}<input value={filters[k]} onChange={e => change(k, k === 'method' ? e.target.value.toUpperCase() : e.target.value)} placeholder={['127.0.0.1', 'GET', '/api/', '499 或 5xx', 'Mozilla', '搜索原始文本'][i]}/></label>)}</div><div className="panel-title"><h3>请求明细 <span>{fmt(total)} 条</span></h3><button onClick={() => { setSort(sort === 'desc' ? 'asc' : 'desc'); setNumber(1); }}>时间 {sort === 'desc' ? '↓' : '↑'}</button></div><div className="table-scroll"><table><thead><tr>{['时间', 'IP', '方法', '请求路径', '状态码', '响应大小', '总耗时', '操作'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.line}><td>{new Date(r.timestamp).toLocaleString('zh-CN', { hour12: false })}</td><td className="mono">{r.ip}</td><td>{r.method}</td><td title={r.uri} className="path">{r.uri}</td><td><span className={'status s' + Math.floor(r.status / 100)}>{r.status}</span></td><td>{bytes(r.bytes)}</td><td>{duration(r.requestTime)}</td><td><button onClick={() => setDetail(r)}>详情</button></td></tr>)}</tbody></table></div>{!loading && !rows.length && <p className="no-results">没有符合筛选条件的数据，请调整或重置筛选。</p>}<div className="pagination"><span>每页 50 条 · 第 {number} / {Math.max(1, Math.ceil(total / 50))} 页</span><div><button disabled={number <= 1 || loading} onClick={() => setNumber(n => n - 1)}>上一页</button><button disabled={number * 50 >= total || loading} onClick={() => setNumber(n => n + 1)}>下一页</button></div></div></section>}
 </>}</>}
 {page === '导入记录' && <section className="panel"><div className="panel-title"><h3>本地数据集</h3><span>{sets.length} 条记录</span></div>{!sets.length && <p className="no-results">暂无导入记录，请先导入日志。</p>}{sets.map(d => <div className="dataset" key={d.id}><FileText /><div>{d.state==='ready'?<button className="dataset-name" title="打开此数据集的分析总览" onClick={()=>openAnalysis(d)}>{labels.get(d.id)}</button>:<strong>{labels.get(d.id)}</strong>}<p>{new Date(d.created).toLocaleString()} · {bytes(d.size)} · 成功 {fmt(d.count)} · 失败 {fmt(d.failed)} · {(d.elapsed / 1000).toFixed(1)} 秒</p><small>{({ ready: '导入完成', failed: '导入失败', cancelled: '已取消', importing: '导入中' })[d.state]}</small></div><button className="primary" disabled={d.state!=='ready'} title={d.state==='ready'?'查看此数据集的全部分析':'导入完成后可查看分析'} onClick={()=>openAnalysis(d)}>查看分析</button><button onClick={() => setReport(d)}>解析报告</button><button disabled={busy} title="删除数据集" onClick={() => { if (confirm('删除此数据集及其全部日志？此操作无法撤销。'))
        send({ type: 'delete', id: d.id }); }}><Trash2 size={16}/></button></div>)}</section>}
 {page === '设置' && <section className="panel settings"><h3>本地运行设置</h3><p>存储：TOPARROW_DATA_DIR 下的 SQLite 数据库，关闭应用后保留。</p><p>日志格式：导入时可自动识别 Combined、中英文键值和 JSON；自定义格式可粘贴 Nginx log_format，并先核对样本。</p><p>时间：解析原始时区偏移，界面按本机时区显示。</p><p>隐私：日志解析和统计在浏览器 Worker 中执行，数据仅写入本机服务，不访问第三方。</p><button onClick={() => setLight(!light)}>切换深色 / 浅色主题</button></section>}
 <footer>LogScope · Nginx 日志可视化分析<span>本机处理，数据由你掌控</span></footer></main></section>
 {pendingFiles.length>0&&<ImportDialog files={pendingFiles} datasets={sets} initial={sets.find(d=>d.state==='ready')?.parserConfig} onClose={()=>setPendingFiles([])} onConfirm={(config,name)=>{setBusy(true);setProgress(0);setError('');send({type:'import',files:pendingFiles,config,name,id:crypto.randomUUID()});setPendingFiles([]);}}/>}
 {(detail || report || help) && <div className="overlay" onClick={() => { setDetail(undefined); setReport(undefined); setHelp(false); }}><section className="modal panel" onClick={e => e.stopPropagation()}><button className="close" onClick={() => { setDetail(undefined); setReport(undefined); setHelp(false); }}><X /></button>{detail ? <><h2>原始请求详情</h2><p>来源：{detail.source} · 数据集行号 {detail.line}</p><p>User-Agent：{detail.ua}</p><p>Referer：{detail.referer} · 总耗时：{duration(detail.requestTime)}</p><p>上游响应耗时：{formatUpstreamTime(detail.upstreamResponseTime)} · 连接耗时：{formatUpstreamTime(detail.upstreamConnectTime)} · 首包耗时：{formatUpstreamTime(detail.upstreamHeaderTime)}</p>{[detail.upstreamResponseTime,detail.upstreamConnectTime,detail.upstreamHeaderTime].some(v=>typeof v==='string')&&<p>上游多值按原顺序展示：逗号和冒号表示多次连接或不同上游组，未合并为单个耗时。</p>}<pre>{detail.raw}</pre><button onClick={() => navigator.clipboard.writeText(detail.raw).catch(() => setError('复制失败，请手动选择原始文本复制'))}>复制原始日志</button></> : report ? <><h2>解析报告</h2><p>{labels.get(report.id)??report.name}</p><p>成功 {fmt(report.count)} · 失败 {fmt(report.failed)} · 空行 {fmt(report.empty)} · {(report.elapsed / 1000).toFixed(2)} 秒</p><p>{report.message || '保留前 30 条错误样本，行号按文件导入顺序累计。无法识别时，可重新导入并选择自定义 log_format。'}</p>{report.errors.map((e, i) => <div key={i}><strong>第 {e.line} 行：{e.reason}</strong><pre>{e.sample}</pre></div>)}</> : <><h2>开始使用 LogScope</h2><p>支持 Combined、单用户字段扩展和中文键值日志，多个文件合并到同一数据集。压缩文件必须为 gzip 格式。</p><p>图表中的 IP、路径、状态码和时间点可以点击，进入日志检索。图表路径采用精确匹配；手动编辑路径后改为包含匹配。</p><p>重复导入或文件内容重叠会重复计数；应用不会擅自删除内容相同的真实请求。</p><p>本阶段不提供爬虫识别、异常检测、耗时分位数或导出。当前没有这些数据时不会生成模拟结果。</p></>}</section></div>}
 </div>;
}
function localTime(t: number) { const d = new Date(t); return new Date(t - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); }
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
