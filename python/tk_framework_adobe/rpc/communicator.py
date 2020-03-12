# Copyright (c) 2019 Shotgun Software Inc.
#
# CONFIDENTIAL AND PROPRIETARY
#
# This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
# Source Code License included in this distribution package. See LICENSE.
# By accessing, using, copying or modifying this work you indicate your
# agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
# not expressly granted therein are reserved by Shotgun Software Inc.
import threading
import sys
import os.path
import time
import logging
import contextlib


# Add our third-party packages to sys.path. We've created a zip file because some of the file paths
# are pretty long. We're also normalizing the path or we're getting import errors.
sys.path.insert(
    0,
    os.path.normpath(
        os.path.join(
            os.path.dirname(__file__),  # ./python/tk_framework_adobe/rpc
            os.pardir,  # ./python/tk_framework_adobe
            os.pardir,  # ./python
            os.pardir,  # .
            "pkgs.zip",  # ./pkgs.zip
        )
    ),
)


import socketIO_client.exceptions
from socketIO_client import SocketIO
from .proxy import ProxyScope, ProxyWrapper, ClassInstanceProxyWrapper

import sgtk
from tank_vendor import six


class Communicator(object):
    """
    A communication manager that owns a socket.io client. The
    communicator offers access to a global scope provided by
    a server that the communicator connects to at instantiation
    time. Basic RPC calls are also implemented.
    """

    _RESULTS = dict()
    _UID = 0
    _LOCK = threading.Lock()
    _RPC_EXECUTE_COMMAND = "execute_command"
    _REGISTRY = dict()
    _COMMAND_REGISTRY = dict()

    def __init__(
        self,
        port=8090,
        host="localhost",
        disconnect_callback=None,
        logger=None,
        network_debug=False,
        event_processor=None,
    ):
        """
        Constructor. Rather than instantiating the Communicator directly,
        it is advised to make use of the get_or_create() classmethod as
        a factory constructor.

        :param int port: The port num to connect to. Default is 8090.
        :param str host: The host to connect to. Default is localhost.
        :param disconnect_callback: A callback to call if a disconnect
                                    message is received from the host.
        :param logger: A standard Python logger to use for network debug
                       logging.
        :param bool network_debug: Whether network debug logging is desired.
        :param event_processor: A callable that will be called during each
                                iteration of the response wait loop. An
                                example would be passing in the
                                QtGui.QApplication.processEvents callable,
                                which will force an iteration of the Qt
                                event loop during response wait periods,
                                which will stop Qt widgets from being
                                blocked from repainting.
        """
        self._port = port
        self._host = host
        self._network_debug = network_debug
        self._logger = logger or logging.getLogger(__name__)
        self._event_processor = event_processor
        self._response_logging_silenced = False

        self._io = SocketIO(host, port)
        self._io.on("return", self._handle_response)

        self._global_scope = None
        self._disconnect_callback = disconnect_callback

        if disconnect_callback:
            self._io.on("disconnect", disconnect_callback)

        self._get_global_scope()

    ##########################################################################################
    # constructor

    @classmethod
    def get_or_create(cls, identifier, *args, **kwargs):
        """
        A factory constructor that provides singleton instantiation
        behavior based on a given unique identifier. If an instance
        exists with the given identifier it will be returned,
        otherwise a new instance is constructed and returned after
        being recorded by the given identifier.

        :param identifier: Some hashable identifier to associate
                           the instantiated communicator with.
        :param int port: The port to connect to. Default is 8090.
        :param str host: The host to connect to. Default is localhost.
        :param disconnect_callback: A callback to call if a disconnect
                                    message is received from the host.
        """
        if identifier in cls._REGISTRY:
            instance = cls._REGISTRY[identifier]
            instance.logger.debug("Reusing Communicator by id '%s'" % identifier)
        else:
            instance = cls(*args, **kwargs)
            instance._identifier = identifier
            cls._REGISTRY[identifier] = instance
            instance.logger.debug("New Communicator of id '%s'" % identifier)
        return instance

    ##########################################################################################
    # properties

    @property
    def event_processor(self):
        """
        The callable event processor that will be called between iterations
        of the RPC response wait loop.
        """
        return self._event_processor

    @event_processor.setter
    def event_processor(self, processor):
        self._event_processor = processor

    @property
    def host(self):
        """
        The host that was connected to.
        """
        return self._host

    @property
    def logger(self):
        """
        The standard Python logger used by the communicator.
        """
        return self._logger

    @logger.setter
    def logger(self, logger):
        self._logger = logger

    @property
    def network_debug(self):
        """
        Whether network debugging messages are logged.
        """
        return self._network_debug

    @network_debug.setter
    def network_debug(self, state):
        self._network_debug = bool(state)

    @property
    def port(self):
        """
        The port number connected to.
        """
        return self._port

    ##########################################################################################
    # context managers

    @contextlib.contextmanager
    def response_logging_silenced(self):
        """
        A context manager that will silence RPC command response logging
        on enter, and enable it on exit. This is useful if you're emitting
        an RPC command that you expect might fail, but you want to handle
        that failure without alerting a user via logging.
        """
        self._response_logging_silenced = True
        yield
        self._response_logging_silenced = False

    ##########################################################################################
    # RPC

    def disconnect(self):
        """
        Disconnects from the socket.io server.
        """
        self._io.disconnect()
        del self._REGISTRY[self._identifier]

    def ping(self):
        """
        Pings the host, testing whether the connection is still live.
        """
        self._io._ping()

    def process_new_messages(self, wait=0.01, single_loop=False, process_events=True):
        """
        Processes new messages that have arrived but that have not been
        previously handled.

        :param float wait: How long to poll for new messages, in seconds.
        :param bool single_loop: If True, only a single check for messages
                                 will be made and the timeout duration will
                                 not be used. Default is False.
        :param bool process_events: If True and an event processor callable
                                    is registered with the communicator, it
                                    will be called at the end of the wait
                                    duration.
        """
        self.log_network_debug("Processing new messages, wait is %s" % wait)

        try:
            self._io._heartbeat_thread.hurry()
            self._io._transport.set_timeout(seconds=0.1)
            start = time.time()

            while wait >= (time.time() - start) or single_loop:
                try:
                    self._io._process_packets()
                except socketIO_client.exceptions.TimeoutError:
                    # Timeouts here are not a problem. It can be something
                    # as simple as the server being busy and not responding
                    # quickly enough, in which case subsequent attempts will
                    # go through without a problem.
                    self.log_network_debug(
                        "Timed out during _process_packets call. This is "
                        "likely not a problem if it only happens occasionally."
                    )
                else:
                    if single_loop:
                        break

                # Force an event loop iteration if we were provided with a
                # callable event processor.
                if self.event_processor and process_events:
                    self.event_processor()
        finally:
            self._io._heartbeat_thread.relax()
            self._io._transport.set_timeout()

        self.log_network_debug("New message processing complete.")

    def rpc_call(self, proxy_object, params=[], parent=None):
        """
        Executes a "call" RPC command.

        :param proxy_object: The proxy object to call via RPC.
        :param list params: The list of arguments to pass to the
                            callable when it is called.
        :param parent: The parent proxy object, if any. If given, the
                       callable will be called as a method of the
                       parent object. If a parent is not given, it
                       will be called as a function of the global
                       scope.

        :returns: The data returned by the callable when it is
                  called.
        :raises: RuntimeError
        """
        self.log_network_debug("Sending a call message using rpc_call...")

        if parent:
            params.insert(0, parent.uid)
            self.log_network_debug("Parent given, UID is %s" % parent.uid)
        else:
            self.log_network_debug("No parent given.")
            params.insert(0, None)

        try:
            return self.__run_rpc_command(
                method="call",
                proxy_object=proxy_object,
                params=params,
                wrapper_class=ProxyWrapper,
            )
        except RuntimeError:
            if parent:
                msg = "Failed to call method %s bound to %s with arguments %s" % (
                    proxy_object,
                    parent,
                    params[1:],  # The first item is the UID, which isn't relevant.
                )
            else:
                msg = "Failed to call function %s with arguments %s" % (
                    proxy_object,
                    params[1:],  # The first item is the UID, which isn't relevant.
                )
            raise RuntimeError(msg)

    def rpc_is_equal(self, left, right):
        """
        Checks the equality of the given left and right values. If the
        given objects are ProxyWrapper instances, the wrapped object's
        UID will be sent across the RPC channel for comparison of the
        wrapped object in the remote interpreter.

        :param left: The left-hand value to be tested.
        :param right: The right-hand value to be tested.

        :rtype: bool
        :raises: ValueError
        """
        self.log_network_debug("Sending an is_equal message using rpc_is_equal...")
        packages = []

        for value in (left, right):
            if isinstance(value, ProxyWrapper):
                packages.append(dict(is_wrapped=True, value=value.uid,))
            else:
                packages.append(dict(is_wrapped=False, value=value,))
        try:
            return self.__run_rpc_command(
                method="is_equal",
                proxy_object=None,
                params=packages,
                wrapper_class=ProxyWrapper,
            )
        except RuntimeError:
            self.log_network_debug("Comparison of packages failed: %s" % packages)
            raise ValueError("Unable to compare packages.")

    def rpc_eval(self, command):
        """
        Evaluates the given string command via RPC.

        :param str command: The command to execute.

        :returns: The data returned by the evaluated command.
        :raises: RuntimeError
        """
        self.log_network_debug("Sending an eval message using rpc_eval...")
        self.log_network_debug("Command is: %s" % command)

        try:
            return self.__run_rpc_command(
                method="eval",
                proxy_object=None,
                params=[command],
                wrapper_class=ProxyWrapper,
            )
        except RuntimeError:
            raise RuntimeError("Evaluation failed: %s" % command)

    def rpc_get(self, proxy_object, property_name):
        """
        Gets the value of the given property for the given proxy
        object.

        :param proxy_object: The proxy object to get the property
                             value from.
        :param str property_name: The name of the property to get.

        :returns: The value of the property of the remote object.
        :raises: AttributeError
        """
        self.log_network_debug("Sending a get message using rpc_get...")
        self.log_network_debug(
            "Getting property %s from object UID %s" % (property_name, proxy_object.uid)
        )

        try:
            return self.__run_rpc_command(
                method="get",
                proxy_object=proxy_object,
                params=[property_name],
                wrapper_class=ProxyWrapper,
                attach_parent=proxy_object,
            )
        except RuntimeError:
            raise AttributeError(
                "Failed to get property %s of object %s"
                % (property_name, proxy_object,)
            )

    def rpc_get_index(self, proxy_object, index):
        """
        Gets the value at the given index of the given proxy object.

        :param proxy_object: The proxy object to index into.
        :param int index: The index to get the value of.

        :returns: The value of the index of the remote object.
        :raises: IndexError
        """
        self.log_network_debug("Sending a get_index message using rpc_get_index...")
        self.log_network_debug(
            "Getting index %s of object UID %s" % (index, proxy_object.uid)
        )

        try:
            return self.__run_rpc_command(
                method="get_index",
                proxy_object=proxy_object,
                params=[index],
                wrapper_class=ProxyWrapper,
            )
        except RuntimeError:
            raise IndexError(
                "Failed to get index %d of list %s" % (index, proxy_object,)
            )

    def rpc_new(self, class_name, *args):
        """
        Instantiates a new remote object of the given class name.

        :param str class_name: The name of the class to instantiate.

        :returns: A proxy object pointing to the instantiated
                  remote object.
        :raises: RuntimeError
        """
        self.log_network_debug("Sending a 'new' message using rpc_new...")
        self.log_network_debug("Instantiating class %s" % class_name)

        try:
            return self.__run_rpc_command(
                method="new",
                proxy_object=None,
                params=[class_name, args],
                wrapper_class=ProxyWrapper,
            )
        except RuntimeError:
            raise RuntimeError("Failed to instantiate %s" % class_name)

    def rpc_set(self, proxy_object, property_name, value):
        """
        Sets the given property to the given value on the given proxy
        object.

        :param proxy_object: The proxy object to set the property of.
        :param str property_name: The name of the property to set.
        :param value: The value to set the property to.

        :raises: AttributeError
        """
        self.log_network_debug("Sending a set message using rpc_set...")
        self.log_network_debug(
            "Setting property %s to %s for object UID %s"
            % (property_name, value, proxy_object.uid)
        )

        try:
            return self.__run_rpc_command(
                method="set",
                proxy_object=proxy_object,
                params=[property_name, value],
                wrapper_class=ProxyWrapper,
            )
        except RuntimeError:
            raise AttributeError(
                "Unable to set property %s to value %s on object %s"
                % (property_name, value, proxy_object,)
            )

    def wait(self, timeout=0.1, single_loop=False, process_events=True):
        """
        Triggers a wait and the processing of any messages already
        queued up or that arrive during the wait period.

        :param float timeout: The duration of time, in seconds, to
                              wait.
        :param bool single_loop: If True, only a single check for messages
                                 will be made and the timeout duration will
                                 not be used. Default is False.
        :param bool process_events: If True and an event processor callable
                                    is registered with the communicator, it
                                    will be called at the end of the wait
                                    duration.
        """
        self.log_network_debug("Triggering a wait of duration %s" % timeout)
        self.log_network_debug("single_loop is %s" % single_loop)
        self.log_network_debug("process_events is %s" % process_events)
        self.process_new_messages(
            wait=float(timeout), single_loop=single_loop, process_events=process_events,
        )

    ##########################################################################################
    # logging

    def log_network_debug(self, msg):
        """
        Logs a debug message if 'network_debug' is turned on.

        :param str msg: The log message.
        """
        if self.network_debug:
            self.logger.debug(msg)

    ##########################################################################################
    # internal methods

    def _get_global_scope(self):
        """
        Emits a message requesting that the remote global scope be
        introspected, wrapped, and returned as JSON data.
        """
        self.log_network_debug("Getting the remote global scope...")
        payload = self._get_payload("get_global_scope")
        self.log_network_debug("Payload: %s" % payload)

        self._io.emit(self._RPC_EXECUTE_COMMAND, payload)
        uid = payload["id"]
        results = self._wait_for_response(uid)

        self.log_network_debug("Raw data response: %s" % results)

        self._global_scope = ProxyScope(results, self)

    def _get_payload(self, method, proxy_object=None, params=[]):
        """
        Builds the payload dictionary to be sent via RPC.

        :param str method: The JSON-RPC method name to call.
        :param proxy_object: The proxy object to be included in the
                             payload.
        :param list params: The list of paramaters to be packaged.

        :returns: The payload dictionary, formatted for JSON-RPC
                  use.
        """
        payload = dict(id=self.__get_uid(), method=method, jsonrpc="2.0", params=[],)

        if proxy_object:
            payload["params"] = [proxy_object.serialized]

            if params:
                payload["params"].extend(self.__prepare_params(params))
        else:
            payload["params"] = self.__prepare_params(params)

        self.log_network_debug("Payload constructed: %s" % payload)

        return payload

    def _handle_response(self, response, *args):
        """
        Handles the response to an already-emitted message.

        :param str response: The JSON encoded message response.

        :returns: The decoded result data.
        """
        self.log_network_debug("Handling RPC response...")

        result = sgtk.util.json.loads(response)
        uid = result["id"]
        self.log_network_debug("Response UID is %s" % uid)

        try:
            self._RESULTS[uid] = sgtk.util.json.loads(result["result"])
        except (TypeError, ValueError):
            # TODO: This feels like it would cause an error later if the result is a string. We need
            #  further clarification on what this catch is trying to achieve.
            result = result.get("result")
            if result is six.text_type():
                result = six.ensure_str(result)
            self._RESULTS[uid] = result
        except KeyError:
            if not self._response_logging_silenced:
                self.logger.error("RPC command (UID=%s) failed!" % uid)
                self.logger.debug(
                    "Failed command payload: %s" % self._COMMAND_REGISTRY[uid]
                )
                self.logger.debug("Failure raw response: %s" % response)
                self.logger.debug("Failure results: %s" % result)
            # This is all happening with a deal of asynchronicity, so we
            # don't want to raise here. We'll record that an error occurred,
            # but let the listener decide how and when to raise.
            self._RESULTS[uid] = RuntimeError()

        self.log_network_debug("Processed response data: %s" % self._RESULTS[uid])

    def _wait_for_response(self, uid):
        """
        Waits for the results of an RPC call.

        :param int uid: The unique id of the RPC call to wait for.

        :returns: The raw returned results data.
        """
        self.log_network_debug("Waiting for RPC response for UID %s..." % uid)

        while uid not in self._RESULTS:
            # If we were given an event processor, we can call that here. That
            # will be something like QApplication.processEvents, which will
            # force an iteration of the Qt event loop so that we're not
            # completely the UI thread here, even though we're blocking Python.
            if self.event_processor:
                self.event_processor()

            self.wait(single_loop=True, process_events=False)

        results = self._RESULTS[uid]
        del self._RESULTS[uid]

        self.log_network_debug("Results arrived for UID %s" % uid)
        return results

    ##########################################################################################
    # private methods

    def __get_uid(self):
        """
        Gets the next available unique id number.
        """
        with self._LOCK:
            self._UID += 1
            return self._UID

    def __prepare_params(self, params):
        """
        Prepares a list of paramaters to be emitted as part of an
        RPC call.

        :param list params: The list of paramaters to prepare.

        :returns: The list of prepared paramaters, fit for emission.
        """
        processed = []

        for param in params:
            # TODO: Probably handle all iterables.
            if isinstance(param, list):
                processed.extend(self.__prepare_params(param))
            elif isinstance(param, ProxyWrapper):
                processed.append(param.data)
            else:
                if isinstance(param, six.string_types):
                    param = six.ensure_str(param)
                processed.append(param)

        return processed

    def __run_rpc_command(
        self, method, proxy_object, params, wrapper_class, attach_parent=None
    ):
        """
        Emits the requested JSON-RPC method via socket.io and handles
        the returned result when it arrives.

        :param str method: The JSON-RPC method name to call.
        :param proxy_object: The proxy object to send.
        :param list params: The list of parameters to emit.
        :param wrapper_class: The class reference to use when
                              wrapping results.
        :param attach_parent: An optional parent object to associate
                              the returned data to.

        :returns: The wrapped results of the RPC call.
        """
        payload = self._get_payload(
            method=method, proxy_object=proxy_object, params=params,
        )

        self._COMMAND_REGISTRY[payload["id"]] = payload

        self._io.emit(self._RPC_EXECUTE_COMMAND, payload)
        results = self._wait_for_response(payload["id"])

        # If we got an error in the response, then we can now raise.
        # We're in the main thread here, so this will be caught and
        # handled properly by the rpc methods.
        if isinstance(results, RuntimeError):
            raise RuntimeError()

        return wrapper_class(results, self, parent=attach_parent)

    ##########################################################################################
    # magic methods

    def __getattr__(self, name):
        try:
            return getattr(self._global_scope, name)
        except AttributeError:
            # in case the requested attribute doesn't exist
            # we will try to generate a new instance of the
            # requested name
            return ClassInstanceProxyWrapper(
                {"__class__": name, "__uniqueid": -1}, self
            )
