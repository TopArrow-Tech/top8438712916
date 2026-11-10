import{useEffect,useRef,useState}from'react';
import{timeBounds}from'../../analytics/timeRange';
import{DateTimeInput,type DateTimeHandle}from'./DateTimeInput';
export function TimeRangeFields({from,to,onApply}:{from:string;to:string;onApply:(from:string,to:string)=>void}){
 const start=useRef<DateTimeHandle>(null),end=useRef<DateTimeHandle>(null);
 const[error,setError]=useState(''),[dirty,setDirty]=useState(false);
 useEffect(()=>{setError('');setDirty(false);},[from,to]);
 const apply=()=>{try{const a=start.current!.read(),b=end.current!.read();timeBounds(a,b);onApply(a,b);setError('');setDirty(false);}catch(e){setError((e as Error).message);}};
 return <div className="time-range-fields" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply();}}}>
  <DateTimeInput ref={start} label="开始时间" value={from} onEdit={()=>setDirty(true)}/>
  <DateTimeInput ref={end} label="结束时间" value={to} end onEdit={()=>setDirty(true)}/>
  <button className="primary" onClick={apply}>应用时间</button>
  <small role={error?'alert':undefined} className={error?'time-error':'time-hint'}>{error||(dirty?'时间已修改，请点击“应用时间”或按回车。':'点击日期框，在弹出日历中选择年月日和时分秒。按本机时区筛选，包含结束秒。')}</small>
 </div>;
}
