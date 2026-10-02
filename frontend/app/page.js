import Link from 'next/link';

export default function Home() {
  return (
    <div className="container" style={{ padding: '4rem 1.5rem' }}>
      {/* Hero Section */}
      <section className="fade-in" style={{ textAlign: 'center', margin: '4rem 0 5rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
        <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', maxWidth: '850px', margin: '0 auto' }}>
          <span className="text-gradient">BioInsight 360</span>
        </h1>
        <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text-primary)', maxWidth: '700px', margin: '0 auto' }}>
          Easy Gene Data Visualizer & Explorer
        </h2>
        <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)', maxWidth: '720px', margin: '0.75rem auto', lineHeight: 1.6 }}>
          Turn complex gene spreadsheets into clear, interactive charts in one click. Compare DESeq2, edgeR, and limma-voom side-by-side to discover robust consensus genes and biological pathways.
        </p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/upload" className="btn btn-primary" style={{ fontSize: 'var(--fs-lg)', padding: '0.85rem 2rem' }}>
            Upload File & Start &rarr;
          </Link>
        </div>
      </section>

      {/* 3-Step Simple Workflow Section */}
      <section className="glass-card" style={{ marginBottom: '5rem', padding: '2.5rem' }}>
        <h2 className="section-title text-center" style={{ marginBottom: '0.5rem' }}>How BioInsight 360 Works</h2>
        <p className="text-center" style={{ color: 'var(--text-muted)', marginBottom: '2.5rem' }}>Three simple steps from raw gene data to publication-ready insights</p>

        <div className="grid grid-cols-3 gap-6">
          <div className="glass-card text-center flex flex-col items-center gap-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 800 }}>
              1
            </div>
            <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>📥 Upload File</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Drag & drop your DESeq2, edgeR, or Excel CSV result table. Our smart profiler checks it for formatting errors instantly.
            </p>
          </div>

          <div className="glass-card text-center flex flex-col items-center gap-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ccfbf1', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 800 }}>
              2
            </div>
            <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>📊 Instant Charts</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Get interactive Volcano Plots, Heatmaps, and MA plots instantly—no R or Python coding required.
            </p>
          </div>

          <div className="glass-card text-center flex flex-col items-center gap-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 800 }}>
              3
            </div>
            <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>🎯 Find Key Genes</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Filter top differentially expressed genes and discover what biological pathways they control.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="grid grid-cols-3" style={{ marginBottom: '5rem' }}>
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
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Multi-Tool Consensus</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Compare DESeq2, edgeR, and limma-voom to highlight high-confidence genes verified across methods.
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
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Interactive Visuals</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Filter log2FoldChange and adjusted p-values dynamically with real-time Plotly charts.
          </p>
        </div>
        <div className="glass-card text-center flex flex-col items-center gap-4">
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Cloud & Local Execution</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Instantly interpret DEG CSV files in your browser, or connect to our Python/R Colab engine for raw counts.
          </p>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="text-center fade-in" style={{ animationDelay: '0.3s', marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Powered By</p>
        <div className="flex justify-center items-center gap-4 flex-wrap">
          <span className="badge badge-ns">Next.js</span>
          <span className="badge badge-ns">FastAPI</span>
          <span className="badge badge-ns">Bioconductor DESeq2</span>
          <span className="badge badge-ns">Plotly.js</span>
        </div>
      </section>
    </div>
  );
}

