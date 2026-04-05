import * as fs from "fs";
import * as path from "path";

/**
 * Gets the base directory of the application.
 * It tries multiple strategies to find the root directory where 'scripts' or 'package.json' might exist.
 */
function getBaseDir(): string {
    const candidates: string[] = [];

    // 1. Try to get directory of current module (useful for plugins/bundled JS)
    try {
        // @ts-ignore - Bun-specific
        let currentFilePath = import.meta.path;
        
        // @ts-ignore - Standard ESM
        if (!currentFilePath && import.meta.url) {
            try {
                currentFilePath = new URL(import.meta.url).pathname;
            } catch (e) {}
        }

        if (currentFilePath) {
            candidates.push(path.dirname(currentFilePath));
            // Also try parent directory as we might be in 'src' or 'dist'
            candidates.push(path.dirname(path.dirname(currentFilePath)));
        }
        
        // @ts-ignore - Bun-specific
        if (import.meta.dir) {
            candidates.push(import.meta.dir);
            candidates.push(path.dirname(import.meta.dir));
        }
    } catch (e) {}


    // 2. Compiled executable path
    const execPath = process.execPath;
    const isBunRuntime = execPath.includes('/bun') || execPath.includes('\\bun');
    if (!isBunRuntime) {
        candidates.push(path.dirname(execPath));
    }

    // 3. Current working directory
    candidates.push(process.cwd());

    // 4. If there's a main entry point
    if (require.main && require.main.filename) {
        candidates.push(path.dirname(require.main.filename));
    }

    // Remove duplicates and invalid paths
    const uniqueCandidates = [...new Set(candidates.filter(c => c && fs.existsSync(c)))];

    // Priority 1: Look for a directory that contains the 'scripts' folder (where tikfinity-webview.ts lives)
    for (const cand of uniqueCandidates) {
        if (fs.existsSync(path.join(cand, 'scripts'))) {
            return cand;
        }
    }

    // Priority 2: Look for a directory that contains 'package.json'
    for (const cand of uniqueCandidates) {
        if (fs.existsSync(path.join(cand, 'package.json'))) {
            return cand;
        }
    }

    // Fallback to the first valid candidate or CWD
    return uniqueCandidates[0] || process.cwd();
}

/**
 * Searches for a file path in multiple potential base directories.
 * Returns the first path that exists, or null if not found.
 */
async function findInRoots(relativePaths: string | string[]): Promise<string | null> {
    const baseDir = getBaseDir();
    const pathsToCheck = Array.isArray(relativePaths) ? relativePaths : [relativePaths];
    
    // 1. Check relative to baseDir
    for (const relPath of pathsToCheck) {
        const fullPath = path.resolve(baseDir, relPath);
        if (await Bun.file(fullPath).exists()) {
            return fullPath;
        }
    }
    
    // 2. Check if any are already absolute paths
    for (const relPath of pathsToCheck) {
        if (path.isAbsolute(relPath) && await Bun.file(relPath).exists()) {
            return relPath;
        }
    }
    
    // 3. Try relative to CWD if different from baseDir
    const cwd = process.cwd();
    if (cwd !== baseDir) {
        for (const relPath of pathsToCheck) {
            const fullPath = path.resolve(cwd, relPath);
            if (await Bun.file(fullPath).exists()) {
                return fullPath;
            }
        }
    }

    return null;
}


function ensureDir(Path:string){
    if (!fs.existsSync(Path)) {
        fs.mkdirSync(Path, { recursive: true });
    }
    return fs.existsSync(Path);
}

export { ensureDir, getBaseDir, findInRoots }