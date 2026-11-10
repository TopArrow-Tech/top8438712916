/** Upstream lists retain their delimiters; they are not a single duration. */
export type UpstreamTime = number | string | null;
const scalar=/^\d+(?:\.\d+)?$/;
const list=/^(?:-|\d+(?:\.\d+)?)(?:\s*[,:]\s*(?:-|\d+(?:\.\d+)?))*$/;
export function parseSeconds(value:string|undefined,label:string):number|null {
 if(value===undefined||value==='-')return null;
 if(!scalar.test(value)||!Number.isFinite(+value))throw Error(`${label}无效，应为非负秒数或 -`);
 return +value;
}
export function parseUpstreamTime(value:string|undefined,label:string):UpstreamTime {
 if(value===undefined||value==='-')return null;
 if(!list.test(value))throw Error(`${label}无效，应为非负秒数、- 或逗号/冒号分隔的耗时列表`);
 const values=value.split(/\s*[,:]\s*/);
 if(values.some(v=>v!=='-'&&!Number.isFinite(+v)))throw Error(`${label}超出数值范围`);
 return values.length===1?parseSeconds(value,label):value;
}
// Space-delimited upstream values may themselves contain spaced , or :.
export function groupTimingTokens(tokens:string[]):string[]{
 const groups:string[]=[];
 for(const token of tokens){
  const last=groups.length-1;
  if(last>=0&&(/^[,:]/.test(token)||/[,:]$/.test(groups[last])))groups[last]+=' '+token;
  else groups.push(token);
 }
 return groups;
}
export function formatDuration(value:number|null|undefined){return value==null?'无数据':`${(value*1000).toFixed(1)} ms`;}
export function formatUpstreamTime(value:UpstreamTime|undefined){
 if(typeof value!=='string')return formatDuration(value);
 return value.replace(/\d+(?:\.\d+)?|-/g,part=>part==='-'?'无数据':formatDuration(+part));
}
