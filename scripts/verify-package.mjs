import{test}from'node:test';
import assert from'node:assert/strict';
import{mkdtempSync,cpSync,readFileSync,readdirSync,rmSync,existsSync}from'node:fs';
import{spawn}from'node:child_process';
import{once}from'node:events';
import{tmpdir}from'node:os';
import path from'node:path';
import net from'node:net';
const root=path.resolve(process.env.LOGSCOPE_PACKAGE_DIR??path.resolve(import.meta.dirname,'..'));
async function run(copyPage,check){
 const temp=mkdtempSync(path.join(tmpdir(),'logscope-package-')),app=path.join(temp,'app'),data=path.join(temp,'data');
 for(const name of ['manifest.json','server.mjs','icon.png',...(copyPage?['public']:[])])cpSync(path.join(root,name),path.join(app,name),{recursive:true});
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 const child=spawn(process.execPath,[path.join(app,'server.mjs')],{cwd:temp,env:{...process.env,TOPARROW_APP_PORT:String(port),TOPARROW_DATA_DIR:data},stdio:'pipe'});let stderr='';child.stderr.on('data',c=>stderr+=c);const base=`http://127.0.0.1:${port}`;
 try{let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/__health');ready=true;break;}catch{}if(child.exitCode!==null)throw Error(stderr);await new Promise(r=>setTimeout(r,50));}assert.ok(ready,'服务应可启动');assert.equal(existsSync(path.join(app,'node_modules')),false);assert.equal(existsSync(path.join(app,'src')),false);await check(base,app,data);}finally{if(child.exitCode===null){child.kill();await once(child,'exit');}rmSync(temp,{recursive:true,force:true});}
}
test('仅运行包文件即可加载页面、静态资源及 Worker，无开发依赖',async()=>run(true,async(base,app,data)=>{
 const manifest=JSON.parse(readFileSync(path.join(app,'manifest.json'),'utf8'));assert.equal(manifest.ui.icon,'icon.png');const icon=readFileSync(path.join(app,manifest.ui.icon));assert.equal(icon.toString('hex',0,8),'89504e470d0a1a0a');assert.ok(icon.length>0&&icon.length<=200000);assert.equal(icon.readUInt32BE(16),512);assert.equal(icon.readUInt32BE(20),512);
 assert.equal((await fetch(base+'/__health')).status,200);
 assert.match(readFileSync(path.join(app,'server.mjs'),'utf8'),/server\.listen\(port,\s*['"]127\.0\.0\.1['"]\)/);
 const acceptsOtherLoopback=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.2',port:Number(new URL(base).port)});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});assert.equal(acceptsOtherLoopback,false,'服务不能绑定所有接口');
 const page=await fetch(base+'/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/LogScope/);assert.doesNotMatch(html,/\/src\//);
 const assets=readdirSync(path.join(app,'public','assets'));assert.ok(assets.some(n=>n.startsWith('log.worker-')));
 for(const name of assets){const r=await fetch(base+'/assets/'+name);assert.equal(r.status,200,name);assert.ok((await r.arrayBuffer()).byteLength>0);}
 for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))assert.equal((await fetch(new URL(match[1],base))).status,200,match[1]);
 const token=(await(await fetch(base+'/api/session')).json()).token;const datasets=await fetch(base+'/api/list',{headers:{'X-LogScope-Token':token}});assert.deepEqual(await datasets.json(),[]);assert.equal(existsSync(path.join(data,'logscope.sqlite')),true);
 assert.equal((await fetch(base+'/assets/not-found.js')).status,404);
}));
test('运行包缺少页面时健康检查失败并显示清晰说明，不泄露本机路径',async()=>run(false,async(base)=>{
 assert.equal((await fetch(base+'/__health')).status,503);const r=await fetch(base+'/');assert.equal(r.status,503);const text=await r.text();assert.match(text,/运行包缺少页面资源/);assert.doesNotMatch(text,/ENOENT|\/Users\//);
}));
