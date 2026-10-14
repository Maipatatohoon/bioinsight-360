import Link from 'next/link';
import Reveal from '../components/Reveal';

function HeroHelix() {
  return (
    <svg viewBox="0 0 220 340" width="100%" height="320" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="hero-dna" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path d="M60 6 C185 62, 40 118, 160 174 C40 230, 185 286, 60 334"
        stroke="url(#hero-dna)" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M160 6 C40 62, 180 118, 60 174 C180 230, 40 286, 160 334"
        stroke="url(#hero-dna)" strokeWidth="4" fill="none" strokeLinecap="round" />
      <g stroke="url(#hero-dna)" strokeWidth="2" opacity="0.5">
        {Array.from({ length: 8 }, (_, i) => 26 + i * 42).map((y) => (
          <line key={y} x1="66" y1={y} x2="154" y2={y} />
        ))}
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <div className="container" style={{ padding: '3rem 1.5rem' }}>
      {/* Hero */}
      <section className="hero-split" style={{ margin: '2rem 0 5rem 0' }}>
        <div>
          <span className="hero-eyebrow">Multi-method RNA-Seq consensus</span>
          <h1 className="hero-title" style={{ margin: '0 0 1rem' }}>
            <span className="text-gradient">BioInsight 360</span>
          </h1>
          <p style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.85rem', lineHeight: 1.4 }}>
            An Integrated Platform for Multi-method RNA-Seq Analysis, Consensus Differential Expression, and Interpretation
          </p>
          <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)', maxWidth: 560, lineHeight: 1.6 }}>
            Compare DESeq2, edgeR, and limma-voom side by side to surface robust consensus genes and biological
            pathways — in your browser, or through the full R engine.
          </p>
          <div style={{ marginTop: '1.75rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/upload" className="hero-cta">Upload File &amp; Start &rarr;</Link>
            <Link href="/consensus" className="btn btn-secondary" style={{ fontSize: 'var(--fs-lg)' }}>
              View Dashboard
            </Link>
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><div className="num">3</div><div className="lbl">R engines</div></div>
            <div className="hero-stat"><div className="num">6</div><div className="lbl">Pipelines</div></div>
            <div className="hero-stat"><div className="num">100%</div><div className="lbl">Private / in-browser</div></div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="glass-panel" style={{ padding: '1.5rem', width: '100%', maxWidth: 380 }}>
            <HeroHelix />
          </div>
          <div className="hero-chip" style={{ top: 12, left: -6 }}>DESeq2 &check;</div>
          <div className="hero-chip" style={{ top: 62, right: -8, animationDelay: '0.6s' }}>Fleiss &kappa; 0.82</div>
          <div className="hero-chip" style={{ bottom: 46, right: -6, animationDelay: '1.2s' }}>edgeR &check;</div>
          <div className="hero-chip" style={{ bottom: 6, left: 4, animationDelay: '2.1s' }}>limma-voom &check;</div>
        </div>
      </section>

      {/* 3-Step Workflow */}
      <Reveal>
        <section className="glass-panel" style={{ marginBottom: '4rem', padding: '2.5rem' }}>
          <h2 className="section-title text-center" style={{ marginBottom: '0.5rem' }}>How BioInsight 360 Works</h2>
          <p className="text-center" style={{ color: 'var(--text-muted)', marginBottom: '2.5rem' }}>Three simple steps from raw gene data to publication-ready insights</p>

          <div className="grid grid-cols-3 gap-6">
            <div className="glass-card text-center flex flex-col items-center gap-3" style={{ background: 'rgba(241, 245, 249, 0.55)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 800 }}>
                1
              </div>
              <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>📥 Upload File</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Drag &amp; drop your DESeq2, edgeR, or Excel CSV result table. Our smart profiler checks it for formatting errors instantly.
              </p>
            </div>

            <div className="glass-card text-center flex flex-col items-center gap-3" style={{ background: 'rgba(241, 245, 249, 0.55)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ccfbf1', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 800 }}>
                2
              </div>
              <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>📊 Instant Charts</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Get interactive Volcano Plots, Heatmaps, and MA plots instantly — no R or Python coding required.
              </p>
            </div>

            <div className="glass-card text-center flex flex-col items-center gap-3" style={{ background: 'rgba(241, 245, 249, 0.55)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 800 }}>
                3
              </div>
              <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>🎯 Find Key Genes</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Filter top differentially expressed genes and discover the biological pathways they control.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* Feature Cards */}
      <Reveal delay={80}>
        <section className="grid grid-cols-3" style={{ marginBottom: '4rem' }}>
          <div className="glass-panel text-center flex flex-col items-center gap-4" style={{ padding: '1.75rem' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Multi-Tool Consensus</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Compare DESeq2, edgeR, and limma-voom to highlight high-confidence genes verified across methods.
            </p>
          </div>
          <div className="glass-panel text-center flex flex-col items-center gap-4" style={{ padding: '1.75rem' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#ccfbf1', border: '1px solid #99f6e4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d9488' }}>
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Interactive Visuals</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Filter log2FoldChange and adjusted p-values dynamically with real-time Plotly charts.
            </p>
          </div>
          <div className="glass-panel text-center flex flex-col items-center gap-4" style={{ padding: '1.75rem' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Cloud &amp; Local Execution</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Interpret DEG CSV files in your browser, or connect to the Python/R backend engine for raw counts.
            </p>
          </div>
        </section>
      </Reveal>

      {/* Tech Stack */}
      <Reveal delay={120}>
        <section className="text-center" style={{ marginBottom: '2rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Powered By</p>
          <div className="flex justify-center items-center gap-4 flex-wrap">
            <span className="badge badge-ns">Next.js</span>
            <span className="badge badge-ns">FastAPI</span>
            <span className="badge badge-ns">Bioconductor DESeq2</span>
            <span className="badge badge-ns">Plotly.js</span>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
