import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ErrorConsumoIncierto } from './llm/adapter.js';
import type { AdaptadorLLM, MensajeModelo, DeclaracionHerramienta, ParteMensaje } from './llm/adapter.js';
import * as proveedor from './tools/proveedor.js';

type ToolCall={nombre:string;argumentos:Record<string,unknown>;resultado:string};
export type Session={contenidos:MensajeModelo[];historial:{role:string;contenido:string;toolCalls?:ToolCall[];needsConfirmation?:boolean}[];tokens:number;pendiente?:string;preparados?:string[];ocupada:boolean};
type Result={ok:boolean;data?:unknown;error?:string};
type Evento={nombre:string;resultado:Result};
const toolNames=['leer_solicitud','mapear_campos','generar_formulario','armar_paquete','simular_envio'] as const;
type ToolName=typeof toolNames[number];
export const declarations:DeclaracionHerramienta[]=toolNames.map(name=>{const tool=proveedor[name];return {name:`proveedor_${name}`,description:tool.description,parametersJsonSchema:z.toJSONSchema(z.object(tool.args))};});
function resumir(data:unknown):string {if(!data || typeof data!=='object')return 'Operación completada';const d=data as Record<string,unknown>;if(Array.isArray(d.campos))return `${d.campos.length} campos; formato ${String(d.formato)}`;if(Array.isArray(d.llenos))return `${d.llenos.length} llenos, ${Array.isArray(d.faltantes)?d.faltantes.length:0} faltantes, ${Array.isArray(d.requiere_confirmacion)?d.requiere_confirmacion.length:0} por confirmar`;if('listo_para_firma'in d)return `Listo para firma: ${d.listo_para_firma?'sí':'no'}`;return typeof d.ruta==='string'?`Generado: ${d.ruta}`:'Operación completada';}
function resumirArgs(args:Record<string,unknown>):Record<string,unknown> {const out:Record<string,unknown>={};if(typeof args.caso==='string')out.caso=args.caso;if(Array.isArray(args.campos))out.campos=`${args.campos.length} campos`;if('mapeo'in args)out.mapeo='[mapeo validado por herramienta]';if('confirmado'in args)out.confirmado=args.confirmado;return out;}
const campoResultado=z.object({etiqueta:z.string(),valor:z.union([z.string(),z.number(),z.boolean()]).optional(),ruta_maestro:z.string().optional(),nota:z.string().optional()});
const mapeoResultado=z.object({llenos:z.array(campoResultado),faltantes:z.array(campoResultado),requiere_confirmacion:z.array(campoResultado)});
const paqueteResultado=z.object({ruta:z.string(),listo_para_firma:z.boolean(),checklist:z.array(z.object({tipo:z.string(),estado:z.string(),vigencia_hasta:z.string().nullable()})),mapeo:mapeoResultado});
const solicitudResultado=z.object({cliente:z.string(),pais:z.string(),formato:z.string(),campos:z.array(z.unknown()),error_plantilla:z.string().optional()});
const formularioResultado=z.object({ruta:z.string(),formato:z.string(),aviso:z.string().optional()});

