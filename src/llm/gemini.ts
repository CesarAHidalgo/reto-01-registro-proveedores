import { GoogleGenAI, type Content, type FunctionDeclaration } from '@google/genai';
import type { AdaptadorLLM, RespuestaModelo } from './adapter.js';

export class Gemini implements AdaptadorLLM {
  private cliente: GoogleGenAI;
  constructor(private clave:string, private modelo:string, private timeout:number, private maxSalida:number) {this.cliente=new GoogleGenAI({apiKey:clave});}
  async enviar(contenidos:Content[],herramientas:FunctionDeclaration[],instrucciones:string,restante:number):Promise<RespuestaModelo> {
    const tools=[{functionDeclarations:herramientas}];
    const cuenta=await this.cliente.models.countTokens({model:this.modelo,contents:contenidos,config:{tools,systemInstruction:instrucciones,abortSignal:AbortSignal.timeout(this.timeout)}});
    const entrada=cuenta.totalTokens;
    if(entrada===undefined) throw new Error('No se pudo verificar el consumo de tokens.');
    const disponible=restante-entrada;
    if(disponible<1) throw new Error('La sesión alcanzó su límite de tokens.');
    const maxOutputTokens=Math.min(this.maxSalida,disponible);
    const r=await this.cliente.models.generateContent({model:this.modelo,contents:contenidos,config:{tools,systemInstruction:instrucciones,maxOutputTokens,temperature:0,abortSignal:AbortSignal.timeout(this.timeout)}});
    const contenido=r.candidates?.[0]?.content;
    if(!contenido) throw new Error('El modelo no devolvió una respuesta utilizable.');
    const tokens=r.usageMetadata?.totalTokenCount;
    // Si falta la medición, cobrar la reserva completa para no subestimar la cuota.
    return {contenido,texto:r.text??'',llamadas:(r.functionCalls??[]).map(c=>({nombre:c.name??'',argumentos:c.args??{}})),tokens:tokens??entrada+maxOutputTokens};
  }
}
