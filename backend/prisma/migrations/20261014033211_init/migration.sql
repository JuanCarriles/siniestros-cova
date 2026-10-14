-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('DOCUMENTO_NUEVO', 'NOVEDAD_CARGADA', 'CAMBIO_ESTADO', 'MENSAJE_NUEVO', 'ASIGNACION_SINIESTRO', 'REASIGNACION_SINIESTRO');

-- CreateEnum
CREATE TYPE "TipoEventoHistorial" AS ENUM ('MENSAJE', 'NOVEDAD', 'DOCUMENTO', 'ASIGNACION', 'REASIGNACION', 'CAMBIO_ESTADO');

-- CreateEnum
CREATE TYPE "TipoPerito" AS ENUM ('CESVI', 'MEDICO');

-- CreateEnum
CREATE TYPE "RolAccidente" AS ENUM ('TERCERO', 'ASEGURADO');

-- CreateEnum
CREATE TYPE "UsoVehiculo" AS ENUM ('COMERCIAL', 'PARTICULAR', 'TRANSPORTE_PASAJEROS');

-- CreateEnum
CREATE TYPE "TipoLesion" AS ENUM ('LEVE', 'MODERADA', 'GRAVE', 'MUERTE');

-- CreateTable
CREATE TABLE "Pais" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Pais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provincia" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "idPais" INTEGER NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Provincia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Direccion" (
    "id" SERIAL NOT NULL,
    "localidad" TEXT,
    "calle" TEXT,
    "pisoDepartamento" TEXT,
    "codigoPostal" TEXT,
    "idProvincia" INTEGER,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Direccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contrasena" TEXT NOT NULL,
    "tipoUsuario" "TipoUsuario" NOT NULL,
    "idDireccion" INTEGER NOT NULL,
    "ultimaConexion" TIMESTAMPTZ(3),
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoPlantilla" (
    "id" SERIAL NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "urlArchivo" TEXT NOT NULL,
    "tipoExtension" TEXT NOT NULL,
    "fechaCarga" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idUsuario" INTEGER NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "DocumentoPlantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" SERIAL NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL,
    "revisada" BOOLEAN NOT NULL,
    "fechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idUsuario" INTEGER NOT NULL,
    "idSiniestro" INTEGER NOT NULL,
    "tipoNotificacion" "TipoNotificacion" NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialSiniestro" (
    "id" SERIAL NOT NULL,
    "tipoEvento" "TipoEventoHistorial" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fechaEvento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idSiniestro" INTEGER NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "HistorialSiniestro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeChat" (
    "id" SERIAL NOT NULL,
    "fechaEnvio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contenidoMensaje" TEXT NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "idSiniestro" INTEGER NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "MensajeChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LecturaMensajeChat" (
    "id" SERIAL NOT NULL,
    "idMensajeChat" INTEGER NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "fechaLeido" TIMESTAMPTZ(3) NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "LecturaMensajeChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoSiniestro" (
    "id" SERIAL NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "urlArchivoSinDominio" TEXT NOT NULL,
    "tipoExtension" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanoBytes" BIGINT NOT NULL,
    "fechaCarga" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idUsuario" INTEGER NOT NULL,
    "idSiniestro" INTEGER NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "DocumentoSiniestro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovedadSiniestro" (
    "id" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "fechaCarga" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idSiniestro" INTEGER NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "NovedadSiniestro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Perito" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaSolicitud" TIMESTAMPTZ(3) NOT NULL,
    "cerrado" BOOLEAN NOT NULL,
    "idSiniestro" INTEGER NOT NULL,
    "tipoPerito" "TipoPerito" NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "fechaCierre" TIMESTAMPTZ(3),
    "idDireccion" INTEGER,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Perito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aseguradora" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Aseguradora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ajustador" (
    "id" SERIAL NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "idAseguradora" INTEGER NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Ajustador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abogado" (
    "id" SERIAL NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "telefono" TEXT,
    "numeroMatricula" INTEGER,
    "email" TEXT,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Abogado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehiculo" (
    "id" SERIAL NOT NULL,
    "dominio" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "version" TEXT,
    "acreedorPrendario" TEXT,
    "numeroChasis" TEXT,
    "anio" SMALLINT,
    "numeroMotor" TEXT,
    "tipo" TEXT,
    "descripcionDanos" TEXT,
    "color" TEXT,
    "idAseguradora" INTEGER,
    "rolAccidente" "RolAccidente",
    "uso" "UsoVehiculo",
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoDocumento" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "TipoDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaInvolucrada" (
    "id" SERIAL NOT NULL,
    "idSiniestro" INTEGER NOT NULL,
    "nombreCompletoRazonSocial" TEXT,
    "estadoCivil" TEXT,
    "documento" TEXT,
    "sexo" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "numeroPermisoConducir" TEXT,
    "descripcionLesiones" TEXT,
    "fechaNacimiento" DATE,
    "esOcupante" BOOLEAN,
    "fechaVencimientoCarnet" DATE,
    "esPropietario" BOOLEAN,
    "relacionPropietario" TEXT,
    "rolEnVehiculo" TEXT,
    "rolSinVehiculo" TEXT,
    "idDireccion" INTEGER,
    "idAbogado" INTEGER,
    "idTipoDocumento" INTEGER,
    "idVehiculo" INTEGER,
    "tipoLesion" "TipoLesion",
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "PersonaInvolucrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstadoSiniestro" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "esCierre" BOOLEAN NOT NULL DEFAULT false,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "EstadoSiniestro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Siniestro" (
    "id" SERIAL NOT NULL,
    "numeroSiniestro" TEXT NOT NULL,
    "numeroPoliza" TEXT NOT NULL,
    "fechaAsignacion" TIMESTAMPTZ(3) NOT NULL,
    "demorado" BOOLEAN NOT NULL,
    "menorEdadInvolucrado" BOOLEAN NOT NULL,
    "idEstadoSiniestro" INTEGER NOT NULL,
    "idAseguradora" INTEGER NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "fechaOcurrencia" DATE,
    "horaOcurrencia" TIME,
    "inicioVigencia" TEXT,
    "sucursal" TEXT,
    "causa" TEXT,
    "fechaCierre" TIMESTAMPTZ(3),
    "fechaUltimoMovimiento" TIMESTAMPTZ(3),
    "idAjustador" INTEGER,
    "idDireccion" INTEGER,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaBaja" TIMESTAMPTZ(3),

    CONSTRAINT "Siniestro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pais_nombre_key" ON "Pais"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Provincia_idPais_nombre_key" ON "Provincia"("idPais", "nombre");

-- CreateIndex
CREATE INDEX "Direccion_idProvincia_idx" ON "Direccion"("idProvincia");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_idDireccion_idx" ON "Usuario"("idDireccion");

-- CreateIndex
CREATE INDEX "DocumentoPlantilla_idUsuario_idx" ON "DocumentoPlantilla"("idUsuario");

-- CreateIndex
CREATE INDEX "Notificacion_idUsuario_eliminado_leida_fechaCreacion_idx" ON "Notificacion"("idUsuario", "eliminado", "leida", "fechaCreacion");

-- CreateIndex
CREATE INDEX "Notificacion_idSiniestro_idx" ON "Notificacion"("idSiniestro");

-- CreateIndex
CREATE INDEX "HistorialSiniestro_idSiniestro_eliminado_fechaEvento_idx" ON "HistorialSiniestro"("idSiniestro", "eliminado", "fechaEvento");

-- CreateIndex
CREATE INDEX "HistorialSiniestro_idUsuario_idx" ON "HistorialSiniestro"("idUsuario");

-- CreateIndex
CREATE INDEX "MensajeChat_idUsuario_idx" ON "MensajeChat"("idUsuario");

-- CreateIndex
CREATE INDEX "MensajeChat_idSiniestro_eliminado_fechaEnvio_idx" ON "MensajeChat"("idSiniestro", "eliminado", "fechaEnvio");

-- CreateIndex
CREATE INDEX "LecturaMensajeChat_idUsuario_eliminado_idx" ON "LecturaMensajeChat"("idUsuario", "eliminado");

-- CreateIndex
CREATE UNIQUE INDEX "LecturaMensajeChat_idMensajeChat_idUsuario_key" ON "LecturaMensajeChat"("idMensajeChat", "idUsuario");

-- CreateIndex
CREATE INDEX "DocumentoSiniestro_idUsuario_idx" ON "DocumentoSiniestro"("idUsuario");

-- CreateIndex
CREATE INDEX "DocumentoSiniestro_idSiniestro_eliminado_fechaCarga_idx" ON "DocumentoSiniestro"("idSiniestro", "eliminado", "fechaCarga");

-- CreateIndex
CREATE INDEX "NovedadSiniestro_idSiniestro_eliminado_fechaCarga_idx" ON "NovedadSiniestro"("idSiniestro", "eliminado", "fechaCarga");

-- CreateIndex
CREATE UNIQUE INDEX "Perito_idDireccion_key" ON "Perito"("idDireccion");

-- CreateIndex
CREATE INDEX "Perito_idSiniestro_idx" ON "Perito"("idSiniestro");

-- CreateIndex
CREATE INDEX "Ajustador_idAseguradora_idx" ON "Ajustador"("idAseguradora");

-- CreateIndex
CREATE INDEX "Vehiculo_idAseguradora_idx" ON "Vehiculo"("idAseguradora");

-- CreateIndex
CREATE UNIQUE INDEX "TipoDocumento_nombre_key" ON "TipoDocumento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaInvolucrada_idDireccion_key" ON "PersonaInvolucrada"("idDireccion");

-- CreateIndex
CREATE INDEX "PersonaInvolucrada_idSiniestro_idx" ON "PersonaInvolucrada"("idSiniestro");

-- CreateIndex
CREATE INDEX "PersonaInvolucrada_idAbogado_idx" ON "PersonaInvolucrada"("idAbogado");

-- CreateIndex
CREATE INDEX "PersonaInvolucrada_idTipoDocumento_idx" ON "PersonaInvolucrada"("idTipoDocumento");

-- CreateIndex
CREATE INDEX "PersonaInvolucrada_idVehiculo_idx" ON "PersonaInvolucrada"("idVehiculo");

-- CreateIndex
CREATE UNIQUE INDEX "EstadoSiniestro_nombre_key" ON "EstadoSiniestro"("nombre");

-- CreateIndex
CREATE INDEX "Siniestro_idEstadoSiniestro_eliminado_idx" ON "Siniestro"("idEstadoSiniestro", "eliminado");

-- CreateIndex
CREATE INDEX "Siniestro_idAseguradora_eliminado_idx" ON "Siniestro"("idAseguradora", "eliminado");

-- CreateIndex
CREATE INDEX "Siniestro_idUsuario_eliminado_idx" ON "Siniestro"("idUsuario", "eliminado");

-- CreateIndex
CREATE INDEX "Siniestro_idAjustador_idx" ON "Siniestro"("idAjustador");

-- CreateIndex
CREATE INDEX "Siniestro_idDireccion_idx" ON "Siniestro"("idDireccion");

-- CreateIndex
CREATE INDEX "Siniestro_numeroSiniestro_idx" ON "Siniestro"("numeroSiniestro");

-- AddForeignKey
ALTER TABLE "Provincia" ADD CONSTRAINT "Provincia_idPais_fkey" FOREIGN KEY ("idPais") REFERENCES "Pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Direccion" ADD CONSTRAINT "Direccion_idProvincia_fkey" FOREIGN KEY ("idProvincia") REFERENCES "Provincia"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_idDireccion_fkey" FOREIGN KEY ("idDireccion") REFERENCES "Direccion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DocumentoPlantilla" ADD CONSTRAINT "DocumentoPlantilla_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistorialSiniestro" ADD CONSTRAINT "HistorialSiniestro_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistorialSiniestro" ADD CONSTRAINT "HistorialSiniestro_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LecturaMensajeChat" ADD CONSTRAINT "LecturaMensajeChat_idMensajeChat_fkey" FOREIGN KEY ("idMensajeChat") REFERENCES "MensajeChat"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LecturaMensajeChat" ADD CONSTRAINT "LecturaMensajeChat_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DocumentoSiniestro" ADD CONSTRAINT "DocumentoSiniestro_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DocumentoSiniestro" ADD CONSTRAINT "DocumentoSiniestro_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NovedadSiniestro" ADD CONSTRAINT "NovedadSiniestro_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Perito" ADD CONSTRAINT "Perito_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Perito" ADD CONSTRAINT "Perito_idDireccion_fkey" FOREIGN KEY ("idDireccion") REFERENCES "Direccion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Ajustador" ADD CONSTRAINT "Ajustador_idAseguradora_fkey" FOREIGN KEY ("idAseguradora") REFERENCES "Aseguradora"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_idAseguradora_fkey" FOREIGN KEY ("idAseguradora") REFERENCES "Aseguradora"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonaInvolucrada" ADD CONSTRAINT "PersonaInvolucrada_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonaInvolucrada" ADD CONSTRAINT "PersonaInvolucrada_idDireccion_fkey" FOREIGN KEY ("idDireccion") REFERENCES "Direccion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonaInvolucrada" ADD CONSTRAINT "PersonaInvolucrada_idAbogado_fkey" FOREIGN KEY ("idAbogado") REFERENCES "Abogado"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonaInvolucrada" ADD CONSTRAINT "PersonaInvolucrada_idTipoDocumento_fkey" FOREIGN KEY ("idTipoDocumento") REFERENCES "TipoDocumento"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonaInvolucrada" ADD CONSTRAINT "PersonaInvolucrada_idVehiculo_fkey" FOREIGN KEY ("idVehiculo") REFERENCES "Vehiculo"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_idEstadoSiniestro_fkey" FOREIGN KEY ("idEstadoSiniestro") REFERENCES "EstadoSiniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_idAseguradora_fkey" FOREIGN KEY ("idAseguradora") REFERENCES "Aseguradora"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_idAjustador_fkey" FOREIGN KEY ("idAjustador") REFERENCES "Ajustador"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_idDireccion_fkey" FOREIGN KEY ("idDireccion") REFERENCES "Direccion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Baja lógica: "eliminado" y "fechaBaja" siempre sincronizados.
-- Agregado a mano desde prisma/soft-delete-checks.sql: Prisma Schema no representa CHECK.
-- ---------------------------------------------------------------------------

ALTER TABLE "Pais" ADD CONSTRAINT "Pais_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Provincia" ADD CONSTRAINT "Provincia_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Direccion" ADD CONSTRAINT "Direccion_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "DocumentoPlantilla" ADD CONSTRAINT "DocumentoPlantilla_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "HistorialSiniestro" ADD CONSTRAINT "HistorialSiniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "LecturaMensajeChat" ADD CONSTRAINT "LecturaMensajeChat_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "DocumentoSiniestro" ADD CONSTRAINT "DocumentoSiniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "NovedadSiniestro" ADD CONSTRAINT "NovedadSiniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Perito" ADD CONSTRAINT "Perito_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Aseguradora" ADD CONSTRAINT "Aseguradora_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Ajustador" ADD CONSTRAINT "Ajustador_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Abogado" ADD CONSTRAINT "Abogado_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "TipoDocumento" ADD CONSTRAINT "TipoDocumento_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "PersonaInvolucrada" ADD CONSTRAINT "PersonaInvolucrada_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "EstadoSiniestro" ADD CONSTRAINT "EstadoSiniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

