// Animated RNA-seq hero visual: a transcript stream (A/U/G/C) behind a
// transcribing double helix with a polymerase moving along the strand.
// CSS/SVG only — no dependencies. Motion is disabled under
// prefers-reduced-motion via globals.css.
export default function RnaHero() {
  const columns = [
    ['A', 'U', 'G', 'C', 'U', 'A', 'G'],
    ['C', 'G', 'A', 'U', 'C', 'G', 'A'],
    ['U', 'A', 'C', 'G', 'A', 'U', 'C'],
    ['G', 'C', 'U', 'A', 'G', 'C', 'U'],
    ['A', 'U', 'G', 'C', 'U', 'A', 'G'],
    ['C', 'G', 'A', 'U', 'C', 'G', 'A'],
  ];

  const strand = 'M20 110 C90 50, 150 170, 220 110 C290 50, 320 170, 340 110';

  return (
    <div className="rna-hero" aria-hidden="true">
      <div className="rna-stream">
        {columns.map((col, ci) => (
          <div className="rna-col" key={ci} style={{ animationDelay: `${ci * 0.4}s` }}>
            {col.map((letter, i) => (
              <span key={i} style={{ color: i % 2 ? '#06b6d4' : '#2563eb' }}>{letter}</span>
            ))}
          </div>
        ))}
      </div>

      <svg className="rna-helix" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="rna-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        <path d={strand} stroke="url(#rna-grad)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path
          d="M20 110 C90 170, 150 50, 220 110 C290 170, 320 50, 340 110"
          stroke="url(#rna-grad)" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7"
        />

        <g stroke="url(#rna-grad)" strokeWidth="2">
          <line className="rung" x1="60" y1="70" x2="60" y2="150" style={{ animationDelay: '0s' }} />
          <line className="rung" x1="120" y1="106" x2="120" y2="114" style={{ animationDelay: '0.25s' }} />
          <line className="rung" x1="180" y1="60" x2="180" y2="160" style={{ animationDelay: '0.5s' }} />
          <line className="rung" x1="240" y1="106" x2="240" y2="114" style={{ animationDelay: '0.75s' }} />
          <line className="rung" x1="300" y1="70" x2="300" y2="150" style={{ animationDelay: '1s' }} />
        </g>

        <circle className="pol" r="8" fill="#0ea5e9">
          <animateMotion dur="3.6s" repeatCount="indefinite" path={strand} />
        </circle>
        <circle className="pol-core" r="4" fill="#ffffff">
          <animateMotion dur="3.6s" repeatCount="indefinite" path={strand} />
        </circle>
      </svg>
    </div>
  );
}
