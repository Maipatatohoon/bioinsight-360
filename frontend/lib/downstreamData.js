import { Storage } from './storage';
import { formatDownstreamPipelines } from './consensus';
import { getJobResults } from './backend_api';

/**
 * Loads the three downstream pipelines (DESeq2, edgeR, limma) and normalises
 * them into the shape the consensus/pathways/export pages expect.
 *
 * Source is either:
 *  - 'job'    -> results of the backend analysis job stored under currentJobId
 *  - 'upload' -> CSV tables the user uploaded on the upload page
 *
 * Keeping this in one place means every downstream page reads the same data
 * instead of each one re-implementing (and getting wrong) the lookup.
 */
export async function loadDownstreamPipelines() {
    const source = Storage.getItem('downstreamSource')
        || (Storage.getItem('currentJobId') ? 'job' : 'upload');

    if (source === 'job') {
        const jobId = Storage.getItem('currentJobId');
        if (jobId) {
            const jobData = await getJobResults(jobId);
            const results = jobData.results || {};
            return formatDownstreamPipelines(
                results.deseq2 || [],
                results.edger || [],
                results.limma || []
            );
        }
    }

    const parse = (key) => {
        try {
            return JSON.parse(Storage.getItem(key) || '[]');
        } catch (e) {
            console.error(`Failed to parse ${key}`, e);
            return [];
        }
    };

    const deseq2 = parse('deseq2Data');
    const edger = parse('edgerData');
    const limma = parse('limmaData');

    if (!deseq2.length && !edger.length && !limma.length) {
        throw new Error('No downstream results found. Run an analysis or upload result files first.');
    }

    return formatDownstreamPipelines(deseq2, edger, limma);
}
