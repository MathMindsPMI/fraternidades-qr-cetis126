# Fraternidades QR CETis 126 — multiusuario offline

## Qué incluye
- `index.html`, `app.js`, `config.js`: interfaz y lógica, sin bibliotecas CDN.
- `qr-local.js`: generador QR local.
- `schema.sql`: tablas y políticas de seguridad RLS de Supabase.
- `sw.js`, `manifest.webmanifest`, iconos y logotipos: instalación PWA y caché.

## 1. Preparar Supabase
1. Crea un proyecto Supabase. En SQL Editor ejecuta TODO `schema.sql`.
2. En Project Settings > API (o sección de claves del proyecto), copia **Project URL** y la **clave pública anon/publishable compatible con API REST**. Nunca copies la `service_role` ni una clave secreta en el HTML.
3. Edita `config.js` con URL y clave pública. `emailDomain` debe coincidir con el dominio que usarás en los usuarios (puedes dejar `fraternidades.cetis126.invalid`: son identificadores internos, no buzones de correo). Si el proyecto exige confirmación de correo, crea los usuarios desde Authentication > Users con la opción de autoconfirmación.
4. En Authentication > Users, crea cada cuenta con un email interno como `admin@fraternidades.cetis126.invalid`, `agua@fraternidades.cetis126.invalid`, `aire@...`, `tierra@...`, `fuego@...` y una contraseña **individual aleatoria de al menos 8–12 caracteres** que será el PIN de acceso. Evita PIN de 4 cifras. **No habilites registro público de usuarios**.
5. Tras crear usuarios, en SQL Editor ejecuta estas sentencias (adapta nombres y correos):

```sql
insert into public.profiles(id,alias,display_name,role,house)
select id,'admin','Administración','admin',null from auth.users where email='admin@fraternidades.cetis126.invalid';
insert into public.profiles(id,alias,display_name,role,house)
select id,'agua','Tutor Agua','tutor','Agua' from auth.users where email='agua@fraternidades.cetis126.invalid';
insert into public.profiles(id,alias,display_name,role,house)
select id,'aire','Tutor Aire','tutor','Aire' from auth.users where email='aire@fraternidades.cetis126.invalid';
insert into public.profiles(id,alias,display_name,role,house)
select id,'tierra','Tutor Tierra','tutor','Tierra' from auth.users where email='tierra@fraternidades.cetis126.invalid';
insert into public.profiles(id,alias,display_name,role,house)
select id,'fuego','Tutor Fuego','tutor','Fuego' from auth.users where email='fuego@fraternidades.cetis126.invalid';
```

Si `select` no encuentra un usuario, esa sentencia no insertará perfil. Comprueba perfiles con `select alias,role,house from public.profiles;`.

## 2. Publicar e instalar
1. Sube todos los archivos de esta carpeta a un repositorio de GitHub (puede ser privado si tu plan permite publicar Pages desde él; recuerda que el contenido de GitHub Pages publicado puede ser accesible públicamente).
2. En Settings > Pages configura la rama y carpeta raíz, y abre la URL HTTPS publicada.
3. Android: Chrome > menú > Instalar aplicación / Añadir a pantalla de inicio. iPhone: Safari > Compartir > Añadir a pantalla de inicio.
4. Cada tutor inicia sesión con su alias y PIN mientras tiene Internet; pulsa **Sincronizar ahora** para descargar alumnos y misiones antes de salir al patio.
5. Desconecta Internet, registra asistencias y verifica la cantidad pendiente. Cuando vuelva la conexión pulsa **Sincronizar ahora**. No borres datos del navegador ni cierres sesión con pendientes.

## 3. Uso administrativo
- Administración crea misiones y agrega alumnos individualmente o desde CSV UTF-8 con columnas `matricula,nombre,grupo,fraternidad`.
- Descarga el catálogo a cada dispositivo con Sincronizar ahora.
- Las credenciales QR se generan localmente y se imprimen o se guardan como PDF desde el diálogo del navegador. No se utiliza jsPDF.
- Reportes CSV incluyen el estado pendiente/sincronizado; el panel general muestra únicamente los registros que ya llegaron a Supabase y los pendientes del dispositivo administrativo.

## 4. Limitaciones y seguridad
- **El escáner automático sin conexión requiere `BarcodeDetector`**. Su disponibilidad depende del navegador y no está garantizada en Safari/iPhone. El registro manual por matrícula sí funciona sin conexión. Para lector QR universal en iPhone hay que incorporar una biblioteca decodificadora local probada (no incluida en esta entrega).
- No se ha conectado a un proyecto Supabase real ni probado en dispositivos físicos: se entrega listo para configurar, no desplegado.
- Los datos locales usan `localStorage`: pueden perderse al borrar almacenamiento, desinstalar o cambiar dispositivo. Descarga respaldos JSON y sincroniza frecuentemente. No guardes los PIN en respaldos.
- Si se modifica la fraternidad de un alumno o una misión mientras un tutor está desconectado, el registro puede requerir intervención para resolver conflictos. No cambies los catálogos durante una misión activa.
- El PIN es una **contraseña de Supabase Auth**, no un PIN local de cuatro dígitos. Supabase autentica en línea; el uso sin conexión solo funciona tras el primer acceso y descarga de catálogos. La sesión debe renovarse al reconectar.
- Los datos de alumnos son personales: comparte accesos solo con tutores autorizados, usa dispositivos con bloqueo de pantalla, revisa el aviso de privacidad institucional y no publiques listados ni respaldos.
- La política `attendance` evita duplicados mediante clave compuesta `(mission_id,student_id)`; la sincronización utiliza `on_conflict` y `ignore-duplicates`.
- Para un despliegue de producción conviene añadir monitoreo de errores, recuperación de contraseña, revocación de dispositivos y pruebas de compatibilidad en iOS.
