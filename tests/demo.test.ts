import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
const exec=promisify(execFile);
test('demo sin clave procesa todos los casos con resultados reproducibles',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'demo-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.symlink(path.join(process.cwd(),'fixtures'),path.join(dir,'fixtures'),'dir');
 const cli=path.join(process.cwd(),'node_modules/tsx/dist/cli.mjs'),script=path.join(process.cwd(),'demo.ts');
 const ejecutar=async()=>{const {stdout}=await exec(process.execPath,[cli,script],{cwd:dir,env:{...process.env,GEMINI_API_KEY:''}});const rows=stdout.trim().split('\n').map(line=>JSON.parse(line) as {caso:string});const contents=await Promise.all(rows.map(r=>fs.readFile(path.join(dir,'out',r.caso,'mapeo.json'),'utf8')));return {rows,contents};};
 const primero=await ejecutar(),segundo=await ejecutar();assert.equal(primero.rows.length,4);assert.deepEqual(segundo,primero);
});
