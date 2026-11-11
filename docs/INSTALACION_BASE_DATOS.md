# Instalación de la base de datos

Base `DB_CONTROL_ASISTENCIA` para SQL Server 2008 R2. Los tres scripts también están en la carpeta `database/sqlserver/` y se pueden abrir directo en SQL Server Management Studio. Están escritos para poder ejecutarse más de una vez: si la base, la tabla o el índice ya existen, no los vuelven a crear.

El driver de Node es el paquete `mssql` (Tedious). SQL Server 2008 R2 habla el protocolo TDS 7.3.B. El driver, si no se le indica otra cosa, usa TDS 7.4, que corresponde a SQL Server 2012. Por eso la conexión fija `options.tdsVersion` en `7_3_B`. Además deja `encrypt` en `false`: un 2008 R2 sin los parches de TLS 1.2 no negocia cifrado moderno.

Ejecute los scripts en este orden, con un inicio de sesión que pueda crear bases y tablas.

1. `database/sqlserver/01_create_database.sql`
2. `database/sqlserver/02_create_tables.sql`
3. `database/sqlserver/03_create_indexes.sql`

## 1. Crear la base de datos

En SQL Server Management Studio, conectado a la instancia, abra una consulta nueva y ejecute:

```sql
/*
  Control de Asistencia
  01 - Crear la base de datos
  Compatible con SQL Server 2008 R2 y versiones posteriores.
*/

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'DB_CONTROL_ASISTENCIA')
BEGIN
    CREATE DATABASE DB_CONTROL_ASISTENCIA;
END
GO
```

La base queda en la carpeta de datos por defecto de la instancia y con la intercalación del servidor. En un servidor de Perú conviene una intercalación de página de códigos 1252, por ejemplo `Modern_Spanish_CI_AS` o `SQL_Latin1_General_CP1_CI_AS`, para que la eñe se guarde bien en las columnas `VARCHAR`.

## 2. Crear las tres tablas

Este script crea solo `tbl_personas`, `tbl_asistencias` y `tbl_configuracion`, la relación entre asistencia y persona, y las dos claves iniciales.

```sql
/*
  Control de Asistencia
  02 - Crear las tres tablas, la relacion y la configuracion inicial.
  Compatible con SQL Server 2008 R2.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE DB_CONTROL_ASISTENCIA;
GO

IF OBJECT_ID(N'dbo.tbl_personas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tbl_personas (
        id_persona       INT IDENTITY(1, 1) NOT NULL,
        numero_dni       VARCHAR(8)         NOT NULL,
        nombres          VARCHAR(150)       NULL,
        apellido_paterno VARCHAR(100)       NULL,
        apellido_materno VARCHAR(100)       NULL,
        estado           BIT                NOT NULL CONSTRAINT DF_tbl_personas_estado DEFAULT (1),
        fecha_creacion   DATETIME           NOT NULL,
        CONSTRAINT PK_tbl_personas PRIMARY KEY CLUSTERED (id_persona),
        CONSTRAINT UQ_tbl_personas_numero_dni UNIQUE (numero_dni)
    );
END
GO

IF OBJECT_ID(N'dbo.tbl_asistencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tbl_asistencias (
        id_asistencia       BIGINT IDENTITY(1, 1) NOT NULL,
        id_persona          INT                   NOT NULL,
        numero_dni          VARCHAR(8)            NOT NULL,
        fecha_asistencia    DATE                  NOT NULL,
        hora_asistencia     TIME(0)               NOT NULL,
        fecha_hora_registro DATETIME              NOT NULL,
        tipo_asistencia     VARCHAR(10)           NOT NULL,
        estado              VARCHAR(15)           NOT NULL,
        dispositivo         VARCHAR(150)          NULL,
        CONSTRAINT PK_tbl_asistencias PRIMARY KEY CLUSTERED (id_asistencia)
    );
END
GO

IF OBJECT_ID(N'dbo.tbl_configuracion', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tbl_configuracion (
        id_configuracion INT IDENTITY(1, 1) NOT NULL,
        clave            VARCHAR(100)       NOT NULL,
        valor            VARCHAR(250)       NOT NULL,
        descripcion      VARCHAR(250)       NULL,
        CONSTRAINT PK_tbl_configuracion PRIMARY KEY CLUSTERED (id_configuracion)
    );
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_tbl_asistencias_tbl_personas'
      AND parent_object_id = OBJECT_ID(N'dbo.tbl_asistencias')
)
BEGIN
    ALTER TABLE dbo.tbl_asistencias
    ADD CONSTRAINT FK_tbl_asistencias_tbl_personas
        FOREIGN KEY (id_persona) REFERENCES dbo.tbl_personas (id_persona);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM dbo.tbl_configuracion WHERE clave = 'INTERVALO_DUPLICADO_MINUTOS'
)
BEGIN
    INSERT INTO dbo.tbl_configuracion (clave, valor, descripcion)
    VALUES (
        'INTERVALO_DUPLICADO_MINUTOS',
        '5',
        'Minutos durante los cuales el mismo DNI no puede volver a registrar asistencia'
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM dbo.tbl_configuracion WHERE clave = 'TIPO_ASISTENCIA_DEFAULT'
)
BEGIN
    INSERT INTO dbo.tbl_configuracion (clave, valor, descripcion)
    VALUES (
        'TIPO_ASISTENCIA_DEFAULT',
        'ENTRADA',
        'Tipo de asistencia que graba el sistema'
    );
END
GO
```

