/*
  Control de Asistencia
  01 - Crear la base de datos
  Compatible con SQL Server 2008 R2 y versiones posteriores.
  Ejecutar en SQL Server Management Studio, con permisos para crear bases.
*/

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'DB_CONTROL_ASISTENCIA')
BEGIN
    CREATE DATABASE DB_CONTROL_ASISTENCIA;
END
GO
