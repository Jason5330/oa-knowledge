const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Store}=require('./store.cjs');
const dir=process.env.OA_DATA_DIR;if(!dir)throw new Error('OA_DATA_DIR required');
const store=new Store(dir),jobs=new Map();let active=null;
const token=process.env.OA_SESSION_TOKEN;if(!token||token.length<32)throw new Error('Missing session token');
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req,max=65536){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>max)throw new Error('上傳內容超過大小限制');chunks.push(c);}return Buffer.concat(chunks);}
async function input(req){return JSON.parse((await body(req)).toString('utf8')||'{}');}
function idle(){if(active)throw new Error('已有文件作業進行中，請等待完成或取消。');}
function parse(buffer,name,job,options={}){return new Promise((resolve,reject)=>{
  const worker=require('../offline-guard.cjs').launchDocumentParser(),chunks=[];let size=0;
  const timer=setTimeout(()=>{worker.kill();reject(new Error('文件解析超過兩分鐘'));},120000);
  job.worker={terminate:()=>worker.kill()};worker.stdout.on('data',c=>{size+=c.length;if(size>32*1024*1024){worker.kill();reject(new Error('解析文字過大'));}else chunks.push(c);});worker.stderr.resume();worker.stdin.on('error',()=>{});
  worker.once('error',reject);worker.once('close',code=>{clearTimeout(timer);job.worker=null;if(code)return reject(new Error(job.cancelled?'已取消匯入':'文件解析元件停止，此文件未匯入'));try{const m=JSON.parse(Buffer.concat(chunks).toString('utf8'));m.error?reject(new Error(m.error)):resolve(m.pages);}catch(e){reject(e);}});
  worker.stdin.end(JSON.stringify({name,buffer:buffer.toString('base64'),options}));
});}
function job(work){
  idle();const j={id:crypto.randomUUID(),state:'running',stage:'準備中',done:0,total:0,cancelled:false};active=j;jobs.set(j.id,j);
  Promise.resolve().then(()=>work(j)).then(result=>{j.state='completed';j.result=result;}).catch(e=>{j.state=j.cancelled?'cancelled':'failed';j.error=e.message;}).finally(()=>{active=null;if(jobs.size>100)jobs.delete(jobs.keys().next().value);});
  return {jobId:j.id};
}
async function legacy(j){
  const {DatabaseSync}=require('node:sqlite');const oldPath=path.join(dir,'storage/anythingllm.db');if(!fs.existsSync(oldPath))throw new Error('此資料目錄沒有 0.1 版資料');
  const old=new DatabaseSync(oldPath,{readOnly:true});let documents=0;const created=[];
  try{
    const rows=old.prepare('SELECT * FROM workspaces').all();
    for(const w of rows){if(j.cancelled)throw new Error('已取消');const nw=store.create(w.name+'（舊版）');created.push(nw.slug);
      for(const d of old.prepare('SELECT * FROM workspace_documents WHERE workspaceId=?').all(w.id)){
        const base=fs.realpathSync(path.join(dir,'storage/documents')),file=fs.realpathSync(path.resolve(base,d.docpath)),rel=path.relative(base,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('舊版文件路徑超出資料目錄');
        const source=JSON.parse(fs.readFileSync(file,'utf8'));const text=source.pageContent||'';
        const name=path.parse(source.title||d.filename).name.slice(0,220)+'（舊版解析文字）.txt';
        await store.index(nw.slug,name,Buffer.from(text),[{text,location:'舊版匯入文字'}],j);documents++;
      }
    }return {workspaces:created.length,documents};
  }catch(e){for(const id of created)store.removeWorkspace(id);throw e;}finally{old.close();}
}
const server=http.createServer(async(req,res)=>{
  try{
    const got=req.headers['x-oa-session'];if(typeof got!=='string'||Buffer.byteLength(got)!==Buffer.byteLength(token)||!crypto.timingSafeEqual(Buffer.from(got),Buffer.from(token)))return json(res,{error:'本機工作階段驗證失敗'},403);
    const url=new URL(req.url,'http://127.0.0.1'),p=url.pathname,method=req.method;
    if(method==='GET'&&['/','/app-v2.js','/style.css','/complete.css','/excel.css','/excel-ui.js'].includes(p)){const file=path.join(__dirname,'../ui',p==='/'?'index-v2.html':p.slice(1));res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);return;}
    if(!p.startsWith('/api/oa/'))return json(res,{error:'此功能未開放'},403);
    if(method==='GET'&&p==='/api/oa/status')return json(res,{name:'OA 知識庫',version:'0.3.2',storage:dir,...store.stats(),legacy:fs.existsSync(path.join(dir,'storage/anythingllm.db')),job:active?.id||null});
    if(method==='GET'&&p==='/api/oa/workspaces')return json(res,store.listWorkspaces({offset:Number(url.searchParams.get('offset')||0),limit:1000}));
    if(method==='POST'&&p==='/api/oa/workspaces'){idle();return json(res,store.create((await input(req)).name));}
    if(method==='PATCH'&&p==='/api/oa/workspaces'){idle();const b=await input(req);return json(res,store.rename(b.workspace,b.name));}
    if(method==='DELETE'&&p==='/api/oa/workspaces'){idle();return json(res,store.removeWorkspace((await input(req)).workspace));}
    if(method==='GET'&&p==='/api/oa/documents')return json(res,store.listDocuments(url.searchParams.get('workspace'),{offset:Number(url.searchParams.get('offset')||0),limit:100,filter:url.searchParams.get('filter')||''}));
    if(method==='DELETE'&&p==='/api/oa/documents'){idle();const b=await input(req);return json(res,store.removeDocument(b.workspace,b.documentId));}
    if(method==='POST'&&p==='/api/oa/read')return json(res,store.readDocument(await input(req)));
    if(method==='POST'&&p==='/api/oa/excel/inspect')return json(res,require('./excel-query.cjs').inspect(store,await input(req)));
    if(method==='POST'&&p==='/api/oa/excel/rows')return json(res,require('./excel-query.cjs').readRows(store,await input(req)));
    if(method==='POST'&&p==='/api/oa/excel/aggregate')return json(res,require('./excel-query.cjs').aggregate(store,await input(req)));
    if(method==='GET'&&p==='/api/oa/excel/export'){const {d,book}=require('./excel-query.cjs').workbook(store,url.searchParams.get('workspace'),url.searchParams.get('documentId'));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','X-File-Name':encodeURIComponent(d.name+'.structured.json'),'Cache-Control':'no-store'});res.end(JSON.stringify({documentId:d.id,title:d.name,...book},null,2));return;}
    if(method==='POST'&&p==='/api/oa/excel/reparse'){const b=await input(req),d=store.document(b.workspace,b.documentId);if(!/\.xlsx$/i.test(d.name))throw new Error('此功能僅適用 XLSX');const options=require('./excel.cjs').options(b.options||{});return json(res,job(async j=>{j.stage='重新解析 Excel 結構';const pages=await parse(Buffer.from(d.original),d.name,j,options);return store.index(b.workspace,d.name,Buffer.from(d.original),pages,j,d.id);}),202);}
    if(method==='GET'&&p==='/api/oa/export'){const d=store.document(url.searchParams.get('workspace'),url.searchParams.get('documentId'));res.writeHead(200,{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(d.name),'Cache-Control':'no-store'});res.end(Buffer.from(d.original));return;}
    if(method==='POST'&&p==='/api/oa/search')return json(res,await store.search(await input(req)));
    if(method==='POST'&&p==='/api/oa/ask')return json(res,await require('./local-model.cjs').ask(store,await input(req)));
    if(method==='GET'&&p==='/api/oa/settings')return json(res,store.settings());
    if(method==='POST'&&p==='/api/oa/settings'){const value=store.saveSettings(await input(req));return json(res,value);}
    if(method==='POST'&&p==='/api/oa/model-test')return json(res,await require('./local-model.cjs').test(store.settings()));
    if(method==='POST'&&p==='/api/oa/import'){
      idle();const workspace=url.searchParams.get('workspace'),name=url.searchParams.get('name');store.workspace(workspace);require('./store.cjs').str(name,255);
      const replaceId=url.searchParams.get('replaceId')||undefined;if(replaceId)store.document(workspace,replaceId);
      const options=require('./excel.cjs').options({includeHidden:url.searchParams.get('includeHidden')==='true'});
      const bytes=await body(req,50*1024*1024);return json(res,job(async j=>{j.stage=/\.xlsx$/i.test(name)?'Excel：自動建立結構化 JSON':'解析文件';const pages=await parse(bytes,name,j,options);return store.index(workspace,name,bytes,pages,j,replaceId);}),202);
    }
    if(method==='POST'&&p==='/api/oa/reindex'){const b=await input(req);const d=store.document(b.workspace,b.documentId);return json(res,job(async j=>{let pages=JSON.parse(d.pages);if(/\.xlsx$/i.test(d.name))pages=await parse(Buffer.from(d.original),d.name,j,pages.find(p=>p.kind==='excel-workbook')?.workbook?.options||{});return store.index(b.workspace,d.name,Buffer.from(d.original),pages,j,d.id);}),202);}
    if(method==='GET'&&p==='/api/oa/job'){const j=jobs.get(url.searchParams.get('id'));if(!j)throw new Error('找不到作業');const {worker,...safe}=j;return json(res,safe);}
    if(method==='POST'&&p==='/api/oa/cancel'){const b=await input(req),j=jobs.get(b.id);if(j&&j.state==='running'){j.cancelled=true;if(j.worker)j.worker.terminate();}return json(res,{success:true});}
    if(method==='POST'&&p==='/api/oa/backup'){idle();return json(res,await store.backup());}
    if(method==='POST'&&p==='/api/oa/restore'){idle();const b=await input(req);if(typeof b.name!=='string'||!/^import-[a-f0-9-]+\.sqlite$/.test(b.name))throw new Error('備份名稱錯誤');return json(res,store.restore(path.join(dir,'backups',b.name)));}
    if(method==='POST'&&p==='/api/oa/legacy')return json(res,job(legacy),202);
    if(method==='GET'&&p==='/api/oa/mcp-config'){
      return json(res,require('../mcp-config.cjs').configs());
    }
    return json(res,{error:'找不到此功能'},404);
  }catch(e){if(!res.headersSent)json(res,{error:e.message},400);else res.destroy();}
});
server.headersTimeout=15000;server.requestTimeout=120000;
server.listen(Number(process.env.SERVER_PORT),'127.0.0.1',()=>console.log('OA local runtime ready'));
// Upgrade only legacy XLSX indexes, from saved originals, after making a consistent backup.
const pendingExcel=store.db.prepare("SELECT id,workspace,name FROM documents WHERE lower(name) LIKE '%.xlsx' AND coalesce(json_extract(pages,'$[0].workbook.parserVersion'),0)<>3").all();
if(pendingExcel.length)job(async j=>{const backup=await store.backup();const upgraded=[],errors=[];for(const row of pendingExcel){if(j.cancelled)break;try{const d=store.document(row.workspace,row.id);j.stage='升級 Excel 結構：'+d.name;const pages=await parse(Buffer.from(d.original),d.name,j,{});await store.index(d.workspace,d.name,Buffer.from(d.original),pages,j,d.id);upgraded.push(d.name);}catch(e){errors.push({document:row.name,error:e.message});}}return {upgraded,errors,backup:backup.name};});
process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
