import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

async function puertoLibre():Promise<number>{return new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const addr=s.address();if(!addr||typeof addr==='string')return reject(new Error('Sin puerto'));const port=addr.port;s.close(()=>resolve(port));});});}
test('API local valida acceso, salud y configuración ausente',async t=>{
  const port=await puertoLibre(),code='codigo-demo-prueba',url=`http://127.0.0.1:${port}`;
  const proc=spawn(process.execPath,['--import','tsx','src/server.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),GEMINI_API_KEY:'',DEMO_ACCESS_CODE:code},stdio:'ignore'});t.after(()=>proc.kill());
  let ready=false;for(let i=0;i<50;i++){try{await fetch(url+'/api/health');ready=true;break;}catch{await delay(100);}}assert.equal(ready,true);
  assert.equal((await fetch(url+'/api/health')).status,401);
  const headers={Authorization:'Basic '+Buffer.from(`demo:${code}`).toString('base64')};const health=await fetch(url+'/api/health',{headers});assert.equal(health.status,200);assert.equal((await health.json() as {configured:boolean}).configured,false);
  const wrong=await fetch(url+'/api/chat',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:''})});assert.equal(wrong.status,400);
  const invalidJson=await fetch(url+'/api/chat',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{'});assert.equal(invalidJson.status,400);assert.deepEqual(await invalidJson.json(),{error:'Solicitud inválida.'});
  const noKey=await fetch(url+'/api/chat',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:'hola'})});assert.equal(noKey.status,503);
  assert.equal((await fetch(url+'/',{headers})).status,200);
});
