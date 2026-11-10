/*
  Control de Asistencia
  03 - Indices de DNI y fecha de asistencia.
  Compatible con SQL Server 2008 R2.
  Ejecutar despues de database/sqlserver/02_create_tables.sql.

  numero_dni de tbl_personas ya queda indexado por la restriccion UNIQUE
  creada en el script 02. No se repite aqui.
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
