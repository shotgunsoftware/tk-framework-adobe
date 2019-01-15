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
var sg_manager = sg_manager || {};

// typically as an async response to a REQUEST_STATE event from the panel
sg_event.create_event(sg_manager, "UPDATE_COMMANDS");

// typically as an async response to a REQUEST_STATE event from the panel
sg_event.create_event(sg_manager, "UPDATE_CONTEXT_DISPLAY");

// typically as an async response to a REQUEST_STATE event from the panel
sg_event.create_event(sg_manager, "UPDATE_CONTEXT_THUMBNAIL");

// provides the toolkit log file path for display in panel
sg_event.create_event(sg_manager, "UPDATE_LOG_FILE_PATH");

// sent when the python side cannot determine a context for the current document
sg_event.create_event(sg_manager, "UNKNOWN_CONTEXT");

// sent just before a context change from python
sg_event.create_event(sg_manager, "CONTEXT_ABOUT_TO_CHANGE");

// emits critical errors whereby the manager is not or can not function
// properly. the emitted event will contain a dictionary of the following form:
//
//      {
//         message: <the user-friendly error message>
//         stack: <the stack trace for debugging>
//      }
//
// this event is only emitted when something happens that prevents the manager
// from continuing to function properly.
sg_event.create_event(sg_manager, "CRITICAL_ERROR");

// this event emitted when the python process cannot bootstrap due to pyside
// not being installed
sg_event.create_event(sg_manager, "PYSIDE_NOT_AVAILABLE");

// emitted when the manager is shutting down. allows listeners to act accordingly
sg_event.create_event(sg_manager, "SHUTTING_DOWN");
