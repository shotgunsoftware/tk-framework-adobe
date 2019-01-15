// Copyright (c) 2016 Shotgun Software Inc.
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
var sg_socket_io = sg_socket_io || {};

sg_socket_io.io = undefined;

/*
Emits the provided payload stringified as JSON via the currently open socket.io
server.

:param message_type: The type of message to emit.
:param payload: The payload data to emit as a message.
*/
sg_socket_io.emit = function(message_type, payload) {
    if ( sg_socket_io.io !== undefined ) {
        sg_socket_io.io.emit(message_type, JSON.stringify(payload));
    }
};

/*
Emits a message that informs any listeners of a change in active document within
the host application.
*/
sg_socket_io.rpc_active_document_changed = function(active_document_path) {
    sg_logging.debug("Emitting 'active_document_changed' message via socket.io.");
    var msg = {
        active_document_path: active_document_path
    };
    sg_socket_io.emit("active_document_changed", msg);
};

/*
Emits a "logging" message from the currently open socket.io server. The log
message string and level are combined into a single payload object with "level"
and "message" properties that is JSON encoded before emission.

:param level: The severity level of the logging message.
:param message: The logging message.
*/
sg_socket_io.rpc_log = function(level, message) {
    var msg = {
        level: level,
        message: message
    };
    sg_socket_io.emit("logging", msg);
};

/*
Emits a "state_requested" message from the currently open socket.io server.
*/
sg_socket_io.rpc_state_requested = function() {
    sg_logging.debug("Emitting 'state_requested' message via socket.io.");
    sg_socket_io.emit("state_requested");
};

/*
Emits a "command" message from the currently open socket.io server. The given
uid references an SGTK engine command by the same id, which will be used to look
up the appropriate callback once the message is handled by a client.

:param uid: The unique id associated with the command to be by the remote client.
*/
sg_socket_io.rpc_command = function(uid) {
    sg_logging.debug("Emitting 'command' message via socket.io.");
    sg_socket_io.emit("command", uid);
};

/*
Emits a "run_tests" message from the currently open socket.io server.
*/
sg_socket_io.rpc_run_tests = function() {
    sg_logging.debug("Emitting 'run_tests' message via socket.io.");
    sg_socket_io.emit("run_tests", {});
};