`DATE`, `TIME(0)` y `DATETIME` existen en SQL Server 2008. No se usa `OFFSET`, `CONCAT` ni `TRY_CAST`, que llegaron en SQL Server 2012.

## 3. Crear los índices y la relación

La relación `tbl_asistencias.id_persona` → `tbl_personas.id_persona` se crea en el script anterior, con el nombre `FK_tbl_asistencias_tbl_personas`.

`numero_dni` de `tbl_personas` ya queda indexado por la restricción `UNIQUE`. El script de índices agrega el índice de DNI y el de fecha sobre `tbl_asistencias`.

```sql
/*
  Control de Asistencia
  03 - Indices de DNI y fecha de asistencia.
  Compatible con SQL Server 2008 R2.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE DB_CONTROL_ASISTENCIA;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_tbl_asistencias_numero_dni'
      AND object_id = OBJECT_ID(N'dbo.tbl_asistencias')
)
BEGIN
    CREATE INDEX IX_tbl_asistencias_numero_dni
        ON dbo.tbl_asistencias (numero_dni);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_tbl_asistencias_fecha_asistencia'
      AND object_id = OBJECT_ID(N'dbo.tbl_asistencias')
)
BEGIN
    CREATE INDEX IX_tbl_asistencias_fecha_asistencia
        ON dbo.tbl_asistencias (fecha_asistencia);
END
GO
```

Compruebe el resultado:

```sql
USE DB_CONTROL_ASISTENCIA;
GO

SELECT name
FROM sys.tables
WHERE name IN (N'tbl_personas', N'tbl_asistencias', N'tbl_configuracion');

SELECT clave, valor
FROM dbo.tbl_configuracion;

SELECT fk.name
FROM sys.foreign_keys AS fk
WHERE fk.name = N'FK_tbl_asistencias_tbl_personas';

SELECT i.name
FROM sys.indexes AS i
WHERE i.object_id = OBJECT_ID(N'dbo.tbl_asistencias')
  AND i.name IN (N'IX_tbl_asistencias_numero_dni', N'IX_tbl_asistencias_fecha_asistencia');
```

Deben aparecer tres tablas, las claves `INTERVALO_DUPLICADO_MINUTOS = 5` y `TIPO_ASISTENCIA_DEFAULT = ENTRADA`, la clave foránea y los dos índices.

## 4. SQL Server 2008 R2 en la misma PC

1. Instale SQL Server 2008 R2 y SQL Server Management Studio 2008 R2, o un Management Studio más nuevo que aún pueda conectarse a esa instancia.
2. Abra SQL Server Management Studio y conéctese a `localhost` o `.\NOMBRE_INSTANCIA`.
3. En el Explorador de objetos, clic derecho sobre el servidor, Propiedades, Seguridad. Elija **Modo de autenticación de SQL Server y Windows**. El backend entra con usuario y contraseña de SQL, no con autenticación de Windows.
4. Acepte y reinicie el servicio SQL Server.
5. Ejecute los tres scripts de las secciones 1, 2 y 3.
6. Cree un inicio de sesión para la aplicación. Cambie la contraseña antes de ejecutarlo. En 2008 R2 el alta al rol se hace con `sp_addrolemember`:

```sql
USE master;
GO

CREATE LOGIN usuario_asistencia
    WITH PASSWORD = 'CambieEstaClave1',
         CHECK_POLICY = ON;
GO

USE DB_CONTROL_ASISTENCIA;
GO

CREATE USER usuario_asistencia FOR LOGIN usuario_asistencia;
GO

EXEC sp_addrolemember N'db_datareader', N'usuario_asistencia';
GO
EXEC sp_addrolemember N'db_datawriter', N'usuario_asistencia';
GO
```

7. Ponga la zona horaria de Windows en `(UTC-05:00) Bogotá, Lima, Quito`. La hora de la asistencia sale de `GETDATE()` en el servidor.

