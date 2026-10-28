import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Agente,type Session } from '../src/agent.js';
import { ErrorConsumoIncierto } from '../src/llm/adapter.js';
import type { AdaptadorLLM,RespuestaModelo,MensajeModelo,DeclaracionHerramienta } from '../src/llm/adapter.js';
class ModeloFalso implements AdaptadorLLM {
  calls=0;
  constructor(private fase:'paquete'|'envio'|'sin-fin'|'error'='paquete'){}
  async enviar(_c:MensajeModelo[],_h:DeclaracionHerramienta[],_i:string,_r:number):Promise<RespuestaModelo>{
    this.calls++;if(this.fase==='error')throw new Error('secreto');
    const nombre=this.fase==='envio'?'proveedor_simular_envio':'proveedor_armar_paquete';
    if(this.calls===1||this.fase==='sin-fin')return {contenido:{role:'model',parts:[{functionCall:{name:nombre,args:{caso:'co-industrias-delta',confirmado:true}}}]},texto:'',llamadas:[{nombre,argumentos:{caso:'co-industrias-delta',confirmado:true}}],tokens:10};
    return {contenido:{role:'model',parts:[{text:'Paquete revisado.'}]},texto:'Paquete revisado.',llamadas:[],tokens:10};
  }
}
async function setup(t:test.TestContext){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agente-'));await fs.symlink(path.join(process.cwd(),'fixtures'),path.join(directory,'fixtures'),'dir');t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
function session():Session{return {contenidos:[],historial:[],tokens:0,ocupada:false};}
test('confirmación se solicita y se ejecuta solo en el turno siguiente',async t=>{const dir=await setup(t),s=session(),m=new ModeloFalso();const agente=new Agente(m,'prompt',dir,4,1000);const primero=await agente.conversar(s,'s','Procesa el caso');assert.equal(primero.needsConfirmation,true);assert.match(primero.reply,/¿Confirmas/);await assert.rejects(fs.access(path.join(dir,'out/co-industrias-delta/ENVIO-SIMULADO.md')));const segundo=await agente.conversar(s,'s','sí');assert.equal(segundo.needsConfirmation,false);assert.match(segundo.reply,/simulado/);await fs.access(path.join(dir,'out/co-industrias-delta/ENVIO-SIMULADO.md'));});
test('una llamada del modelo no confirma la acción',async t=>{const dir=await setup(t),s=session();const agente=new Agente(new ModeloFalso('envio'),'prompt',dir,4,1000);const r=await agente.conversar(s,'s','envía');assert.equal(r.needsConfirmation,false);assert.match(r.toolCalls[0]?.resultado??'',/Primero se debe preparar/);await assert.rejects(fs.access(path.join(dir,'out/co-industrias-delta/ENVIO-SIMULADO.md')));});
test('hay límite de iteraciones y el error no filtra detalles',async t=>{const dir=await setup(t);const modelo=new ModeloFalso('sin-fin');const r=await new Agente(modelo,'prompt',dir,2,1000).conversar(session(),'s','procesa');assert.equal(modelo.calls,2);assert.match(r.reply,/límite de pasos/);const err=await new Agente(new ModeloFalso('error'),'prompt',dir,2,1000).conversar(session(),'s','procesa');assert.doesNotMatch(err.reply,/secreto/);});
test('una respuesta distinta invalida la confirmación anterior',async t=>{const dir=await setup(t),s=session();const a=new Agente(new ModeloFalso(),'prompt',dir,4,1000);await a.conversar(s,'s','procesa');await a.conversar(s,'s','no, espera');assert.equal(s.pendiente,undefined);await assert.rejects(fs.access(path.join(dir,'out/co-industrias-delta/ENVIO-SIMULADO.md')));});
test('el chat no presenta datos inventados por el modelo',async t=>{
 const dir=await setup(t),s=session();
 const fake:AdaptadorLLM={enviar:async()=>({contenido:{role:'model',parts:[{text:'NIT inventado: 111111'}]},texto:'NIT inventado: 111111',llamadas:[],tokens:1})};
 const response=await new Agente(fake,'prompt',dir,2,1000).conversar(s,'s','¿Cuál es el NIT?');
 assert.doesNotMatch(response.reply,/111111/);assert.match(response.reply,/datos verificados/);
 assert.doesNotMatch(JSON.stringify(s.contenidos),/111111/);
});
test('la respuesta con datos se compone desde el paquete aunque el modelo invente',async t=>{
 const dir=await setup(t),s=session();let llamadas=0;
 const fake:AdaptadorLLM={enviar:async()=>{llamadas++;return llamadas===1?{contenido:{role:'model',parts:[{functionCall:{name:'proveedor_armar_paquete',args:{caso:'ec-corp-andina'}}}]},texto:'',llamadas:[{nombre:'proveedor_armar_paquete',argumentos:{caso:'ec-corp-andina'}}],tokens:10}:{contenido:{role:'model',parts:[{text:'NIT 111111'}]},texto:'NIT 111111',llamadas:[],tokens:10};}};
 const response=await new Agente(fake,'prompt',dir,4,1000).conversar(s,'s','procesa');
 assert.doesNotMatch(response.reply,/111111/);assert.match(response.reply,/900123456/);assert.match(response.reply,/Número de contribuyente especial/);assert.match(response.reply,/camara_comercio: vencido/);assert.equal(response.needsConfirmation,true);
});
test('un fallo con consumo incierto reserva tokens sin perder la sesión',async t=>{
 const dir=await setup(t),s=session();let calls=0;
 const fake:AdaptadorLLM={enviar:async()=>{calls++;if(calls===1)throw new ErrorConsumoIncierto(400);return {contenido:{role:'model',parts:[{text:'hola'}]},texto:'hola',llamadas:[],tokens:20};}};
 const agente=new Agente(fake,'prompt',dir,2,1000);
 assert.match((await agente.conversar(s,'s','hola')).reply,/error del modelo/);
 assert.equal(s.tokens,400);
 assert.match((await agente.conversar(s,'s','continuar')).reply,/datos verificados/);
 assert.equal(s.tokens,420);
});
