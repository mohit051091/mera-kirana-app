const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
const logFile = path.join(logDir, 'error.log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
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
    
    // Also print to stdout/stderr for dev convenience
    console.error(`[${context}]`, error);
}

module.exports = {
    logError
};
