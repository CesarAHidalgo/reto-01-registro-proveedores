import { GoogleGenAI } from '@google/genai';
import { ErrorConsumoIncierto } from './adapter.js';
import type { AdaptadorLLM, RespuestaModelo, MensajeModelo, DeclaracionHerramienta } from './adapter.js';

export class Gemini implements AdaptadorLLM {
  private cliente: GoogleGenAI;
  constructor(private clave:string, private modelo:string, private timeout:number, private maxSalida:number) {this.cliente=new GoogleGenAI({apiKey:clave});}
  async enviar(contenidos:MensajeModelo[],herramientas:DeclaracionHerramienta[],instrucciones:string,restante:number):Promise<RespuestaModelo> {
    const tools=[{functionDeclarations:herramientas}];
    // El SDK de Gemini Developer API no admite tools/systemInstruction en su
    // interfaz countTokens; el endpoint REST sí permite generateContentRequest.
    // Esto cuenta tanto el historial como el prompt y las herramientas.
    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelo)}:countTokens`;
    const cuenta=await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':this.clave},
      body:JSON.stringify({generateContentRequest:{model:`models/${this.modelo}`,contents:contenidos,systemInstruction:{parts:[{text:instrucciones}]},tools}}),
      signal:AbortSignal.timeout(this.timeout)
    });
    if(!cuenta.ok)throw new Error('No se pudo verificar el consumo de tokens.');
    const payload:unknown=await cuenta.json();
    const entrada=typeof payload==='object' && payload!==null && 'totalTokens' in payload ? (payload as {totalTokens:unknown}).totalTokens : undefined;
    if(typeof entrada!=='number' || !Number.isSafeInteger(entrada) || entrada<0)throw new Error('No se pudo verificar el consumo de tokens.');
    const disponible=restante-entrada;
    if(disponible<1) throw new Error('La sesión alcanzó su límite de tokens.');
    const maxOutputTokens=Math.min(this.maxSalida,disponible);
    let r:Awaited<ReturnType<typeof this.cliente.models.generateContent>>;
    try {
      r=await this.cliente.models.generateContent({model:this.modelo,contents:contenidos,config:{tools,systemInstruction:instrucciones,maxOutputTokens,temperature:0,abortSignal:AbortSignal.timeout(this.timeout)}});
    } catch {
      throw new ErrorConsumoIncierto(entrada+maxOutputTokens);
    }
    const contenido=r.candidates?.[0]?.content;
    if(!contenido) throw new ErrorConsumoIncierto(r.usageMetadata?.totalTokenCount??entrada+maxOutputTokens);
    const tokens=r.usageMetadata?.totalTokenCount;
    // Si falta la medición, cobrar la reserva completa para no subestimar la cuota.
    const texto=(contenido.parts??[]).filter(p=>!p.thought && typeof p.text==='string').map(p=>p.text).join('');
    return {contenido,texto,llamadas:(r.functionCalls??[]).map(c=>({nombre:c.name??'',argumentos:c.args??{}})),tokens:tokens??entrada+maxOutputTokens};
  }
}
