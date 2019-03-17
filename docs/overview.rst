Framework Overview
===================================

This framework provides a platform for integrating Shotgun into
the Adobe product ecosystem. Examples of how it is currently being
used include the `Photoshop Engine <https://github.com/shotgunsoftware/tk-photoshopcc>`_
as well as the `After Effects Engine <https://github.com/shotgunsoftware/tk-aftereffects>`_.
The central technical component is an an Adobe CC extension built upon Adobe's
`Common Extensibility Platform <https://github.com/Adobe-CEP/CEP-Resources#getting-started-with-the-creative-cloud-extension-sdk>`_ (CEP).

This framework handles the following:

- Automatic installation and updates of the adobe extension at runtime.
- Automatic wrapping of adobe API methods so that they are accessible in Toolkit and Python.
- A standardized adobe panel which shows Toolkit icons and allows a user to launch Toolkit apps.


CEP extension
-------------

The CEP extension is installed on the artist's local machine in the standard, OS-specific CEP
extension directories::

    # Windows
    > C:\Users\[user name]\AppData\Roaming\Adobe\CEP\extensions\

    # OS X
    > ~/Library/Application Support/Adobe/CEP/extensions/


Each time an Adobe engine is launched, the engine bootstrap code will check the
version of the extension that is bundled with the engine against the version
that is installed on the machine. This means that after an engine update,
assuming a new version of the extension came with it, the installed extension
will be automatically updated to the newly-bundled version.


To understand the CEP technology that the extension is based on, the following
resources can be useful:

- The `CEP HTML Extension Cookbook <https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_9.x/Documentation/CEP%209.0%20HTML%20Extension%20Cookbook.md>`_, describing how to develop CEP panels.

- The `CEP-Samples <https://github.com/Adobe-CEP/CEP-Resources/tree/master/CEP_9.x>`_ collection.

.. note::
    Before deployment, the CEP extension needs to be signed. This process
    is described in the :ref:`development` section.


Application specific logic
--------------------------

As the framework provides a single, signed adobe extension that is meant
to be shared between all Adobe applications, it was was not possible
to completely avoid application specific values inside of it.
When implementing a new engine for a new adobe product, the following files have to
be modified:

- ``cep/CSXS/manifest.xml`` - Add your host and supported minimum version number here::

        <HostList>
            ...
            <!-- your host -->
            <Host Name="SHORTCODE" Version="12.3"/>
            ...
        </HostList>

    Replace SHORTCODE with the CEP-name of your Host Application (``AEFT`` for After effects),
    and ``12.3`` with your minimum supported internal version of the Host Application.
    For example ``14.0`` is equivalent to After Effects 2017.

- ``cep/.debug`` - Similar to the manifest above, please add your new host to
    the debug lists and define a unique custom port.

- ``cep/js/shotgun/constants.js`` - Add a new section describing your host as follows::

        sg_constants.product_info = {
            ...
            // Your Host
            SHORTCODE: {
                display_name: "Your Host Nice Name",
                tk_engine_name: "tk-your-engine-name",
                debug_url: "http://localhost:PORTNUM"
            }
            ...
        }

    Please replace PORTNUM with the unique port used in ``cep/.debug``.

Environment Variables
---------------------

To aid in debugging, there are a set of environment variables that change some
of the framework's default values:

- ``SHOTGUN_ADOBE_DISABLE_AUTO_INSTALL`` - Prevents the startup process from
  attempting to automatically install or update the extension bundled with the engine.

- ``SHOTGUN_ADOBE_HEARTBEAT_TIMEOUT`` - How long, in seconds, Python waits for
  Photoshop to answer its heartbeat (default is 0.5 seconds).

- ``SHOTGUN_ADOBE_NETWORK_DEBUG`` - Include additional networking debug messages
  when logging output.

- ``SHOTGUN_ADOBE_PYTHON`` - The path to the Python executable to use when launching the
  engine. If not set, the system Python is used. If the Adobe DCC is launched from a Python
  process, like Shotgun Desktop or via the tk-shell engine, the Python used by that
  process will be used by the integration.

- ``SHOTGUN_ADOBE_RESPONSE_TIMEOUT`` - How long, in seconds, Python waits for a
  response from the DCC (default is 300 seconds).

