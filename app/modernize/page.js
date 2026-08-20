'use client';

import { useState } from 'react';
import { modernizePerl } from '../../lib/modernizer';

export default function ModernizePage() {
  const [perlCode, setPerlCode] = useState('# Paste your legacy Perl script here\n\nuse strict;\nuse warnings;\n\nmy $file = "data.csv";\nopen(my $fh, "<", $file) or die "Cannot open $file";\n\nwhile (my $line = <$fh>) {\n  chomp($line);\n  my @parts = split(/,/, $line);\n  print "Processed: " . $parts[0] . "\\n";\n}\n');
  const [targetLanguage, setTargetLanguage] = useState('python');
  const [outputCode, setOutputCode] = useState('');

  const handleConvert = () => {
    const result = modernizePerl(perlCode, targetLanguage);
    setOutputCode(result);
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontSize: '2rem', fontWeight: 700 }}>
          Legacy Script Modernizer
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '800px' }}>
          Instantly convert old bioinformatics Perl scripts into modern Python, R, or Java equivalents using heuristic syntax translation.
        </p>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '2rem',
        alignItems: 'center',
        marginBottom: '1.5rem',
        background: 'var(--bg-card)',
        padding: '1rem 1.5rem',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Target Language:</label>
          <select 
            value={targetLanguage} 
            onChange={(e) => setTargetLanguage(e.target.value)}
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '6px', 
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            <option value="python">Python 3</option>
            <option value="r">R Language</option>
            <option value="java">Java 17+</option>
          </select>
        </div>
        
        <button 
          onClick={handleConvert}
          style={{ 
            background: 'var(--accent-primary)',
            color: 'white',
            border: 'none',
            padding: '0.6rem 1.5rem',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)'
          }}
        >
          Modernize Code ⚡
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Left Pane: Perl Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            background: 'var(--bg-secondary)', 
            padding: '0.75rem 1rem',
            borderRadius: '8px 8px 0 0',
            border: '1px solid var(--border-color)',
            borderBottom: 'none'
          }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Legacy Perl</span>
          </div>
          <textarea
            value={perlCode}
            onChange={(e) => setPerlCode(e.target.value)}
            spellCheck="false"
            style={{ 
              width: '100%', 
              height: '500px', 
              padding: '1rem', 
              fontFamily: 'monospace',
              fontSize: '14px',
              border: '1px solid var(--border-color)',
              borderRadius: '0 0 8px 8px',
              background: '#ffffff',
              color: 'var(--text-primary)',
              resize: 'vertical',
              outline: 'none'
            }}
          />
        </div>

        {/* Right Pane: Output */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            background: 'var(--bg-secondary)', 
            padding: '0.75rem 1rem',
            borderRadius: '8px 8px 0 0',
            border: '1px solid var(--border-color)',
            borderBottom: 'none'
          }}>
            <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
              Modern {targetLanguage === 'python' ? 'Python' : targetLanguage === 'r' ? 'R' : 'Java'}
            </span>
          </div>
          <textarea
            value={outputCode}
            readOnly
            spellCheck="false"
            placeholder="Click 'Modernize Code' to see the result..."
            style={{ 
              width: '100%', 
              height: '500px', 
              padding: '1rem', 
              fontFamily: 'monospace',
              fontSize: '14px',
              border: '1px solid var(--border-color)',
              borderRadius: '0 0 8px 8px',
              background: '#f8fafc',
              color: 'var(--text-primary)',
              resize: 'vertical',
              outline: 'none'
            }}
          />
        </div>
      </div>
    </div>
  );
}
