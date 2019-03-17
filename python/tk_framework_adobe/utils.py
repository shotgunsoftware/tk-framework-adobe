# Copyright (c) 2019 Shotgun Software Inc.
#
# CONFIDENTIAL AND PROPRIETARY
#
# This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
# Source Code License included in this distribution package. See LICENSE.
# By accessing, using, copying or modifying this work you indicate your
# agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
# not expressly granted therein are reserved by Shotgun Software Inc.

import functools
import threading

from sgtk.platform.qt import QtCore
from .errors import RPCTimeoutError


def timeout(seconds=5.0, error_message="Timed out."):
    """
    A timeout decorator. When the given amount of time has passed
    after the decorated callable is called, if it has not completed
    an RPCTimeoutError is raised.

    :param float seconds: The timeout duration, in seconds.
    :param str error_message: The error message to raise once timed out.
    """
    def decorator(func):
        def _handle_timeout():
            raise RPCTimeoutError(error_message)

        def wrapper(*args, **kwargs):
            timer = threading.Timer(float(seconds), _handle_timeout)
            try:
                timer.start()
                result = func(*args, **kwargs)
            finally:
                timer.cancel()
            return result

        return functools.wraps(func)(wrapper)
    return decorator



class MessageEmitter(QtCore.QObject):
    """
    Container QObject for Qt signals fired when messages requesting certain
    actions take place in Python arrive from the remote process.

    :signal logging_received(str, str): Fires when a logging call has been
        received. The first string is the logging level (debug, info, warning,
        or error) and the second string is the message.
    :signal command_received(int): Fires when an engine command has been
        received. The integer value is the unique id of the engine command
        that was requested to be executed.
    :signal run_tests_request_received: Fires when a request for unit tests to
        be run has been received.
    :signal state_requested: Fires when the remote process requests the current
        state.
    :signal active_document_changed(str): Fires when alerted to a change in active
        document by the RPC server. The string value is the path to the new
        active document, or an empty string if the active document is unsaved.
    """
    logging_received = QtCore.Signal(str, str)
    command_received = QtCore.Signal(int)
    run_tests_request_received = QtCore.Signal()
    state_requested = QtCore.Signal()
    active_document_changed = QtCore.Signal(str)


