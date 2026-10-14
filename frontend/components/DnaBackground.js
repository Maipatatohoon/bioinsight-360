// Site-wide decorative DNA background (Genomic Light).
// Pure markup + CSS animation — no client JS, no dependencies.
export default function DnaBackground() {
  const rungs = Array.from({ length: 20 }, (_, i) => 30 + i * 60);

  const helix = (id) => (
    <svg
      viewBox="0 0 120 1230"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path
        d="M20 0 C100 90, 20 190, 100 280 C20 370, 100 470, 20 560 C100 650, 20 750, 100 840 C20 930, 100 1030, 20 1120 C100 1210, 20 1230, 60 1230"
        stroke={`url(#${id})`}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M100 0 C20 90, 100 190, 20 280 C100 370, 20 470, 100 560 C20 650, 100 750, 20 840 C100 930, 20 1030, 100 1120 C20 1210, 100 1230, 60 1230"
        stroke={`url(#${id})`}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <g stroke={`url(#${id})`} strokeWidth="2" opacity="0.5">
        {rungs.map((y) => (
          <line key={y} x1="22" y1={y} x2="98" y2={y} />
        ))}
      </g>
    </svg>
  );

  return (
    <div className="site-bg" aria-hidden="true">
      <div className="glow a" />
      <div className="glow b" />
      <div className="helix left">{helix('dna-l')}</div>
      <div className="helix right">{helix('dna-r')}</div>
    </div>
  );
}
