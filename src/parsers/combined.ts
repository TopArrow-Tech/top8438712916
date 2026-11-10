import {parseSeconds,parseUpstreamTime,groupTimingTokens} from './timings';
import type { LogRow } from '../types';
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parseTime(input: string): number {
    const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(input);
    if (!m) throw Error('时间格式无效');
    const [, d, mon, y, h, min, s, sign, oh, om] = m;
    const month = months.indexOf(mon);
    const value = Date.UTC(+y, month, +d, +h, +min, +s);
    const date = new Date(value);
    if (month < 0 || +y < 100 || date.getUTCDate() !== +d || +h > 23 || +min > 59 || +s > 59 || +oh > 23 || +om > 59) throw Error('非法时间');
    return value - (sign === '+' ? 1 : -1) * (+oh * 60 + +om) * 60000;
}
// Each token may have a key= prefix. Quoted and bracketed values stay intact.
export function tokenize(raw: string) {
    const fields: {key?: string; value: string}[] = [];
    let i = 0;
    while (i < raw.length) {
        while (i < raw.length && /\s/.test(raw[i])) i++;
        if (i === raw.length) break;
        let key: string | undefined;
        const prefix = /^([^\s=\[\]"]+)=/.exec(raw.slice(i));
        if (prefix) { key = prefix[1]; i += prefix[0].length; }
        let value = '';
        const open = raw[i];
        if (open === '"' || open === '[') {
            const close = open === '[' ? ']' : '"';
            i++;
            let closed = false;
            while (i < raw.length) {
                const c = raw[i++];
                if (c === '\\' && open === '"') {
                    if (i === raw.length) throw Error('转义字符不完整');
                    const escaped = raw[i++];
                    value += escaped === '"' || escaped === '\\' ? escaped : '\\' + escaped;
                } else if (c === close) { closed = true; break; }
                else value += c;
            }
            if (!closed) throw Error('引号或方括号未闭合');
            if (i < raw.length && !/\s/.test(raw[i])) throw Error('字段之间缺少空格');
        } else {
            const start = i;
            const multiValueKey=key!==undefined&&['响应耗时','连接耗时','首包耗时','upstream_response_time','upstream_connect_time','upstream_header_time'].includes(key);
            while (i < raw.length) {
                if (/\s/.test(raw[i])) {
                    if (!multiValueKey || /^\s+[^\s=\[\]"]+=/.test(raw.slice(i))) break;
                }
                i++;
            }
            value = raw.slice(start, i).trimEnd();
        }
        if (key && !value) throw Error(`字段 ${key} 缺少值`);
        fields.push({key, value});
    }
    return fields;
}
export function parseLine(raw: string, dataset: string, line: number): LogRow | null {
    if (!raw.trim()) return null;
    const fields = tokenize(raw);
    let ip: string, time: string, request: string, status: string, size: string, referer: string, ua: string;
    let timings: (string | undefined)[] = [];
    if (fields.some(f=>f.key === '客户端IP')) {
        const map = new Map<string,string>();
        const allowed = new Set(['客户端IP','用户','时间','请求','状态码','响应字节','来源','设备','总耗时','响应耗时','连接耗时','首包耗时']);
        for (const f of fields) {
            if (!f.key || !allowed.has(f.key)) throw Error(`不支持的中文日志字段：${f.key ?? f.value}`);
            if (map.has(f.key)) throw Error(`字段重复：${f.key}`);
            map.set(f.key, f.value);
        }
        const get = (key: string) => { const v=map.get(key); if(v===undefined)throw Error(`缺少字段：${key}`);return v; };
        ip=get('客户端IP');get('用户');time=get('时间');request=get('请求');status=get('状态码');size=get('响应字节');referer=get('来源');ua=get('设备');
        timings=['总耗时','响应耗时','连接耗时','首包耗时'].map(k=>map.get(k));
    } else {
        if (fields.some(f=>f.key)) throw Error('不支持的键值日志格式，请使用已支持的中文字段名称');
        const tokens=fields.map(f=>f.value);
        const timeIndex=/^\d{2}\/[A-Za-z]{3}\//.test(tokens[2]??'')?2:3;
        const base=timeIndex+6;
        const suffix=groupTimingTokens(tokens.slice(base));
        const extra=suffix.length;
        if ((timeIndex!==2&&timeIndex!==3)||![0,1,4].includes(extra)) throw Error('不支持的日志字段数量：支持 Combined、单用户字段及末尾 1 或 4 个耗时字段');
        ip=tokens[0];time=tokens[timeIndex];request=tokens[timeIndex+1];status=tokens[timeIndex+2];size=tokens[timeIndex+3];referer=tokens[timeIndex+4];ua=tokens[timeIndex+5];
        // Fixed supported suffix: request_time, upstream_response_time,
        // upstream_connect_time, upstream_header_time (all seconds).
        timings=suffix;
    }
    if (!/^\d{3}$/.test(status) || +status < 100 || +status > 599) throw Error('无效状态码');
    if (size !== '-' && !/^\d+$/.test(size)) throw Error('无效响应字节数');
    const bytes=size==='-'?0:+size;
    if (!Number.isSafeInteger(bytes)) throw Error('响应字节数超出安全范围');
    let method='-',uri='-',protocol='-';
    if(request!=='-'){
        const match=/^([A-Za-z]+) (\S+) (HTTP\/\d(?:\.\d)?)$/.exec(request);
        if(!match)throw Error('无效请求字段');
        [,method,uri,protocol]=match;method=method.toUpperCase();
    }
    const q=uri.indexOf('?');
    return {dataset,line,timestamp:parseTime(time),ip,method,uri,path:q<0?uri:uri.slice(0,q),query:q<0?'':uri.slice(q+1),protocol,status:+status,bytes,referer,ua,raw,
        requestTime:parseSeconds(timings[0],'总耗时'),upstreamResponseTime:parseUpstreamTime(timings[1],'响应耗时'),upstreamConnectTime:parseUpstreamTime(timings[2],'连接耗时'),upstreamHeaderTime:parseUpstreamTime(timings[3],'首包耗时')};
}
