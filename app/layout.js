import './globals.css';

export const metadata = {
  title: 'BioInsight 360',
  description: 'Consensus-Based Multi-Method RNA-Seq Analysis Platform',
};

import Navbar from '../components/Navbar';

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Navbar />
        <main className="main-content">
          {children}
        </main>
        <footer style={{ borderTop: '1px solid var(--border-color)', padding: '2rem 0', textAlign: 'center', marginTop: 'auto', background: 'rgba(241, 245, 249, 0.8)' }}>
          <div className="container">
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
              &copy; {new Date().getFullYear()} BioInsight 360. All rights reserved.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
