'use client';

export default function BioLogo({ size = 34, showText = true }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}>
      <div style={{ 
        position: 'relative', 
        width: size, 
        height: size, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%)',
        borderRadius: '10px',
        border: '1px solid #bfdbfe',
        boxShadow: '0 2px 5px rgba(37, 99, 235, 0.12)'
      }}>
        <svg
          width={size * 0.75}
          height={size * 0.75}
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="bioGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
            <linearGradient id="bioGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>

          {/* Animated DNA Strand 1 */}
          <path
            d="M 6,10 C 14,10 26,30 34,30"
            stroke="url(#bioGrad1)"
            strokeWidth="4"
            strokeLinecap="round"
          >
            <animate
              attributeName="d"
              values="M 6,10 C 14,10 26,30 34,30; M 6,30 C 14,30 26,10 34,10; M 6,10 C 14,10 26,30 34,30"
              dur="3.5s"
              repeatCount="indefinite"
            />
          </path>

          {/* Animated DNA Strand 2 */}
          <path
            d="M 6,30 C 14,30 26,10 34,10"
            stroke="url(#bioGrad2)"
            strokeWidth="4"
            strokeLinecap="round"
          >
            <animate
              attributeName="d"
              values="M 6,30 C 14,30 26,10 34,10; M 6,10 C 14,10 26,30 34,30; M 6,30 C 14,30 26,10 34,10"
              dur="3.5s"
              repeatCount="indefinite"
            />
          </path>

          {/* Dynamic Nodes */}
          <circle cx="20" cy="20" r="3.5" fill="#2563eb">
            <animate attributeName="r" values="3.5; 5; 3.5" dur="1.75s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      {showText && (
        <span style={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-0.03em', color: '#0f172a' }}>
          Bio<span style={{ color: '#2563eb' }}>Insight</span>
          <span style={{ 
            marginLeft: '0.4rem', 
            fontSize: '0.75rem', 
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', 
            color: '#ffffff', 
            padding: '0.2rem 0.55rem', 
            borderRadius: '6px', 
            fontWeight: 700,
            letterSpacing: '0.02em',
            verticalAlign: 'middle',
            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
          }}>
            360
          </span>
        </span>
      )}
    </div>
  );
}
