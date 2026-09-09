import type { TopicIndicator } from "../lib/xmind/indicators";

/** SVG symbols keep internal XMind identifiers out of the visible document. */
export default function XmindIndicator({
  icon,
  x,
  y,
  label,
  color,
}: {
  icon: TopicIndicator;
  x: number;
  y: number;
  label: string;
  color: string;
}) {
  const ink = icon.color ?? color;
  return (
    <svg
      x={x}
      y={y}
      width={16}
      height={16}
      viewBox="0 0 16 16"
      role="img"
      aria-label={label}
      pointerEvents="auto"
    >
      <title>{label}</title>
      {icon.kind === "priority" ? (
        <>
          <circle cx={8} cy={8} r={7} fill={ink} />
          <text
            x={8}
            y={11.3}
            textAnchor="middle"
            fontFamily="sans-serif"
            fontSize={10}
            fontWeight={700}
            fill="white"
            aria-hidden="true"
          >
            {icon.value}
          </text>
        </>
      ) : icon.kind === "task" ? (
        <>
          <circle
            cx={8}
            cy={8}
            r={6.3}
            fill={icon.value === 1 ? ink : "none"}
            stroke={ink}
            strokeWidth={1.4}
          />
          {icon.value === 1 ? (
            <path
              d="M4.5 8l2.3 2.3 4.7-4.7"
              fill="none"
              stroke="white"
              strokeWidth={1.6}
            />
          ) : (
            !!icon.value && (
              <path
                d={`M8 8 L8 2.7 A5.3 5.3 0 ${icon.value > 0.5 ? 1 : 0} 1 ${8 + 5.3 * Math.sin(icon.value * Math.PI * 2)} ${8 - 5.3 * Math.cos(icon.value * Math.PI * 2)} Z`}
                fill={ink}
              />
            )
          )}
        </>
      ) : icon.kind === "star" ? (
        <path
          d="M8 1l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 11.8 3.8 14l.8-4.7L1.2 6l4.7-.7Z"
          fill={ink}
        />
      ) : icon.kind === "flag" ? (
        <path
          d="M3 14V2m0 0h10l-2.5 3L13 8H3"
          fill={ink}
          stroke={ink}
          strokeWidth={1.3}
        />
      ) : icon.kind === "notes" ? (
        <g
          fill="none"
          stroke={ink}
          strokeWidth={1.2}
          strokeLinecap="round"
        >
          <rect x={3} y={1.8} width={10} height={12.4} rx={1.5} />
          <path d="M5.5 5h5M5.5 8h5M5.5 11h3" />
        </g>
      ) : icon.kind === "link" ? (
        <g
          fill="none"
          stroke={ink}
          strokeWidth={1.4}
          strokeLinecap="round"
        >
          <path d="M6.3 5.1l2-2a3 3 0 014.3 4.3l-2 2M9.7 10.9l-2 2a3 3 0 01-4.3-4.3l2-2M5.8 10.2l4.4-4.4" />
        </g>
      ) : (
        <g fill="none" stroke={ink} strokeWidth={1.3}>
          <path d="M8 1.5L14.5 8 8 14.5 1.5 8Z" />
          <circle cx={8} cy={8} r={1.2} fill={ink} />
        </g>
      )}
    </svg>
  );
}