Para saber el puerto real, sobre todo si la instancia no es la predeterminada, siga la sección 6 y anote el puerto de IPAll.

## 5. SQL Server en un servidor de la red

Haga en el servidor todo lo de la sección 4. Además:

1. En Propiedades del servidor, Conexiones, deje marcada **Permitir conexiones remotas a este servidor**.
2. Habilite TCP/IP y fije el puerto, como se indica en la sección 6.
3. Abra el puerto en el firewall del servidor, sección 7.
4. En el equipo donde corre Node, `backend/.env` debe apuntar a la IP o al nombre del servidor, no a `localhost`:

```env
DB_TYPE=sqlserver
DB_HOST=192.168.1.20
DB_PORT=1433
DB_NAME=DB_CONTROL_ASISTENCIA
DB_USER=usuario_asistencia
DB_PASSWORD=CambieEstaClave1
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

El proyecto se conecta por host y puerto. No usa el formato `SERVIDOR\INSTANCIA`. Si la instancia se llama `SQLEXPRESS` u otro nombre, busque el puerto TCP fijo de esa instancia y escríbalo en `DB_PORT`.

Desde el equipo de Node puede probar el puerto con `sqlcmd`, incluido en las herramientas de SQL Server 2008:

```bat
sqlcmd -S 192.168.1.20,1433 -U usuario_asistencia -P CambieEstaClave1 -d DB_CONTROL_ASISTENCIA -Q "SELECT DB_NAME()"
```

## 6. Habilitar TCP/IP y el puerto

1. Abra **SQL Server Configuration Manager**. En 2008 R2 el acceso directo es `SQLServerManager10.msc`.
2. Vaya a **SQL Server Network Configuration** → **Protocols for** el nombre de la instancia. En una instancia predeterminada dice `MSSQLSERVER`.
3. Clic derecho en **TCP/IP** → **Enable**. Si estaba deshabilitado, quedará pendiente hasta el reinicio.
4. Doble clic en **TCP/IP** → pestaña **IP Addresses**.
5. En la sección **IPAll** borre **TCP Dynamic Ports** y escriba `1433` en **TCP Port**. Si 1433 ya lo usa otra instancia, elija un puerto libre, por ejemplo `1435`, y use ese mismo número en `DB_PORT`.
6. Acepte.
7. En **SQL Server Services**, clic derecho en **SQL Server (nombre)** → **Restart**.

El servicio **SQL Server Browser** (UDP 1434) no hace falta cuando la aplicación ya conoce el puerto. Conviene dejar el puerto fijo para no depender del Browser.

## 7. Configurar el firewall

En el servidor SQL, abra una consola de administrador y permita el puerto TCP elegido. Este ejemplo es el 1433:

```bat
netsh advfirewall firewall add rule name="SQL Server 1433" dir=in action=allow protocol=TCP localport=1433
```

Si Node y SQL Server están en la misma máquina y `DB_HOST` es `localhost`, el firewall no interviene en esa conexión. Sí interviene cuando el backend está en otra PC.

Para comprobar desde el equipo del backend, en Windows 8 o posterior:

```powershell
Test-NetConnection 192.168.1.20 -Port 1433
```

`TcpTestSucceeded` debe ser `True`. En un Windows más antiguo puede usar `telnet 192.168.1.20 1433`. Si la pantalla queda en blanco, el puerto responde.

## 8. Configurar el archivo .env

El archivo es `backend/.env`. La conexión la decide `DB_TYPE`: `mock`, `sqlserver`, `postgres` o `localstorage`.

Modo DEMO, sin SQL Server. Es el valor con el que se entrega el proyecto:

```env
DB_TYPE=mock
PORT=3001

DB_HOST=localhost
DB_PORT=1433
DB_NAME=DB_CONTROL_ASISTENCIA
DB_USER=usuario
DB_PASSWORD=contraseña
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

Modo SQL Server. Cambie usuario, contraseña, host y puerto por los de la sección 4 o 5:

```env
DB_TYPE=sqlserver
PORT=3001

DB_HOST=localhost
DB_PORT=1433
DB_NAME=DB_CONTROL_ASISTENCIA
DB_USER=usuario_asistencia
DB_PASSWORD=CambieEstaClave1
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

Reglas:

- DEMO es `DB_TYPE=mock`.
- SQL Server es `DB_TYPE=sqlserver`. `mssql` se acepta como alias.
- PostgreSQL es `DB_TYPE=postgres`.
- Navegador es `DB_TYPE=localstorage`. También se puede forzar en `frontend/.env` con `VITE_DB_MODE=localstorage`.
- Si `DB_TYPE` no es uno de esos valores, `/api/health` responde que la configuración no es válida y no graba asistencias.
- Si la contraseña tiene `#`, enciérrela entre comillas dobles.
- Después de editar `.env`, detenga y vuelva a iniciar el backend. No basta con guardar el archivo.
- Deje `DB_ENCRYPT=false` en SQL Server 2008 R2. El código fuerza el protocolo TDS 7.3.B; no hay que escribir esa versión en el `.env`.

