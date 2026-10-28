import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import type { AdaptadorLLM } from './llm/adapter.js';
import * as proveedor from './tools/proveedor.js';

type ToolCall={nombre:string;argumentos:Record<string,unknown>;resultado:string};
export type Session={contenidos:Content[];historial:{role:string;contenido:string;toolCalls?:ToolCall[];needsConfirmation?:boolean}[];tokens:number;pendiente?:string;ocupada:boolean};
type Result={ok:boolean;data?:unknown;error?:string};
const toolNames=['leer_solicitud','mapear_campos','generar_formulario','armar_paquete','simular_envio'] as const;
type ToolName=typeof toolNames[number];
export const declarations:FunctionDeclaration[]=toolNames.map(name=>{const tool=proveedor[name];return {name:`proveedor_${name}`,description:tool.description,parametersJsonSchema:z.toJSONSchema(z.object(tool.args))};});
function resumir(data:unknown):string {if(!data || typeof data!=='object')return 'Operación completada';const d=data as Record<string,unknown>;if(Array.isArray(d.campos))return `${d.campos.length} campos; formato ${String(d.formato)}`;if(Array.isArray(d.llenos))return `${d.llenos.length} llenos, ${Array.isArray(d.faltantes)?d.faltantes.length:0} faltantes, ${Array.isArray(d.requiere_confirmacion)?d.requiere_confirmacion.length:0} por confirmar`;if('listo_para_firma'in d)return `Listo para firma: ${d.listo_para_firma?'sí':'no'}`;return typeof d.ruta==='string'?`Generado: ${d.ruta}`:'Operación completada';}
function resumirArgs(args:Record<string,unknown>):Record<string,unknown> {const out:Record<string,unknown>={};if(typeof args.caso==='string')out.caso=args.caso;if(Array.isArray(args.campos))out.campos=`${args.campos.length} campos`;if('mapeo'in args)out.mapeo='[mapeo validado por herramienta]';if('confirmado'in args)out.confirmado=args.confirmado;return out;}
async function invocar(nombre:string,args:Record<string,unknown>,ctx:proveedor.Contexto):Promise<Result> {
  const simple=nombre.replace(/^proveedor_/,'');
  if(!nombre.startsWith('proveedor_') || !toolNames.includes(simple as ToolName))return {ok:false,error:'Herramienta desconocida.'};
  const key=simple as ToolName; const tool=proveedor[key];const parsed=z.object(tool.args).safeParse(args);
  if(!parsed.success)return {ok:false,error:'Los argumentos de la herramienta no cumplen el formato requerido.'};
  let raw:string;
  switch(key) {
    case 'leer_solicitud': raw=await proveedor.leer_solicitud.execute(parsed.data as {caso:string},ctx);break;
    case 'mapear_campos': raw=await proveedor.mapear_campos.execute(parsed.data as Parameters<typeof proveedor.mapear_campos.execute>[0],ctx);break;
    case 'generar_formulario': raw=await proveedor.generar_formulario.execute(parsed.data as Parameters<typeof proveedor.generar_formulario.execute>[0],ctx);break;
    case 'armar_paquete': raw=await proveedor.armar_paquete.execute(parsed.data as {caso:string},ctx);break;
    case 'simular_envio': raw=await proveedor.simular_envio.execute(parsed.data as {caso:string;confirmado:boolean},ctx);break;
  }
  return JSON.parse(raw) as Result;
}
async function registrarRechazo(directory:string,nombre:string):Promise<void> {
  await fs.mkdir(path.join(directory,'out'),{recursive:true});
  await fs.appendFile(path.join(directory,'out','log.jsonl'),JSON.stringify({ts:new Date().toISOString(),herramienta:nombre,ok:false,resumen:'Llamada rechazada'})+'\n');
}
export class Agente {
  constructor(private modelo:AdaptadorLLM,private prompt:string,private directory:string,private maxIteraciones:number,private maxTokens:number){}
  async conversar(session:Session,id:string,message:string):Promise<{reply:string;toolCalls:ToolCall[];needsConfirmation:boolean}> {
    const llamadas:ToolCall[]=[];
    if(session.ocupada) return {reply:'Hay una operación en curso para esta sesión.',toolCalls:[],needsConfirmation:false};
    session.ocupada=true;
    try {
      session.historial.push({role:'user',contenido:message});
      const pendiente=session.pendiente; session.pendiente=undefined;
      const confirma=/^(s[ií]|confirmo|confirmar|enviar|env[ií]a|de acuerdo|adelante)[.!\s]*$/i.test(message.trim());
      if(pendiente && confirma) {
        const args={caso:pendiente,confirmado:true};const r=await invocar('proveedor_simular_envio',args,{directory:this.directory,sessionId:id,confirmadoEnTurnoAnterior:true});
        llamadas.push({nombre:'proveedor_simular_envio',argumentos:args,resultado:r.ok?resumir(r.data):r.error??'Error'});
        const reply=r.ok?'Se registró el envío simulado. No se envió ningún correo ni documento.':`No se pudo registrar la simulación: ${r.error}`;
        session.contenidos.push({role:'user',parts:[{text:message}]},{role:'model',parts:[{text:reply}]});session.historial.push({role:'assistant',contenido:reply,toolCalls:llamadas,needsConfirmation:false});
        return {reply,toolCalls:llamadas,needsConfirmation:false};
      }
      session.contenidos.push({role:'user',parts:[{text:message}]});
      let reply='';let casoPreparado:string|undefined;
      for(let i=0;i<this.maxIteraciones;i++) {
        const restante=this.maxTokens-session.tokens;if(restante<=0){reply='La sesión alcanzó su límite de tokens. Inicia otra sesión para continuar.';break;}
        const r=await this.modelo.enviar(session.contenidos,declarations,this.prompt,restante);
        session.tokens+=r.tokens;session.contenidos.push(r.contenido);
        if(!r.llamadas.length){reply=r.texto||'El modelo no produjo una respuesta. Inténtalo de nuevo.';break;}
        const respuestas:Part[]=[];
        for(const call of r.llamadas) {
          const isSend=call.nombre==='proveedor_simular_envio';
          const resultado=isSend?{ok:false,error:'Se requiere confirmación explícita del usuario en el turno anterior.'}:await invocar(call.nombre,call.argumentos,{directory:this.directory,sessionId:id});
          const nombreCorto=call.nombre.replace(/^proveedor_/,'');
          const conocida=call.nombre.startsWith('proveedor_') && toolNames.includes(nombreCorto as ToolName);
          const argumentosValidos=conocida && z.object(proveedor[nombreCorto as ToolName].args).safeParse(call.argumentos).success;
          if(isSend || !conocida || !argumentosValidos) await registrarRechazo(this.directory,conocida?call.nombre:'herramienta_desconocida');
          if(call.nombre==='proveedor_armar_paquete'&&resultado.ok&&typeof call.argumentos.caso==='string')casoPreparado=call.argumentos.caso;
          if(isSend&&typeof call.argumentos.caso==='string')casoPreparado=call.argumentos.caso;
          llamadas.push({nombre:call.nombre,argumentos:resumirArgs(call.argumentos),resultado:resultado.ok?resumir(resultado.data):resultado.error??'Error'});
          respuestas.push({functionResponse:{name:call.nombre,response:resultado as Record<string,unknown>}});
        }
        session.contenidos.push({role:'user',parts:respuestas});
      }
      if(!reply)reply='Se alcanzó el límite de pasos de este turno. Revisa las operaciones realizadas y solicita continuar.';
      // El estado de confirmación es responsabilidad del servidor, no del modelo.
      const needsConfirmation=Boolean(casoPreparado);
      if(casoPreparado){session.pendiente=casoPreparado;reply=reply.replace(/\s*¿(?:confirmas|deseas|quieres)[^?]*\?\s*$/i,'').trim()+`\n\n¿Confirmas registrar un envío simulado para ${casoPreparado}? No se enviará ningún correo ni documento.`;}
      session.historial.push({role:'assistant',contenido:reply,toolCalls:llamadas,needsConfirmation});
      return {reply,toolCalls:llamadas,needsConfirmation};
    } catch (error) {
      const reply=error instanceof Error && error.message==='La sesión alcanzó su límite de tokens.'
        ? 'La sesión alcanzó su límite de tokens. Inicia otra sesión para continuar.'
        : 'No se pudo completar la solicitud por un error del modelo o de conexión. Puedes intentarlo nuevamente.';
      // Evita mantener una respuesta de herramienta parcial y dejar la conversación inutilizable.
      session.contenidos=[];session.pendiente=undefined;session.historial.push({role:'assistant',contenido:reply,toolCalls:llamadas,needsConfirmation:false});
      return {reply,toolCalls:llamadas,needsConfirmation:false};
    } finally {session.ocupada=false;}
  }
}
