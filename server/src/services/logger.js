const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
const logFile = path.join(logDir, 'error.log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

function sanitizeAxiosError(error) {
    // Never log Authorization headers or tokens (they leaked into railway logs before)
    if (error && error.config) {
        const cfg = { ...error.config };
        if (cfg.headers) {
            const h = { ...cfg.headers };
            for (const k of Object.keys(h)) {
                if (/auth|token|secret|key/i.test(k)) h[k] = '[REDACTED]';
            }
            cfg.headers = h;
        }
        // Keep only safe bits: URL, method, status — drop full raw dumps
        return {
            message: error.message,
            url: cfg.url,
            method: cfg.method,
            status: error.response?.status,
            responseData: error.response?.data,
        };
    }
    return error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
}

function logError(error, context = '') {
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    
    const logEntry = `[${timestamp}] CONTEXT: ${context}\nERROR: ${errorMessage}\nSTACK: ${errorStack}\n----------------------------------------\n`;
    
    fs.appendFile(logFile, logEntry, (err) => {
        if (err) {
            console.error('Failed to write to log file:', err);
        }
    });
    
    // Also print to stdout/stderr for dev convenience (sanitized — no tokens)
    console.error(`[${context}]`, sanitizeAxiosError(error));
}

module.exports = {
    logError
};
