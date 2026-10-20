-- Búsqueda de siniestros sin distinguir tildes (RF-16): "rios" encuentra "Ríos".
-- unaccent viene con PostgreSQL (contrib) y es una extensión de confianza: la puede crear el dueño de la base.
-- Prisma no la declara en schema.prisma; solo la usan las consultas SQL del módulo de siniestros.
CREATE EXTENSION IF NOT EXISTS unaccent;
