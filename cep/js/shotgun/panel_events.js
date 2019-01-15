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

// namespace. not to be confused with the Shotgun Panel app.
var sg_panel = sg_panel || {};

// sent when a command is clicked in the panel
sg_event.create_event(sg_panel, "REGISTERED_COMMAND_TRIGGERED");

// sent from the panel when the user requests to reload the extension
sg_event.create_event(sg_panel, "REQUEST_MANAGER_RELOAD");

// sent by the panel to request an updated state from the python process
sg_event.create_event(sg_panel, "REQUEST_STATE");

// sent by the panel to alert Python of the need to run the photoshopcc
// test suite.
sg_event.create_event(sg_panel, "RUN_TESTS");

