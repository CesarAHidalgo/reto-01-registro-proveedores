/** Contrato interno del agente: no depende de tipos de un proveedor concreto. */
export interface ParteMensaje {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name?: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name?: string; response?: Record<string, unknown>; id?: string };
}
export interface MensajeModelo { role?: string; parts?: ParteMensaje[] }
export interface DeclaracionHerramienta {
  name: string;
  description: string;
  parametersJsonSchema: unknown;
}
export interface RespuestaModelo {
  contenido: MensajeModelo;
  texto: string;
  llamadas: { nombre: string; argumentos: Record<string, unknown> }[];
  tokens: number;
}
/** La llamada pudo consumirse en el proveedor aunque no se recibiera respuesta. */
export class ErrorConsumoIncierto extends Error {
  constructor(readonly reservaTokens:number) {
    super('No se pudo confirmar el consumo del proveedor.');
  }
}
export interface AdaptadorLLM {
  enviar(contenidos: MensajeModelo[], herramientas: DeclaracionHerramienta[], instrucciones: string, restante: number): Promise<RespuestaModelo>;
}
