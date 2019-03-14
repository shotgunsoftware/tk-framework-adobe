Adobe Common Extensibility Platform
===================================

The Shotgun engine for Photoshop CC provides a platform for integrating Shotgun
into your Photoshop CC workflow. It consists of a standard Shotgun Pipeline
Toolkit engine and an Adobe CC extension built upon Adobe's
`Common Extensibility Platform`_ (CEP).

.. _Common Extensibility Platform: https://github.com/Adobe-CEP/CEP-Resources#getting-started-with-the-creative-cloud-extension-sdk


CEP extension
-------------

The extension defined in this framework is referenced by engines that run inside
Adobe products (Currently: tk-photoshopcc and tk-aftereffects).
The engines should handle the installation of the panel automatically and this
framework contains helper methods to actually implement this auto-installation
into a new engine.
The extension is installed on the artist's local machine in the standard, OS-specific CEP
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


Changing the CEP extension
--------------------------

Before changing the extension please look at the `CEP HTML Extension Cookbook`_,
which holds a lot information on how to deal with CEP-panels.
Additionally you can clone the `CEP-Samples`_.

Be aware that the signing process is described in `contributing <contributing.html>`__.

.. _CEP HTML Extension Cookbook: https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_9.x/Documentation/CEP%209.0%20HTML%20Extension%20Cookbook.md
.. _CEP-Samples: https://github.com/Adobe-CEP/CEP-Resources/tree/master/CEP_9.x


Engine Specific Entries in this Framework
-----------------------------------------

As the engine provides a signed version of the CEP-Extension it was not possible
to completely avoid engine specific values inside of this engine.

When implementing a new engine for a new adobe product the following files have to
be touched and the application needs to be resigned as described in `contributing <contributing.html>`__.

cep/CSXS/manifest.xml
.....................

Add your host and supported minimum version number here::

    <HostList>
        ...
        <!-- your host -->
        <Host Name="SHORTCODE" Version="12.3"/>
        ...
    </HostList>

Replace SHORTCODE with the CEP-name of your Host Application (AEFT for After effects),
and 12.3 with your minimum supported internal version of the Host Application.
For example 14.0 is equivalent to After Effects 2017.

cep/.debug
..........

Similar to the manifest, please add your new host to the debug lists and define
a unique custom port.

cep/js/shotgun/constants.js
...........................


Add a new section describing your host as follows::

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


Please replace PORTNUM with the unique port used in cep/.debug.

