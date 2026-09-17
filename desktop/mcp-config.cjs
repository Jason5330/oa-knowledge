const fs = require('node:fs');
const path = require('node:path');
const {defaultDataDir} = require('./paths.cjs');

// No user name, drive or installation directory is embedded in shared settings.
// PowerShell resolves LOCALAPPDATA at launch; installation paths are JSON data,
// never interpolated into shell code. No profiles or execution-policy changes.
const bootstrap = "$ErrorActionPreference='Stop'; $OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $p=Join-Path $env:LOCALAPPDATA 'OA-Knowledge\\mcp\\connection.json'; if (!(Test-Path -LiteralPath $p)) { throw 'Open OA Knowledge once before connecting MCP.' }; $c=Get-Content -LiteralPath $p -Raw -Encoding UTF8 | ConvertFrom-Json; if (!(Test-Path -LiteralPath $c.node) -or !(Test-Path -LiteralPath $c.server)) { throw 'OA Knowledge moved: open the app at its new location.' }; $env:OA_DATA_DIR=$c.data; & $c.node $c.server; exit $LASTEXITCODE";

function configs() {
  const command='powershell.exe', args=['-NoLogo','-NoProfile','-NonInteractive','-Command',bootstrap];
  const claude=JSON.stringify({mcpServers:{'oa-knowledge':{type:'stdio',command,args}}},null,2);
  const codex=`[mcp_servers.oa-knowledge]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\nenv_vars = ["LOCALAPPDATA"]\nstartup_timeout_sec = 60\ntool_timeout_sec = 180\n`;
  return {claude,codex};
}

function register({node,server,data,base=defaultDataDir()}) {
  for(const file of [node,server]) if(!path.isAbsolute(file)||!fs.statSync(file).isFile()) throw new Error('MCP executable or server missing');
  if(!path.isAbsolute(data)) throw new Error('MCP data path must be absolute');
  const dir=path.join(base,'mcp');fs.mkdirSync(dir,{recursive:true});
  const dest=path.join(dir,'connection.json'),temp=path.join(dir,`connection-${process.pid}.tmp`);
  try { fs.writeFileSync(temp,JSON.stringify({version:1,node,server,data},null,2),'utf8');fs.renameSync(temp,dest); }
  finally { if(fs.existsSync(temp)) fs.unlinkSync(temp); }
  return dest;
}
module.exports={configs,register};
