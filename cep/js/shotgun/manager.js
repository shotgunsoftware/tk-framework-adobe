// Copyright (c) 2019 Shotgun Software Inc.
//
// CONFIDENTIAL AND PROPRIETARY
//
// This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
// Source Code License included in this distribution package. See LICENSE.
// By accessing, using, copying or modifying this work you indicate your
// agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
// not expressly granted therein are reserved by Shotgun Software Inc.

"use strict";

// namespace
var sg_manager = sg_manager || {};

// A singleton "class" to manage the Shotgun integration layers
//   * python bootstrap
//   * communication with the panel
//   * communication with adobe api (extendscript) via socket.io
sg_manager.Manager = new function() {

    // ---- public data members

    // the port we'll be communicating over
    this.communication_port = undefined;

    // ---- private

    // adobe interface
    const _cs_interface = new CSInterface();

    // remember if/why python was disconnected
    var __python_disconnected = false;
    var __python_disconnected_error = undefined;

    // remember if pyside was unavailable
    var __pyside_unavailable = false;

    // keep track of the active document
    var __active_document = undefined;

    // ---- public methods

    // Setup the Shotgun integration within the app.
    this.on_load = function() {

        // Execute the startup payload and catch *any* errors. If there are
        // errors, display them in the panel if possible.
        try {

            // ensure this app is supported by our extension
            if (!_app_is_supported()) {
                _emit_python_critical_error({
                    message: "This CC product does not meet the minimum " +
                        "requirements to run the Shotgun integration. The " +
                        "Shotgun integration requires support for HTML " +
                        "panels and the extended panel menu.",
                    stack: undefined
                });
                return;
            }

            // setup event listeners so that we can react to messages as they
            // come in.
            _setup_event_listeners();

            const manager_ext_id = sg_constants.extension_info["manager"]["id"];
            const panel_ext_id = sg_constants.extension_info["panel"]["id"];

            // start up the panel in the adobe product first. we can display
            // messages and information to the user while functions below are
            // running
            sg_logging.debug("Launching the panel extension...");
            _cs_interface.requestOpenExtension(panel_ext_id);

            // Look for an open port to use for the server. Once a port has been
            // found, this method will directly call the supplied callback
            // method to start up the server and then bootstrap python.
            _get_open_port(_on_server_port_found);

            // log info about the loaded extensions
            const extensions = _cs_interface.getExtensions(
                [panel_ext_id, manager_ext_id]);

            if (extensions.length > 0) {
                sg_logging.debug("Loaded extensions:");
                extensions.forEach(function(ext) {
                    sg_logging.debug(
                        "--------------------------------------\n" +
                        `    name: ${ext.name}\n` +
                        `      id: ${ext.id}\n` +
                        `mainPath: ${ext.mainPath}\n` +
                        `basePath: ${ext.basePath}\n`
                    );
                });
            }

            // log the os information
            sg_logging.debug("OS information: " + _cs_interface.getOSInformation());

            // log the cep api version:
            const api_version = _cs_interface.getCurrentApiVersion();
            sg_logging.debug("CEP API Version: " +
                api_version.major + "." +
                api_version.minor + "." +
                api_version.micro
            );

        } catch (error) {

            const error_lines = error.stack.split(/\r?\n/);
            const stack_err_msg = error_lines[0];

            const message = "There was an unexpected error during startup of " +
                "the Adobe Shotgun integration:<br><br>" + stack_err_msg;

            // log the error in the event that the panel has started and the
            // user can click the console
            sg_logging.error(message);
            sg_logging.error(error.stack);

            // emit the critical error for any listeners to display
            _emit_python_critical_error({
                message: message,
                stack: error.stack
            });

            // There are no guarantees that the panel has started up, and
            // therefore no guarantees that the user has easy access to the
            // debug console. Go ahead and display an old school alert box here
            // to ensure that they get something. This may look like crap.
            alert(message + "\n\n" + error.stack);
        }
    };

    // Code to run when the manager extension is unloaded
    this.on_unload = function() {

        // This callback never seems to run. This could be because this is an
        // "invisible" extension, but it seems like even regular panels never
        // have their page "unload" callbacks called. Leaving this here for now
        // in the event that this becomes called at some point in the future.
        this.shutdown();
    };

    // Ensure all the manager's components are shutdown properly
    //
    // Also emits an event for listeners to respond to manager shutdown.
    this.shutdown = function() {

        // alert listeners that the manager is shutting down
        sg_manager.SHUTTING_DOWN.emit();

        // ensure the python process is shut down
        if (typeof this.python_process !== "undefined") {
            sg_logging.debug("Terminating python process...");
            try {
                this.python_process.kill();
                sg_logging.debug("Python process terminated successfully.");
            } catch(error) {
                sg_logging.warning(
                    "Unable to terminate python process: " + error.stack);
            }
        }

        // shut down socket.io server
        sg_socket_io.SocketManager.stop_socket_server();
    };

    // ---- private methods

    // Tests whether the extension can run with the current application
    const _app_is_supported = function() {

        // supported if the panel menu and html extensions are available
        const host_capabilities = _cs_interface.getHostCapabilities();
        return host_capabilities.EXTENDED_PANEL_MENU &&
            host_capabilities.SUPPORT_HTML_EXTENSIONS;
    };

    const _active_document_check = function(event) {
        _cs_interface.evalScript(
            // NOTE: Hopefully this is the same across all Adobe CC
            // products. If it isn't, then we'll likely want to make
            // a manager method that abstracts it away and returns
            // the active document after checking which DCC we're in.
            //
            // UPDATE: It's not the same, at least not for AE. In that
            // case you look up the current project and get the path
            // from that. This is going to need to be abstracted
            // somehow when we break this out of being PS only.
            "app.activeDocument.fullName.fsName",
            function(result) {
                // If the above command fails, then it's because the
                // active document is an unsaved file.
                if ( result == "EvalScript error." ) {
                    // If we previously had a path stored and we're in
                    // this undefined state, then we've switched from a
                    // saved document to one that isn't and we still
                    // need to alert clients.
                    if ( __active_document !== undefined ) {
                        sg_logging.debug("Active document changed to undefined");
                        __active_document = undefined;
                        sg_socket_io.rpc_active_document_changed("");
                    }
                }
                else {
                    // If it's changed, then alert clients.
                    if ( __active_document !== result ) {
                        sg_logging.debug("Active document changed to " + result);
                        __active_document = result;
                        sg_socket_io.rpc_active_document_changed(result);
                    }
                }
            }
        );
    };

    // Bootstrap the toolkit python process.
    //
    // Returns a `child_process.ChildProcess` object for the running
    // python process with a bootstrapped toolkit core.
    const _bootstrap_python = function(framework_folder, port) {

        const child_process = require("child_process");
        const path = require("path");

        const app_id = _cs_interface.hostEnvironment.appId;
        const engine_name = sg_constants.product_info[app_id].tk_engine_name;

        // The path to this extension. We're also replacing any encoded
        // $ characters that might be returned with a literal $. On
        // Windows we're seeing the CS interface returning system paths
        // without having $ decoded. This becomes a problem when there's
        // a $ in the path, like when using roaming user profiles on
        // a Windows network.
        const ext_dir = framework_folder.replace("%24", "$");

        // path to the python folder within the extension
        const plugin_python_path = path.join(ext_dir, "python");

        // get a copy of the current environment and append to PYTHONPATH.
        // we need to append the plugin's python path so that it can locate the
        // manifest and other files necessary for the bootstrap.
        if (process.env.PYTHONPATH) {
            // append the plugin's python path to the existing env var
            process.env.PYTHONPATH += path.delimiter + plugin_python_path;
        } else {
            // no PYTHONPATH set. set it to the plugin python path
            process.env.PYTHONPATH = plugin_python_path;
        }

        // Set the port in the environment. The engine will use this when
        // establishing a socket client connection.
        process.env.SHOTGUN_ADOBE_PORT = port;

        // get the bootstrap python script from the bootstrap python dir
        const plugin_bootstrap_py = path.join(plugin_python_path,
            "tk_framework_adobe_utils", "plugin_bootstrap.py");

        sg_logging.debug("Bootstrapping: " + plugin_bootstrap_py);

        // launch a separate process to bootstrap python with toolkit running...
        // > cd $ext_dir
        // > python /path/to/ext/bootstrap.py

        // use the system installed python
        var python_exe_path = "python";

        if (process.env.SHOTGUN_ADOBE_PYTHON) {
            // use the python specified in the environment if it exists
            sg_logging.info("Using python executable set in environment variable 'SHOTGUN_ADOBE_PYTHON'.");
            python_exe_path = process.env.SHOTGUN_ADOBE_PYTHON;
        }

        sg_logging.debug("Spawning child process... ");
        sg_logging.debug("Python executable: " + python_exe_path);
        sg_logging.debug("Current working directory: " + plugin_python_path);
        sg_logging.debug("Executing command: " +
            [
                python_exe_path,
                plugin_bootstrap_py,
                port,
                engine_name,
                app_id
            ].join(" ")
        );

        try {
            this.python_process = child_process.spawn(
                python_exe_path,
                [
                    // path to the python bootstrap script
                    plugin_bootstrap_py,
                    port,
                    engine_name,
                    app_id
                ],
                {
                    // start the process from this dir
                    cwd: plugin_python_path,
                    // the environment to use for bootstrapping
                    env: process.env
                }
            );
        }
        catch (error) {
            sg_logging.error("Child process failed to spawn:  " + error);
            throw error;
        }

        this.python_process.on("error", function(error) {
            sg_logging.error("Python process error: " + error);
        });

        // log stdout from python process
        this.python_process.stdout.on("data", function(data) {
            sg_logging.python(data.toString());
        });

        // log stderr from python process
        this.python_process.stderr.on("data", function(data) {
            sg_logging.python(data.toString());
        });

        // handle python process disconnection
        this.python_process.on("close", _handle_python_close);

    }.bind(this);

    // Python should never be shut down by anything other than the manager.
    // So if we're here, something caused it to exit early. Handle any known
    // status codes accordingly.
    const _handle_python_close = function(code, signal) {

        const error_codes = sg_constants.python_error_codes;

        if (code == error_codes.EXIT_STATUS_NO_PYSIDE) {
            // Special case, PySide does not appear to be installed.
            __pyside_unavailable = true;
            __python_disconnected = true;
            sg_logging.error("Python exited because PySide is unavailable.");
            sg_manager.PYSIDE_NOT_AVAILABLE.emit();
        } else {
            // Fallback case where we don't know why it shut down.
            sg_logging.error("Python exited unexpectedly.");
            _emit_python_critical_error({
                message: "The Shotgun integration has unexpectedly shut " +
                         "down. Specifically, the python process that " +
                         "handles the communication with Shotgun has " +
                         "been terminated.",
                stack: undefined
            });
        }
    };

    // Find an open port and send it to the supplied callback
    const _get_open_port = function(port_found_callback) {

        // https://nodejs.org/api/http.html#http_class_http_server
        const http = require('http');

        // keep track of how many times we've tried to find an open port
        var num_tries = 0;

        // the number of times to try to find an open port
        const max_tries = 25;

        // function to try a port. recurses until a port is found or the max
        // try limit is reached.
        const _try_port = function() {

            ++num_tries;

            // double checking whether we need to continue here. this should
            // prevent this method from being called after a suitable port has
            // been identified.
            if (typeof this.communication_port !== "undefined") {
                // the port is defined. no need to continue
                return;
            }

            // check the current number of tries. if too many, emit a signal
            // indicating that a port could not be found
            if (num_tries > max_tries) {
                _emit_python_critical_error({
                    message: "Unable to set up the communication server that " +
                             "allows the shotgun integration to work. " +
                             "Specifically, there was a problem identifying " +
                             "a port to start up the server.",
                    stack: undefined
                });
                return;
            }

            // our method to find an open port seems a bit hacky, and not
            // entirely failsafe, but hopefully good enough. if you're reading
            // this and know a better way to get an open port, please make
            // changes.

            // the logic here is to create an http server, and provide 0 to
            // listen(). the OS will provide a random port number. it is *NOT*
            // guaranteed to be an open port, so we wait until the listening
            // event is fired before presuming it can be used. we close the
            // server before proceeding and there's no guarantee that some other
            // process won't start using it before our communication server is
            // started up.
            const server = http.createServer();

            // if we can listen to the port then we're using it and nobody else
            // is. close out and forward the port on for use by the
            // communication server
            server.on(
                "listening",
                function() {
                    // listening, so the port is available
                    this.communication_port = server.address().port;
                    server.close();
                }.bind(this)
            );

            // if we get an error, we presume that the port is already in use.
            server.on(
                "error",
                function(error) {
                    const port = server.address().port;
                    sg_logging.debug("Could not listen on port: " + port);
                    // will close after this event
                }
            );

            // when the server is closed, check to see if we got a port number.
            // if so, call the callback. if not, try again
            server.on(
                "close",
                function() {
                    if (this.communication_port !== undefined) {
                        // the port is defined. no need to continue
                        const port = this.communication_port;
                        sg_logging.debug("Found available port: " + port);
                        try {
                            port_found_callback(port);
                        } catch(error) {
                            _emit_python_critical_error({
                                message: "Unable to set up the communication " +
                                         "server that allows the shotgun " +
                                         "integration to work.",
                                stack: error.stack
                            });
                        }
                    } else {
                        // still no port. try again
                        _try_port();
                    }
                }.bind(this)
            );

            // now that we've setup the event callbacks, tell the server to
            // listen to a port assigned by the OS.
            server.listen(0);
        }.bind(this);

        // fake error message to test startup fail. good for debugging.
        //var error = new Error();
        //error.message = "This is a fake fail!!! Thrown manually to force an error!";
        //Error.captureStackTrace(error);
        //throw error;

        // initiate the port finding
        _try_port();
    }.bind(this);

    // Callback for when an open port is found.
    const _on_server_port_found = function(port) {

        sg_socket_io.SocketManager.start_socket_server(port, _cs_interface);

        // Register the socket manager for logging.
        sg_logging.rpc = sg_socket_io;

        // bootstrap the python process.
        function __tmp_bootstrap_python(result){
            if (!result)
            {
                console.log("Variable " + sg_constants.framework_adobe_env_var + "is not set. Please edit the bootstrap.py of your engine implementation.");
                return false;
            }
            _bootstrap_python(result, port);
            return true;
        }
        _cs_interface.evalScript("$.getenv('"  + sg_constants.framework_adobe_env_var + "')", __tmp_bootstrap_python);
    };

    // Reloads the manager
    const _reload = function(event) {

        sg_logging.debug("Reloading the manager...");

        // shutdown the python process
        this.shutdown();

        // remember this extension id to reload it
        const extension_id = _cs_interface.getExtensionID();

        // close the extension
        sg_logging.debug(" Closing the python extension.");
        _cs_interface.closeExtension();

        // request relaunch
        sg_logging.debug(" Relaunching the manager...");
        _cs_interface.requestOpenExtension(extension_id);

    }.bind(this);

    // Setup listeners for any events that need to be processed by the manager
    const _setup_event_listeners = function() {

        sg_logging.debug("Setting up event listeners...");

        // ---- Events from the panel
        sg_panel.REQUEST_MANAGER_RELOAD.connect(_reload);

        // Handle python process disconnected
        sg_panel.REGISTERED_COMMAND_TRIGGERED.connect(
            function(event) {
                sg_logging.debug("Registered Command Triggered: " + event.data);
                sg_socket_io.rpc_command(event.data);
            }
        );

        // Handle requests for test running.
        sg_panel.RUN_TESTS.connect(
            function(event) {
                sg_logging.debug("Requesting that tk_photoshopcc run tests...");
                sg_socket_io.rpc_run_tests();
            }
        );

        sg_panel.REQUEST_STATE.connect(
            function() {
                sg_logging.debug("State requested.");
                if (__python_disconnected) {
                    if (__pyside_unavailable) {
                        sg_manager.PYSIDE_NOT_AVAILABLE.emit();
                    } else {
                        _emit_python_critical_error(__python_disconnected_error);
                    }
                } else {
                    sg_logging.debug("Awaiting new state from Python...");
                    sg_socket_io.rpc_state_requested();
                }
            }
        );

        // Keep an eye on the active document.
        //
        // NOTE: A useful answer from an Adobe employee in the below:
        // https://forums.adobe.com/thread/1380138#
        //
        sg_logging.debug("Registering documentAfterActivate event...");
        _cs_interface.addEventListener(
            'documentAfterActivate',
            _active_document_check
        );

        sg_logging.debug("Event listeners created.");
    };

    // Wrapper to emit the python critical error for listeners
    const _emit_python_critical_error = function(error) {
        __python_disconnected = true;
        __python_disconnected_error = error;
        sg_manager.CRITICAL_ERROR.emit(error);
    };

};

