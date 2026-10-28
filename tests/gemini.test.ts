import test from 'node:test';
import assert from 'node:assert/strict';
import { Gemini } from '../src/llm/gemini.js';
import { ErrorConsumoIncierto } from '../src/llm/adapter.js';
import { declarations } from '../src/agent.js';

test('el adaptador Gemini procesa llamadas de herramientas del SDK sin red',async()=>{
 const original=globalThis.fetch;const endpoints:string[]=[];let solicitudConteo:unknown;
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=input instanceof Request?input.url:String(input);
  const endpoint=url.includes(':countTokens')?'count':url.includes(':generateContent')?'generate':'unknown';endpoints.push(endpoint);
  if(endpoint==='count')solicitudConteo=JSON.parse(String(init?.body));
  const payload=endpoint==='count'?{totalTokens:50}:{candidates:[{content:{role:'model',parts:[{functionCall:{name:'proveedor_leer_solicitud',args:{caso:'ec-corp-andina'}}}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:50,candidatesTokenCount:10,totalTokenCount:60}};
  return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
 };
 try {
  const adapter=new Gemini('test-key','test-model',3000,100);
  const result=await adapter.enviar([{role:'user',parts:[{text:'Procesa Ecuador'}]}],declarations,'prompt',1000);
  assert.deepEqual(endpoints,['count','generate']);assert.equal(result.tokens,60);
  assert.match(JSON.stringify(solicitudConteo),/generateContentRequest/);assert.match(JSON.stringify(solicitudConteo),/systemInstruction/);assert.match(JSON.stringify(solicitudConteo),/functionDeclarations/);
  assert.equal(result.llamadas[0]?.nombre,'proveedor_leer_solicitud');assert.equal(result.llamadas[0]?.argumentos.caso,'ec-corp-andina');
 } finally {globalThis.fetch=original;}
});

test('el adaptador reserva el consumo máximo si falla después del conteo',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const url=input instanceof Request?input.url:String(input);
  if(url.includes(':countTokens'))return new Response(JSON.stringify({totalTokens:50}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('fallo simulado');
 };
 try {
  const adapter=new Gemini('test-key','test-model',3000,100);
  await assert.rejects(adapter.enviar([{role:'user',parts:[{text:'hola'}]}],declarations,'prompt',1000),error=>error instanceof ErrorConsumoIncierto && error.reservaTokens===150);
 } finally {globalThis.fetch=original;}
});

test('el agente completa el ciclo con el SDK y una API Gemini simulada',async t=>{
 const {promises:fs}=await import('node:fs');const path=await import('node:path');const os=await import('node:os');const {Agente}=await import('../src/agent.js');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gemini-ciclo-'));await fs.symlink(path.join(process.cwd(),'fixtures'),path.join(dir,'fixtures'),'dir');t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const original=globalThis.fetch;let generaciones=0;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const url=input instanceof Request?input.url:String(input);
  if(url.includes(':countTokens'))return new Response(JSON.stringify({totalTokens:100}),{status:200,headers:{'content-type':'application/json'}});
  generaciones++;
  const part=generaciones===1?{functionCall:{name:'proveedor_armar_paquete',args:{caso:'ec-corp-andina'}}}:{text:'NIT inventado 111111'};
  return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[part]},finishReason:'STOP'}],usageMetadata:{totalTokenCount:120}}),{status:200,headers:{'content-type':'application/json'}});
 };
 try {
  const session={contenidos:[],historial:[],tokens:0,ocupada:false};
  const agent=new Agente(new Gemini('test-key','test-model',3000,100),'prompt',dir,4,1000);
  const r=await agent.conversar(session,'test','Procesa el caso ec-corp-andina');
  assert.equal(generaciones,2);assert.equal(r.needsConfirmation,true);assert.match(r.reply,/Paquete:/);assert.match(r.reply,/900123456/);assert.doesNotMatch(r.reply,/111111/);
 } finally {globalThis.fetch=original;}
});
