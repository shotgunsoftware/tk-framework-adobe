Public API
==========

Adobe Communicator
------------------

The Commicator for Adobe is called AdobeBridge (python.tk_framework_adobe.adobe_bridge.AdobeBridge). It is responsible for bringing
the entire global scope recursively into python.

Once an instance of the AdobeBridge class has been created, this instance can be
used as entry point to javascript-objects inside the Adobe host.

The instance will always return ProxyWrapper objects, that represent javascript objects or functions.

For more detailed information, please see the documentation of tk-aftereffects.

Utils
-----

In order to simplify the engine installation logic in the startup.py of the engine, the following method is provided.

.. automodule:: python.tk_framework_adobe_utils.startup
    :members: ensure_extension_up_to_date



