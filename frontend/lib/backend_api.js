// frontend/lib/backend_api.js
// Client library to manage connection to Python FastAPI / R Bioconductor Backend

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export const getBackendUrl = () => {
    return DEFAULT_BACKEND_URL.replace(/\/+$/, '');
};

export const checkBackendHealth = async () => {
    const baseUrl = getBackendUrl();
    try {
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET'
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
 * Submits an asynchronous analysis job to the backend via multipart/form-data.
 * Returns { job_id, state, message }
 */
export const submitAnalysisJob = async (countsFile, metadataFile, params) => {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}/api/analysis`;
    
    const formData = new FormData();
    formData.append('counts_file', countsFile);
    formData.append('metadata_file', metadataFile);
    if (params) {
        formData.append('params', JSON.stringify(params));
    }
    
    const response = await fetch(url, {
        method: 'POST',
        body: formData
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
        method: 'GET'
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
        method: 'GET'
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to fetch results for job ${jobId}`);
    }
    
    return await response.json();
};
