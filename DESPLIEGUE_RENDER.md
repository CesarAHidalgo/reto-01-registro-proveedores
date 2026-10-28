# Despliegue de demostración en Render

La aplicación ya se probó localmente con los fixtures ficticios. Esta guía publica una **demo**, no una plataforma apta para datos reales ni para operación multiusuario. Se requiere una cuenta de Render, acceso a este repositorio de GitHub y una clave de Gemini válida.

## 1. Crear el servicio

1. Inicia sesión en [Render](https://dashboard.render.com/), por ejemplo con GitHub. Completa personalmente cualquier registro, autorización o aceptación de términos.
2. Selecciona **New → Web Service**.
3. Conecta GitHub y selecciona `CesarAHidalgo/reto-01-registro-proveedores`. Si GitHub permite limitar el acceso de Render, selecciona solamente este repositorio.
4. Usa la rama `main`, deja vacío el directorio raíz y selecciona el entorno **Node**. Elige el plan **Free** para la demostración.
5. Configura los comandos:

   - **Build Command:** `npm ci --include=dev && npm run build`
   - **Start Command:** `npm start`

El build instala las dependencias de desarrollo necesarias para compilar, incluso si `NODE_ENV` es `production`. En ejecución se utiliza JavaScript compilado.

## 2. Variables de entorno

En **Environment** o **Advanced**, agrega las siguientes variables antes de crear el servicio:

| Nombre | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.21.0` |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` |
| `GEMINI_API_KEY` | Tu clave de Gemini, pegada directamente en Render. |
| `DEMO_ACCESS_CODE` | Una contraseña nueva, aleatoria y de al menos 12 caracteres; utiliza preferiblemente una más larga generada con un gestor de contraseñas. |
| `APP_TIMEZONE` | `America/Bogota` |

No agregues manualmente `PORT`: Render lo asigna. No envíes la clave de Gemini ni la contraseña por el chat, no las incluyas en el repositorio y no compartas capturas donde se vean. El archivo local `.env` ya está excluido de Git. Evita cargar el `.env` completo: contiene valores locales que no son necesarios para Render.

El plan gratuito de Gemini está sujeto a disponibilidad y cuota del proyecto. Los datos que se procesan en esta demo son ficticios. Antes de tratar datos reales sería necesario revisar el contrato y tratamiento de datos del proveedor y agregar controles de producción.

## 3. Crear y comprobar

1. Pulsa **Create Web Service** y espera a que el build y el despliegue finalicen correctamente.
2. Copia la dirección `https://...onrender.com` que muestre Render. Es la URL pública de la aplicación; `http://127.0.0.1:3000` solo sirve en el computador local.
3. Abre la URL en una ventana privada o en otro dispositivo. Debe solicitar credenciales: escribe `evaluador` como usuario y el `DEMO_ACCESS_CODE` como contraseña. El usuario puede ser cualquier nombre; la contraseña es el valor configurado.
4. Abre `https://TU-DIRECCION.onrender.com/api/health` después de autenticarte y comprueba `configured: true` y el modelo `gemini-3.1-flash-lite`. No debe aparecer ninguna clave.
5. En el chat ejecuta el caso `ec-corp-andina` según `PRUEBAS_MANUALES.md`; revisa las herramientas, los faltantes, la confirmación y la descarga del paquete. Comprueba también al menos un Excel y el caso de portal.
6. Verifica que responder «sí» solo cree una simulación y que responder que no no cree un envío simulado.
7. Entrega a los evaluadores la URL y la contraseña de la demo por un canal apropiado. El PRD menciona incluir la clave de acceso en el README: para no publicar credenciales en este repositorio público, entrega un README privado al evaluador o acuerda con él un canal seguro para la contraseña. Nunca incluyas la clave de Gemini.
8. Cuando la URL esté confirmada, actualiza `README.md`, `SOLUCION.md` y el checklist con la dirección y los resultados comprobados.

## 4. Limitaciones de Free

Los servicios gratuitos pueden suspenderse después de 15 minutos sin tráfico y tardar alrededor de un minuto en despertar. Los archivos locales y las sesiones se pierden al reiniciar, redeployar o suspender el servicio. Antes de la defensa abre la aplicación con anticipación y vuelve a generar los paquetes necesarios. Las cuotas del plan y del proveedor de IA pueden limitar la disponibilidad.

El límite de peticiones actual funciona en memoria y usa la IP observada por la aplicación. Detrás de un proxy varios usuarios podrían compartir la misma IP y quedar limitados juntos. La contraseña es compartida y las salidas por caso no aíslan usuarios: no utilizar datos reales en esta demo.

Referencias: [servicios web de Render](https://render.com/docs/web-services), [variables de entorno](https://render.com/docs/configure-environment-variables), [versiones de Node](https://render.com/docs/node-version) y [limitaciones gratuitas](https://render.com/docs/free).
