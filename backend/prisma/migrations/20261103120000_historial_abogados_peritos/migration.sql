-- CU-10 1.d y 1.e (E5-07): agregar, modificar y dar de baja abogados y peritos desde la ficha queda en el historial.
-- Solo agrega valores al tipo de evento: no toca ningún evento existente.
ALTER TYPE "TipoEventoHistorial" ADD VALUE 'ABOGADO';
ALTER TYPE "TipoEventoHistorial" ADD VALUE 'PERITO';
