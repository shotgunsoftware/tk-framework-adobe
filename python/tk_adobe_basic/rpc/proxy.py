# Copyright (c) 2016 Shotgun Software Inc.
#
# CONFIDENTIAL AND PROPRIETARY
#
# This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
# Source Code License included in this distribution package. See LICENSE.
# By accessing, using, copying or modifying this work you indicate your
# agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
# not expressly granted therein are reserved by Shotgun Software Inc.

import json
import threading

class ProxyScope(object):
    """
    An object representation of a remotely-accessible scope.
    """
    def __init__(self, data, communicator):
        """
        Constructor.

        :param dict data: The data available to the scope to be represented
                          by the proxy object. The dictionary takes the form
                          of dict(item_name=item), where item_name is the name
                          associated with the data in the remote scope, and
                          item is the data itself. In plain terms, item_name
                          is the name of the variable, and item is what's
                          accessible via the variable of that name.
        :param communicator: An active Communicator object connected to some
                             server process.
        """
        self._data = data
        self._communicator = communicator
        self.__registry = dict()
        self.__register_data()

    def __register_data(self):
        """
        Interprets the data dictionary provided at instantiation time.

        ..Example:
            dict(
                item_name=item_data,
                ...
            )
        """
        try:
            for item_name, item in self._data.iteritems():
                self._communicator.log_network_debug("Scope registry: %s" % item_name)
                self.__registry[item_name] = ProxyWrapper(
                    item,
                    self._communicator,
                )
        except Exception:
            raise ValueError("Unable to interpret data: \"%s\"" % self._data)

    def __getattr__(self, name):
        """
        Custom attribute lookup behavior that allows names accessible in the
        wrapped, remote scope to be directly accessible as attributes on the
        wrapper.

        ..Example:
            adobe_app_proxy = proxy_scope.app

        :param name: The attribute name to look up.
        """
        try:
            return self.__registry[name]
        except KeyError:
            raise AttributeError("'%s' is not available in the requested scope." % name)


