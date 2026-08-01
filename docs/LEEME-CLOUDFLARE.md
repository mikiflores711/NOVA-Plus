# Watch Movies Plus V3.2

Paquete completo con frontend, Worker de Cloudflare, base D1 y panel administrativo.

## Archivos importantes

- `cloudflare/worker.js`: código para `watch-movies-plus-api`.
- `cloudflare/schema.sql`: esquema D1 opcional; el Worker también crea las tablas automáticamente.
- `admin.html`: panel de reportes.
- `cloudflare/prueba-api.html`: prueba de conexión y envío.
- `assets/js/config.js`: URL de la API.

Consulta `INSTALACION-CLOUDFLARE.txt` para los pasos exactos.


## Variables del administrador
- `ADMIN_USER`: usuario del panel (por ejemplo `admin`).
- `ADMIN_PASSWORD`: contraseña guardada como secreto.
- El Worker también acepta `ADMIN_USERNAME` para compatibilidad con versiones anteriores.
