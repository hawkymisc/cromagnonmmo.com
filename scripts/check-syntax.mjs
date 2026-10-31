import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files=['server.mjs', 'public/site-analytics.js'];
// Subfolders too, so scripts/archive and the tool folders stay checked.
const walk=(directory)=>{
  for(const entry of readdirSync(path.join(root,directory),{withFileTypes:true})){
    const file=`${directory}/${entry.name}`;
    if(entry.isDirectory())walk(file);
    else if(entry.isFile()&&/\.(mjs|js)$/.test(entry.name))files.push(file);
  }
};
for(const directory of ['src','shared','scripts','tests','cloudflare'])walk(directory);
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,stdio:'pipe',windowsHide:true});
  if(result.status!==0){
    console.error(`${file}: ${result.error?.message??result.stderr?.toString()}`);
    process.exitCode=1;
  }
}
if(!process.exitCode)console.log(`Syntax checked ${files.length} JavaScript files.`);
