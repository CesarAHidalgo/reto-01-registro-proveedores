import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const exec=promisify(execFile);
const paths=[['agent/prompt.md','modulo/agent.md'],['src/tools/proveedor.ts','modulo/tools/proveedor.ts'],['src/knowledge/registro-proveedor.md','modulo/skill/registro-proveedor/SKILL.md']];
test('el módulo contiene las mismas piezas sin enlaces externos',async t=>{
 for(const [fuente,destino] of paths){assert.ok(fuente&&destino);assert.equal((await fs.lstat(destino)).isSymbolicLink(),false);assert.deepEqual(await fs.readFile(destino),await fs.readFile(fuente));}
 const root=JSON.parse(await fs.readFile('package.json','utf8')) as {dependencies:Record<string,string>;overrides:unknown};
 const modulePackage=JSON.parse(await fs.readFile('modulo/package.json','utf8')) as {dependencies:Record<string,string>;overrides:unknown};
 for(const dependency of ['zod','exceljs','pdf-lib'])assert.equal(modulePackage.dependencies[dependency],root.dependencies[dependency]);
 assert.deepEqual(modulePackage.overrides,root.overrides);
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'modulo-reto-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const modulo=path.join(temp,'modulo');await fs.cp(path.join(process.cwd(),'modulo'),modulo,{recursive:true});
 await fs.symlink(path.join(process.cwd(),'node_modules'),path.join(modulo,'node_modules'),'dir');
 const cli=path.join(process.cwd(),'node_modules/tsx/dist/cli.mjs');
 const archivo=path.join(modulo,'tools/proveedor.ts');
 const {stdout}=await exec(process.execPath,[cli,'-e',`import(${JSON.stringify(archivo)}).then(m=>console.log(typeof m.leer_solicitud.execute))`],{cwd:modulo});
 assert.equal(stdout.trim(),'function');
});
