import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export class InfoPlistManager {
    private readonly _infoPlistPath : string;
    private readonly _content : string;
    constructor(inPath : string) {
        this._infoPlistPath = inPath;
        this._content = "";
        if (fs.existsSync(this._infoPlistPath)) {
            this._content = fs.readFileSync(this._infoPlistPath).toString();
        }
    }

    private static _getInfoplistPath(inExePath : string) {
        const serverPath = inExePath;
        const type = os.type();
        const dirname = path.basename(serverPath);
        if (type === "Darwin" && dirname.endsWith(".app")) {
            return path.join(serverPath, "Contents", "Info.plist");
        }
        else if (type === "Windows_NT" || type === "Linux") {
            return path.join(serverPath, "..", "Resources", "Info.plist");
        }
        return serverPath;
    }

    public getExeName() : string {
        let nameExecutable = "";
        const match = this._content.match(/CFBundleExecutable<\/key>\s*<string>(.*)<\/string>/mi);
        if (match !== null && match.length > 1) {
            nameExecutable = match[1];
        }
        return nameExecutable;
    }

    static fromExePath( inPath : string) : InfoPlistManager {
        return new InfoPlistManager(InfoPlistManager._getInfoplistPath(inPath));
    }
    
}