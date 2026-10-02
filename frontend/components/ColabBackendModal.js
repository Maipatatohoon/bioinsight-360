'use client';
import { useState, useEffect } from 'react';
import { getBackendUrl, setBackendUrl, checkBackendHealth } from '../lib/backend_api';

export default function ColabBackendModal({ isOpen, onClose }) {
    const [urlInput, setUrlInput] = useState('');
    const [status, setStatus] = useState({ state: 'idle', message: '' });

    useEffect(() => {
        if (isOpen) {
            const currentUrl = getBackendUrl();
            setUrlInput(currentUrl);
            handleTestConnection(currentUrl);
        }
    }, [isOpen]);

    const handleTestConnection = async (testUrl) => {
        setStatus({ state: 'checking', message: 'Testing connection to backend...' });
        if (testUrl) setBackendUrl(testUrl);
        const result = await checkBackendHealth();
        if (result.status === 'connected') {
            setStatus({ state: 'connected', message: `Connected successfully to Python/R server!` });
        } else {
            setStatus({ state: 'error', message: `Failed to connect: ${result.message}` });
        }
    };

    const handleSave = () => {
        setBackendUrl(urlInput);
        handleTestConnection(urlInput);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                maxWidth: '520px',
                width: '100%',
                padding: '1.75rem',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid #e2e8f0'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        ⚡ Colab / Cloud Backend Settings
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}>
                        ✕
                    </button>
                </div>

                <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                    Connect your web app to your <strong>Google Colab backend</strong> (via ngrok) to execute authentic DESeq2, edgeR, and limma-voom analyses on 12GB+ RAM compute nodes.
                </p>

                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
                        Backend Ngrok URL:
                    </label>
                    <input
                        type="text"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://xxxx-xx-xxx.ngrok-free.app"
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.9rem',
                            fontFamily: 'monospace',
                            outline: 'none'
                        }}
                    />
                </div>

                {/* Status Indicator */}
                <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    marginBottom: '1.25rem',
                    background: status.state === 'connected' ? '#ecfdf5' : status.state === 'error' ? '#fef2f2' : '#f8fafc',
                    color: status.state === 'connected' ? '#047857' : status.state === 'error' ? '#b91c1c' : '#475569',
                    border: `1px solid ${status.state === 'connected' ? '#a7f3d0' : status.state === 'error' ? '#fecaca' : '#e2e8f0'}`
                }}>
                    {status.state === 'checking' && '🔄 Testing connection...'}
                    {status.state === 'connected' && `✅ ${status.message}`}
                    {status.state === 'error' && `❌ ${status.message}`}
                    {status.state === 'idle' && 'Paste your URL and click Save to test.'}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                        onClick={() => handleTestConnection(urlInput)}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            background: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}>
                        Test Connection
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            padding: '0.5rem 1.25rem',
                            borderRadius: '8px',
                            background: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}>
                        Save & Connect
                    </button>
                </div>
            </div>
        </div>
    );
}
