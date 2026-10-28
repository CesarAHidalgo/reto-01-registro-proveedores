# Registro como proveedor — reto 01

Agente conversacional en TypeScript para preparar formularios, soportes y un borrador. No firma ni realiza envíos reales. Los fixtures incluidos son ficticios y se mantienen sin modificar.

## Requisitos

Node.js 20 o superior, npm y, para el chat con modelo real, una clave de Gemini API. La demostración determinista y las pruebas no necesitan clave.

## Instalación y ejecución

```bash
npm ci
cp .env.example .env
# Edita .env localmente y coloca GEMINI_API_KEY sin compartirla.
npm run dev
```

Abrir `http://localhost:3000`. En modo local el servidor escucha solo en la interfaz de bucle local. Si no hay clave, la interfaz abre y la API comunica que falta configuración. Nunca incluyas `.env` en la entrega. Cambia `PORT` si el puerto está ocupado.

## Verificación

```bash
npm run typecheck
npm test
npm run demo
npm audit --omit=dev
```

`demo` elimina y regenera **únicamente** el directorio `out/` de este proyecto. Procesa todos los casos directamente contra las herramientas, sin llamadas al modelo, e imprime un resumen por caso. No ejecutar mientras haya otra sesión usando esos archivos.

## Uso

1. En el chat escribe: `Procesa el caso ec-corp-andina. Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.`
2. Revisa las llamadas a herramientas, los resultados y descarga el paquete.
3. Si quieres registrar una simulación, responde `sí` a la pregunta explícita inmediatamente posterior. No se envía ningún correo ni se firma nada.

Casos: `co-industrias-delta`, `ec-corp-andina`, `hn-agroexport-sula`, `pa-logistica-istmo`. El portal solo genera valores para copiar.

## API

- `GET /api/health`: proveedor, modelo y si está configurado, sin claves.
- `POST /api/chat`: `{ "sessionId": "UUID opcional", "message": "..." }`; devuelve sesión, respuesta, llamadas resumidas y estado de confirmación. Una nueva sesión omite `sessionId`.
- `GET /api/sessions/:id`: historial de la sesión.
- `GET /api/casos/:caso/paquete`: descarga el paquete generado como ZIP.

Las sesiones viven en memoria. Se pierden al reiniciar; los archivos se escriben en `out/`. `DEMO_ACCESS_CODE` habilita autenticación básica para la demo y es obligatorio cuando `NODE_ENV=production`: el usuario puede ser cualquiera y la contraseña es el valor configurado. Debe comunicarse de forma segura, no guardarse en el repositorio. El límite de peticiones es local a cada proceso; detrás de un proxy puede agrupar a varios clientes bajo una misma IP. Este control no sustituye autenticación, autorización ni aislamiento de producción.

## Despliegue de prueba

URL pública: **pendiente**. En un servicio Node que permita escritura temporal: compilar con `npm ci && npm run build`, iniciar con `npm start`, configurar `NODE_ENV=production`, `GEMINI_API_KEY` y `DEMO_ACCESS_CODE` en el entorno del servidor. El código debe tener al menos 12 caracteres y comunicarse por un canal seguro. El proceso de ejecución utiliza JavaScript compilado y puede funcionar con dependencias de producción únicamente después de compilar. El alojamiento gratuito puede perder los paquetes al reiniciar; volver a procesar el caso antes de la demostración. No usar información real con esta configuración.

Ver `SOLUCION.md` para arquitectura, límites, decisiones y riesgos.

## Módulo reutilizable

`npm run sync:module` genera `modulo/` desde las mismas fuentes de la aplicación. La suite detecta divergencias y prueba su importación por separado; ver `modulo/README.md`.
