# Control de Asistencia

Registro de entrada leyendo el código de barras del DNI peruano con la cámara del celular.

El backend arranca en modo DEMO: no hace falta SQL Server para probar el escáner, el registro y la consulta. Los datos de ese modo viven en memoria.

Vercel publica el frontend con Node.js 26.x, que es la versión mayor que acepta. No admite un parche fijo: en `package.json` tiene que decir `"node": "26.x"`. El instalador actual de esa línea es Node.js 26.13.0 y trae npm 11.20.0.

- Node.js 26.13.0 para Windows de 64 bits: [node-v26.13.0-x64.msi](https://nodejs.org/dist/v26.13.0/node-v26.13.0-x64.msi)
- Otras plataformas y el código fuente: [índice de Node.js 26.13.0](https://nodejs.org/dist/v26.13.0/)
- npm 11.20.0, por si hace falta reinstalarlo: [npm-11.20.0.tgz](https://registry.npmjs.org/npm/-/npm-11.20.0.tgz)

## Ejecutar

En una terminal:

```bash
cd backend
npm install
npm run dev
```

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173` en el navegador. El frontend envía `/api` al backend `http://127.0.0.1:3001`.

Desde un celular en la misma red Wi-Fi, abra `http://IP-DE-LA-PC:5173`. Si Windows bloquea el puerto, permita la entrada TCP 5173. La cámara del iPhone exige HTTPS; en un Android de la red local, Chrome suele permitir la cámara por HTTP.

## Qué código del DNI se lee

No todos los DNI usan el mismo código.

- **DNI convencional:** el código lineal Code39 del reverso trae el CUI, el número de 8 dígitos. El PDF417 grueso guarda la huella y no el nombre. Hay que apuntar al código lineal.
- **DNI adulto de 1997:** el PDF417 sí trae número, apellidos y nombres en campos de ancho fijo. Si la lectura coincide con ese formato, se guardan los nombres.
- Si el código no trae nombres, la asistencia queda identificada por el DNI.

El mismo DNI no puede registrar otra entrada durante 5 minutos. La fecha y la hora las pone el servidor. En modo DEMO es el reloj de la PC. En SQL Server es el reloj de esa instancia. En PostgreSQL y en el modo navegador se usa la hora de Lima (`America/Lima`).

## Modos

La base la elige una sola variable, `DB_TYPE`, en `backend/.env`. Hay que reiniciar el backend después de cambiarla.

DEMO, en memoria del servidor:

```env
DB_TYPE=mock
```

SQL Server:

```env
DB_TYPE=sqlserver
```

PostgreSQL, el que se usa en Render:

```env
DB_TYPE=postgres
DATABASE_URL=postgres://usuario:clave@host:5432/control_asistencia
DB_SSL=true
```

Navegador. No abre PostgreSQL ni SQL Server. Las personas y las asistencias quedan en `localStorage` de ese navegador:

```env
DB_TYPE=localstorage
```

La misma opción se puede forzar sin backend, en `frontend/.env`, con `VITE_DB_MODE=localstorage`. Si esa variable está vacía, la página sigue lo que diga `DB_TYPE`. `mssql` sigue valiendo como alias de `sqlserver`.

SQL Server se instala con los scripts de [database/sqlserver](database/sqlserver). PostgreSQL se crea con [database/postgres/01_create_tables.sql](database/postgres/01_create_tables.sql). El detalle está en [docs/INSTALACION_BASE_DATOS.md](docs/INSTALACION_BASE_DATOS.md).

## Desplegar

Frontend en Vercel y backend en Render. Primero el backend, porque Vercel necesita su URL al construir la página.

**Render**

1. Cree un PostgreSQL y copie la External Database URL.
2. Conéctese con `psql` o el shell de Render y ejecute `database/postgres/01_create_tables.sql`.
3. Cree un Web Service con la raíz del repositorio, directorio raíz `backend`, build `npm install` y start `npm start`.
4. Variables: `DB_TYPE=postgres`, `DATABASE_URL` con la URL copiada y `DB_SSL=true`.
5. Abra `https://su-servicio.onrender.com/api/health`. Debe decir `base_datos: postgres` y `conectado: true`.

El archivo `render.yaml` describe ese servicio y la base. Si el plan `free` no aparece en su cuenta, cree la base desde el panel y pegue `DATABASE_URL` a mano.

**Vercel**

1. Importe el repositorio. Root Directory: `frontend`. Framework: Vite. Build: `npm run build`. Output: `dist`.
2. Variable `VITE_API_URL` con la URL de Render, sin barra al final. Ejemplo: `https://control-asistencia-api.onrender.com`.
3. Vuelva a desplegar cada vez que cambie esa URL: Vite la graba dentro del build.

En local deje `VITE_API_URL` vacío para seguir usando el proxy de Vite.

## API

- `POST /api/attendance/register`
- `GET /api/attendance`
- `GET /api/attendance/today`
- `GET /api/health`

## Estructura

```text
frontend/src
  components/Scanner.jsx
  components/AttendanceTable.jsx
  services/api.js
  services/dniParser.js
  App.jsx
  main.jsx
backend/src
  config/database.js
  controllers/attendanceController.js
  routes/attendanceRoutes.js
  services/attendanceService.js
  server.js
database/
  postgres/01_create_tables.sql
  sqlserver/01_create_database.sql
  sqlserver/02_create_tables.sql
  sqlserver/03_create_indexes.sql
docs/INSTALACION_BASE_DATOS.md
```