`frontend/.env` lleva `VITE_API_URL` y `VITE_DB_MODE`. Deje `VITE_API_URL` vacío para que el celular hable con el proxy de Vite y no con su propio `localhost`. Deje `VITE_DB_MODE` vacío para seguir el `DB_TYPE` del backend. `VITE_DB_MODE=localstorage` guarda los datos en el navegador aunque el backend esté apagado.

## 9. Probar la conexión desde Node.js

En `backend`:

```bash
npm install
```

Cree un archivo temporal, por ejemplo `backend/probar-conexion.js`, con este contenido. Usa el mismo protocolo que la aplicación. No lo deje con la contraseña real en un repositorio.

```javascript
require('dotenv').config();
const sql = require('mssql');

const config = {
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        tdsVersion: '7_3_B'
    }
};

sql.connect(config)
    .then(async (pool) => {
        const result = await pool.request().query('SELECT DB_NAME() AS base');
        console.log('Conectado a', result.recordset[0].base);
        await pool.close();
    })
    .catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
```

Ejecútelo con el `.env` ya en `DB_TYPE=sqlserver`:

```bash
node probar-conexion.js
```

La prueba integrada del sistema es el propio backend. Con el `.env` de producción:

```bash
npm run dev
```

En el navegador, o con otra terminal:

```bash
curl http://127.0.0.1:3001/api/health
```

Respuesta esperada cuando la base y las tres tablas existen:

```json
{
  "ok": true,
  "servidor": "en linea",
  "modo": "production",
  "base_datos": "sqlserver",
  "conectado": true,
  "mensaje": "Conexion con SQL Server correcta."
}
```

Si SQL Server no acepta la conexión, `ok` viene en `false` y `mensaje` describe el fallo. Causas habituales en 2008 R2:

- TCP/IP deshabilitado o el servicio no se reinició después de habilitarlo.
- El puerto de IPAll no coincide con `DB_PORT`.
- El inicio de sesión no existe, o la instancia sigue solo en autenticación de Windows.
- `encrypt` quedó en `true` contra un 2008 R2 sin TLS 1.2.
- El firewall del servidor bloquea el puerto.

Borre `probar-conexion.js` cuando termine. La aplicación no lo necesita.

## 10. Ejecutar en modo DEMO, sin SQL Server

No instale SQL Server ni ejecute los scripts. En `backend/.env`:

```env
DB_TYPE=mock
```

Luego:

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173`. `GET http://127.0.0.1:3001/api/health` debe responder `modo: demo`, `base_datos: mock` y `conectado: true`.

Puede escanear un DNI, registrar la entrada y verla en la tabla. Un segundo escaneo del mismo DNI, dentro de 5 minutos, se rechaza. Al detener el backend esos registros desaparecen: la memoria no es la base de datos.

## 11. PostgreSQL, para Render

Render no ofrece SQL Server. El mismo backend usa PostgreSQL cuando `DB_TYPE=postgres`. Las tablas, la relación, los índices y las dos claves de configuración son las mismas. Los tipos cambian donde el motor lo exige: `BIT` pasa a `BOOLEAN`, `DATETIME` a `TIMESTAMP` e `IDENTITY` a `GENERATED BY DEFAULT AS IDENTITY`.

Render crea la base. No ejecute `CREATE DATABASE`. Abra el shell SQL de la instancia, o desde su PC:

```bash
psql "postgres://usuario:clave@host:5432/control_asistencia" -f database/postgres/01_create_tables.sql
```

El script está en `database/postgres/01_create_tables.sql` y se puede volver a ejecutar.

En `backend/.env`, o en las variables del servicio de Render:

```env
DB_TYPE=postgres
DATABASE_URL=postgres://usuario:clave@host:5432/control_asistencia
DB_SSL=true
```

`DATABASE_URL` reemplaza a `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`. Si no hay URL, el backend usa esas cinco variables y el puerto por defecto `5432`.

La hora de la asistencia en este modo es `America/Lima`, aunque la máquina de Render esté en UTC. SQL Server sigue usando el reloj de su propia instancia.

Compruebe:

```bash
curl https://su-servicio.onrender.com/api/health
```

`conectado` debe ser `true` y `base_datos` debe ser `postgres`. Si el mensaje dice que faltan tablas, el proceso está en línea y todavía no se ejecutó el script.
