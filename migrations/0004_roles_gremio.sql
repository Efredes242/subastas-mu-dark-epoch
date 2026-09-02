-- Los roles pasan a llamarse como en el gremio.
--   admin       → Alckron, y nadie más.
--   grandmaster → sube los drops y arranca el reparto.
--   invitado    → el resto: se anota y pide items.

UPDATE usuarios SET rol = 'grandmaster' WHERE rol = 'cargador';
UPDATE usuarios SET rol = 'invitado'    WHERE rol = 'miembro';
