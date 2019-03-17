Developing Adobe Engines
========================

This section explains you can use the Adobe Framework when writing an Adobe engine.

In your engine, load and initialize the framework::

    # import the framework module
    adobe_bridge = sgtk.platform.import_framework(
        "tk-framework-adobe",
        "tk_framework_adobe.adobe_bridge"
    )
    AdobeBridge = adobe_bridge.AdobeBridge

    # get the adobe instance. it may have been initialized already by a
    # previous instance of the engine. if not, initialize a new one.
    adobe = AdobeBridge.get_or_create(
        identifier='tk-myengine',
        logger=self.logger, # engine logger
    )

    # connect to all the adobe bridge signals
    adobe.logging_received.connect(self._handle_logging)
    adobe.command_received.connect(self._handle_command)
    adobe.active_document_changed.connect(self._handle_active_document_change)
    adobe.run_tests_request_received.connect(self._run_tests)
    adobe.state_requested.connect(self.__send_state)

    # Adobe API will be accessible via the adobe object
    temp_thumb_file = adobe.File('/tmp/foo.jpeg')
    save_for_web = adobe.ExportType.SAVEFORWEB
    export_options = adobe.ExportOptionsSaveForWeb()
    adobe.app.activeDocument.exportDocument(temp_thumb_file, save_for_web, export_options)


The API exposed via the ``adobe`` bridge will depend on the Application that the framework is connecting to.
The above example shows Photoshop - in this case, the API is
defined `here <http://wwwimages.adobe.com/www.adobe.com/content/dam/acom/en/devnet/photoshop/pdfs/photoshop-cc-javascript-ref-2015.pdf>`_.


Adobe Communicator
------------------

This is the main object that the Framework exposes. It is responsible for bringing
the entire global Adobe API javascript scope recursively into python. Once an instance
of the AdobeBridge class has been created, this instance can be
used as entry point to javascript-objects inside the Adobe host.
The instance will always return ProxyWrapper objects, that represent javascript objects or functions.

.. autoclass:: python.tk_framework_adobe.adobe_bridge.AdobeBridge
    :inherited-members:
    :members:
    :exclude-members: save_as, save_as_psb


Exceptions
----------

.. autoclass:: python.tk_framework_adobe.adobe_bridge.RPCTimeoutError


Utilities
---------

In order to simplify the engine installation logic in the startup.py of the engine, the following method is provided.

.. automodule:: python.tk_framework_adobe_utils.startup
    :members: ensure_extension_up_to_date



