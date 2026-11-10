export async function readLines(file: Blob, onLine: (line: string, n: number) => Promise<void> | void, onProgress: (n: number) => void, cancelled: () => boolean, chunkSize = 2 * 1024 * 1024, gzip = false) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let carry = '', line = 0, consumed = 0;
    const input = new ReadableStream<Uint8Array<ArrayBuffer>>({ async pull(controller) { if (cancelled()) {
            controller.error(Error('CANCELLED'));
            return;
        } if (consumed >= file.size) {
            controller.close();
            return;
        } const bytes = new Uint8Array(await file.slice(consumed, consumed + chunkSize).arrayBuffer()); consumed += bytes.length; controller.enqueue(bytes); onProgress(consumed / file.size); } });
    if (gzip && typeof DecompressionStream === 'undefined')
        throw Error('当前浏览器不支持 gzip 解压，请更新顶箭或先解压文件');
    const reader = (gzip ? input.pipeThrough(new DecompressionStream('gzip')) : input).getReader();
    const consume = async (text: string) => { carry += text; let start = 0, end; while ((end = carry.indexOf('\n', start)) !== -1) {
        if (end - start > 8 * 1024 * 1024)
            throw Error('单行超过 8MB 安全限制');
        if (cancelled())
            throw Error('CANCELLED');
        await onLine(carry.slice(start, end).replace(/\r$/, ''), ++line);
        start = end + 1;
    } carry = carry.slice(start); if (carry.length > 8 * 1024 * 1024)
        throw Error('单行超过 8MB 安全限制'); };
    try {
        while (true) {
            if (cancelled())
                throw Error('CANCELLED');
            const r = await reader.read();
            if (r.done)
                break;
            await consume(decoder.decode(r.value, { stream: true }));
            await new Promise(r => setTimeout(r, 0));
        }
        await consume(decoder.decode());
        if (carry)
            await onLine(carry.replace(/\r$/, ''), ++line);
        return line;
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
