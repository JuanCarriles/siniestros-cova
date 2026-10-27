-- La matrícula de un abogado no siempre es un número ("T° 45 F° 123", "Mat. 1234 CPACF"): pasa a texto y se
-- conservan las cargadas.
ALTER TABLE "Abogado" ALTER COLUMN "numeroMatricula" TYPE TEXT USING "numeroMatricula"::TEXT;
