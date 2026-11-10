import {parseUpstreamTime,parseSeconds} from './timings';
import {parseLine,parseTime,tokenize} from './combined';
import type {LogRow} from '../types';
export interface ParserConfig { mode:'auto'|'template'; template:string }
export const defaultParserConfig:ParserConfig={mode:'auto',template:''};
export type LineParser=(raw:string,dataset:string,line:number)=>LogRow|null;
const aliases:Record<string,string>={
 remote_addr:'ip',client_ip:'ip',ip:'ip','客户端IP':'ip',
 time_local:'time',time_iso8601:'time',timestamp:'time',time:'time','时间':'time',msec:'msec',
 request:'request','请求':'request',request_method:'method',method:'method',request_uri:'uri',uri:'uri',url:'uri',path:'uri',args:'query',query_string:'query',
 server_protocol:'protocol',protocol:'protocol',status:'status',status_code:'status','状态码':'status',
 body_bytes_sent:'bytes',bytes_sent:'bytes',bytes:'bytes','响应字节':'bytes',
 http_referer:'referer',referer:'referer',referrer:'referer','来源':'referer',
 http_user_agent:'ua',user_agent:'ua',ua:'ua','设备':'ua',
 request_time:'requestTime',total_time:'requestTime','总耗时':'requestTime',request_time_ms:'requestTimeMs',
 upstream_response_time:'responseTime','响应耗时':'responseTime',upstream_connect_time:'connectTime','连接耗时':'connectTime',upstream_header_time:'headerTime','首包耗时':'headerTime',
};
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function timestamp(value:string):number {
 const iso=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
 if(!iso)return parseTime(value.replace(/^\[|\]$/g,''));
 const [,y,month,day,h,m,s,fraction,zone]=iso;
 const offset=zone==='Z'?'+0000':zone.replace(':','');
 return parseTime(`${day}/${months[+month-1]}/${y}:${h}:${m}:${s} ${offset}`)+Number('0.'+(fraction??'0'))*1000;
}
function quoted(value:string){return '"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
function fromNamed(input:Record<string,unknown>,raw:string,dataset:string,line:number):LogRow {
 const values:Record<string,string>={};
 for(const [key,value]of Object.entries(input)){
  const target=aliases[key.replace(/^\$/,'')];if(!target)continue;
  if(value===null||value===undefined)continue;
  if(typeof value!=='string'&&typeof value!=='number')throw Error(`字段 ${key} 必须是文本或数字`);
  const text=String(value);if(target in values&&values[target]!==text)throw Error(`字段定义冲突：${key}`);values[target]=text;
 }
 for(const [key,label]of [['ip','客户端 IP'],['status','状态码'],['bytes','响应字节数']])if(!values[key])throw Error(`无法自动识别${label}，请粘贴 log_format 配置`);
 let request=values.request;
 if(!request){if(!values.method||!values.uri)throw Error('无法识别请求字段，需要 request 或 method + uri');let uri=values.uri;if(values.query&&values.query!=='-'&&!uri.includes('?'))uri+='?'+values.query;request=`${values.method} ${uri} ${values.protocol??'HTTP/1.1'}`;}
 let epoch:number;
 if(values.time)epoch=timestamp(values.time);
 else if(values.msec&&/^\d+(?:\.\d+)?$/.test(values.msec))epoch=+values.msec*1000;
 else throw Error('无法识别带时区的日志时间，请粘贴 log_format 配置');
 if(!Number.isFinite(epoch)||Math.abs(epoch)>8.64e15)throw Error('无效时间');
 // Reuse strict Combined field validation without duplicating request semantics.
 const canonical=`${values.ip} - - [01/Jan/2000:00:00:00 +0000] ${quoted(request)} ${values.status} ${values.bytes} ${quoted(values.referer??'-')} ${quoted(values.ua??'-')}`;
 const row=parseLine(canonical,dataset,line)!;row.timestamp=epoch;row.raw=raw;if(!values.request&&!values.protocol)row.protocol='-';
 const duration=(key:string)=>parseSeconds(values[key],key);
 row.requestTime=duration('requestTime');
 if(values.requestTimeMs!==undefined&&values.requestTimeMs!=='-'){const ms=duration('requestTimeMs')!;if(row.requestTime!==null&&Math.abs(row.requestTime-ms/1000)>1e-9)throw Error('秒与毫秒耗时字段冲突');row.requestTime=ms/1000;}
 row.upstreamResponseTime=parseUpstreamTime(values.responseTime,'上游响应耗时');row.upstreamConnectTime=parseUpstreamTime(values.connectTime,'上游连接耗时');row.upstreamHeaderTime=parseUpstreamTime(values.headerTime,'上游首包耗时');return row;
}
// Accept a format body or one complete log_format directive with quoted segments.
export function normalizeTemplate(input:string):string {
 let text=input.trim();if(!text)throw Error('请填写 Nginx log_format');if(text.length>8192)throw Error('格式配置超过 8KB 限制');
 if(/^log_format\s/.test(text)){
  const head=/^log_format\s+[A-Za-z0-9_]+\s+(?:escape=(?:default|json|none)\s+)?/.exec(text);if(!head)throw Error('log_format 指令头无效');text=text.slice(head[0].length).trim();
  if(!text.endsWith(';'))throw Error('完整 log_format 指令应以分号结尾');text=text.slice(0,-1).trim();
  let i=0,body='';while(i<text.length){while(/\s/.test(text[i]??'')&&i<text.length)i++;if(i===text.length)break;const quote=text[i++];if(quote!=="'"&&quote!=='"')throw Error('log_format 内容需要用引号包裹');let closed=false;while(i<text.length){const c=text[i++];if(c==='\\'&&i<text.length&&(text[i]===quote||text[i]==='\\'))body+=text[i++];else if(c===quote){closed=true;break;}else body+=c;}if(!closed)throw Error('log_format 引号未闭合');}text=body;
 }
 else if((text.startsWith("'")&&text.endsWith("'"))||(text.startsWith('"')&&text.endsWith('"')))text=text.slice(1,-1);
 return text;
}
function compileTemplate(input:string):LineParser {
 const template=normalizeTemplate(input),variables:[string,number,number][]=[];
 const re=/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;let match;
 while((match=re.exec(template)))variables.push([match[1]??match[2],match.index,re.lastIndex]);
 if(!variables.length)throw Error('配置中未找到 $remote_addr 等 Nginx 变量');
 const names=variables.map(v=>aliases[v[0]]);for(const required of ['ip','status','bytes'])if(!names.includes(required))throw Error('格式必须包含 $remote_addr、$status、$body_bytes_sent（或 $bytes_sent）');
 if(!names.includes('time')&&!names.includes('msec'))throw Error('格式需要 $time_local、$time_iso8601 或 $msec');
 if(!names.includes('request')&&!(names.includes('method')&&names.includes('uri')))throw Error('格式需要 $request 或 $request_method + $request_uri');
 const literals=[template.slice(0,variables[0][1]),...variables.map((v,i)=>template.slice(v[2],variables[i+1]?.[1]??template.length))];
 for(let i=1;i<variables.length;i++)if(!literals[i])throw Error('相邻变量之间必须有分隔符，无法可靠拆分');
 return(raw,dataset,line)=>{
  if(!raw.trim())return null;if(!raw.startsWith(literals[0]))throw Error('日志开头与 log_format 不匹配');let cursor=literals[0].length;const values:Record<string,string>={};
  for(let i=0;i<variables.length;i++){
   const delimiter=literals[i+1];let end=raw.length;
   if(delimiter){end=raw.indexOf(delimiter,cursor);while(end>=0){let slashes=0;for(let p=end-1;p>=cursor&&raw[p]==='\\';p--)slashes++;if(slashes%2===0){const upstream=['responseTime','connectTime','headerTime'].includes(aliases[variables[i][0]]);const prefix=raw.slice(cursor,end).trimEnd(),rest=raw.slice(end+delimiter.length).trimStart();if(!(upstream&&/^\s+$/.test(delimiter)&&(/[,:]$/.test(prefix)||/^[,:]/.test(rest))))break;}end=raw.indexOf(delimiter,end+1);}if(end<0)throw Error(`日志与 $${variables[i][0]} 后的分隔符不匹配`);}
   let value=raw.slice(cursor,end);value=value.replace(/\\(["\\])/g,'$1');const key=variables[i][0];if(key in values&&values[key]!==value)throw Error(`重复变量值不一致：$${key}`);values[key]=value;cursor=end+delimiter.length;
  }
  if(cursor!==raw.length)throw Error('日志末尾与 log_format 不匹配');return fromNamed(values,raw,dataset,line);
 };
}
export function createParser(config:ParserConfig=defaultParserConfig):LineParser {
 if(config.mode==='template')return compileTemplate(config.template);
 return(raw,dataset,line)=>{
  if(!raw.trim())return null;
  if(raw.trimStart().startsWith('{')){let object:unknown;try{object=JSON.parse(raw);}catch{throw Error('JSON 日志格式无效');}if(!object||typeof object!=='object'||Array.isArray(object))throw Error('每行 JSON 必须是对象');return fromNamed(object as Record<string,unknown>,raw,dataset,line);}
  const fields=tokenize(raw);if(fields.some(f=>f.key)){
   const values:Record<string,string>={};for(const f of fields){if(!f.key)throw Error('键值日志包含没有字段名的内容，请配置 log_format');if(f.key in values)throw Error(`重复字段：${f.key}`);values[f.key]=f.value;}return fromNamed(values,raw,dataset,line);
  }
  return parseLine(raw,dataset,line);
 };
}
