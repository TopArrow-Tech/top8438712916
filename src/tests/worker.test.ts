import {it,expect,vi,afterEach} from 'vitest';
const storage=vi.hoisted(()=>({save:vi.fn(),scan:vi.fn(),remove:vi.fn(),list:vi.fn().mockResolvedValue([])}));
vi.mock('../storage/db',()=>storage);
import type {Response,Command} from '../types';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();vi.clearAllMocks();});
it('最终元信息保存失败不能报告导入成功，且允许再次导入',async()=>{
 const messages:Response[]=[];
 const scope:{postMessage:(m:Response)=>void;onmessage?:(e:{data:Command})=>Promise<void>}={postMessage:m=>messages.push(structuredClone(m))};
 vi.stubGlobal('self',scope);
 await import('../workers/log.worker');
 const file=new File(['127.0.0.1 - - [02/Nov/2026:14:23:15 +0800] "GET / HTTP/1.1" 200 1 "-" "test"'],'a.log');
 let calls=0;storage.save.mockImplementation(async()=>{if(++calls===3)throw Error('磁盘已满');});storage.remove.mockResolvedValue(undefined);
 await scope.onmessage!({data:{type:'import',files:[file],id:'a'}});
 const first=messages.find(m=>m.type==='done');expect(first?.type==='done'&&first.dataset.state).toBe('failed');expect(storage.remove).toHaveBeenCalledWith('a');
 messages.length=0;storage.save.mockResolvedValue(undefined);
 await scope.onmessage!({data:{type:'import',files:[file],id:'b'}});
 const second=messages.find(m=>m.type==='done');expect(second?.type==='done'&&second.dataset.state).toBe('ready');
});
