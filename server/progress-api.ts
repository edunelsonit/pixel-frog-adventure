import type { Connect } from 'vite';
import { getProgress, saveProgress, type ProgressRecord } from './progress-db';

export function progressApi(): Connect.NextHandleFunction {
    return (request, response, next) => {
        if (request.url !== '/api/progress') {
            next();
            return;
        }

        response.setHeader('Content-Type', 'application/json');

        if (request.method === 'GET') {
            response.end(JSON.stringify(getProgress()));
            return;
        }

        if (request.method !== 'POST') {
            response.statusCode = 405;
            response.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }

        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => { body += chunk; });
        request.on('end', () => {
            try {
                const progress = JSON.parse(body) as ProgressRecord;
                response.end(JSON.stringify(saveProgress(progress)));
            } catch {
                response.statusCode = 400;
                response.end(JSON.stringify({ error: 'Invalid progress payload' }));
            }
        });
    };
}