class ProxyWrapper(object):
    """
    A wrapper class for remotely-accessible data.
    """
    _LOCK = threading.Lock()
    _REGISTRY = dict()

    def __new__(cls, data, *args, **kwargs):
        """
        Custom instantiation behavior that ensures an item existing remotely
        is always represented by the same proxy wrapper.

        :param dict data: The data representing the remote item.
        """
        # These wrappers are singletons based on the unique id of
        # the data being wrapped. We only wrap data that has a unique
        # id, so anything that doesn't pass the test defined by the
        # _needs_wrapping() class method is returned as is.
        with cls._LOCK:
            if not cls._needs_wrapping(data):
                try:
                    return json.loads(data)
                except Exception:
                    return data
            elif data["__uniqueid"] in cls._REGISTRY:
                # This data has already been wrapped, so we just need
                # to return the object we already have stored in the
                # registry.
                return cls._REGISTRY[data["__uniqueid"]]
            else:
                # New data, so we go ahead and instantiate a new wrapper
                # object.
                return object.__new__(cls, data, *args, **kwargs)

    def __init__(self, data, communicator, parent=None):
        """
        Constructor.

        :param dict data: The data representing the remote item.
        :param communicator: An active Communicator object connected to some
                             server process.
        :param parent: Another ProxyObject that should act as this object's
                       parent. If defined and this object is used as a
                       callable, this object will be called as a method of
                       the parent object.
        """
        # We have to use super here because I've implemented a
        # __setattr__ on this class. This will prevent infinite
        # recursion when setting these attributes.
        super(ProxyWrapper, self).__setattr__("_data", data)
        super(ProxyWrapper, self).__setattr__("_serialized", json.dumps(data))
        super(ProxyWrapper, self).__setattr__("_parent", parent)
        super(ProxyWrapper, self).__setattr__("_communicator", communicator)
        super(ProxyWrapper, self).__setattr__("_uid", data.get("__uniqueid"))

        # Everything is registered by unique id. This allows us get
        # JSON data back from CEP and map it to an existing ProxyWrapper.
        self._REGISTRY[self._uid] = self

    @property
    def data(self):
        """
        The raw data provided by the server for this object.
        """
        return self._data

    @property
    def serialized(self):
        """
        The raw item data, encoded as JSON.
        """
        return self._serialized

    @property
    def uid(self):
        """
        This object's unique id. This id corresponds to the concrete object
        on the other end of the remote process connection.
        """
        return self._uid

    @classmethod
    def _needs_wrapping(cls, data):
        """
        States whether the given raw data requires wrapping in a proxy
        object.

        :param dict data: The raw data to test.

        :rtype: bool
        """
        # If it has a unique id, then it needs to be wrapped. If it
        # doesn't, then we don't really know what to do with it. Most
        # cases like this will be basic data types like ints and strings.
        if isinstance(data, dict) and "__uniqueid" in data:
            return True
        else:
            return False

    def __call__(self, *args): # TODO: support kwargs
        """
        Calls this object's equivalent concrete object on the other end of the
        remote connection. Any ordered arguments provided are passed through to
        the remote callable.
        """
        return self._communicator.rpc_call(
            self,
            list(args),
            parent=self._parent,
        )

    def __eq__(self, other):
        """
        Custom equality comparison behavior. This will compare the proxy object
        to the other object in the remote process. This is not a comparison of
        the given Python objects, but rather a equality check of the
        represented objects on the other side of the RPC connection.

        :param other: The value to compare against.

        :rtype: bool
        """
        # If they're both proxy wrappers and the uids match, then they are
        # representing the same object and are equal. Note that if the uids
        # do NOT match, that does NOT mean they're inequal. It's entirely
        # possible to have two object registry entries on the remote side
        # that correspond to equal values/objects.
        if isinstance(other, ProxyWrapper) and self.uid == other.uid:
            return True

        try:
            return self._communicator.rpc_is_equal(self, other)
        except ValueError:
            # Something went wrong with the RPC comparison, so we have to assume
            # that they are inequal. The communicator will have logged some info
            # about the RPC call that can be used for debugging.
            return False

    def __ne__(self, other):
        """
        Custom inequality comparison behavior. This will compare the proxy object
        to the other object in the remote process. This is not a comparison of
        the given Python objects, but rather an inequality check of the
        represented objects on the other side of the RPC connection.

        :param other: The value to compare against.

        :rtype: bool
        """
        return not self.__eq__(other)

    def __iter__(self):
        """
        Custom iteration behavior. This will loop up from index 0 until a failed
        index lookup occurs, at which time a StopIteration will be raised.
        """
        with self._communicator.response_logging_silenced():
            try:
                i = 0
                while True:
                    yield self[i]
                    i = i + 1
            except IndexError:
                raise StopIteration

    def __getattr__(self, name):
        """
        Custom attribute getter that accesses and returns the remote data
        using the proxy object's communicator reference.

        :param str name: The attribute name to get.
        """
        remote_names = self.data["properties"] + self.data["methods"].keys()

        # TODO: Let's not hardcode this to Adobe-like behavior. We should
        # allow for type-specific handlers that can be registered with the
        # API in case higher-level code wants to customize how attribute
        # lookup via RPC works.
        if name in remote_names or self.data.get("instanceof") == "Enumerator":
            return self._communicator.rpc_get(self, name)
        else:
            raise AttributeError("Attribute '%s' does not exist!" % name)

    def __getitem__(self, key):
        """
        Custom key or index look up. The remote process is queried for the
        appropriate index or key and the data stored there returned.

        :param key: Some item key, whether it's an integer index or some bit
                    of hashable data.
        """
        return self._communicator.rpc_get_index(self, key)

    def __setattr__(self, name, value):
        """
        Custom attribute setter that sets the given attribute name to the given
        value via RPC.

        :param str name: The attribute name to set.
        :param value: The value to set the attribute to.
        """
        remote_names = self.data["properties"] + self.data["methods"].keys()

        if name in remote_names:
            self._communicator.rpc_set(self, name, value)
        else:
            super(ProxyWrapper, self).__setattr__(name, value)

    def __repr__(self):
        """
        Stringifies the proxy object.
        """
        concrete_name = self._data.get("name", "undefined")
        concrete_type = self._data.get("instanceof", "undefined")
        return "<%s for remote object: type=%s, name=%s>" % (
            self.__class__.__name__,
            concrete_type,
            concrete_name,
        )


class ClassInstanceProxyWrapper(ProxyWrapper):
    """
    A ProxyWrapper for class instances.
    """
    def __call__(self, *args, **kwargs):
        # We don't actually call this. We're wrapping and returning
        # instance objects as is. This is just to allow for the typical
        # Python syntax of `adobe.SomeClassToInstantiate()`
        return self

