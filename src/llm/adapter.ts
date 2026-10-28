import type { Content, FunctionDeclaration } from '@google/genai';
export interface RespuestaModelo { contenido: Content; texto: string; llamadas: {nombre:string; argumentos:Record<string,unknown>}[]; tokens: number; }
export interface AdaptadorLLM {
  enviar(contenidos: Content[], herramientas: FunctionDeclaration[], instrucciones: string, restante: number): Promise<RespuestaModelo>;
}
