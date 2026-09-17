// Windows build workstation only: range download, then verify the checksum
// shipped in the pinned official Electron npm package before extraction.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile,execFileSync}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const desktop=path.resolve(__dirname,'..');
const version=require('../node_modules/electron/package.json').version;
if(version!=='44.4.1')throw new Error('Update and review download metadata for the new Electron version.');
const name=`electron-v${version}-win32-x64.zip`;
const expected=require('../node_modules/electron/checksums.json')[name];
const size=158290103;
const dir=path.join(desktop,'assets');fs.mkdirSync(dir,{recursive:true});
const zip=path.join(dir,name);
async function hash(file){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
(async()=>{
 const existing=fs.existsSync(zip)?fs.statSync(zip).size:0;
 if(existing<size){
   const jobs=[],step=Math.ceil((size-existing)/8);
   for(let start=existing,i=0;start<size;start+=step,i++){
     const end=Math.min(size-1,start+step-1),file=path.join(dir,`electron-part-${i}`);
     jobs.push({start,end,file});
   }
   await Promise.all(jobs.map(async job=>{
     const have=fs.existsSync(job.file)?fs.statSync(job.file).size:0;
     if(have===job.end-job.start+1)return;
     console.log(`Electron range ${job.start}–${job.end}`);
     const remaining=job.file+'.remaining';
     await execute('curl.exe',['-sS','-L','--fail','--connect-timeout','20','--max-time','600','--retry','4','--retry-all-errors','--range',`${job.start+have}-${job.end}`,'--output',remaining,`https://github.com/electron/electron/releases/download/v${version}/${name}`],{windowsHide:true,maxBuffer:1024*1024});
     if(fs.statSync(remaining).size!==job.end-job.start-have+1)throw new Error('Unexpected remaining range size');
     fs.appendFileSync(job.file,fs.readFileSync(remaining));fs.unlinkSync(remaining);
     if(fs.statSync(job.file).size!==job.end-job.start+1)throw new Error('Unexpected range size');
   }));
   for(const job of jobs){fs.appendFileSync(zip,fs.readFileSync(job.file));fs.unlinkSync(job.file);}
 }
 if(await hash(zip)!==expected)throw new Error('Electron SHA-256 mismatch; do not execute this artifact.');
 const dist=path.join(desktop,'node_modules/electron/dist');fs.mkdirSync(dist,{recursive:true});
 execFileSync('tar.exe',['-xf',zip,'-C',dist],{windowsHide:true});
 fs.writeFileSync(path.join(desktop,'node_modules/electron/path.txt'),'electron.exe');
 fs.writeFileSync(path.join(dir,'electron-manifest.json'),JSON.stringify({version,file:name,sha256:expected,source:`https://github.com/electron/electron/releases/download/v${version}/${name}`,verified:true},null,2));
 console.log('Electron verified and extracted.');
})().catch(error=>{console.error(error);process.exitCode=1;});
