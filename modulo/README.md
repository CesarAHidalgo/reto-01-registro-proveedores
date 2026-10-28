# Módulo de registro de proveedores

Paquete autocontenido de las piezas del agente. `agent.md` contiene el comportamiento, `tools/proveedor.ts` contiene las herramientas TypeScript y `skill/registro-proveedor/SKILL.md` el conocimiento. Las herramientas requieren Node 20+, las dependencias del `package.json` de este módulo y un `ctx.directory` que apunte a un proyecto con los fixtures del reto en `fixtures/reto-01/`; las salidas se escriben en `out/` de ese directorio.

Los archivos se generan desde las fuentes utilizadas por la aplicación con `npm run sync:module`. La suite verifica igualdad de contenido e importación aislada para detectar cualquier divergencia antes de entregar.
