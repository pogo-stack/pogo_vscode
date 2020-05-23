import { Logger, logger, LoggingDebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles, Breakpoint } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { basename } from 'path';
import { MockBreakpoint } from './PogoDebuggerRuntime';
import { PogoDebuggerRuntime } from "./PogoDebuggerRuntime";
const { Subject } = require('await-notify');
import { AttachRequestArguments } from './LaunchRequestArguments';
import * as hhh from 'request';
import { log } from 'util';
export class PogoDebugSession extends LoggingDebugSession {
	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static THREAD_ID = 1;
	// a Mock runtime (or debugger)
	private _runtime: PogoDebuggerRuntime;
	private _variableHandles = new Handles<string>();
	private _configurationDone = new Subject();
	private _threadStates = new Map<number, any>();
	private _pageNamesToPaths = new Map<string, string>();
    /**
     * Creates a new debug adapter that is used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
	public constructor() {
		super();
		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
		this._runtime = new PogoDebuggerRuntime();
		// setup event handlers
		// this._runtime.on('stopOnEntry', () => {
		// 	this.sendEvent(new StoppedEvent('entry', PogoDebugSession.THREAD_ID));
		// });
		this._runtime.on('stopOnStep', () => {
			this.sendEvent(new StoppedEvent('step', PogoDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnBreakpoint', (threadId) => {
			this.sendEvent(new StoppedEvent('breakpoint', threadId));
		});
		this._runtime.on('stopOnException', (threadId) => {
			this.sendEvent(new StoppedEvent('exception', threadId));
		});
		this._runtime.on('breakpointValidated', (bp: MockBreakpoint) => {
			this.sendEvent(new BreakpointEvent('changed', <DebugProtocol.Breakpoint>{ verified: bp.verified, id: bp.id }));
		});
		this._runtime.on('threadState', (threadId: number, threadState: any) => {
			this._threadStates.set(threadId, threadState)
		});
		this._runtime.on('output', (text, filePath, line, column) => {
			const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`);
			e.body.source = this.createSource(filePath);
			e.body.line = this.convertDebuggerLineToClient(line);
			e.body.column = this.convertDebuggerColumnToClient(column);
			//e.body.category = 'stdout'
			this.sendEvent(e);
		});
		this._runtime.on('end', () => {
			this.sendEvent(new TerminatedEvent());
		});
	}
    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
		// build and return the capabilities of this debug adapter:
		response.body = response.body || {};
		// the adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest = true;
		// make VS Code to use 'evaluate' when hovering over source
		response.body.supportsEvaluateForHovers = true;
		// make VS Code to show a 'step back' button
		response.body.supportsStepBack = false;
		this.sendResponse(response);
		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.
		this.sendEvent(new InitializedEvent());
	}
    /**
     * Called at the end of the configuration sequence.
     * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
     */
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		super.configurationDoneRequest(response, args);
		// notify the launchRequest that configuration has finished
		this._configurationDone.notify();
	}


	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments) {
		hhh.get(`http://localhost:${this._runtime.Port()}/command/clear_breakpoints`, {
			json: true
		},
		(err, res, body) => {
			if (err){
				//TODO: log
			}
			this._runtime.stopChecking();
			this.sendResponse(response);
		});
	}

	protected async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments) {
		// make sure to 'Stop' the buffered logging if 'trace' is not set
		logger.setup(Logger.LogLevel.Verbose, false);
		// wait until configuration has finished (and configurationDoneRequest has been called)
		//await this._configurationDone.wait(1000);
		// start the program in the runtime
		const port = args.pogodebugger.port ?? 4250;
		this._stopOnEntry = args.stopOnEntry;
		this._runtime.start(port); //!!
		this.sendResponse(response);
		this.sendEvent(new OutputEvent(`Attaching debugger`, 'stdout'));
		if (this._stopOnEntry) {
			hhh.get(`http://localhost:${this._runtime.Port()}/command/attach_request`, {
				json: {
					stopOnEntry: true
				}
			},
			(err, res, body) => {
				if (err){
					//TODO: log
				}
			});
		}
	}

	private _stopOnEntry = false;
	private _breakpointId = 1;
	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {


		this._pageNamesToPaths.set(<string>args.source.name, <string>args.source.path);
		const pageName = <string>args.source.name;
		let pogoPageName = pageName.replace('.pogo', '');
		const clientLines = args.breakpoints || [];


		const ffg = clientLines.map(l => {
			let bid = this._breakpointId++
			let breakpointToValidate = {line: this.convertClientLineToDebugger(l.line), id: bid + ''}
			return breakpointToValidate;
		});

		let validationRequestItem = [{
			page: pogoPageName,
			breakpoints: ffg,
			stopOnEntry: this._stopOnEntry
		}]
		this._stopOnEntry = false;
		//this.sendErrorResponse(response, 500, 'test error response')

		hhh.post(`http://localhost:${this._runtime.Port()}/command/set_breakpoints`, {
			body: validationRequestItem,
			json: true
		}, (err, res, body) => {
			if(err){
				this.sendEvent(new OutputEvent(`Error on debugger request "${JSON.stringify(validationRequestItem)}" to http://localhost:${this._runtime.Port()}/command/set_breakpoints" error ${JSON.stringify(err)}\n`, 'pogo_debug'));
				this.sendEvent(new TerminatedEvent());
				return;
			}
			let heh = res.toJSON().body;
			let actualBreakpoints = <DebugProtocol.Breakpoint[]>heh.map(verifiedPage => {
				if (verifiedPage.page !== pogoPageName) {
					return [];
				}
				let abps = <DebugProtocol.Breakpoint[]>verifiedPage.breakpoints.map(verifiedBreakpoint => {
					const breakpoint = <DebugProtocol.Breakpoint>new Breakpoint(true, verifiedBreakpoint.line)
					return breakpoint;
				})
				return abps;
			});

			let flatArray = flatten(actualBreakpoints)

			response.body = {
				breakpoints: flatArray
			};
			this.sendResponse(response);
		});

		function flatten(arr) {
			return arr.reduce(function (flat, toFlatten) {
			  return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
			}, []);
		  }

	}
	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		// runtime supports now threads so just return a default thread.

		let threads: Array<Thread> = [];
		this._threadStates.forEach((value: any, key: number) => {
			threads.push(new Thread(key, key + ''))
		});

		response.body = {
			threads: threads
		};
		this.sendResponse(response);
	}


	private _currentThreadId = 0
	private _currentStackFrameId = 0;

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		this._currentThreadId = args.threadId;
		let threadCallStack = this._threadStates.get(this._currentThreadId).call_stack
		threadCallStack = threadCallStack ? threadCallStack : [];

		//const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
		//const maxLevels = typeof args.levels === 'number' ? args.levels : 1000;
		//const endFrame = startFrame + maxLevels;
		//const stk = this._runtime.stack(startFrame, endFrame);
		response.body = {
			stackFrames: threadCallStack.map((f,i)=>{
				let fullfileName = <string>f.file_name;
				let src = this.createSource(fullfileName);
				//let line = this.convertDebuggerLineToClient(f.line);
				return new StackFrame(i, f.name, src, f.line);
			}),
			totalFrames: threadCallStack.length
		};
		this.sendResponse(response);
	}
	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		const frameReference = args.frameId;
		const scopes = new Array<Scope>();
		scopes.push(new Scope("Local", this._variableHandles.create(""+frameReference), false));
		//scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));
		response.body = {
			scopes: scopes
		};
		this.sendResponse(response);
	}
	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
		const id = this._variableHandles.get(args.variablesReference);
		this._currentStackFrameId = Number(id)
		let stack = this._threadStates.get(this._currentThreadId).call_stack
		let variables = new Array<DebugProtocol.Variable>();

		let stackFrame = stack[this._currentStackFrameId];
		let objectProps = Object.getOwnPropertyNames(stackFrame.state);
		log(objectProps + "")

		variables = variables.concat(objectProps.map((k)=>{
			return <DebugProtocol.Variable>{
				name: k,
				type: 'object',
				value: JSON.stringify(stackFrame.state[k], null, '  '),
				variablesReference: 0
			}
		}));

		response.body = {
			variables: variables
		};
		this.sendResponse(response);
	}
	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this._runtime.continue();
		this.sendResponse(response);
	}
	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments): void {
		this._runtime.continue(true);
		this.sendResponse(response);
	}
	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this._runtime.step(this._currentThreadId);
		this.sendResponse(response);
	}
	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		this._runtime.step(this._currentThreadId);
		this.sendResponse(response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		this._runtime.step(this._currentThreadId);
		this.sendResponse(response);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {

		let stack = this._threadStates.get(this._currentThreadId).call_stack

		let stackFrame = stack[this._currentStackFrameId];

		let result = JSON.stringify(stackFrame.state[args.expression], null, '  ');

		response.body = {
			result: `'${args.expression}': ${result})`,
			variablesReference: 0
		};
		this.sendResponse(response);
	}
	//---- helpers
	private createSource(filePath: string): Source {
		let name = basename(filePath);
		let clientThing = this.convertDebuggerPathToClient(filePath);
		return new Source(name, clientThing, undefined, undefined, 'mock-adapter-data');
	}
}