sg_socket_io.SocketManager = new function() {

    var io = undefined;

    /*
    Emits a debug logging message only if network logging has been
    turned on via the environment.

    :param msg: The logging message.
    */
    var log_network_debug = function(msg) {
        const legacy_env = process.env.SGTK_PHOTOSHOP_NETWORK_DEBUG;
        const env_var = process.env.SHOTGUN_ADOBE_NETWORK_DEBUG;

        if ( legacy_env || env_var ) {
            sg_logging.debug(msg);
        }
    };

    /*
    Replaces Windows-style backslash paths with forward slashes. Also
    replaces any %24 strings found with $, which is a problem that
    arises with system paths coming from the CS interface on Windows
    that contain $ for things like roaming user profiles.

    :param file_path: The file path string to sanitize.
    */
    var sanitize_path = function(file_path) {
        var file_path = file_path.replace(RegExp('\\\\', 'g'), '/');
        return file_path.replace("%24", "$");
    };

    /*
    The callback attached to each JSON-RPC call that's made.

    :param next: The "next" callback that unlocks the socket server event loop.
    :param result: The result data to be returned back to the RPC caller.
    */
    var _eval_callback = function(next, result) {
        if ( result === "EvalScript error." ) {
            // We're not going to log here at all. We are notifying any
            // clients that are listening that the command failed, and
            // they will have the chance to either recover or raise an
            // exception on their own.
            next(true, result);
        }
        else {
            next(false, result);
        }
    };

    /*
    Starts the socket.io server and defines the JSON-RPC interface that is made
    publicly available to clients.

    :param port: The port number to use when opening the socket.
    :param csLib: A handle to the standard Adobe CSInterface object.
    */
    this.start_socket_server = function (port, csLib) {
        var path = require('path');
        var jrpc = require('jrpc');
        var io = require('socket.io').listen(port);
        sg_socket_io.io = io;

        sg_logging.info("Listening on port " + JSON.stringify(port));

        // Get the path to the extension.
        var ext_dir = csLib.getSystemPath(SystemPath.APPLICATION);
        var js_dir = path.join(ext_dir, "js", "shotgun");

        // Tell ExtendScript to load the rpc.js file that contains our
        // helper functions.
        var jsx_rpc_path = sanitize_path(path.join(js_dir, "ECMA", "rpc.js"));
        var cmd = '$.evalFile("' + jsx_rpc_path + '")';
        sg_logging.debug("Sourcing rpc.js: " + cmd);
        csLib.evalScript(cmd);

        sg_logging.info("Establishing jrpc interface.");

        /*
        The object that defines the JSON-RPC interface exposed by the socket.io
        server. Each method on this object becomes a callable method over the
        socket.io connection.
        */
        function RPCInterface() {

            /*
            Maps the global scope of ExtendScript and returns a list of wrapper
            objects as JSON data. Each wrapper describes the object, its
            properties, and its methods.

            :param params: The list of parameters associated with the rpc call.
            :param next: The handle to the "next" callback that triggers the
                return of data to the caller and causes the next RPC call queued
                 up to be processed.
            */
            this.get_global_scope = function(params, next) {
                const cmd = "map_global_scope()";
                log_network_debug(cmd);
                csLib.evalScript(cmd, _eval_callback.bind(this, next));
            };

            /*
            Evalualtes an arbitrary string of Javascript in ExtendScript and
            returns the resulting data.

            :param params: The list of parameters associated with the rpc call.
                [extendscript_command]
            :param next: The handle to the "next" callback that triggers the
                return of data to the caller and causes the next RPC call queued
                up to be processed.
            */
            this.eval = function(params, next) {
                log_network_debug(params[0]);
                csLib.evalScript(params[0], function(result) {
                    next(false, result);
                });
            };

            /*
            Instantiates an object for the given global-scope class. The given
            class name must be available in the global scope of ExtendScript at
            call time.

            :param params: The list of parameters associated with the rpc call.
                [class_name]
            :param next: The handle to the "next" callback that triggers the
                return of data to the caller and causes the next RPC call queued
                up to be processed.
            */
            this.new = function(params, next) {
                var class_name = JSON.stringify(params.shift());
                var cmd = "rpc_new(" + class_name + ")";
                log_network_debug(cmd);

                csLib.evalScript(
                    cmd,
                    _eval_callback.bind(this, next)
                );
            };

            /*
            Gets the value of the given property on the given object.

            :param params: The list of parameters associated with the rpc call.
                [object, property_name]
            :param next: The handle to the "next" callback that triggers the
                return of data to the caller and causes the next RPC call queued
                up to be processed.
            */
            this.get = function(params, next) {
                var base = JSON.parse(params.shift());
                var property = params.shift();
                var args = [base.__uniqueid, JSON.stringify(property)].join();
                var cmd = "rpc_get(" + args + ")";
                log_network_debug(cmd);

                csLib.evalScript(
                    cmd,
                    _eval_callback.bind(this, next)
                );
            };

            /*
            Gets the value for the given index number on the given iterable
                object.

            :param params: The list of parameters associated with the rpc call.
                [object, index]
            :param next: The handle to the "next" callback that triggers the
                return of data to the caller and causes the next RPC call queued
                up to be processed.
            */
            this.get_index = function(params, next) {
                var base = JSON.parse(params.shift());
                var index = JSON.stringify(params.shift());
                var args = [base.__uniqueid, index].join();
                var cmd = "rpc_get_index(" + args + ")";
                log_network_debug(cmd);

                csLib.evalScript(
                    cmd,
                    _eval_callback.bind(this, next)
                );
            };

            /*
            Compares two objects for equality.

            :param params: A list containing two objects describing what to
                compare. Each object should contain two properties:
                value, and is_wrapped. If is_wrapped is true, the comparison
                will treat the value as an object registry UID and look up
                the appropriate object for comparison. Otherwise, the value
                is compared as is.
            :param next: The handle to the "next" callback that triggers the
                return of data to the caller and causes the next RPC call queued
                up to be processed.
            */
            this.is_equal = function(params, next) {
                var left = params.shift();
                var right = params.shift();

                var left_value = left["value"];
                var right_value = right["value"];

                if (left["is_wrapped"] === true) {
                    left_value = "__OBJECT_REGISTRY[" + left_value + "]";
                }
                if (right["is_wrapped"] === true) {
                    right_value = "__OBJECT_REGISTRY[" + right_value + "]";
                }

                var cmd = left_value + " == " + right_value;
                log_network_debug(cmd);
                csLib.evalScript(
                    cmd,
                    _eval_callback.bind(this, next)
                );
            };

            /*
            Sets the value of the given property on the given object.

            :param params: The list of parameters associated with the rpc call.
                [object, property_name, value]
            :param next: The handle to the "next" callback that triggers the
                return of data to the caller and causes the
                next RPC call queued up to be processed.
            */
            this.set = function(params, next) {
                var base = JSON.parse(params.shift());
                var property = params.shift();
                var value = params.shift();
                var args = [
                    base.__uniqueid,
                    JSON.stringify(property),
                    JSON.stringify(value)
                ].join();

                var cmd = "rpc_set(" + args + ")";
                log_network_debug(cmd);

                csLib.evalScript(
                    cmd,
                    _eval_callback.bind(this, next)
                );
            };

            /*
            Calls the given method on the given object.

            :param params: The list of parameters associated with the rpc call.
                [method_wrapper, parent_uid, method_arg_1, ...]
            :param next: The handle to the "next" callback that triggers the
                return of data to the caller and causes the next RPC call queued
                up to be processed.
            */
            this.call = function(params, next) {
                var base = JSON.parse(params.shift());
                // The parent object of the method being called. Since we
                // need to know what the method is bound to in order to
                // actually call it (foo.bar(), with "foo" being the parent
                // object identified by its unique id, and "bar" being the
                // method itself being called.
                var parent_uid = params.shift();

                var args = [
                    base.__uniqueid,
                    JSON.stringify(params),
                    parent_uid
                ].join();

                if ( args.endsWith(",") ) {
                    args = args + "-1";
                }

                var cmd = "rpc_call(" + args + ")";
                log_network_debug(cmd);

                csLib.evalScript(
                    cmd,
                    _eval_callback.bind(this, next)
                );
            };

        }

        // Stops the socket server.
        this.stop_socket_server = function() {
            sg_logging.debug("Shutting down socket server.");
            io.close();
        };

        sg_logging.info("Setting up connection handling...");

        const remote = new jrpc();
        remote.expose(new RPCInterface());

        remote.setTransmitter(function(message, next) {
            try {
                io.emit("return", message);
                return next(false);
            } catch (e) {
                return next(true);
            }
        });

        // Define the root namespace interface. This will receive all
        // commands for interacting with ExtendScript.
        io.on("connection", function(socket) {
            sg_logging.info("Connection received!");

            socket.on("execute_command", function(message) {
                remote.receive(message);
            });

            socket.on("set_commands", function(json_commands) {
                // The client is setting the commands
                var commands = JSON.parse(json_commands);
                sg_logging.debug("Setting commands from client: " + json_commands);

                // TODO: we're emitting a manager event. perhaps we should
                // have a set of events that come from socket.io? or perhaps
                // this should call a method on the manager (tried, but doesn't
                // seem to work!)? but this shouldn't really know about the
                // manager. anyway, this works, so revisit as time permits.
                sg_manager.UPDATE_COMMANDS.emit(commands);
            });

            socket.on("set_context_display", function(json_context_display) {
                // The client is setting the context display.
                var context_display = JSON.parse(json_context_display);
                sg_logging.debug("Setting context display from client.");
                sg_manager.UPDATE_CONTEXT_DISPLAY.emit(context_display);
            });

            socket.on("set_context_thumbnail", function(json_context_thumbnail) {
                // The client is setting the context thumbnail path.
                var context_thumbnail = JSON.parse(json_context_thumbnail);
                sg_logging.debug("Setting context thumbnail from client: " + json_context_thumbnail);
                sg_manager.UPDATE_CONTEXT_THUMBNAIL.emit(context_thumbnail);
            });

            socket.on("set_log_file_path", function(json_log_file_path) {
                // The client is setting the current log file path
                var log_file_path = JSON.parse(json_log_file_path);
                sg_logging.debug("Setting log file path from client: " + json_log_file_path);
                sg_manager.UPDATE_LOG_FILE_PATH.emit(log_file_path);
            });

            socket.on("set_unknown_context", function() {
                // The context is unknown
                sg_logging.debug("Sending unknown context signal from the client.");
                sg_manager.UNKNOWN_CONTEXT.emit();
            });

            socket.on("context_about_to_change", function() {
                // The context is about to change
                sg_logging.debug("Sending context about to change from client.");
                sg_manager.CONTEXT_ABOUT_TO_CHANGE.emit();
            });

            socket.on("log_message", function(json_log_data) {
                // log a message from python
                var log_data = JSON.parse(json_log_data);
                sg_logging._log(log_data.level, log_data.msg, false)
            });
        });
    };
};
