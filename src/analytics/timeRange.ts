export interface TimeBounds {from:number;toExclusive:number}
function boundary(value:string):{timestamp:number;precision:number}{
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
 if(!match)throw Error('请输入完整的日期和时间');
 const [,year,month,day,hour,minute,second,fraction,zone]=match;
 if(+month<1||+month>12||+day<1||+day>new Date(Date.UTC(+year,+month,0)).getUTCDate()||+hour>23||+minute>59||+(second??0)>59)throw Error('日期或时间无效');
 const timestamp=new Date(value).getTime();
 if(!Number.isFinite(timestamp))throw Error('日期或时间无效');
 if(!zone){const date=new Date(timestamp);if(date.getFullYear()!==+year||date.getMonth()+1!==+month||date.getDate()!==+day||date.getHours()!==+hour||date.getMinutes()!==+minute)throw Error('该本地时间不存在，请检查时区或夏令时');}
 return{timestamp,precision:fraction?10**(3-fraction.length):second===undefined?60000:1000};
}
export function timeBounds(from:string,to:string):TimeBounds {
 const start=from?boundary(from).timestamp:-Infinity;
 const end=to?boundary(to):undefined;
 const toExclusive=end?end.timestamp+end.precision:Infinity;
 if(start>=toExclusive)throw Error('结束时间不能早于开始时间');
 return{from:start,toExclusive};
}
