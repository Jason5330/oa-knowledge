const fs=require('node:fs');
const path=require('node:path');
// Avoid Node 22's native cpSync crash seen on this Windows build.
module.exports=function copyTree(source,destination,{filter=()=>true}={}) {
  if(!filter(source))return;
  const stat=fs.statSync(source);
  if(stat.isDirectory()){
    fs.mkdirSync(destination,{recursive:true});
    for(const entry of fs.readdirSync(source))module.exports(path.join(source,entry),path.join(destination,entry),{filter});
  }else fs.copyFileSync(source,destination);
};
