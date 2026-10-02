// frontend/lib/backend_api.js
// Client library to manage connection to Python FastAPI / R Bioconductor Backend (e.g. running on Colab via ngrok)

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const STORAGE_KEY = 'bioinsight_colab_backend_url';

export const getBackendUrl = () => {
    if (typeof window !== 'undefined') {
        const savedUrl = localStorage.getItem(STORAGE_KEY);
        if (savedUrl && savedUrl.trim() !== '') {
            return savedUrl.trim().replace(/\/+$/, '');
        }
    }
    return DEFAULT_BACKEND_URL.replace(/\/+$/, '');
};

export const setBackendUrl = (url) => {
    if (typeof window !== 'undefined') {
        if (!url || url.trim() === '') {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            // Clean URL string
            let cleanUrl = url.trim().replace(/\/+$/, '');
            if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
                cleanUrl = 'https://' + cleanUrl;
            }
            localStorage.setItem(STORAGE_KEY, cleanUrl);
        }
    }
};

export const checkBackendHealth = async () => {
    const baseUrl = getBackendUrl();
    try {
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true' // Bypass ngrok warning page
            }
        });
        if (response.ok) {
            const data = await response.json();
            return { status: 'connected', data, url: baseUrl };
        }
        return { status: 'error', message: `HTTP ${response.status}`, url: baseUrl };
    } catch (err) {
        return { status: 'error', message: err.message, url: baseUrl };
    }
};

export const runBackendAnalysis = async (endpoint, counts, metadata, params) => {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}/api/analyze/${endpoint}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ counts, metadata, params })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Analysis failed on ${endpoint}`);
    }
    
    return await response.json();
};
