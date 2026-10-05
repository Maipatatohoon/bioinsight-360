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
                'ngrok-skip-browser-warning': 'true'
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

/**
 * Submits an asynchronous analysis job to the backend.
 * Returns { job_id, state, message }
 */
export const submitAnalysisJob = async (counts, metadata, params) => {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}/api/analysis`;
    
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
        throw new Error(errorData.detail || "Failed to submit analysis job.");
    }
    
    return await response.json();
};

/**
 * Polls the status of an analysis job.
 * Returns { job_id, state, progress, message, warnings, error }
 */
export const getJobStatus = async (jobId) => {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}/api/analysis/${jobId}`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'ngrok-skip-browser-warning': 'true'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch status for job ${jobId}`);
    }
    
    return await response.json();
};

/**
 * Retrieves completed job results.
 */
export const getJobResults = async (jobId) => {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}/api/analysis/${jobId}/results`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'ngrok-skip-browser-warning': 'true'
        }
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to fetch results for job ${jobId}`);
    }
    
    return await response.json();
};
