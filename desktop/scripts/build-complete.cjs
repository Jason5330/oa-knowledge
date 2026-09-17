const fs=require('node:fs'),path=require('node:path');
const copy=require('./copy-tree.cjs');
const desktop=path.resolve(__dirname,'..'),root=path.dirname(desktop),output=path.join(desktop,'release/OA-Knowledge-0.3.1-win-x64');
for(const file of ['assets/node.exe','assets/node-manifest.json','assets/models/MintplexLabs/multilingual-e5-small/onnx/model_quantized.onnx','runtime/node_modules/@huggingface/transformers/package.json','node_modules/electron/dist/electron.exe'])if(!fs.existsSync(path.join(desktop,file)))throw new Error('Missing build asset: '+file);
fs.mkdirSync(output,{recursive:true});copy(path.join(desktop,'node_modules/electron/dist'),output);fs.copyFileSync(path.join(output,'electron.exe'),path.join(output,'OA-Knowledge.exe'));fs.unlinkSync(path.join(output,'electron.exe'));
const app=path.join(output,'resources/app'),dest=path.join(app,'desktop');fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'oa-knowledge',version:'0.3.1',main:'desktop/main.cjs',private:true}));
for(const file of ['main.cjs','mcp-config.cjs','preload.cjs','paths.cjs','offline-guard.cjs','policy.cjs','api-policy.cjs','package.json'])fs.copyFileSync(path.join(desktop,file),path.join(dest,file));
for(const dir of ['runtime','ui','fixtures','scripts','tests'])copy(path.join(desktop,dir),path.join(dest,dir),{filter:p=>!['.env','.env.local'].includes(path.basename(p))});
for(const stale of ['environment.cjs','runtime/parser-worker.cjs']){const file=path.join(dest,stale);if(fs.existsSync(file))fs.unlinkSync(file);}
copy(path.join(desktop,'assets'),path.join(dest,'assets'),{filter:p=>{const rel=path.relative(path.join(desktop,'assets'),p);return !path.basename(p).startsWith('electron-')&&!['empty.db','empty.db.new'].includes(rel);}});
fs.copyFileSync(path.join(root,'LICENSE'),path.join(output,'AnythingLLM-LICENSE.txt'));
for(const file of ['USER-GUIDE.md','CONNECT-AI.md','OPEN-SOURCE.md','LICENSE','ARCHITECTURE.md','RELEASE-NOTES.md','EXCEL-DESIGN.md'])fs.copyFileSync(path.join(desktop,file),path.join(output,file));
const reports=path.join(output,'reports');fs.mkdirSync(reports,{recursive:true});fs.copyFileSync(path.join(desktop,'review/runtime-audit.json'),path.join(reports,'runtime-audit.json'));
const connections=path.join(output,'connections');fs.mkdirSync(connections,{recursive:true});const configs=require('../mcp-config.cjs').configs();fs.writeFileSync(path.join(connections,'claude.mcp.json'),configs.claude+'\n');fs.writeFileSync(path.join(connections,'codex.toml'),configs.codex);console.log('Built '+output);
