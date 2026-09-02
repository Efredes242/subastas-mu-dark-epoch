import type { Estado } from '../../worker/types';
import { fechaHoraEn } from '../api';
import { IconoItem } from '../iconos';

/**
 * El reparto del Kundun anterior. Sirve para que cualquiera pueda ver quién salió
 * sorteado la vez pasada y con qué, sin tener que preguntarlo por el chat.
 */
export function PujaAnterior({ anterior, zona }: { anterior: Estado['anterior']; zona: string }) {
  if (!anterior || anterior.items.length === 0) return null;

  const repartidos = anterior.items.filter((i) => i.dueno);

  return (
    <section className="panel subir" style={{ padding: '18px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '0 4px 12px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Puja anterior · Kundun #{anterior.numero}</h2>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--tx3)', marginTop: 4 }}>
            {fechaHoraEn(anterior.fecha, zona)} · {anterior.participantes}{' '}
            {anterior.participantes === 1 ? 'participante' : 'participantes'}
          </div>
        </div>
        <span className="pastilla" style={{ flexShrink: 0 }}>
          {repartidos.length} de {anterior.items.length}
        </span>
      </div>

      <div className="escalonado">
        {anterior.items.map((it) => (
          <div
            key={it.id}
            className={`fila r-${it.rareza}`}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px' }}
          >
            <IconoItem icono={it.icono} imagen={it.imagen} rareza={it.rareza} tam={36} />
            <div className="recorte" style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
              {it.etiqueta}
            </div>
            {it.dueno ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--oro)' }}>{it.dueno}</span>
                {it.estado === 'entregado' && (
                  <span className="pastilla ok" style={{ padding: '4px 9px', fontSize: 10 }}>
                    ganado
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx3)', flexShrink: 0 }}>nadie lo pidió</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
