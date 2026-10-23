-- Retirar exclusivamente las tres filas ficticias de la antigua seed de desarrollo.
-- Las cargas reales usan claves UUID y registran el tamaño; quedan fuera de este filtro.
DELETE FROM "DocumentoPlantilla"
WHERE "tamanoBytes" IS NULL
  AND ("nombreOriginal", "urlArchivo") IN (
    ('Formulario de cierre.pdf', 'plantillas/formulario-de-cierre.pdf'),
    ('Planilla de daños.xlsx', 'plantillas/planilla-de-danos.xlsx'),
    ('Modelo de denuncia administrativa.docx', 'plantillas/modelo-de-denuncia-administrativa.docx')
  );
