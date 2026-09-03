import type { ReactNode } from 'react';

/** Los diez íconos que el admin puede elegir al cargar un item. */
export const ICONOS: Record<string, ReactNode> = {
  arma: (
    <>
      <path d="M19 3h2v2L11.5 14.5 9.5 12.5 19 3Z" />
      <path d="M8.4 13.4 10.6 15.6" />
      <path d="M4 20.5 8 16.5" />
      <path d="M3.6 17.6 6.4 20.4" />
    </>
  ),
  armadura: (
    <>
      <path d="M12 3 5 5.5v5.8c0 4.3 2.9 8 7 9.7 4.1-1.7 7-5.4 7-9.7V5.5L12 3Z" />
      <path d="M12 8v6" />
    </>
  ),
  casco: (
    <>
      <path d="M5 12a7 7 0 0 1 14 0v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5Z" />
      <path d="M9 19v-4" />
      <path d="M15 19v-4" />
      <path d="M5.4 13h13.2" />
    </>
  ),
  alas: (
    <>
      <path d="M12 6.5v12" />
      <path d="M12 8.5C9.5 5.5 6.2 5 3.2 5.5c0 5 3.4 8.4 8.8 9" />
      <path d="M12 8.5c2.5-3 5.8-3.5 8.8-3 0 5-3.4 8.4-8.8 9" />
    </>
  ),
  joya: (
    <>
      <path d="M6.5 4h11l3 5-8.5 11L3.5 9l3-5Z" />
      <path d="M3.5 9h17" />
      <path d="m9.5 4-3 5 5.5 11L17.5 9l-3-5" />
    </>
  ),
  anillo: (
    <>
      <circle cx="12" cy="14.8" r="5.7" />
      <path d="m9.6 6.6 2.4-3 2.4 3" />
      <path d="M9.6 6.6h4.8" />
    </>
  ),
  pergamino: (
    <>
      <path d="M6.5 4H16a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8.5a2 2 0 0 1-2-2V4Z" />
      <path d="M6.5 4a2 2 0 0 0-2 2v2h2" />
      <path d="M9.5 9.5h5.5" />
      <path d="M9.5 13.5h5.5" />
    </>
  ),
  bota: (
    <>
      <path d="M6 3.5h4.5V11H15a5 5 0 0 1 5 5v2.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
      <path d="M10.5 11v4.5" />
    </>
  ),
  zen: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6v8.8" />
      <path d="M9.4 10h5.2" />
      <path d="M9.4 14h5.2" />
    </>
  ),
  caja: (
    <>
      <path d="M4 8.4 12 4l8 4.4v7.2L12 20l-8-4.4V8.4Z" />
      <path d="M4 8.4 12 12.9l8-4.5" />
      <path d="M12 12.9V20" />
    </>
  ),
};

export const NOMBRES_ICONOS = Object.keys(ICONOS);

export function Glifo({ nombre, tam = 22 }: { nombre: string; tam?: number }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONOS[nombre] ?? ICONOS.caja}
    </svg>
  );
}

export function IconoItem({
  icono,
  imagen,
  rareza,
  tam = 44,
}: {
  icono: string;
  imagen?: string | null;
  rareza: string;
  tam?: number;
}) {
  return (
    <div className={`icono-item r-${rareza}`} style={{ width: tam, height: tam, borderRadius: tam / 3.4 }}>
      {imagen ? <img src={imagen} alt="" /> : <Glifo nombre={icono} tam={Math.round(tam * 0.5)} />}
    </div>
  );
}

/* Íconos de interfaz, aparte de los de items. */

const Trazo = ({ children, tam = 20 }: { children: ReactNode; tam?: number }) => (
  <svg
    width={tam}
    height={tam}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Escudo = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M12 3 5 5.5v5.8c0 4.3 2.9 8 7 9.7 4.1-1.7 7-5.4 7-9.7V5.5L12 3Z" />
    <path d="M12 8.5v5" />
    <path d="M9.5 11h5" />
  </Trazo>
);

export const Cofre = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <rect x="3.5" y="8.5" width="17" height="11" rx="2.5" />
    <path d="M8.5 8.5V6.4A3.5 3.5 0 0 1 12 2.9a3.5 3.5 0 0 1 3.5 3.5v2.1" />
    <path d="M12 12.8v2.4" />
  </Trazo>
);

export const Lineas = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M4 5.5h16" />
    <path d="M4 12h16" />
    <path d="M4 18.5h10" />
  </Trazo>
);

export const Luna = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Trazo>
);

export const Sol = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2" />
    <path d="M12 19.5v2" />
    <path d="M2.5 12h2" />
    <path d="M19.5 12h2" />
    <path d="m5.5 5.5 1.4 1.4" />
    <path d="m17.1 17.1 1.4 1.4" />
    <path d="m18.5 5.5-1.4 1.4" />
    <path d="m6.9 17.1-1.4 1.4" />
  </Trazo>
);

export const Reloj = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5l3 1.8" />
  </Trazo>
);

export const Tilde = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Trazo>
);

export const Mas = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M12 5.5v13" />
    <path d="M5.5 12h13" />
  </Trazo>
);

export const Copiar = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
  </Trazo>
);

export const Tacho = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M5 7h14" />
    <path d="M9 7V5h6v2" />
    <path d="M7 7l1 12h8l1-12" />
  </Trazo>
);

export const Arriba = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="m5.5 14.5 6.5-6.5 6.5 6.5" />
  </Trazo>
);

export const Abajo = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />
  </Trazo>
);

export const Lupa = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Trazo>
);

export const Alerta = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16.4v.01" />
  </Trazo>
);

export const Orden = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M7 4.5v15" />
    <path d="m3.5 8 3.5-3.5L10.5 8" />
    <path d="M13.5 7h7" />
    <path d="M13.5 12h5" />
    <path d="M13.5 17h3" />
  </Trazo>
);

export const Subir = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M12 16V5" />
    <path d="m8 8.5 4-3.5 4 3.5" />
    <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
  </Trazo>
);

export const Salir = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M14 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
    <path d="M10 8.5 6 12l4 3.5" />
    <path d="M6 12h8" />
  </Trazo>
);

export const Gente = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <circle cx="9.5" cy="8" r="3.3" />
    <path d="M3.5 19.5a6 6 0 0 1 12 0" />
    <path d="M16.5 5.4a3.3 3.3 0 0 1 0 6.3" />
    <path d="M18 14.4a6 6 0 0 1 2.5 5.1" />
  </Trazo>
);

/** Mano levantada: "estoy". */
export const Mano = ({ tam }: { tam?: number }) => (
  <Trazo tam={tam}>
    <path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10" />
    <path d="M12 10V3.5a1.5 1.5 0 0 1 3 0V10" />
    <path d="M15 10.5V5.5a1.5 1.5 0 0 1 3 0V14" />
    <path d="M9 11V8.5a1.5 1.5 0 0 0-3 0v6.2c0 3.2 2.4 5.8 5.5 5.8h1.2c3 0 5.3-2.4 5.3-5.4V14" />
  </Trazo>
);
