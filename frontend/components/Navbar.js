'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BioLogo from './BioLogo';
import BackendSettings from './BackendSettings';

const LINKS = [
  { href: '/upload', label: 'Upload' },
  { href: '/qc', label: 'QC' },
  { href: '/consensus', label: 'Consensus' },
  { href: '/pathways', label: 'Pathways' },
  { href: '/export', label: 'Export' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (href) => pathname === href || (pathname && pathname.startsWith(`${href}/`));

  return (
    <>
      <nav className="nav-glass" style={{ padding: '0.7rem 0' }}>
        <div className="container flex justify-between items-center">
          <Link href="/" style={{ textDecoration: 'none' }} aria-label="BioInsight 360 home">
            <BioLogo />
          </Link>

          {/* Desktop Nav */}
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }} className="desktop-nav">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${isActive(link.href) ? 'active' : ''}`}
                aria-current={isActive(link.href) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
            <BackendSettings />
            <Link href="/upload" className="nav-cta">Start &rarr;</Link>
          </div>

          {/* Mobile Toggle */}
          <button
            className="mobile-toggle"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
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
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`nav-link ${isActive(link.href) ? 'active' : ''}`}
                >
                  {link.label}
                </Link>
              ))}
              <BackendSettings />
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
