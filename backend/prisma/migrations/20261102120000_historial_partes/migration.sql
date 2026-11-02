-- CU-10 1.c (E5-06): agregar, modificar y dar de baja vehículos y personas desde la ficha queda en el historial.
-- Solo agrega valores al tipo de evento: no toca ningún evento existente.
ALTER TYPE "TipoEventoHistorial" ADD VALUE 'VEHICULO';
ALTER TYPE "TipoEventoHistorial" ADD VALUE 'PERSONA';
