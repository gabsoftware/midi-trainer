import { useState } from 'react';

export interface ChartPoint {
  /** Libellé de l'abscisse (date de la séance). */
  readonly label: string;
  /** Valeur, ou `null` si elle n'existe pas pour ce point (rupture de la ligne). */
  readonly value: number | null;
}

interface LineChartProps {
  readonly title: string;
  readonly points: readonly ChartPoint[];
  /** Formate une valeur pour les graduations et l'infobulle. */
  readonly format: (value: number) => string;
  /** Graduations de l'axe vertical, de bas en haut ; la première et la dernière bornent l'axe. */
  readonly ticks: readonly number[];
}

const WIDTH = 360;
const HEIGHT = 170;
const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

/**
 * Courbe d'une seule série (pas de légende : le titre la nomme).
 * Ligne de 2 px, points de 8 px avec anneau de 2 px couleur du fond, quadrillage fin.
 * Infobulle au survol de toute la colonne d'un point, pas seulement du point lui-même.
 */
export function LineChart({ title, points, format, ticks }: LineChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const low = ticks[0];
  const high = ticks[ticks.length - 1];
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xOf = (index: number) => PAD.left + (points.length > 1 ? index * step : plotWidth / 2);
  const yOf = (value: number) => PAD.top + plotHeight * (1 - (Math.min(high, Math.max(low, value)) - low) / (high - low));

  // Segments continus (une valeur manquante coupe la ligne).
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
    } else {
      current.push(`${current.length === 0 ? 'M' : 'L'}${xOf(index).toFixed(1)},${yOf(point.value).toFixed(1)}`);
    }
  });
  if (current.length > 1) segments.push(current.join(' '));

  const bandWidth = points.length > 1 ? step : plotWidth;
  const hoveredPoint = hovered === null ? null : points[hovered];

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div className="chart-plot">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title} onPointerLeave={() => setHovered(null)}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={yOf(tick)} y2={yOf(tick)} />
              <text className="chart-tick" x={PAD.left - 6} y={yOf(tick)} textAnchor="end" dominantBaseline="middle">
                {format(tick)}
              </text>
            </g>
          ))}
          {points.length > 0 && (
            <>
              <text className="chart-tick" x={xOf(0)} y={HEIGHT - 4} textAnchor={points.length > 1 ? 'start' : 'middle'}>
                {points[0].label}
              </text>
              {points.length > 1 && (
                <text className="chart-tick" x={xOf(points.length - 1)} y={HEIGHT - 4} textAnchor="end">
                  {points[points.length - 1].label}
                </text>
              )}
            </>
          )}
          {hovered !== null && <line className="chart-crosshair" x1={xOf(hovered)} x2={xOf(hovered)} y1={PAD.top} y2={PAD.top + plotHeight} />}
          {segments.map((path) => (
            <path key={path} className="chart-line" d={path} />
          ))}
          {points.map((point, index) =>
            point.value === null ? null : (
              <circle
                key={index}
                className={index === hovered ? 'chart-dot hovered' : 'chart-dot'}
                cx={xOf(index)}
                cy={yOf(point.value)}
                r={index === hovered ? 5 : 4}
              />
            ),
          )}
          {/* Zones de survol : toute la hauteur, toute la largeur de la colonne. */}
          {points.map((_, index) => (
            <rect
              key={index}
              className="chart-hit"
              x={xOf(index) - bandWidth / 2}
              y={0}
              width={bandWidth}
              height={HEIGHT}
              onPointerEnter={() => setHovered(index)}
            />
          ))}
        </svg>
        {hoveredPoint && hovered !== null && (
          <div
            className="chart-tooltip"
            style={{ left: `${(xOf(hovered) / WIDTH) * 100}%` }}
            role="status"
          >
            <span>{hoveredPoint.label}</span>
            <strong>{hoveredPoint.value === null ? '—' : format(hoveredPoint.value)}</strong>
          </div>
        )}
      </div>
    </figure>
  );
}
