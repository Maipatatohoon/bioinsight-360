// frontend/lib/backend_api.js
// Client library to manage connection to Python FastAPI / R Bioconductor Backend
import { resolveBackendUrl, readStoredBackendUrl, writeStoredBackendUrl } from './backendUrl.mjs';

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

/**
 * The effective backend URL: a per-browser override (set from the UI) wins over
 * the build-time NEXT_PUBLIC_BACKEND_URL. This lets a deployed build point at a
 * Colab tunnel URL at runtime without a Vercel rebuild.
 */
export const getBackendUrl = () => {
    return resolveBackendUrl(readStoredBackendUrl(), DEFAULT_BACKEND_URL);
};

/** Save (or clear, with an empty string) a runtime backend URL override. */
export const setBackendUrl = (url) => {
    writeStoredBackendUrl(url);
};

export const clearBackendUrl = () => {
    writeStoredBackendUrl('');
};

/** The build-time default, for display in the settings UI. */
export const getDefaultBackendUrl = () => resolveBackendUrl(null, DEFAULT_BACKEND_URL);

export const checkBackendHealth = async (urlOverride) => {
    const baseUrl = resolveBackendUrl(urlOverride ?? readStoredBackendUrl(), DEFAULT_BACKEND_URL);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
    try {
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            signal: controller ? controller.signal : undefined,
        });
        if (response.ok) {
            const data = await response.json();
            return { status: 'connected', data, url: baseUrl };
        }
        return { status: 'error', message: `HTTP ${response.status}`, httpStatus: response.status, url: baseUrl };
    } catch (err) {
        const aborted = err && err.name === 'AbortError';
        return {
            status: 'error',
            message: aborted ? 'Timed out after 12s' : err.message,
            url: baseUrl,
        };
    } finally {
        if (timer) clearTimeout(timer);
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
 * Retrieves saved job results. This succeeds with a partial payload while one
 * method is still running, so completed methods can be rendered immediately.
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

/** Retrieves one engine's table without waiting for the other engine. */
export const getMethodResults = async (jobId, engine) => {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/api/analysis/${jobId}/method/${engine}`, { method: 'GET' });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to fetch ${engine} results`);
    }
    return await response.json();
};

/** Runs the optional comparison from the job's saved DESeq2/edgeR tables. */
export const compareMethods = async (jobId, { padjThreshold = 0.05, log2fcThreshold = 1.0 } = {}) => {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/api/analysis/${jobId}/comparison`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            padj_threshold: padjThreshold,
            log2fc_threshold: log2fcThreshold,
        }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || 'Comparison failed');
    }
    return await response.json();
};

/** Returns a previously saved comparison, or null when none exists. */
export const getSavedComparison = async (jobId) => {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/api/analysis/${jobId}/comparison`, { method: 'GET' });
    if (response.status === 404) return null;
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || 'Could not load the saved comparison');
    }
    return await response.json();
};
