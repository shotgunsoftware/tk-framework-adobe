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

// Each of the extensions (panel & manager) will use this interface, and each
// will emit log messages. The panel will be connected to these log messages and
// react to both sources. This allows all logging from python (via the manager)
// and the panel to end up in one destination. In addition, logging messages
// that don't originate from python will be forwarded back to the python
// process.

// namespace
var sg_logging = sg_logging || {};

// ---- Events

// sent from non-panel extensions and received by the panel to log to the
// console available via the panel's flyout menu
sg_event.create_event(sg_logging, "LOG_MESSAGE");

// ---- Interface

// The rpc interface will be assigned by the manager once
// the server has been spun up.
sg_logging.rpc = undefined;

sg_logging._get_logger_by_level = function(level, send_to_rpc) {
    return function(message) {
        sg_logging._log(level, message, send_to_rpc);
    };
};

sg_logging._log_rpc = function(level, message) {
    if ( sg_logging.rpc !== undefined ) {
        sg_logging.rpc.rpc_log(level, message);
    }
};

sg_logging._log = function(level, message, send_to_rpc) {
    // Attempt to send the log message to the socket.io server to
    // be emitted to clients.
    if ( send_to_rpc && sg_logging.rpc !== undefined ) {
        sg_logging._log_rpc(level, message);
    }

    // the log messages with level "python" could be comprised of multiple
    // log messages because of stdout buffering. submit each
    if (level == "python") {
        var messages = message.split("\n");
    } else {
        var messages = [message];
    }

    messages.forEach(function(message) {
        // send a log message. this should be received and processed by the
        // panel extension. that's where the user will have access to the
        // flyout menu where they can click and go to the console.
        sg_logging.LOG_MESSAGE.emit({
            level: level,
            message: message,
            from_python: !send_to_rpc
        });
    });
};

sg_logging.debug = sg_logging._get_logger_by_level("debug", true);
sg_logging.info = sg_logging._get_logger_by_level("info", true);
sg_logging.log = sg_logging._get_logger_by_level("log", true);
sg_logging.warn = sg_logging._get_logger_by_level("warn", true);
sg_logging.error = sg_logging._get_logger_by_level("error", true);

// for log messages coming from python (not sent back via rpc)
sg_logging.python = sg_logging._get_logger_by_level("python", false);
