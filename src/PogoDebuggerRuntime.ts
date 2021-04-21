import { readFileSync } from 'fs';
import { EventEmitter } from 'events';
import * as hhh from 'request';
import * as www from 'timers'

export interface MockBreakpoint {
	id: number;
	line: number;
	verified: boolean;
}

/**
 * A Mock runtime with minimal debugger functionality.
 */
export class PogoDebuggerRuntime extends EventEmitter {
	// the initial (and one and only) file we are 'debugging'
	private _sourceFile: string;
	public get sourceFile() {
		return this._sourceFile;
	}
	// the contents (= lines) of the one and only file
	private _sourceLines: string[];
	// This is the next line that will be 'executed'
	private _currentLine = 0;
	private _port = 4250;
	private _isRemoteWSL: boolean;
	public get isRemoteWSL(): boolean {
		return this._isRemoteWSL;
	}
	public get currentLine() {
		return this._currentLine;
	}
	// maps from sourceFile to array of Mock breakpoints
	private _breakPoints = new Map<string, MockBreakpoint[]>();
	// since we want to send breakpoint events, we will assign an id to every event
	// so that the frontend can match events with breakpoints.
	//private _breakpointId = 1;
	constructor() {
		super();
	}

	public _handledRequests =  new Map<string, boolean>()

	public _statusChecker: NodeJS.Timer;

	public stopChecking(){
		www.clearInterval(this._statusChecker);
	}

	public Port() {
		return this._port;
	}

    /**
     * Start executing the given program.
     */
	public start(port, isRemoteWSL) {
		//this.loadSource(program);
		this._port = port;
		this._isRemoteWSL = isRemoteWSL;
		this._currentLine = -1;
		this.verifyBreakpoints(this._sourceFile);

		this._statusChecker = www.setInterval(function(that, breakpoints){
			hhh.get(`http://localhost:${that._port}/status`, {
				json: true
			},
			(err, res, body) => {
				if (err){
					that._statusChecker = undefined;
					that.sendEvent('output', `Error on checking debugger status: at "http://localhost:${that._port}/status" error ${JSON.stringify(err)}\n`, 'pogo_debug');
					that.sendEvent('end');
				}
				for(let requestId in body.active) {
					let activeBreakpoint = body.active[requestId];

					let hhh = that._handledRequests.get(requestId)
					if (hhh !== undefined) {
						continue;
					}

					that._handledRequests.set(requestId, true);

					that.sendEvent('threadState', <number>activeBreakpoint.thread_id_int, activeBreakpoint)
					that.sendEvent('stopOnBreakpoint', <number>activeBreakpoint.thread_id_int)
					//that.sendEvent('output', 'breakpoint....' + requestId, 'qqq', 111);
			}

			});
		}, 500, this, this._breakPoints)
	}

    /**
     * Continue execution to the end/beginning.
     */
	public continue(reverse = false) {
		hhh.get(`http://localhost:${this._port}/command/continue_all`, {}, (err, res, body) => {
			if(err){
				this.sendEvent('output', `Error sending continue request at "http://localhost:${this._port}/command/continue_all" error ${JSON.stringify(err)}\n`, 'pogo_debug');
				return;
			}
		});

	}
    /**
     * Step to the next/previous non empty line.
     */
	public step(threadId) {
		hhh.get(`http://localhost:${this._port}/command/step?thread_id=` + threadId, {}, (err, res, body) => {
			if(err){
				this.sendEvent('output', `Error sending continue request at "http://localhost:${this._port}/command/step?thread_id=${threadId}" error ${JSON.stringify(err)}\n`, 'pogo_debug');
				return;
			}
		});
	}


	// private methods
	private loadSource(file: string) {
		if (this._sourceFile !== file) {
			this._sourceFile = file;
			this._sourceLines = readFileSync(this._sourceFile).toString().split('\n');
		}
	}

	private verifyBreakpoints(path: string): void {
		let bps = this._breakPoints.get(path);
		if (bps) {
			this.loadSource(path);
			bps.forEach(bp => {
				if (!bp.verified && bp.line < this._sourceLines.length) {
					const srcLine = this._sourceLines[bp.line].trim();
					// if a line is empty or starts with '+' we don't allow to set a breakpoint but move the breakpoint down
					if (srcLine.length === 0 || srcLine.indexOf('+') === 0) {
						bp.line++;
					}
					// if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
					if (srcLine.indexOf('-') === 0) {
						bp.line--;
					}
					// don't set 'verified' to true if the line contains the word 'lazy'
					// in this case the breakpoint will be verified 'lazy' after hitting it once.
					if (srcLine.indexOf('lazy') < 0) {
						bp.verified = true;
						this.sendEvent('breakpointValidated', bp);
					}
				}
			});
		}
	}

	private sendEvent(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}
