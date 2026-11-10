import type {Dataset} from '../../types';
export function availableDatasetName(name:string,existing:Pick<Dataset,'name'>[]):string {
 const base=name.trim();if(!base)throw Error('请输入数据集名称');
 const names=new Set(existing.map(d=>d.name));if(!names.has(base))return base;
 let n=2;while(names.has(`${base}（${n}）`))n++;
 return `${base}（${n}）`;
}
function importTime(created:number){const d=new Date(created);if(!Number.isFinite(d.getTime()))return '导入时间未知';const pad=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
/** Existing duplicate names remain intact; their labels disambiguate IDs everywhere. */
export function datasetLabels(datasets:Dataset[]):Map<string,string>{
 const groups=new Map<string,Dataset[]>();for(const d of datasets){const group=groups.get(d.name)??[];group.push(d);groups.set(d.name,group);}
 const labels=new Map<string,string>();for(const[name,group]of groups){group.sort((a,b)=>a.created-b.created||a.id.localeCompare(b.id));for(const[d,index]of group.map((d,i)=>[d,i] as const))labels.set(d.id,group.length>1?`${name} · ${importTime(d.created)} · 第${index+1}次`:name);}
 return labels;
}
