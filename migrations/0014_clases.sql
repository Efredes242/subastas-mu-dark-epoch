-- La clase de cada personaje, para verla de un vistazo con su retrato al lado del nombre.
--
-- Solo se guarda el código (BK, ELF, SM, DL). El nombre y la imagen salen de worker/clases.ts,
-- porque son cuatro y no cambian: no tiene sentido meterlas en la base.

ALTER TABLE usuarios ADD COLUMN clase TEXT NOT NULL DEFAULT '';

-- Lo que tiene el gremio hoy.
UPDATE usuarios SET clase = 'BK'  WHERE personaje IN ('Violet', 'SynC', 'UriahDelyricth');
UPDATE usuarios SET clase = 'ELF' WHERE personaje IN ('Rikiya', 'Alckron');
UPDATE usuarios SET clase = 'SM'  WHERE personaje = 'DenaliMyrella';
