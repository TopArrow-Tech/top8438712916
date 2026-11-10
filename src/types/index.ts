import type {UpstreamTime} from '../parsers/timings';
import type {ParserConfig} from '../parsers/adaptive';
export interface LogRow {
    dataset: string;
    source?: string;
    line: number;
    timestamp: number;
    ip: string;
    method: string;
    uri: string;
    path: string;
    query: string;
    protocol: string;
    status: number;
    bytes: number;
    referer: string;
    ua: string;
    raw: string;
    requestTime?: number | null;
    upstreamResponseTime?: UpstreamTime;
    upstreamConnectTime?: UpstreamTime;
    upstreamHeaderTime?: UpstreamTime;
}
export interface Dataset {
    parserConfig?:ParserConfig;
    id: string;
    name: string;
    size: number;
    created: number;
    state: 'importing' | 'ready' | 'cancelled' | 'failed';
    count: number;
    failed: number;
    empty: number;
    elapsed: number;
    errors: {
        line: number;
        reason: string;
        sample: string;
    }[];
    message?: string;
}
export interface Filters {
    pathExact?: boolean;
    from: string;
    to: string;
    ip: string;
    method: string;
    path: string;
    status: string;
    ua: string;
    keyword: string;
}
export interface Summary {
    grain?: number;
    timedCount?: number;
    averageRequestTime?: number | null;
    count: number;
    ips: number;
    statuses: Record<string, number>;
    methods: Record<string, number>;
    topIPs: [
        string,
        number
    ][];
    topPaths: [
        string,
        number
    ][];
    buckets: [
        number,
        number
    ][];
    min: number;
    max: number;
    bytes: number;
}
export type Command = {
    type: 'import';
    name?:string;
    config?:ParserConfig;
    files: File[];
    id: string;
} | {
    type: 'cancel';
} | {
    type: 'query';
    id: string;
    filters: Filters;
    page: number;
    sort: 'asc' | 'desc';
    grain: number;
    token: number;
} | {
    type: 'delete';
    id: string;
};
export type Response = {
    type: 'progress';
    dataset: Dataset;
    progress: number;
} | {
    type: 'done';
    dataset: Dataset;
} | {
    type: 'result';
    token: number;
    summary: Summary;
    rows: LogRow[];
    total: number;
} | {
    type: 'deleted';
    id: string;
} | {
    type: 'error';
    message: string;
};
