const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const copyTree=require('./copy-tree.cjs');
const root=path.resolve(__dirname,'../..'),desktop=path.join(root,'desktop');
const out=path.join(desktop,'release');fs.mkdirSync(out,{recursive:true});
const reportDir=path.join(desktop,'review');fs.mkdirSync(reportDir,{recursive:true});
const components=[];
for(const group of ['server','collector','desktop']){
 const lock=JSON.parse(fs.readFileSync(path.join(root,group,'package-lock.json')));
 for(const [location,record] of Object.entries(lock.packages || {})){
  if(!location.startsWith('node_modules/'))continue;
  let installed={};try{installed=JSON.parse(fs.readFileSync(path.join(root,group,location,'package.json')));}catch{}
  components.push({group,location,name:installed.name||record.name||location.split('node_modules/').at(-1),version:record.version,license:installed.license||record.license||'Review required',developmentOnly:!!record.dev,resolved:record.resolved,integrity:record.integrity});
 }
 const audit=path.join(desktop,'.build',group+'-audit.json');
 if(fs.existsSync(audit)&&fs.statSync(audit).size>0)fs.copyFileSync(audit,path.join(reportDir,group+'-audit.json'));
}
fs.writeFileSync(path.join(reportDir,'dependencies.json'),JSON.stringify({generatedAt:new Date().toISOString(),upstream:'90108f98f29546dbe71df27a4da7aef302d48f08',components},null,2));
for(const name of ['manifest.json','electron-manifest.json'])if(fs.existsSync(path.join(desktop,'assets',name)))fs.copyFileSync(path.join(desktop,'assets',name),path.join(reportDir,name));
for(const name of ['service','source','packaged']){
 const data=path.join(desktop,'test-output',name);
 for(const file of ['smoke-result.json','mcp-standalone-result.json','desktop-search.png'])if(fs.existsSync(path.join(data,file)))fs.copyFileSync(path.join(data,file),path.join(reportDir,name+'-'+file));
}
const binaryDir=path.join(out,'OA-Knowledge-0.1.0-win-x64');
if(fs.existsSync(binaryDir)){
 copyTree(reportDir,path.join(binaryDir,'review'));
 const sums=[];
 // Hash runtime, application sources, model assets, locks and review reports.
 // npm dependency provenance/integrity is inventoried separately in dependencies.json.
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='node_modules')continue;const f=path.join(dir,entry.name);if(entry.isDirectory())walk(f);else if(entry.name!=='SHA256SUMS.txt'){const h=crypto.createHash('sha256');h.update(fs.readFileSync(f));sums.push(h.digest('hex')+'  '+path.relative(binaryDir,f).replaceAll('\\','/'));}}}
 walk(binaryDir);fs.writeFileSync(path.join(binaryDir,'SHA256SUMS.txt'),sums.join('\n')+'\n');
}
const source=path.join(desktop,'.build','source');fs.mkdirSync(source,{recursive:true});
for(const name of ['server','collector','frontend','desktop']){
 const src=path.join(root,name);
 copyTree(src,path.join(source,name),{filter:file=>{
  const rel=path.relative(src,file).split(path.sep),base=path.basename(file);
  if(rel.some(x=>['node_modules','.git','.build','release','test-output'].includes(x)))return false;
  if(name==='desktop'&&rel[0]==='assets')return false;
  if(name!=='frontend' && ['storage','hotdir','public'].includes(rel[0]))return false;
  return !(base.startsWith('.env')&&base!=='.env.example')&&!base.endsWith('.log');
 }});
}
for(const name of ['LICENSE','README.md','package.json','.gitignore'])fs.copyFileSync(path.join(root,name),path.join(source,name));
const zip=path.join(out,'OA-Knowledge-0.1.0-source.zip');
execFileSync('tar.exe',['-a','-cf',zip,'-C',source,'.'],{windowsHide:true});
console.log('IT source bundle: '+zip);
console.log('Dependency entries: '+components.length);
