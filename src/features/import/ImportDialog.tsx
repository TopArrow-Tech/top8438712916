import {availableDatasetName} from '../datasets/names';
import type {Dataset} from '../../types';
import {useEffect,useMemo,useState} from 'react';
import {X} from 'lucide-react';
import {createParser,defaultParserConfig,type ParserConfig} from '../../parsers/adaptive';
import {readLines} from '../../parsers/chunks';
import type {LogRow} from '../../types';
const example='$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" $request_time';
export function ImportDialog({files,datasets,initial,onConfirm,onClose}:{files:File[];datasets:Dataset[];initial?:ParserConfig;onConfirm:(config:ParserConfig,name:string)=>void;onClose:()=>void}){
 const baseName=files.map(f=>f.name).join('、');
 const [name,setName]=useState(()=>availableDatasetName(baseName,datasets));
 const duplicateSource=datasets.some(d=>d.name===baseName);
 const duplicateName=datasets.some(d=>d.name===name.trim());
 const [config,setConfig]=useState<ParserConfig>(initial??defaultParserConfig),[samples,setSamples]=useState<{source:string;raw:string;error?:string}[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{let disposed=false;const load=async()=>{const values:{source:string;raw:string;error?:string}[]=[];for(const file of files.slice(0,10)){let count=0;try{await readLines(file,(raw)=>{if(raw.trim()){values.push({source:file.name,raw});count++;}},()=>{},()=>disposed||count>=3,64*1024,/\.gz$/i.test(file.name));if(!count)values.push({source:file.name,raw:'',error:'文件为空或没有非空日志行'});}catch(e){if((e as Error).message!=='CANCELLED')values.push({source:file.name,raw:'',error:(e as Error).message});}}if(!disposed){setSamples(values);setLoading(false);}};load();return()=>{disposed=true;};},[files]);
 const preview=useMemo(()=>{let parse:ReturnType<typeof createParser>;try{parse=createParser(config);}catch(e){return{error:(e as Error).message,rows:[] as {source:string;row?:LogRow;error?:string}[]};}return{error:'',rows:samples.map((s,i)=>{try{if(s.error)throw Error(s.error);return{source:s.source,row:parse(s.raw,'preview',i+1)??undefined};}catch(e){return{source:s.source,error:(e as Error).message};}})};},[config,samples]);
 const valid=preview.rows.filter(r=>r.row).length;
 return <div className="overlay"><section className="modal panel import-dialog"><button className="close" aria-label="关闭导入" onClick={onClose}><X/></button><h2>导入日志 · 格式预览</h2><p>已选择 {files.length} 个文件。先核对解析结果，再导入；每个文件最多预览 3 条，最多检查前 10 个文件。</p><label>数据集名称<input value={name} maxLength={200} onChange={e=>setName(e.target.value)} placeholder="为这次导入起一个便于识别的名称"/></label>{(duplicateSource||duplicateName)&&<p className="duplicate-notice">已有同名导入记录，本次保留为独立数据集；如名称仍重复，将自动添加序号，不会覆盖或合并旧数据。同名不代表文件内容相同。</p>}<label>解析方式<select value={config.mode} onChange={e=>setConfig(c=>({...c,mode:e.target.value as ParserConfig['mode']}))}><option value="auto">自动识别（Combined / 中文或英文键值 / JSON）</option><option value="template">自定义 Nginx log_format</option></select></label>{config.mode==='template'&&<><label>log_format 配置<textarea value={config.template} maxLength={8192} onChange={e=>setConfig(c=>({...c,template:e.target.value}))} placeholder={example} rows={5}/></label><p>可粘贴完整 log_format 指令或格式内容。按 $变量名读取字段，额外变量只跳过，不参与错误统计。耗时顺序以配置为准。</p><button onClick={()=>setConfig({mode:'template',template:example})}>填入 Combined 耗时示例</button></>}
 {config.mode==='auto'&&<p>自动识别有字段名的日志；无字段名的数字无法判断含义。内置 Combined 扩展按“总耗时、上游响应、连接、首包”顺序读取，顺序不同时请选择自定义配置。</p>}
 {loading?<p>正在读取少量样本…</p>:<><h3>解析预览 · {valid} / {preview.rows.length} 条成功</h3>{preview.error&&<p className="alert">{preview.error}</p>}<div className="preview-list">{preview.rows.map((r,i)=><div className="preview-row" key={i}><small>{r.source}</small>{r.row?<><p>{r.row.ip} · {new Date(r.row.timestamp).toLocaleString()} · {r.row.method} {r.row.uri} · 状态 {r.row.status} · {r.row.bytes} 字节</p><small>总耗时：{r.row.requestTime==null?'无数据':`${(r.row.requestTime*1000).toFixed(1)} ms`} · User-Agent：{r.row.ua}</small></>:<p className="preview-error">{r.error}</p>}</div>)}</div>{!valid&&<p>无法识别时，请切换到自定义方式，粘贴服务器使用的 log_format。请勿随意猜测耗时字段。</p>}</>}
 <div className="pagination"><button onClick={onClose}>取消</button><button className="primary" disabled={loading||!valid||!!preview.error||!name.trim()} onClick={()=>onConfirm(config,availableDatasetName(name,datasets))}>确认格式，开始导入</button></div></section></div>;
}
