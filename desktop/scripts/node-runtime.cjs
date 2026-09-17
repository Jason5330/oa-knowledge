const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const index=await (await fetch('https://nodejs.org/dist/latest-v24.x/')).text();
 const version=index.match(/node-(v24\.\d+\.\d+)-win-x64\.zip/)[1];
 const base='https://nodejs.org/dist/'+version;
 const sums=await (await fetch(base+'/SHASUMS256.txt')).text();const expected=sums.split('\n').find(l=>l.endsWith('  win-x64/node.exe')).split(' ')[0];
 const bytes=Buffer.from(await (await fetch(base+'/win-x64/node.exe')).arrayBuffer());const actual=crypto.createHash('sha256').update(bytes).digest('hex');if(actual!==expected)throw new Error('Node checksum mismatch');
 const assets=path.resolve(__dirname,'../assets');fs.writeFileSync(path.join(assets,'node.exe'),bytes);fs.writeFileSync(path.join(assets,'node-manifest.json'),JSON.stringify({version,url:base+'/win-x64/node.exe',sha256:actual},null,2));
 const licenseUrl='https://raw.githubusercontent.com/nodejs/node/'+version+'/LICENSE',license=Buffer.from(await (await fetch(licenseUrl)).text());fs.writeFileSync(path.join(assets,'licenses/Node-LICENSE'),license);
 const manifestFile=path.join(assets,'manifest.json');if(fs.existsSync(manifestFile)){const manifest=JSON.parse(fs.readFileSync(manifestFile));const entry=manifest.find(x=>x.file==='licenses/Node-LICENSE');if(entry)Object.assign(entry,{url:licenseUrl,sha256:crypto.createHash('sha256').update(license).digest('hex'),bytes:license.length});fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));}
 console.log('Verified bundled Node '+version);
})().catch(e=>{console.error(e);process.exitCode=1;});
