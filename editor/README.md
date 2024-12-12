# 4D-Debugger-VSCode

This extension developed by **[4D](https://www.4d.com/)** provides a debugger for the **[4D language](https://developer.4d.com/docs/Concepts/about)**.


## Quick start

1. Install the 4D Debugger extension in VS Code.
2. Configure the `launch.json` file (see below).
3. Open a 4D project folder or a 4D method (.4dm) file and start debugging.

All 4D blog posts about this extension are available [here](https://blog.4d.com/tag/vsdebugger/).

## Requirements

- The 4D Debugger extension can only be used with 4D Server 20 R8 or higher.
- The VS Code with 4D Debugger extension and 4D Server must be on the same machine. 
- No other debugger must be [attached to 4D Server](https://developer.4d.com/docs/Debugging/debugging-remote). 

## Configuration

The following properties can be set in the `launch.json` file.

### "attach" and "attach and run" properties

To execute some code on the currently launched 4D Server.

#### Required properties

|Property|Type|Description|Default|
|---|---|---|---|
|type	|text|	always "4d"	|"4d"|
|request|text|always "attach"|"attach"|
|name|text|can be "Attach" or "Attach and Run"||
|port|number|Port to connect to the 4D server|19815|

#### Optional properties

|Property|	Type|	Description	|Default|
|---|---|---|---|
|program|text|	The 4D Method To launch	|"${file}"|
|"host"	|text	|host to connect to the 4D server||


### "launch" and "launch and run" properties

To launch a referenced 4D Server application before executing some code.

#### Required properties

|Property|Type|Description|Default|
|---|---|---|---|
|type	|text|	always "4d"	|"4d"|
|request|text|always "launch"|"launch"|
|name|text|can be "Launch" or "Launch and Run"||
|project|text|Absolute path to a 4D Project|"${workspaceFolder}/Project/${workspaceFolderBasename}.4DProject"|
|exec|text|Absolute path to a 4D Server|""|


#### Optional properties

|Property|	Type|	Description	|Default|
|---|---|---|---|
|program|text|	The 4D Method To launch	|"${file}"|
|execArgs	|array	|Collection of arguments to the 4D Debugger|[]|
|port|number|Port to connect to the 4D server|19815|


## About Port number

The port number of the remote debugger cannot be modified directly; it is however the Application Server port+2. See [4D Server and port numbers](https://developer.4d.com/docs/settings/client-server#4d-server-and-port-numbers).

## Links

See https://code.visualstudio.com/docs/editor/debugging
