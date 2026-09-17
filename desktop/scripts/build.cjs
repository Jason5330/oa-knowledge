const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const copyTree=require('./copy-tree.cjs');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
const desktop=path.join(root,'desktop');
const assets=path.join(desktop,'assets');
fs.mkdirSync(assets,{recursive:true});
const env={...process.env,CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'true'};
function run(args){execFileSync(process.execPath,[path.join(root,'server/node_modules/prisma/build/index.js'),...args],{cwd:path.join(root,'server'),env,stdio:'inherit',windowsHide:true});}
run(['generate','--schema',path.join(root,'server/prisma/schema.prisma')]);
// Apply upstream SQLite SQL into a NEW build-only template. No user DB is touched.
const template=path.join(assets,'empty.db.new');
if(fs.existsSync(template))fs.unlinkSync(template);
const db=new DatabaseSync(template);
db.exec('CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY NOT NULL,"checksum" TEXT NOT NULL,"finished_at" DATETIME,"migration_name" TEXT NOT NULL,"logs" TEXT,"rolled_back_at" DATETIME,"started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0)');
const migrations=path.join(root,'server/prisma/migrations');
for(const migration of fs.readdirSync(migrations).sort()){
  const sqlPath=path.join(migrations,migration,'migration.sql');
  if(!fs.existsSync(sqlPath))continue;
  const sql=fs.readFileSync(sqlPath,'utf8');
  db.exec(sql);
  db.prepare('INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (?,?,CURRENT_TIMESTAMP,?,1)').run(crypto.randomUUID(),crypto.createHash('sha256').update(sql).digest('hex'),migration);
}
const integrity=db.prepare('PRAGMA integrity_check').get();
if(integrity.integrity_check!=='ok')throw new Error('SQLite template integrity failed');
db.close();fs.copyFileSync(template,path.join(assets,'empty.db'));fs.unlinkSync(template);
console.log('Empty database template created from all upstream SQL migrations.');
fs.copyFileSync(process.execPath,path.join(assets,'node.exe'));
if(process.argv.includes('--prepare-only'))process.exit(0);
for(const name of ['manifest.json','models/MintplexLabs/multilingual-e5-small/onnx/model_quantized.onnx'])if(!fs.existsSync(path.join(assets,name)))throw new Error('Run npm run assets first: missing '+name);
const output=path.join(desktop,'release','OA-Knowledge-0.1.0-win-x64');
fs.mkdirSync(output,{recursive:true});
console.log('Copying desktop runtime…');
copyTree(path.join(desktop,'node_modules/electron/dist'),output);
fs.copyFileSync(path.join(output,'electron.exe'),path.join(output,'OA-Knowledge.exe'));
fs.unlinkSync(path.join(output,'electron.exe'));
const appDir=path.join(output,'resources','app');
fs.mkdirSync(appDir,{recursive:true});
fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({name:'oa-knowledge',version:'0.1.0',main:'desktop/main.cjs',private:true}));
const excluded=new Set(['.git','hotdir','storage','public','.cache','test','tests','__tests__']);
for(const name of ['server','collector']){
  console.log('Copying '+name+'…');
  const src=path.join(root,name);
  copyTree(src,path.join(appDir,name),{filter:p=>{
    const rel=path.relative(src,p).split(path.sep);
    if(excluded.has(rel[0]) || rel.includes('.git') || rel.includes('.cache'))return false;
    const base=path.basename(p);
    return !base.startsWith('.env')&&!base.endsWith('.log');
  }});
}
copyTree(desktop,path.join(appDir,'desktop'),{filter:p=>{
  const rel=path.relative(desktop,p).split(path.sep);
  if (path.basename(p).startsWith('electron-') && !p.endsWith('electron-manifest.json')) return false;
  return !rel.some(part=>['node_modules','release','.build','test-output'].includes(part));
}});
fs.copyFileSync(path.join(root,'LICENSE'),path.join(output,'AnythingLLM-LICENSE.txt'));
fs.copyFileSync(path.join(desktop,'README.md'),path.join(output,'使用與審核說明.md'));
fs.copyFileSync(path.join(desktop,'IT-REVIEW.md'),path.join(output,'IT-REVIEW.md'));
console.log('Built: '+output);
