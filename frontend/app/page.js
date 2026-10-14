import Link from 'next/link';
import HeroShowcase from '../components/HeroShowcase';

const CARDS = [
  { n: '1', t: 'Multi-tool consensus', d: 'Highlight only genes verified across DESeq2, edgeR and limma.' },
  { n: '2', t: 'Agreement metrics', d: "Jaccard, overlap coefficient and Fleiss' \u03ba between methods." },
  { n: '3', t: 'Pathway stability', d: 'GO pathways that stay enriched no matter the pipeline.' },
];

export default function Home() {
  return (
    <div className="container" style={{ padding: '2.5rem 1.5rem 4rem' }}>
      <section className="hero-grid fade-in" style={{ margin: '1rem 0 4rem' }}>
        <div>
          <span style={{ display: 'inline-block', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-primary)', marginBottom: '1rem' }}>
            Multi-method RNA-Seq consensus
          </span>
          <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em', margin: '0 0 0.9rem' }}>
            <span className="text-gradient">BioInsight 360</span>
          </h1>
          <p style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.6rem', lineHeight: 1.4 }}>
            An Integrated Platform for Multi-method RNA-Seq Analysis, Consensus Differential Expression, and Interpretation
          </p>
          <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)', margin: '0 0 1.5rem', lineHeight: 1.6, maxWidth: 520 }}>
            Run DESeq2, edgeR and limma-voom side by side and keep only the genes and pathways every method agrees on.
          </p>
          <Link href="/upload" className="btn btn-primary" style={{ fontSize: 'var(--fs-lg)', padding: '0.85rem 2rem' }}>
            Upload your counts &rarr;
          </Link>
          <div style={{ display: 'flex', gap: '2.25rem', marginTop: '2rem' }}>
            <div>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--text-primary)' }}>3</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>R engines</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--text-primary)' }}>6</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Pipelines</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--text-primary)' }}>100%</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Private / in-browser</div>
            </div>
          </div>
        </div>

        <figure style={{ margin: 0, border: '1px solid var(--border-color)', borderRadius: 14, padding: '0.85rem', background: '#ffffff', boxShadow: '0 14px 40px -26px rgba(15, 23, 42, 0.45)' }}>
          <HeroShowcase />
          <figcaption style={{ textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Consensus DEG volcano &middot; PCA &middot; RNA transcription (rotating)
          </figcaption>
        </figure>
      </section>

      <section className="grid grid-cols-3">
        {CARDS.map((c) => (
          <div key={c.t} className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, marginBottom: '0.75rem' }}>
              {c.n}
            </div>
            <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, margin: '0 0 0.35rem', color: 'var(--text-primary)' }}>{c.t}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>{c.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
