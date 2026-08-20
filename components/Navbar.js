'use client';
import { useState } from 'react';
import Link from 'next/link';
import BioLogo from './BioLogo';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav style={{ 
      position: 'sticky', 
      top: 0, 
      zIndex: 50, 
      background: 'rgba(255, 255, 255, 0.95)', 
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid #e2e8f0',
      padding: '0.85rem 0'
    }}>
      <div className="container flex justify-between items-center">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <BioLogo />
        </Link>

        {/* Desktop Nav */}
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }} className="desktop-nav">
          <Link href="/upload" className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>Upload</Link>
          <Link href="/qc" className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>QC</Link>
          <Link href="/consensus" className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>Consensus</Link>
          <Link href="/pathways" className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>Pathways</Link>
          <Link href="/export" className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>Export</Link>
          <Link href="/modernize" className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>Modernize</Link>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="mobile-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1.5rem', cursor: 'pointer', display: 'none' }}
        >
          ☰
        </button>
      </div>

      {/* Mobile Nav */}
      {isMobileMenuOpen && (
        <div className="mobile-nav" style={{ padding: '1rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex flex-col gap-4">
            <Link href="/upload" onClick={() => setIsMobileMenuOpen(false)} style={{ color: 'var(--text-primary)' }}>Upload</Link>
            <Link href="/qc" onClick={() => setIsMobileMenuOpen(false)} style={{ color: 'var(--text-primary)' }}>QC</Link>
            <Link href="/consensus" onClick={() => setIsMobileMenuOpen(false)} style={{ color: 'var(--text-primary)' }}>Consensus</Link>
            <Link href="/pathways" onClick={() => setIsMobileMenuOpen(false)} style={{ color: 'var(--text-primary)' }}>Pathways</Link>
            <Link href="/export" onClick={() => setIsMobileMenuOpen(false)} style={{ color: 'var(--text-primary)' }}>Export</Link>
            <Link href="/modernize" onClick={() => setIsMobileMenuOpen(false)} style={{ color: 'var(--text-primary)' }}>Modernize</Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .nav-link:hover {
          color: var(--accent-primary) !important;
        }
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-toggle { display: block !important; }
        }
      `}</style>
    </nav>
  );
}
