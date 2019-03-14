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

var sg_event = sg_event || {};

const _cs_interface = new CSInterface();

// namespace for app events
const _event_namespace = "com.sg.basic.adobe.events";


// ---- Functions

sg_event.create_event = function(namespace, event_name) {
    // Creates an event and adds
    namespace[event_name] =
        new sg_event.Event(_event_namespace + "." + event_name);
};

// ---- Event Object

sg_event.Event = function(event_type) {
    // Convenience object that allows for connecting to and emitting events
    this.event_type = event_type;
};

// Convenience wrapper for sending application events.
//
// Args:
//    data: data to send along with the event. for use by listeners
sg_event.Event.prototype.emit = function(data) {

    // allow emission with no data. just populate with null
    data = data || null;

    // create an event instance by populating the type and data supplied
    // as well as the scope, app id, and extension id.
    var event = new CSEvent(
        this.event_type,
        "APPLICATION",
        _cs_interface.getApplicationID(),
        _cs_interface.getExtensionID()
    );

    // serialize the data within an object so that we know the type of data.
    // when the event is heard on the other end, we know to parse it and
    // access the actual data. use encodeURIComponent to prevent parsing
    // problems on the other end when unexpected characters are encountered.
    event.data = encodeURIComponent(
        JSON.stringify({data: data})
    );

    _cs_interface.dispatchEvent(event);
};

// Convenience wrapper for listening to application events.
//
// Args:
//    callback: the method to call when the event is heard
//
// Callbacks should take a single argument which is the event object
// itself.
sg_event.Event.prototype.connect = function(callback) {

    // listen for shutdown requests from panel
    _cs_interface.addEventListener(
        this.event_type,
        function(event) {

            // deserialize the event data and extract the actual data.
            // We decode the serialized string to counter the encoding done
            // when the event was sent. This prevents errors when parsing
            // special characters.
            try {
                event.data = JSON.parse(decodeURIComponent(event.data)).data;
            } catch(error) {
                event.data = null;
            }

            callback(event);
        }
    );
};


