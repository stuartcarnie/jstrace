FBL.ns(function() { with (FBL) {
	
	Components.utils.import("resource://firebug/firebug-trace-service.js");
	var FBTrace = traceConsoleService.getTracer("extensions.firebug");
	
	var traceButton = $('fbjstToggleTracing');
	var searchBox = $('jstFilterBox');
	
	var panelName = "jstracePanel";
	
	var traceHandlers = {
		hooks: [],
		
		callCount: 0,
		
		// Stage for activation when 'hook' is called
		add: function(aHook) {
			if (!aHook)
				ERROR("firebug-service.jsdHandlers.add: null hook");

			this.hooks.push(aHook);
		},

		remove: function(aHook) {
			var i = this.hooks.indexOf(aHook);
			if (i != -1)
				this.hooks.splice(i, 1);
			else
				ERROR("firebug-service.Hooks.unhook ERROR, no such hook "+aHook.name, {aHook: aHook, Hooks: this});
		},
		
		onFunctionCall: function(context, frame, hookFrameCount, calling) {
			traceHandlers.dispatch(frame, calling);
		},
		
		dispatch: function(frame, calling) {
			for (var i = 0; i < this.hooks.length; i++) {
				var aHook = this.hooks[i];
				aHook.onFunctionCall.apply(aHook, [frame, calling]);
			}
		},
		
		hook: function(frame) {
			
		}
	}
	
	function framesToString(frame)
	{
	    var str = "";
	    while (frame)
	    {
	        str += frameToString(frame)+"\n";
	        frame = frame.callingFrame;
	    }
	    return str;
	}
	
	function frameToString(frame)
	{
	    if (!frame)
	        return "< no frame >";

	    if (!frame.script)
	    {
	        ERROR("frameToString bad frame "+typeof(frame), frame);
	        return "<bad frame>";
	    }

	    return frame.script.tag+" in "+frame.script.fileName+"@"+frame.line+"(pc="+frame.pc+")";
	}
	
	function framesToHash(frame) {
		var hash = 7919;	// random prime number
		while (frame) {
			if (!frame.script) {
		        ERROR("frameToString bad frame "+typeof(frame), frame);
		        return "<bad frame>";
		    }
		
			hash ^= frame.script.tag;
			hash ^= frame.line;
			
			frame=frame.callingFrame;
		}
		return hash;
	}
	
	function ProfileCall(aFrame) {
		this.frame = aFrame;
		this.functionName = aFrame.functionName;
		//this.frameAsString = framesToString(aFrame);
		this.script = aFrame.script;
		this.callCount = 0;
	}
	
	function ProfileFunction(aFrame) {
		this.functionName = aFrame.functionName;
		this.fileName = aFrame.script.fileName;
		this.lineNumber = aFrame.script.baseLineNumber;
		this.script = aFrame.script;
		this.callCount = 0;
		this.calls = {};
	}
	
	function ProfileContext(executionContext) {
		this.executionContext = executionContext;
		this.functionCalls = {};
	}
	
	function TraceListener(context) {
		this.context = context;
		this.callCount = 0;
		this.profileData = {};
	}
	
	TraceListener.prototype = {
		onFunctionCall: function(frame, aCalling) {
			try {
				if (!aCalling) {
					return;
				}
				
				this.callCount++;
				var execContextHash = frame.executionContext.tag;
				var profContext = this.profileData[execContextHash];
				if (!profContext) {
					if (FBTrace.DBG_JSTRACE)
					    FBTrace.sysout("jstrace.TraceListener.onFunctionCall (new call context); " + execContextHash);

					profContext = new ProfileContext(frame.executionContext);
					this.profileData[execContextHash] = profContext;
				}

				var scriptHash = frame.script.tag;
				var profFunction = profContext.functionCalls[scriptHash];
				if (!profFunction) {
					profFunction = new ProfileFunction(frame);
					profContext.functionCalls[scriptHash] = profFunction;
				}
				profFunction.callCount++;
				
				var frameHash = framesToHash(frame);
				var profCall = profFunction.calls[frameHash];
				if (!profCall) {
					profCall = new ProfileCall(getCorrectedStackTrace(frame, this.context));
					profFunction.calls[frameHash] = profCall;
				}
				
				profCall.callCount++;
				
			} catch (err) {
				if (FBTrace.DBG_JSTRACE && this.callCount++ < 100)
				    FBTrace.sysout("error jstrace.TraceListener.onFunctionCall", err);
			}
			
		},
		
		hook: function(frame) {
			
		},
	};
	
	Firebug.jstraceModule = extend(Firebug.ActivableModule, {
		
		dispatchName: "jstrace",
		
		initContext: function(context, persistedState) {
			Firebug.ActivableModule.initContext.apply(this, arguments);

			if (FBTrace.DBG_JSTRACE)
				FBTrace.sysout("jstrace.jstraceModule.initContext for: " + context.getName());
		},
		
		onObserverChange: function(observer) {
			if (this.hasObservers()) {
				if (FBTrace.DBG_JSTRACE)
				    FBTrace.sysout("jstrace.jstraceModule.onObserverChange; activate");
			} else {
			}
		},
		
		onToggleTrace: function(context) {
			if (FBTrace.DBG_JSTRACE)
				FBTrace.sysout("jstrace.jstraceModule.onToggleTrace; " + context.getName(), context);
				
			if (traceButton.checked) {
				traceHandlers.callCount = 0;
				this.traceListener = new TraceListener(context);
				traceHandlers.add(this.traceListener);
				
				try {
					fbs.traceAll(null, traceHandlers);
				} catch (err) {
					if (FBTrace.DBG_JSTRACE)
					    FBTrace.sysout("jstrace.jstraceModule.onToggleTrace; error for fbs.traceAll", err);
				}
			} else {
				if (FBTrace.DBG_JSTRACE)
				    FBTrace.sysout("jstrace.jstraceModule.onToggleTrace; off", this.traceListener);
				fbs.untraceAll(traceHandlers);
				this.logTraceReport(context, this.traceListener);
				traceHandlers.remove(this.traceListener);
			}
		},
		
		onSearchKeyUp: function(context, event) {
			// FBTrace.sysout("jstrace.jstraceModule.onSearchKeyUp", this);
			this.logTraceReport(context, this.traceListener);
		},
		
		matchFunctionInfo: function(fi) {
			var searchText = searchBox.value;
			if (searchText == undefined || searchText == '')
				return true;
			
			var calls = fi.calls;
			for(var key in calls) {
				var val = calls[key];
				var frames = val.frame.frames;
				for(var i = 0; i <frames.length; i++) {
					if (frames[i].href.indexOf(searchText) >= 0) {
						return true;
					}
				}
			}
			return false;
		},
		
		logTraceReport: function logTraceReport(context, traceListener) {
			try {
				var panel = context.getPanel(panelName);
				var parentNode = panel.panelNode;
				var rootTemplateElement = Firebug.jstraceModule.TraceTable.tableTag.replace(
					{}, parentNode, Firebug.jstraceModule.TraceTable);
				
				var targetNode = rootTemplateElement.ownerDocument.getElementById("jstraceMessageTable").firstChild;
				
				for(var key in traceListener.profileData) {
					var profContext = traceListener.profileData[key];
					for(var callKey in profContext.functionCalls) {
						var functionInfo = profContext.functionCalls[callKey];
						if (!this.matchFunctionInfo(functionInfo)) {
							continue;
						}
						var message = new Firebug.jstraceModule.FunctionCallLog(context, functionInfo);
						Firebug.jstraceModule.TraceTable.dump(message, targetNode);
					}
				}
			} catch (err) {
				if (FBTrace.DBG_JSTRACE)
				    FBTrace.sysout("error jstrace.jstraceModule.logTraceReport; ", err);
			}
			
			if (FBTrace.DBG_JSTRACE) {
				FBTrace.sysout("jstrace.jstraceModule.logTraceReport:table", targetNode);
			}
		},
		
		
	});
	
	Firebug.registerActivableModule(Firebug.jstraceModule)
	
	// model
	
	// panel
	
	function jstracePanel() {};
	
	jstracePanel.prototype = extend(Firebug.ActivablePanel, {
		name: panelName,
		title: "jstrace",

		initialize: function(context, doc) {
			if (FBTrace.DBG_JSTRACE)
			    FBTrace.sysout("jstrace.jstracePanel.initialize; " + context.getName(), doc);
			
			Firebug.ActivablePanel.initialize.apply(this, arguments);
			
			addStyleSheet(doc, createStyleSheet(doc, "chrome://firebug/skin/panelbase.css"));
			addStyleSheet(doc, createStyleSheet(doc, "chrome://firebug/skin/traceConsole.css"));
		},
		
		show: function(state) {
			if (FBTrace.DBG_JSTRACE)
				FBTrace.sysout("jstrace.jstracePanel.show; " + this.context.getName(), state);
				
			this.showToolbarButtons("fbJsTraceButtons", true);
			
		},
		
		onActivationChanged: function(enable) {
			if (FBTrace.DBG_JSTRACE)
			    FBTrace.sysout(enable ? "enabling panel" : "disabling panel", this);
			
			if (enable)
					Firebug.jstraceModule.addObserver(this);
				else
					Firebug.jstraceModule.removeObserver(this);
		},
		
		getOptionsMenuItems: function(context)	  {
			return [{
				label: "My Menu Item",
				nol10n: true,
				type: "checkbox",
				command: function() { alert("Hello from the Options menu!"); }
			}];
		},
		
		getTargetNode: function() {
			return this.panelNode.ownerDocument.getElementById("jstraceMessageTable");
		},
		
	});
	
	Firebug.registerPanel(jstracePanel);

	Firebug.jstraceModule.TraceTable = domplate({
		tableTag:
			DIV({"class": "profileSizer", "tabindex": "-1" },
				TABLE({"class": "messageTable", id: "jstraceMessageTable", cellspacing: 0, cellpadding: 0, width: "100%"},
					TBODY()
				)
			),
		
		contextTag:
			TR({"class":"messageRow",
				_repObject: "$message",
				onclick: "$onClickContextRow"},
				TD({"class": "messageNameCol messageCol"},
					DIV({"class":"messageNameLabel messageLabel"},
						"$message|getContextMessageIndex"
					)
				),
				TD({"class": "messageBodyCol messageCol"},
					DIV({"class":"messageLabel"},
						"$message|getContextMessageLabel"
					)
				)
			),
		
		rowTag:
			TR({"class": "messageRow",
				_repObject: "$message",
				onclick: "$onClickRow"},
				TD({"class": "messageNameCol messageCol"},
					DIV({"class": "messageNameLabel messageLabel"},
						"$message|getMessageIndex"
					)
				),
				TD({"class": "messageBodyCol messageCol"},
					DIV({"class": "messageLabel", title: "$message|getMessageTitle"},
						"$message|getMessageLabel"
					)
				)
			),
			
		bodyRow:
			TR({"class": "messageInfoRow"},
				TD({"class": "messageInfoCol", colspan: 8})
			),
			
		bodyTag:
			DIV({"class": "messageInfoBody", _repObject: "$message"},
				DIV({"class": "messageInfoTabs"},
					A({"class": "messageInfoFunctionInfoTab messageInfoTab", onclick: "$onClickTab", view: "FunctionInfo"},
						"Function Info"
					),				
					A({"class": "messageInfoCallersTab messageInfoTab", onclick: "$onClickTab", view: "Callers"},
						"Callers"
					)
				),
				DIV({"class": "messageInfoFunctionInfoText messageInfoText"},
					A({"class": "stackFrameLink", onclick: "$onClickCallInfo", lineNumber: "$message.lineNumber"},
						"$message.fileName"
					)
				),
				DIV({"class": "messageInfoCallersText messageInfoText"},
					TABLE({"class": "messageInfoCallersTable", cellpadding: 0, cellspacing: 0},
						TBODY(
							FOR("caller", "$message|callerIterator",
								TR({"class": "messageInfoRow"},
									TD(
										DIV("$caller|callerRowMessage")
									)
								)
							)
						)
					)
				)
			),
			
		// Context nodes
		onClickContextRow: function(event) {
			if (isLeftClick(event)) {
				var row = getAncestorByClass(event.target, "messageRow");
				if (row) {
					this.toggleContextRow(row);
					cancelEvent(event);
				}
			}
		},
			
		// Body of the message.
		onClickRow: function(event) {
			if (isLeftClick(event)) {
				var row = getAncestorByClass(event.target, "messageRow");
				if (row) {
					this.toggleRow(row);
					cancelEvent(event);
				}
			}
		},
		
		collapseRow: function(row) {
			if (hasClass(row, "messageRow") && hasClass(row, "opened"))
				this.toggleRow(row);
		},

		expandRow: function(row) {
			if (hasClass(row, "messageRow"))
				this.toggleRow(row, true);
		},

		toggleRow: function(row, state) {
			var opened = hasClass(row, "opened");
			if ((state != null) && (opened == state))
				 return;
			
			toggleClass(row, "opened"); // adds / removes specified class

			if (hasClass(row, "opened")) {
				var message = row.repObject;				
				var bodyRow = this.bodyRow.insertRows({}, row, this)[0];
				var messageInfo = this.bodyTag.replace({message: message}, bodyRow.firstChild, this);
				message.bodyRow = bodyRow;

				this.selectTabByName(messageInfo, "FunctionInfo");
			}
			else
			{
				row.parentNode.removeChild(row.nextSibling);
			}
		},
		
		selectTabByName: function(messageInfoBody, tabName) {
			var tab = getChildByClass(messageInfoBody, "messageInfoTabs",
				"messageInfo" + tabName + "Tab");
			if (tab)
				this.selectTab(tab);
		},

		onClickTab: function(event) {
			this.selectTab(event.currentTarget);
		},

		selectTab: function(tab) {
			var messageInfoBody = tab.parentNode.parentNode;

			var view = tab.getAttribute("view");
			if (messageInfoBody.selectedTab) {
				messageInfoBody.selectedTab.removeAttribute("selected");
				messageInfoBody.selectedText.removeAttribute("selected");
			}

			var textBodyName = "messageInfo" + view + "Text";

			messageInfoBody.selectedTab = tab;
			messageInfoBody.selectedText = getChildByClass(messageInfoBody, textBodyName);

			messageInfoBody.selectedTab.setAttribute("selected", "true");
			messageInfoBody.selectedText.setAttribute("selected", "true");

			var message = Firebug.getRepObject(messageInfoBody);

			this.updateInfo(messageInfoBody, view, message);
		},
		
		updateInfo: function(messageInfoBody, view, message) {
			var tab = messageInfoBody.selectedTab;
			if (hasClass(tab, "messageInfoFunctionInfoTab")) {
				
			} else if (hasClass(tab, "messageInfoCallersTab")) {
				// The content is generated by domplate template.
			}
		},
		
		// Caller info render support
		onClickCallInfo: function(event) {
			var winType = "FBTraceConsole-SourceView";
			var lineNumber = event.target.getAttribute("lineNumber");

			openDialog("chrome://global/content/viewSource.xul",
				winType, "all,dialog=no",
				event.target.innerHTML, null, null, lineNumber, false);
		},
		
		// Caller render support
		callerIterator: function(message) {
			return message.getCallerArray();
		},
		
		callerRowMessage: function(caller) {
			return caller.getFunctionName();
		},
			
		dump: function(message, targetNode, index) {
			if (index)
				message.index = index;
			else
				message.index = targetNode.childNodes.length;
				
			var row = this.rowTag.insertRows({ message: message}, targetNode, this);
		},
		
		getMessageIndex: function(message) {
			return message.index+1;
		},
		
		getMessageLabel: function(message) {
			return message.getFunctionName();
			
			var maxLength = Firebug.getPref(Firebug.TraceModule.prefDomain,
				"trace.maxMessageLength");
			return message.getLabel(maxLength);
		},

		getMessageTitle: function(message) {
			return message.getMessage();
			
			return message.getLabel(-1);
		},
		
	});
	
	Firebug.jstraceModule.FunctionCallLog = function(context, functionCallInfo) {
		this.context = context;
		this.functionCallInfo = functionCallInfo;
		//this.fileName = functionCallInfo.fileName;
	};
	
	Firebug.jstraceModule.FunctionCallLog.prototype = {
		getMessage: function() {
			return this.functionCallInfo.script.fileName + " : " + this.functionCallInfo.script.baseLineNumber;
		},
		
		getFunctionName: function() {
			return getFunctionName(this.functionCallInfo.script, this.context);
		},
		
		getCallerArray: function() {
			var res = [];
			var calls = this.functionCallInfo.calls;
			for(var key in calls) {
				res.push(new Firebug.jstraceModule.FunctionCallInfo(this, calls[key]));
			}
			return res;
		},
		
		get fileName() {
			return this.functionCallInfo.fileName;
		},
		
		get lineNumber() {
			return this.functionCallInfo.lineNumber;
		}
	};
	
	Firebug.jstraceModule.FunctionCallInfo = function(aFunctionCallLog, aCallInfo) {
		this.functionCallLog = aFunctionCallLog;
		this.callInfo = aCallInfo;
		try {
			this.callingFrame = aCallInfo.frame.frames[1];
		} catch (err) {
			FBTrace.sysout("error Firebug.jstraceModule.FunctionCallInfo", err);
		}
	};
	
	Firebug.jstraceModule.FunctionCallInfo.prototype = {
		getFunctionName: function() {
			return getFunctionName(this.callingFrame.script, this.functionCallLog.context);
		},
	};
}});