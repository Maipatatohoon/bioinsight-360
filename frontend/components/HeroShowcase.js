'use client';

// Hero visual that rotates through the app's own science: a Volcano plot,
// a PCA scatter, and the RNA-transcription animation. Click the dots to jump;
// auto-rotation pauses under prefers-reduced-motion.
import { useEffect, useState } from 'react';
import RnaHero from './RnaHero';

const GREY = [
  [160, 175], [150, 180], [175, 170], [140, 182], [185, 178], [130, 170],
  [200, 172], [155, 160], [170, 165], [145, 155], [190, 158], [165, 150],
  [135, 148], [205, 150], [180, 145], [125, 158], [215, 162], [160, 140],
];
const UP = [[230, 70], [255, 45], [270, 90], [245, 30], [285, 60], [260, 110], [240, 120], [275, 35]];
const DOWN = [[80, 75], [60, 50], [45, 95], [95, 40], [35, 105], [70, 130], [50, 120], [105, 55]];

const CTRL = [[100, 150], [120, 145], [95, 135], [125, 130], [110, 160], [130, 150], [90, 145], [115, 140]];
const TRT = [[200, 90], [225, 85], [210, 70], [235, 95], [195, 75], [220, 105], [240, 80], [205, 60]];

function Volcano() {
  return (
    <svg viewBox="0 0 320 230" role="img" aria-label="Volcano plot of consensus differentially expressed genes">
      <line x1="40" y1="190" x2="305" y2="190" stroke="#cbd5e1" />
      <line x1="40" y1="20" x2="40" y2="190" stroke="#cbd5e1" />
      <line x1="130" y1="20" x2="130" y2="190" stroke="#e2e8f0" strokeDasharray="4 4" />
      <line x1="190" y1="20" x2="190" y2="190" stroke="#e2e8f0" strokeDasharray="4 4" />
      <line x1="40" y1="120" x2="305" y2="120" stroke="#fca5a5" strokeDasharray="4 4" />
      <g fill="#94a3b8">{GREY.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" />)}</g>
      <g fill="#2563eb">{UP.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" />)}</g>
      <g fill="#d97706">{DOWN.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" />)}</g>
      <text x="172" y="222" fontSize="11" fill="#64748b" textAnchor="middle">log2 fold change</text>
      <text x="16" y="105" fontSize="11" fill="#64748b" textAnchor="middle" transform="rotate(-90 16 105)">-log10 p</text>
    </svg>
  );
}

function Pca() {
  return (
    <svg viewBox="0 0 320 230" role="img" aria-label="PCA scatter plot of samples">
      <line x1="40" y1="190" x2="305" y2="190" stroke="#cbd5e1" />
      <line x1="40" y1="20" x2="40" y2="190" stroke="#cbd5e1" />
      <g fill="#2563eb">{CTRL.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="6" opacity="0.85" />)}</g>
      <g fill="#06b6d4">{TRT.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="6" opacity="0.85" />)}</g>
      <text x="172" y="222" fontSize="11" fill="#64748b" textAnchor="middle">PC1 (42.3%)</text>
      <text x="16" y="105" fontSize="11" fill="#64748b" textAnchor="middle" transform="rotate(-90 16 105)">PC2 (18.7%)</text>
      <g fontSize="11" fill="#475569">
        <circle cx="214" cy="34" r="5" fill="#2563eb" /><text x="224" y="38">Control</text>
        <circle cx="214" cy="52" r="5" fill="#06b6d4" /><text x="224" y="56">Treated</text>
      </g>
    </svg>
  );
}

const SLIDES = [
  { key: 'volcano', label: 'Volcano — consensus differential expression', node: <Volcano /> },
  { key: 'pca', label: 'PCA — sample separation', node: <Pca /> },
  { key: 'rna', label: 'RNA transcription', node: <RnaHero /> },
];

export default function HeroShowcase() {
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setAuto(!mq.matches);
    const onChange = () => setAuto(!mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 3000);
    return () => clearInterval(t);
  }, [auto]);

  return (
    <div className="showcase">
      {SLIDES.map((s, i) => (
        <div key={s.key} className={`showcase-slide ${i === idx ? 'is-active' : ''}`} aria-hidden={i !== idx}>
          {s.node}
        </div>
      ))}
      <div className="showcase-caption">{SLIDES[idx].label}</div>
      <div className="showcase-dots">
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-label={`Show ${s.label}`}
            className={i === idx ? 'active' : ''}
            onClick={() => setIdx(i)}
          />
        ))}
      </div>
    </div>
  );
}
