# Copyright (c) 2019 Shotgun Software Inc.
#
# CONFIDENTIAL AND PROPRIETARY
#
# This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
# Source Code License included in this distribution package. See LICENSE.
# By accessing, using, copying or modifying this work you indicate your
# agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
# not expressly granted therein are reserved by Shotgun Software Inc.
import sys

sys.dont_write_bytecode = True


import os
import traceback
from environment_utils import get_extension_install_directory


# exit status codes used when the python process dies. these are known by the
# js process that spawned python so they can be used as a primitive form of
# communication.
EXIT_STATUS_CLEAN = 0
EXIT_STATUS_ERROR = 100
EXIT_STATUS_NO_PYSIDE = 101


def bootstrap(root_path, port, engine_name, app_id):
    """
    Main entry point for adobe rpc python process.

    Blocking method. Launches a QT Application event loop.

    :param root_path: The path to the plugin on disk
    :param port: The communication port to use
    :param engine_name: The engine instance name <--- @todo - not needed?
    :param app_id: The application id
    """
    # first add our plugin python logic sys.path
    sys.path.insert(0, os.path.join(get_extension_install_directory(), "python"))
    sys.path.insert(0, root_path)
    import tk_framework_adobe

    # set the port in the env so that the engine can pick it up. this also
    # allows engine restarts to find the proper port.
    os.environ["SHOTGUN_ADOBE_PORT"] = port

    # set the application id in the environment. This will allow the engine
    # to know what host runtime it's in -- Photoshop, AE, etc.
    os.environ["SHOTGUN_ADOBE_APPID"] = app_id

    # do the toolkit bootstrapping. this will replace the core imported via the
    # sys path with the one specified via the resolved config. it will startup
    # the engine and make Qt available to us.
    if os.environ.get("TANK_CONTEXT") and os.environ.get("TANK_ENGINE"):
        tk_framework_adobe.toolkit_classic_bootstrap()

    else:
        tk_framework_adobe.toolkit_plugin_bootstrap(root_path)

    # core may have been swapped. import sgtk
    import sgtk

    # get a handle on the newly bootstrapped engine
    engine = sgtk.platform.current_engine()

    from sgtk.platform.qt import QtGui
    from sgtk.platform.engine_logging import ToolkitEngineHandler

    app_name = "Shotgun Framework for Adobe CC"

    # create and set up the Qt app. we don't want the app to close when the
    # last window is shut down since it's running in parallel to the CC product.
    # We'll manage shutdown
    app = QtGui.QApplication([app_name])

    # the icon that will display for the python process in the dock/task bar
    app_icon = QtGui.QIcon(os.path.join(root_path, "icon_256.png"))

    # set up the QApplication
    app.setApplicationName(app_name)
    app.setWindowIcon(app_icon)
    app.setQuitOnLastWindowClosed(False)

    # some operations can't be done until a qapplication exists.
    engine.post_qt_init()

    # log metrics for the app name and version
    host_info = engine.host_info
    engine.log_user_attribute_metric(
        "%s Version" % host_info["name"], host_info["version"]
    )

    # debug logging for the app name/version as well
    engine.logger.debug("Adobe CC Product: %s" % host_info["name"])
    engine.logger.debug("Adobe CC Version: %s" % host_info["version"])

    # once the event loop starts, the bootstrap process is complete and
    # everything should be connected. this is a blocking call, so nothing else
    # can happen afterward.
    engine.logger.debug("Starting Qt event loop...")

    # Note: Qt exits the event loop when the process receives a TERM signal which
    # is sent by the parent process when leaving Photoshop or restarting the
    # integration.
    ret = app.exec_()
    # We need to remove the engine log handler which tries to send back messages
    # to Photoshop either through a socket or stdout: we have no guarantee that
    # any of those is still open when Photoshop is quitting and any message send
    # through those will make our Python process hang.
    root_logger = sgtk.LogManager().root_logger
    handlers = list(root_logger.handlers)
    while handlers:
        handler = handlers.pop()
        if isinstance(handler, ToolkitEngineHandler):
            root_logger.removeHandler(handler)
    # Destroy the engine which will stop any background thread that was started.
    engine.logger.debug("Shutting down engine")
    engine.destroy_engine()
    engine.logger.debug("Exiting process...")
    # FiXME: Temp workaround for Shotgun-utils BackgroundTaskManager thread not
    # being joined on shutdown: if we exit immediately we will get some
    # "QThread: Destroyed while thread is still running" errors which can lead to
    # crashes. Until this problem is fixed (#46207) we give the thread a chance
    # to exit its exec loop by sleeping a couple of seconds.
    import time

    time.sleep(2)
    sys.exit(ret)


# executed from javascript
if __name__ == "__main__":

    # the communication port is supplied by javascript. the toolkit engine
    # env to bootstrap into is also supplied by javascript
    (port, engine_name, app_id) = sys.argv[1:4]
    try:
        # First, make sure we can import PySide or PySide2.
        # If not, there's no need to continue.
        from PySide2 import QtCore, QtGui
    except ImportError:
        try:
            # No PySide2, let's try PySide.
            from PySide import QtCore, QtGui
        except ImportError:
            sys.stdout.write("[ERROR]: %s" % (traceback.format_exc(),))
            sys.stdout.flush()
            sys.exit(EXIT_STATUS_NO_PYSIDE)

    # wrap the entire plugin boostrap process so that we can respond to any
    # errors and display them in the panel.
    try:
        # root path is the 'sgtk' directory 2 levels up from this file
        root_path = os.path.dirname(os.path.dirname(__file__))

        # startup the plugin which includes setting up the socket io client,
        # bootstrapping the engine, and starting the Qt event loop
        bootstrap(root_path, port, engine_name, app_id)
    except Exception as e:
        sys.stdout.write("[ERROR]: %s" % (traceback.format_exc(),))
        sys.stdout.flush()
        sys.exit(EXIT_STATUS_ERROR)
