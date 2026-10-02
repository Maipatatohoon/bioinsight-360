'use client';
import { useState } from 'react';
import Link from 'next/link';
import BioLogo from './BioLogo';
import ColabBackendModal from './ColabBackendModal';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
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
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }} className="desktop-nav">
            <Link href="/upload" className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>Upload</Link>
            <Link href="/qc" className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>QC</Link>
            <Link href="#" onClick={(e) => e.preventDefault()} className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>Consensus</Link>
            <Link href="#" onClick={(e) => e.preventDefault()} className="nav-link" style={{ color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.3s' }}>Pathways</Link>
            
            {/* Colab Server Settings Button */}
            <button 
              onClick={() => setIsModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#059669',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ⚡ Colab Server
            </button>
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
              <Link href="#" onClick={(e) => e.preventDefault()} style={{ color: 'var(--text-primary)' }}>Consensus</Link>
              <Link href="#" onClick={(e) => e.preventDefault()} style={{ color: 'var(--text-primary)' }}>Pathways</Link>
            </div>
          </div>
        )}
      </nav>

      {/* Backend Settings Modal */}
      <ColabBackendModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
