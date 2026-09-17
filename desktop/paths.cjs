const path=require('node:path');
module.exports.defaultDataDir=()=>path.join(process.env.LOCALAPPDATA||require('node:os').homedir(),'OA-Knowledge');
