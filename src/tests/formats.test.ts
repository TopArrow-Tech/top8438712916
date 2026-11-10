import fixture from '../../examples/extended.txt?raw';
import {describe,it,expect} from 'vitest';
import {parseLine} from '../parsers/combined';
import {readLines} from '../parsers/chunks';
import {accumulator} from '../analytics/query';
const lines=fixture.trim().split('\n');
describe('用户扩展格式（IP 已替换为测试地址）',()=>{
 it('逐行自动识别两种格式，保留请求与原文',()=>{const rows=lines.map((s,i)=>parseLine(s,'d',i+1)!);expect(rows).toHaveLength(5);expect(rows.map(r=>r.requestTime)).toEqual([.155,.066,.118,0,.034]);expect(rows.map(r=>r.status)).toEqual([200,200,200,405,405]);expect(rows.map(r=>r.bytes)).toEqual([646,67,595,150,150]);expect(rows.every((r,i)=>r.raw===lines[i]&&r.ua==='Dart/3.5 (dart:io)')).toBe(true);expect(rows[0].timestamp).toBe(Date.parse('2026-11-02T07:58:42Z'));expect(rows[3].timestamp).toBe(Date.parse('2026-07-02T09:12:31Z'));});
 it('区分真实零耗时与缺失上游数据',()=>{expect(parseLine(lines[0],'d',1)).toMatchObject({upstreamResponseTime:.139,upstreamConnectTime:0,upstreamHeaderTime:.139});expect(parseLine(lines[3],'d',1)).toMatchObject({requestTime:0,upstreamResponseTime:null,upstreamConnectTime:null,upstreamHeaderTime:null});});
 it('Combined 可带一项或四项耗时，缺失总耗时不猜测',()=>{const standard='::1 - - [02/Nov/2026:15:58:42 +0800] "GET /a?q=中文 HTTP/1.1" 499 0 "-" "test"';expect(parseLine(standard+' 0.135','d',1)?.requestTime).toBe(.135);expect(parseLine(standard+' - 0.1 0 0.1','d',1)?.requestTime).toBeNull();expect(parseLine(standard,'d',1)?.requestTime).toBeNull();});
 it('中文格式不依赖字段顺序，处理带空格及转义引号的值',()=>{const raw=lines[4].replace('设备="Dart/3.5 (dart:io)"','设备="浏览器 \\"测试\\" 1.0"').split(' 总耗时=');const reordered=raw[1]?'客户端IP=192.0.2.4 总耗时='+raw[1]+' '+raw[0].replace('客户端IP=192.0.2.4 ',''):'';expect(parseLine(reordered,'d',1)?.ua).toBe('浏览器 "测试" 1.0');});
 it('拒绝不完整、重复、未知字段及非法耗时，避免错位统计',()=>{for(const raw of [lines[0]+' 0.1',lines[0].replace('0.155','-0.1'),lines[0].replace('0.155','NaN'),lines[3].replace(' 状态码=405',''),lines[3]+' 总耗时=1',lines[3]+' 陌生字段=1'])expect(()=>parseLine(raw,'d',1)).toThrow();});
 it('混合格式分块/gzip导入与聚合保持一致',async()=>{const stream=new Blob([lines.join('\r\n')]).stream().pipeThrough(new CompressionStream('gzip'));const input=await new Response(stream).blob();const a=accumulator(3600000);await readLines(input,(s,n)=>{a.add(parseLine(s,'d',n)!);},()=>{},()=>false,17,true);expect(a.finish()).toMatchObject({count:5,ips:4,bytes:1608,statuses:{200:3,405:2},timedCount:5});expect(a.finish().averageRequestTime).toBeCloseTo(.0746);});
 it('平均耗时仅统计有值的记录，零值参与分母',()=>{const a=accumulator(3600000);a.add(parseLine(lines[3],'d',1)!);a.add(parseLine(lines[4],'d',2)!);const unknown={...parseLine(lines[0],'d',3)!,requestTime:null};a.add(unknown);expect(a.finish()).toMatchObject({timedCount:2,averageRequestTime:.017});const b=accumulator(3600000);b.add(unknown);expect(b.finish().averageRequestTime).toBeNull();});
});
