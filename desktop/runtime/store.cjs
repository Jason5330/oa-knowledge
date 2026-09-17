const {DatabaseSync,backup}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {embed,chunks}=require('./embed.cjs');
const APP_ID=1329679182;
function str(v,max=2000){if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('文字為空或超過長度上限');return v.trim();}
function integer(v,min,max){if(!Number.isInteger(v)||v<min||v>max)throw new Error('數值超出範圍');return v;}
class Store{
  constructor(dir,{readOnly=false}={}){
    this.dir=path.resolve(dir);this.file=path.join(this.dir,'knowledge.sqlite');this.readOnly=readOnly;
    if(!readOnly)fs.mkdirSync(this.dir,{recursive:true});
    this.db=new DatabaseSync(this.file,{readOnly});this.db.exec('PRAGMA busy_timeout=10000;PRAGMA foreign_keys=ON');
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    if(version!==0&&version!==2){this.db.close();throw new Error('不支援的資料庫版本，未修改資料');}
    const appId=this.db.prepare('PRAGMA application_id').get().application_id;
    if((version===2&&appId!==APP_ID)||(version===0&&this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length)){this.db.close();throw new Error('資料庫不是 OA 知識庫格式');}
    if(!readOnly){
      this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA secure_delete=ON;PRAGMA application_id=${APP_ID};
        CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,workspace TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,name TEXT NOT NULL,hash TEXT NOT NULL,original BLOB NOT NULL,text TEXT NOT NULL,pages TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(workspace,hash));
        CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY,document TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,workspace TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,position INTEGER NOT NULL,text TEXT NOT NULL,location TEXT NOT NULL,vector BLOB NOT NULL);
        CREATE INDEX IF NOT EXISTS chunks_workspace ON chunks(workspace);CREATE INDEX IF NOT EXISTS chunks_document ON chunks(document);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        PRAGMA user_version=2;`);
    }
    if(this.db.prepare('PRAGMA user_version').get().user_version!==2)throw new Error('不支援的資料庫版本');
  }
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const out=fn();this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  workspace(id){const w=this.db.prepare('SELECT * FROM workspaces WHERE id=?').get(str(id,128));if(!w)throw new Error('找不到知識庫');return w;}
  listWorkspaces({offset=0,limit=100}={}){integer(offset,0,1e7);integer(limit,1,1000);return this.db.prepare('SELECT w.id AS slug,w.name,w.created,COUNT(d.id) AS documentCount FROM workspaces w LEFT JOIN documents d ON d.workspace=w.id GROUP BY w.id ORDER BY w.created,w.id LIMIT ? OFFSET ?').all(limit,offset);}
  create(name){name=str(name,80);const id=crypto.randomUUID();this.db.prepare('INSERT INTO workspaces VALUES(?,?,?)').run(id,name,new Date().toISOString());return {slug:id,name};}
  rename(id,name){this.workspace(id);this.db.prepare('UPDATE workspaces SET name=? WHERE id=?').run(str(name,80),id);return {slug:id,name};}
  removeWorkspace(id){this.workspace(id);this.db.prepare('DELETE FROM workspaces WHERE id=?').run(id);return {success:true};}
  listDocuments(workspace,{offset=0,limit=100,filter=''}={}){this.workspace(workspace);integer(offset,0,1e7);integer(limit,1,1000);if(typeof filter!=='string'||filter.length>200)throw new Error('篩選文字過長');return this.db.prepare('SELECT d.id,d.name AS title,d.created,length(d.original) AS bytes,length(d.text) AS characters,COUNT(c.id) AS chunks FROM documents d LEFT JOIN chunks c ON c.document=d.id WHERE d.workspace=? AND instr(lower(d.name),lower(?))>0 GROUP BY d.id ORDER BY d.created,d.id LIMIT ? OFFSET ?').all(workspace,filter,limit,offset);}
  document(workspace,id){this.workspace(workspace);const d=this.db.prepare('SELECT * FROM documents WHERE workspace=? AND id=?').get(workspace,str(id,128));if(!d)throw new Error('文件不屬於指定知識庫');return d;}
  readDocument({workspace,documentId,offset=0,length=4000}){integer(offset,0,1e8);integer(length,1,8000);const d=this.document(workspace,documentId);return {documentId,title:d.name,offset,totalCharacters:d.text.length,text:d.text.slice(offset,offset+length),nextOffset:offset+length<d.text.length?offset+length:null};}
  removeDocument(workspace,id){this.document(workspace,id);this.db.prepare('DELETE FROM documents WHERE workspace=? AND id=?').run(workspace,id);return {success:true};}
  async index(workspace,name,original,pages,job={},existingId){
    this.workspace(workspace);str(name,255);const hash=crypto.createHash('sha256').update(original).digest('hex');
    const duplicate=this.db.prepare('SELECT id FROM documents WHERE workspace=? AND hash=?').get(workspace,hash);
    if(duplicate&&!existingId)return {duplicate:true,documentId:duplicate.id};
    if(duplicate&&existingId&&duplicate.id!==existingId)throw new Error('相同內容已存在另一份文件');
    const pieces=chunks(pages);if(!pieces.length)throw new Error('沒有可索引的文字');
    const vectors=[];job.total=pieces.length;job.done=0;job.stage='建立本機索引';
    for(const piece of pieces){if(job.cancelled)throw new Error('已取消匯入');vectors.push(await embed(piece.text));job.done++;await new Promise(r=>setImmediate(r));}
    if(job.cancelled)throw new Error('已取消匯入');const id=existingId||crypto.randomUUID();
    this.tx(()=>{
      this.workspace(workspace);
      if(existingId){this.document(workspace,id);this.db.prepare('DELETE FROM chunks WHERE document=?').run(id);this.db.prepare('UPDATE documents SET name=?,hash=?,original=?,text=?,pages=? WHERE id=?').run(name,hash,original,pages.map(p=>p.location+'\n'+p.text).join('\n\n'),JSON.stringify(pages),id);}
      else this.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?)').run(id,workspace,name,hash,original,pages.map(p=>p.location+'\n'+p.text).join('\n\n'),JSON.stringify(pages),new Date().toISOString());
      const insert=this.db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?)');
      pieces.forEach((p,i)=>insert.run(crypto.randomUUID(),id,workspace,i,p.text,p.location,Buffer.from(vectors[i].buffer)));
    });return {documentId:id,chunks:pieces.length};
  }
  async search({workspace,query,limit=5}){
    this.workspace(workspace);query=str(query);integer(limit,1,10);
    const vector=await embed(query,true),terms=query.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
    const top=[];
    for(const row of this.db.prepare("SELECT c.*,d.name FROM chunks c JOIN documents d ON d.id=c.document WHERE c.workspace=? AND (lower(d.name) NOT LIKE '%.xlsx' OR json_extract(d.pages,'$[0].workbook.parserVersion')=3)").iterate(workspace)){
      const v=new Float32Array(row.vector.buffer,row.vector.byteOffset,row.vector.byteLength/4);let similarity=0;for(let i=0;i<384;i++)similarity+=v[i]*vector[i];
      const text=row.text.toLowerCase();const keyword=terms.length?terms.filter(t=>text.includes(t)).length/terms.length:0;
      const score=similarity+keyword*0.07;
      top.push({documentId:row.document,title:row.name,location:row.location,text:row.text,similarity:Math.max(0,Math.min(1,similarity)),score});top.sort((a,b)=>b.score-a.score);if(top.length>limit)top.pop();
    }
    return {workspace,query,matches:top};
  }
  settings(){const s=this.db.prepare('SELECT value FROM settings WHERE key=?').get('local-model');return s?JSON.parse(s.value):{enabled:false,url:'http://127.0.0.1:11434/v1',model:'',maxTokens:1024};}
  saveSettings(value){const u=require('./local-model.cjs').validate(value);this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('local-model',JSON.stringify(value));require('../offline-guard.cjs').setModelPort(value.enabled?Number(u.port):null);return value;}
  async backup(){const dir=path.join(this.dir,'backups');fs.mkdirSync(dir,{recursive:true});const name='OA-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8)+'.sqlite';await backup(this.db,path.join(dir,name));return {name};}
  restore(file){
    const src=new DatabaseSync(file,{readOnly:true});
    try{
      if(src.prepare('PRAGMA application_id').get().application_id!==APP_ID||src.prepare('PRAGMA user_version').get().user_version!==2)throw new Error('不是相容的 OA 知識庫備份');
      if(src.prepare("SELECT name FROM sqlite_master WHERE type IN ('view','trigger')").all().length)throw new Error('備份含不支援的資料結構');
      if(src.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('備份損壞');
      const rows=src.prepare('SELECT * FROM workspaces').all();if(rows.length>1000)throw new Error('備份知識庫數量過多');let count=0;
      this.tx(()=>{for(const w of rows){const nw=this.create(str(w.name,80).slice(0,76)+'（還原）');
        for(const d of src.prepare('SELECT * FROM documents WHERE workspace=?').iterate(w.id)){
          if(++count>100000||d.original.length>50*1024*1024||d.text.length>5e6)throw new Error('備份內容超過上限');
          const id=crypto.randomUUID();str(d.name,255);JSON.parse(d.pages);
          this.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?)').run(id,nw.slug,d.name,d.hash,d.original,d.text,d.pages,d.created);
          for(const c of src.prepare('SELECT * FROM chunks WHERE document=?').iterate(d.id)){
            if(c.vector.length!==1536||typeof c.text!=='string'||c.text.length>2000)throw new Error('備份索引格式錯誤');
            const v=new Float32Array(c.vector.buffer,c.vector.byteOffset,384);if(!v.every(Number.isFinite))throw new Error('備份含無效向量');
            this.db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,nw.slug,c.position,c.text,String(c.location),c.vector);
          }
        }
      }});return {workspaces:rows.length,documents:count};
    }finally{src.close();}
  }
  stats(){return {workspaces:this.db.prepare('SELECT count(*) AS n FROM workspaces').get().n,documents:this.db.prepare('SELECT count(*) AS n FROM documents').get().n,chunks:this.db.prepare('SELECT count(*) AS n FROM chunks').get().n};}
  close(){this.db.close();}
}
module.exports={Store,str,integer};
