/*
  Control de Asistencia
  02 - Crear las tres tablas, la relacion y la configuracion inicial.
  Compatible con SQL Server 2008 R2.
  Ejecutar despues de database/sqlserver/01_create_database.sql.
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
