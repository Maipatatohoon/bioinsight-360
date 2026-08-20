import Link from 'next/link';

export default function Home() {
  return (
    <div className="container" style={{ padding: '4rem 1.5rem' }}>
      {/* Hero Section */}
      <section className="fade-in" style={{ textAlign: 'center', margin: '4rem 0 6rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', maxWidth: '800px', margin: '0 auto' }}>
          <span className="text-gradient">BioInsight 360</span>
        </h1>
        <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 500, color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
          Consensus-Based Multi-Method RNA-Seq Analysis Platform
        </h2>
        <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-muted)', maxWidth: '700px', margin: '1rem auto' }}>
          Elevate your transcriptomics with robust consensus building. BioInsight 360 runs your RNA-Seq data through multiple analytical pipelines simultaneously to identify high-confidence differential expression, all within your browser.
        </p>
        <div style={{ marginTop: '2rem' }}>
          <Link href="/upload" className="btn btn-primary" style={{ fontSize: 'var(--fs-lg)', padding: '1rem 2rem' }}>
            Get Started &rarr;
          </Link>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="grid grid-cols-3" style={{ marginBottom: '6rem' }}>
        <div className="glass-card text-center flex flex-col items-center gap-4">
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Multi-Method Consensus</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            6 analytical pipelines running simultaneously to give you the highest confidence in your differentially expressed genes.
          </p>
        </div>
        <div className="glass-card text-center flex flex-col items-center gap-4">
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#ccfbf1', border: '1px solid #99f6e4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d9488' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Interactive Visualizations</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Volcano plots, heatmaps, PCA, and UpSet diagrams built right in to explore your consensus data effortlessly.
          </p>
        </div>
        <div className="glass-card text-center flex flex-col items-center gap-4">
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>100% Private & Secure</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            All computation runs in your browser. No data leaves your machine, ensuring complete privacy and security for your research.
          </p>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="glass-card" style={{ marginBottom: '6rem' }}>
        <h2 className="section-title text-center">How It Works</h2>
        <div className="grid grid-cols-4 gap-6" style={{ marginTop: '3rem' }}>
          
          <div className="flex flex-col items-center text-center gap-2">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--accent-primary)' }}>1</div>
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>Upload</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Provide your raw counts and metadata locally.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-2">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--accent-secondary)' }}>2</div>
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>Analyze</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>QC and run multiple DE methods concurrently.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-2">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--accent-success)' }}>3</div>
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>Consensus</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Identify robust markers across all pipelines.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-2">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--accent-warning)' }}>4</div>
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>Export</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Download publication-ready figures and tables.</p>
          </div>

        </div>
      </section>

      {/* Tech Stack */}
      <section className="text-center fade-in" style={{ animationDelay: '0.3s', marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Powered By</p>
        <div className="flex justify-center items-center gap-4 flex-wrap">
          <span className="badge badge-ns">Next.js</span>
          <span className="badge badge-ns">Plotly.js</span>
          <span className="badge badge-ns">Vanilla CSS</span>
          <span className="badge badge-ns">WebAssembly</span>
        </div>
      </section>

    </div>
  );
}