/** Presenta únicamente hechos obtenidos de herramientas, nunca texto libre del modelo. */
function respuestaVerificada(eventos:Evento[],limite:boolean):string {
  const lineas:string[]=[];
  let mapeo:z.infer<typeof mapeoResultado>|undefined;
  for(const evento of eventos) {
    if(!evento.resultado.ok) {
      lineas.push(`No se pudo completar ${evento.nombre}: ${evento.resultado.error ?? 'error de herramienta'}.`);
      continue;
    }
    const data=evento.resultado.data;
    if(evento.nombre==='proveedor_leer_solicitud') {
      const s=solicitudResultado.safeParse(data);
      if(s.success) {
        lineas.push(`Cliente: ${s.data.cliente}. País: ${s.data.pais}. Formato: ${s.data.formato}. Campos solicitados: ${s.data.campos.length}.`);
        if(s.data.error_plantilla) lineas.push(s.data.error_plantilla);
      }
    } else if(evento.nombre==='proveedor_mapear_campos') {
      const m=mapeoResultado.safeParse(data);if(m.success)mapeo=m.data;
    } else if(evento.nombre==='proveedor_generar_formulario') {
      const f=formularioResultado.safeParse(data);
      if(f.success)lineas.push(`Archivo generado: ${f.data.ruta}.${f.data.aviso?` ${f.data.aviso}.`:''}`);
    } else if(evento.nombre==='proveedor_armar_paquete') {
      const p=paqueteResultado.safeParse(data);
      if(p.success) {
        mapeo=p.data.mapeo;
        lineas.push(`Paquete: ${p.data.ruta}\nListo para firma: ${p.data.listo_para_firma?'sí':'no'}.`);
        lineas.push('Soportes:\n'+p.data.checklist.map(s=>`- ${s.tipo}: ${s.estado}${s.vigencia_hasta?` (vigencia hasta ${s.vigencia_hasta})`:''}`).join('\n'));
      }
    }
  }
  if(mapeo) {
    const valor=(c:z.infer<typeof campoResultado>)=>`${c.etiqueta}: ${String(c.valor ?? '')}${c.ruta_maestro?` (fuente: ${c.ruta_maestro})`:''}${c.nota?` — ${c.nota}`:''}`;
    lineas.push('Campos llenos:\n'+(mapeo.llenos.map(c=>`- ${valor(c)}`).join('\n')||'- Ninguno'));
    lineas.push('Campos faltantes:\n'+(mapeo.faltantes.map(c=>`- ${c.etiqueta}`).join('\n')||'- Ninguno'));
    lineas.push('Requieren confirmación:\n'+(mapeo.requiere_confirmacion.map(c=>`- ${valor(c)}`).join('\n')||'- Ninguno'));
  }
  if(limite)lineas.push('Se alcanzó el límite de pasos de este turno; solicita continuar para completar lo pendiente.');
  return lineas.join('\n\n') || 'Para responder con datos verificados, indica el caso que deseas procesar.';
}
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
      const eventos:Evento[]=[];
      let limite=true;
      for(let i=0;i<this.maxIteraciones;i++) {
        const restante=this.maxTokens-session.tokens;if(restante<=0){reply='La sesión alcanzó su límite de tokens. Inicia otra sesión para continuar.';limite=false;break;}
        let r:Awaited<ReturnType<AdaptadorLLM['enviar']>>;
        try {
          r=await this.modelo.enviar(session.contenidos,declarations,this.prompt,restante);
        } catch(error) {
          // El proveedor puede facturar una llamada aunque no llegue la respuesta.
          // Contabilizamos la reserva máxima comunicada por el adaptador.
          if(error instanceof ErrorConsumoIncierto)session.tokens+=Math.min(restante,error.reservaTokens);
          throw error;
        }
        session.tokens+=r.tokens;
        if(!r.llamadas.length){limite=false;break;}
        session.contenidos.push(r.contenido);
        const respuestas:ParteMensaje[]=[];
        for(const call of r.llamadas) {
          const isSend=call.nombre==='proveedor_simular_envio';
          const casoEnvio=typeof call.argumentos.caso==='string'?call.argumentos.caso:undefined;
          const preparado=casoEnvio!==undefined && (session.preparados??[]).includes(casoEnvio);
          const resultado=isSend?{ok:false,error:preparado?'Se requiere confirmación explícita del usuario en el turno anterior.':'Primero se debe preparar el paquete del caso.'}:await invocar(call.nombre,call.argumentos,{directory:this.directory,sessionId:id});
          const nombreCorto=call.nombre.replace(/^proveedor_/,'');
          const conocida=call.nombre.startsWith('proveedor_') && toolNames.includes(nombreCorto as ToolName);
          const argumentosValidos=conocida && z.object(proveedor[nombreCorto as ToolName].args).safeParse(call.argumentos).success;
          if(isSend || !conocida || !argumentosValidos) await registrarRechazo(this.directory,conocida?call.nombre:'herramienta_desconocida');
          eventos.push({nombre:conocida?call.nombre:'herramienta_desconocida',resultado});
          if(call.nombre==='proveedor_armar_paquete'&&resultado.ok&&typeof call.argumentos.caso==='string') {
            casoPreparado=call.argumentos.caso;
            session.preparados=[...new Set([...(session.preparados??[]),casoPreparado])];
          }
          if(isSend&&preparado)casoPreparado=casoEnvio;
          llamadas.push({nombre:call.nombre,argumentos:resumirArgs(call.argumentos),resultado:resultado.ok?resumir(resultado.data):resultado.error??'Error'});
          respuestas.push({functionResponse:{name:call.nombre,response:resultado as Record<string,unknown>}});
        }
        session.contenidos.push({role:'user',parts:respuestas});
      }
      if(!reply)reply=respuestaVerificada(eventos,limite);
      // El estado de confirmación es responsabilidad del servidor, no del modelo.
      const needsConfirmation=Boolean(casoPreparado);
      if(casoPreparado){session.pendiente=casoPreparado;reply=reply.replace(/\s*¿(?:confirmas|deseas|quieres)[^?]*\?\s*$/i,'').trim()+`\n\n¿Confirmas registrar un envío simulado para ${casoPreparado}? No se enviará ningún correo ni documento.`;}
      session.contenidos.push({role:'model',parts:[{text:reply}]});
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
