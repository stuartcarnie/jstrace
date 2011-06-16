# jstrace
jstrace is a Firebug extension which adds a new tab to collect call data followed by the generation of a complete call tree.

## License
jstrace is written by Stuart Carnie and is MIT licensed

## Repository
[http://github.com/scarnie/jstrace](http://github.com/scarnie/jstrace)

## Usage
1. Open Firebug and enable the Script tab
1. Switch to the jstrace tab, and click the Trace button to toggle tracing (defaults to off)
1. Once finished, click the Trace button again to generate the call tree
  * __NOTE__: You can ALT+CLICK a node to see more information about that function call, 
	including links to the function definition and call sites in parent node (caller)

## Performance
Naturally you would expect some slowdown, however be prepared for a significant amount (up to 100x).
The heavy lifting occurs in `TraceListener.processFunctionCall`, which is called back for every function call.
I've isolated the poor performance to converting the jsd stack frame into a safe frame that will remain valid
after tracing completes.  As per [this][jsdIStackFrame] documentation, the stack frame object is only valid for the duration
of the call, and therefore we must do this during profiling.  Simply calling `frame.line` or `frame.script.tag` 
causes a huge performance hit, suggesting these native objects perform poorly when marshaling data or remain 
uninitialized until the first property is accessed.

[jsdIStackFrame]: http://xulrunner-1.9.sourcearchive.com/documentation/1.9.0.14plus-pbuild2plus-pnobinonly/interfacejsdIStackFrame.html