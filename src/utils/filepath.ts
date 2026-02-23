import * as fs from "fs";
import * as path from "path";

/**
 * Gets the base directory of the application.
 * - In development: returns process.cwd()
 * - In compiled executable: returns the directory where the executable is located
 */
function getBaseDir(): string {
    // process.execPath contains the path of the Bun executable
    // In an executable compiled with `bun build --compile`, it points to the executable itself
    const execPath = process.execPath;
    
    // Detect if we are in a compiled executable
    // In development, execPath points to bun (/usr/bin/bun or similar)
    // In compiled, it points to the project executable
    const isBunRuntime = execPath.includes('/bun') || execPath.includes('\\bun');
    
    if (!isBunRuntime) {
        // We are in a compiled executable
        // Return the directory where the executable is located
        return path.dirname(execPath);
    }
    
    // In development, use process.cwd()
    return process.cwd();
}

function ensureDir(Path:string){
    if (!fs.existsSync(Path)) {
        fs.mkdirSync(Path, { recursive: true });
    }
    return fs.existsSync(Path);
}

export { ensureDir, getBaseDir }