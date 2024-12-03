import {
    LoggingDebugSession,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';



export class MockDebugSession extends LoggingDebugSession {

    private _message: string = "DAP Error";

    public constructor(inMessage: string) {
        super("");
        this._message = inMessage;

    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

        this.sendErrorResponse(response, {
            id: 1,
            format: this._message,
            showUser: true
        });
    }
}