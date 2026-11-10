import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,statSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const webRoot=path.join(root,'public');
const hasPage=()=>existsSync(path.join(webRoot,'index.html'));
if(!process.env.TOPARROW_DATA_DIR||!process.env.TOPARROW_APP_PORT)throw Error('请通过顶箭启动，或设置 TOPARROW_DATA_DIR 和 TOPARROW_APP_PORT');
const port=Number(process.env.TOPARROW_APP_PORT);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('TOPARROW_APP_PORT 必须是有效端口');
mkdirSync(process.env.TOPARROW_DATA_DIR,{recursive:true});
const db=new DatabaseSync(path.join(process.env.TOPARROW_DATA_DIR,'logscope.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY,payload TEXT); CREATE TABLE IF NOT EXISTS logs(dataset TEXT,line INTEGER,payload TEXT,PRIMARY KEY(dataset,line));');
// Interrupted imports are never exposed as complete datasets.
for(const row of db.prepare('SELECT payload FROM datasets').all()){const d=JSON.parse(row.payload);if(d.state==='importing'){db.prepare('DELETE FROM logs WHERE dataset=?').run(d.id);d.state='failed';d.count=0;d.message='上次导入意外中断，请重新导入';db.prepare('UPDATE datasets SET payload=? WHERE id=?').run(JSON.stringify(d),d.id);}}
const token=crypto.randomUUID();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer(async(req,res)=>{const send=(value,code=200)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/__health')return hasPage()?send({ok:true}):send({ok:false,error:'运行包缺少页面资源，请重新构建并打包'},503);
 if(url.pathname.startsWith('/api/')){
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send({error:'禁止跨来源请求'},403);
 if(url.pathname==='/api/session'&&req.method==='GET')return send({token});
 if(req.headers['x-logscope-token']!==token)return send({error:'会话已更新，请刷新页面'},403);
 let body={};if(req.method==='POST'){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>32*1024*1024)return send({error:'批次超过大小限制'},413);}body=JSON.parse(text);}
 if(url.pathname==='/api/list')return send(db.prepare('SELECT payload FROM datasets ORDER BY rowid DESC').all().map(r=>JSON.parse(r.payload)));
 if(url.pathname==='/api/save'&&req.method==='POST'){db.exec('BEGIN');try{db.prepare('INSERT OR REPLACE INTO datasets VALUES(?,?)').run(body.dataset.id,JSON.stringify(body.dataset));const put=db.prepare('INSERT OR REPLACE INTO logs VALUES(?,?,?)');for(const row of body.rows??[])put.run(body.dataset.id,row.line,JSON.stringify(row));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send({ok:true});}
 if(url.pathname==='/api/scan')return send(db.prepare('SELECT payload FROM logs WHERE dataset=? AND line>? ORDER BY line LIMIT 2000').all(url.searchParams.get('id'),Number(url.searchParams.get('after')||0)).map(r=>JSON.parse(r.payload)));
 if(url.pathname==='/api/delete'&&req.method==='POST'){db.exec('BEGIN');try{db.prepare('DELETE FROM logs WHERE dataset=?').run(body.id);db.prepare('DELETE FROM datasets WHERE id=?').run(body.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send({ok:true});}
 return send({error:'接口不存在'},404);
 }
 if(url.pathname==='/'&&!hasPage()){res.writeHead(503,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>运行包不完整</title><h1>运行包缺少页面资源</h1><p>请使用包含 public 目录的完整安装包重新打包安装。已有日志数据无需删除。</p></html>');}
 const file=path.resolve(webRoot,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(webRoot+path.sep)||!existsSync(file)||!statSync(file).isFile())return send({error:'文件不存在'},404);
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'"});res.end(readFileSync(file));
 }catch(e){send({error:e.code==='SQLITE_FULL'?'本地磁盘空间不足，请清理空间后重试':String(e.message)},500);}});
server.listen(port, '127.0.0.1');
