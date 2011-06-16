FBL.ns(function() { with (FBL) {
	
	Components.utils.import("resource://firebug/firebug-trace-service.js");
	var FBTrace = traceConsoleService.getTracer("extensions.firebug");
	
	var traceButton = $('fbjstToggleTracing');
	var searchBox = $('jstFilterBox');
	
	var panelName = "jstracePanel";
	
	var traceHandlers = {
		hooks: [],
		
		callCount: 0,
		
		tracing: false,
		
		handler: null,
		
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
			traceHandlers.handler.processFunctionCall(frame, calling);
		},
		
		processFunctionCall: function(frame, calling) {
			for (var i = 0; i < this.hooks.length; i++) {
				var aHook = this.hooks[i];
				aHook.processFunctionCall(frame, calling);
			}
		},
				
		hook: function(frame) {
			
		},
		
		start: function() {
			if (this.tracing) return;
			
			if (this.hooks.length > 1) {
				this.handler = this;
			} else if (this.hooks.length == 1) {
				if (FBTrace.DBG_JSTRACE)
				    FBTrace.sysout("jstrace.traceHandlers.start; using optimized");
				this.handler = this.hooks[0];
			}

			for (var i=0; i < this.hooks.length; i++) {
				var hook = this.hooks[i];
				hook.start();
			}
			
			fbs.traceAll(null, this);
			this.tracing = true;
		},
		
		stop: function(aContext) {
			if (this.tracing) {
				fbs.untraceAll(this);
				
				for (var i=0; i < this.hooks.length; i++) {
					var hook = this.hooks[i];
					hook.stop(aContext);
				}
				
				this.tracing = false;
			}
		}
	}
	
	function cloneObject(obj) {
		if (!obj) return obj;
		if (obj.clone) return obj.clone();
		
		// NOTE: doesn't handle cycles
		var newInstance = new obj.constructor();
		for(var i in obj) {
			if (!obj.hasOwnProperty(i))
				continue;

			var item = obj[i];
			if (item instanceof Array) {
				var ary = newInstance[i] = [];
				for (var j=0; j < item.length; j++) {
					ary.push(cloneObject(item[j]));
				}
			} else {
				newInstance[i] = typeof(item) == 'object' ? cloneObject(item) : item;
			}
		}
		return newInstance;
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
		var hash = 7919;	// prime
		while (frame) {
			if (!frame.script) {
		        ERROR("framesToHash bad frame "+typeof(frame), frame);
		        return "<bad frame>";
		    }
		
			hash ^= frame.script.tag;
			hash ^= frame.line;
			
			frame=frame.callingFrame;
		}
		return hash;
	}
	
	function frameHash(frame) {
		var hash = 7919;	// prime
		hash ^= frame.script.tag;
		hash ^= frame.line;
		return hash;
	}
	
	function ProfileCall(aFrame) {
		this.frame = aFrame;
		this.script = this.frame.script;
		this.functionName = aFrame.functionName;
		this.callCount = 0;
	}
	
	function ProfileContext(executionContext) {
		this.executionContext = executionContext;
		this.functionCalls = {};
		this.calls = {};
	}
	
	function FunctionCallNode(aParent, aFileName, aFunctionName, aBaseLineNumber) {
		this.parent = aParent;
		this.fileName = aFileName
		this.functionName = aFunctionName;
		this.baseLineNumber = aBaseLineNumber;
		this.children = {};
		this.callers = {};
	}
	
	FunctionCallNode.prototype.toString = function toString() {
		return this.functionName + " | " + this.fileName + " (" + this.baseLineNumber + ")";
	}
	
	FunctionCallNode.prototype.clone = function() {
		var res = new FunctionCallNode(this.parent, this.fileName, this.functionName, this.baseLineNumber);
		res.children = cloneObject(this.children);
		res.callers = cloneObject(this.callers);
		return res;
	}
	
	// Works with FunctionCallNode, performs depth-first search
	// Trims branches that do not pass match function
	function trimNodes(node, match) {
		var children = node.children;
		var isMatch = false;
		if (children) {
			for (var k in children) {
				var i = children[k];
				if (!trimNodes(i, match)) {
					delete children[k];
				} else {
					isMatch = true;
				}
			}
		}
		return match(node) || isMatch;
	}
		
	function ContextNode(aParent, aExecutionContext) {
		this.parent = aParent;
		this.executionContext = aExecutionContext;
		this.children = {};
	}
	
	ContextNode.prototype.toString = function() {
		return "Context " + this.executionContext.tag;
	};
	
	ContextNode.prototype.clone = function() {
		var obj = new ContextNode(this.parent, this.executionContext);
		obj.children = cloneObject(this.children);
		return obj;
	}
		
	function TraceListener(context) {
		this.context = context;
		this.callCount = 0;
		this.profileData = {};
	}
	
	function getStackTraceFast(frame, context) {
		try
	    {
			var trace = new this.StackTrace();
			for (; frame && frame.isValid; frame = frame.callingFrame) {
				
			}
		} catch (err) {
			if (FBTrace.DBG_JSTRACE)
			    FBTrace.sysout("error jstrace.getFastStackTrace", err);
		}
	}
	
	TraceListener.prototype = {
		processFunctionCall: function(frame, aCalling) {
			try {
				if (!aCalling) {
					return;
				}
				
				var execContextHash = frame.executionContext.tag;
				var profContext = this.profileData[execContextHash];
				if (!profContext) {
					if (FBTrace.DBG_JSTRACE)
					    FBTrace.sysout("jstrace.TraceListener.onFunctionCall (new call context); " + execContextHash);

					profContext = new ProfileContext(frame.executionContext);
					this.profileData[execContextHash] = profContext;
				}
				
				var frameHash = framesToHash(frame);
				var profCall = profContext.calls[frameHash];
				if (!profCall) {
					var correctedFrame = getCorrectedStackTrace(frame, this.context);
					profCall = new ProfileCall(correctedFrame);
					profContext.calls[frameHash] = profCall;
				}
				profCall.callCount++;
				
			} catch (err) {
				if (FBTrace.DBG_JSTRACE && this.callCount++ < 100)
				    FBTrace.sysout("error jstrace.TraceListener.onFunctionCall", err);
			}
			
		},
		
		hook: function(frame) {
			
		},
		
		start: function() {
			if (FBTrace.DBG_JSTRACE)
				FBTrace.sysout("jstrace.TraceListener.start");
		},
		
		stop: function(aContext) {
			if (FBTrace.DBG_JSTRACE)
				FBTrace.sysout("jstrace.TraceListener.stop; processing profileData", this);			
		},
		
		generateTraceData: function(context) {
			if (FBTrace.DBG_JSTRACE)
				FBTrace.sysout("jstrace.TraceListener.generateTraceData");
				
			try {
				var root = {
					"name": "Root Node",
					parent: null,
					children: {},
					toString: function() {
						return this.name;
					}
				};
				for(var keyExec in this.profileData) {
					var exec = this.profileData[keyExec];
					
					var contextNode = new ContextNode(root, exec.executionContext);
					root.children[keyExec] = contextNode;
					for(var keyCall in exec.calls) {
						var call = exec.calls[keyCall];
						var frames = call.frame.frames;
						var children = contextNode.children;
						var parent = contextNode;
						var lastFrame = frames.length - 1;
						for (var i = lastFrame; i >= 0; i--) {
							var frame = frames[i];
							var child = children[frame.script.tag];
							if (!child) {
								child = new FunctionCallNode(parent, frame.script.fileName, getFunctionName(frame.script, context), frame.script.baseLineNumber);
								children[frame.script.tag] = child;
							}
							if (i < lastFrame) {
								var callingFrame = frames[i+1];
								var hash = frameHash(callingFrame);
								var caller = child.callers[hash];
								if (!caller) {
									child.callers[hash] = {
										fileName: callingFrame.script.fileName,
										line: callingFrame.line
									};
								}
							}
							children = child.children;
							parent = child;
						};
					}
				}
				
				if (FBTrace.DBG_JSTRACE)
					FBTrace.sysout("jstrace.TraceListener.generateTraceData; generated", root);
				return root;
			} catch (err) {
				if (FBTrace.DBG_JSTRACE || FBTrace.DBG_ERROR)
				    FBTrace.sysout("error jstrace.TraceListener.generateTraceData", err);
			}
		}
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
					traceHandlers.start();
				} catch (err) {
					if (FBTrace.DBG_JSTRACE)
					    FBTrace.sysout("jstrace.jstraceModule.onToggleTrace; error for fbs.traceAll", err);
				}
			} else {
				if (FBTrace.DBG_JSTRACE)
				    FBTrace.sysout("jstrace.jstraceModule.onToggleTrace; off", this.traceListener);
				traceHandlers.stop(context);
				traceHandlers.remove(this.traceListener);

				this.traceData = this.traceListener.generateTraceData(context);
				this.logTraceReport(context, this.traceData);
			}
		},
		
		onSearchKeyUp: function(context, event) {
			try {
				var filtered = this.filterData(this.traceData);
				this.logTraceReport(context, filtered);
			} catch(err) {
				if (FBTrace.DBG_JSTRACE || FBTrace.DBG_ERROR)
				    FBTrace.sysout("error jstrace.jstraceModule.onSearchKeyUp", err);
			}
		},
		
		filterData: function(traceData) {
			var searchText = searchBox.value;
			if (searchText == undefined || searchText == '')
				return traceData;
				
			var filtered = cloneObject(traceData);
			trimNodes(filtered, function match(node) {
				return node.toString().indexOf(searchText) >= 0;
			});
			return filtered;
		},
		
		logTraceReport: function logTraceReport(context, traceData) {
			try {
				var panel = context.getPanel(panelName);
				var parentNode = panel.panelNode;
				var rootTemplateElement = tree.tag.replace({object: traceData}, parentNode, tree);
				
			} catch (err) {
				if (FBTrace.DBG_JSTRACE || FBTrace.DBG_ERROR)
				    FBTrace.sysout("error jstrace.jstraceModule.logTraceReport; ", err);
			}
			
			if (FBTrace.DBG_JSTRACE) {
				FBTrace.sysout("jstrace.jstraceModule.logTraceReport:table", rootTemplateElement);
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
			addStyleSheet(doc, createStyleSheet(doc, "chrome://jstrace/skin/classic/jstrace.css"))
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
	
	var tree = domplate({
		tag:
			TABLE({ style: "width: 100%", onclick: "$onClick"},
				TBODY(
					FOR("member", "$object|memberIterator",
						TAG("$row", {member: "$member"})
					)
				)
			),

		row:
			TR({class: "treeRow", $hasChildren: "$member.hasChildren",
				_repObject: "$member", level: "$member.level"},
				TD({style: "padding-left: $member.indent\\px"},
					DIV({class: "treeLabel"},
						"$member.name"
					)
				),
				TD(
					DIV("$member.label")
				)
			),
					
		rowBody:
			DIV({class: "treeRowInfoGroup", _repObject: "$member"}, 
				DIV({class: "treeRowInfoBody"}, 
					TABLE({class: "callTable"},
						TBODY(
							TR(
								TD({ class: "stackLabel"}, "Function:")
							),
							TR(
								TD(
									A({"class": "stackFrameLink", onclick: "$onClickCallInfo", lineNumber: "$member.value.baseLineNumber"},
										"$member.value.fileName"
									)
								)
							),
							TR(
								TD({ class: "stackLabel"}, "Callers locations:")
							),
							FOR("frame", "$member|callersIterator",
								TR(
									TD(
										A({"class": "stackFrameLink", onclick: "$onClickCallInfo", lineNumber: "$frame.line"},
											"$frame.fileName"
										)
									)
								)
							)
						)
					)
				)
			),

		loop:
			FOR("member", "$members",
				TAG("$row", {member: "$member"})
			),

		memberIterator: function(object) {
			return this.getMembers(object);
		},
		
		onClickCallInfo: function(event) {
			var winType = "FBTraceConsole-SourceView";
			var lineNumber = event.target.getAttribute("lineNumber");

			openDialog("chrome://global/content/viewSource.xul",
				winType, "all,dialog=no",
				event.target.innerHTML, null, null, lineNumber, false);
		},
		
		callersIterator: function(member) {
			if (FBTrace.DBG_JSTRACE) {
				FBTrace.sysout("jstrace.tree.frameIterator", member);
			}
			var result = [];
			var callers = member.value.callers;
			for(var key in callers) {
				result.push(callers[key]);
			}
			return result;
		},

		onClick: function(event) {
			var row = getAncestorByClass(event.target, "treeRow");
			if (event.button == 0) {
				if (isAltClick(event)) {
				
					/*
					// open file
					var winType = "FBTraceConsole-SourceView";
					var rowObj = row.repObject;
					var lineNumber = rowObj.value.frame.line;

					openDialog("chrome://global/content/viewSource.xul",
						winType, "all,dialog=no",
						rowObj.value.fileName, null, null, lineNumber, false);
						*/
					this.toggleRowInfo(row);
				} else if (isLeftClick(event)) {
					var label = getAncestorByClass(event.target, "treeLabel");
					if (label && hasClass(row, "hasChildren"))
						this.toggleRow(row);
				}
			}
		},
		
		toggleRowInfo: function(row) {			
			if (hasClass(row, "infoOpened")) {
				removeClass(row, "infoOpened");
				
				row.bodyRow.parentNode.removeChild(row.bodyRow);
				delete row.bodyRow;
			} else {
				setClass(row, "infoOpened");
				var firstTD = row.firstChild;
				var bodyRow = this.rowBody.append({member: row.repObject}, firstTD, this);
				row.bodyRow = bodyRow;
			}
			if (FBTrace.DBG_JSTRACE) {
				FBTrace.sysout("jstrace.tree.toggleRowInfo", row);
			}
		},

		toggleRow: function(row) {
			var level = parseInt(row.getAttribute("level"));

			if (hasClass(row, "opened")) {
				removeClass(row, "opened");

				var tbody = row.parentNode;
				for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling) {
					if (parseInt(firstRow.getAttribute("level")) <= level)
						break;
					tbody.removeChild(firstRow);
				}
			} else {
				setClass(row, "opened");

				var repObject = row.repObject;
				if (repObject) {
					var members = this.getMembers(repObject.value, level+1);
					if (members)
						this.loop.insertRows({members: members}, row);
				}
			}
		},

		getMembers: function(object, level) {
			object = object.children;
		
			if (!level)
				level = 0;

			var members = [];
			for (var p in object) 
				members.push(this.createMember(p, object[p], level));

			return members;
		},

		createMember: function(name, value, level) {
			var hasChildren = (typeof(value.children) == "object");
			return {
				name: value.toString(),
				label: hasChildren ? "" : value,
				value: value,
				level: level,
				indent: level*16,
				hasChildren: hasChildren
			};
		}
	});
	
	/*
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
	*/
}});