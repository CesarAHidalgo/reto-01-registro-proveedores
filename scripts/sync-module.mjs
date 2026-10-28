import { promises as fs } from 'node:fs';
import path from 'node:path';

// The standalone package is generated from the same sources used by the app.
const copies=[
  ['agent/prompt.md','modulo/agent.md'],
  ['src/tools/proveedor.ts','modulo/tools/proveedor.ts'],
  ['src/knowledge/registro-proveedor.md','modulo/skill/registro-proveedor/SKILL.md']
];
for(const [source,target] of copies){
  await fs.mkdir(path.dirname(target),{recursive:true});
  try {if((await fs.lstat(target)).isSymbolicLink())await fs.unlink(target);}catch(error){if(error?.code!=='ENOENT')throw error;}
  await fs.copyFile(source,target);
}
const root=JSON.parse(await fs.readFile('package.json','utf8'));
const dependencies=Object.fromEntries(['zod','exceljs','pdf-lib'].map(name=>[name,root.dependencies[name]]));
await fs.writeFile('modulo/package.json',JSON.stringify({name:'registro-proveedor-modulo',version:root.version,private:true,type:'module',dependencies,overrides:root.overrides},null,2)+'\n');
