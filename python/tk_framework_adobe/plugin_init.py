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
import os

from . import log


# Note: the sgtk_plugin_basic_photoshopcc module is created
# as part of the plugin build process.
try:
    from sgtk_plugin_basic_adobe import manifest
except ImportError:
    pass


def _progress_handler(value, message):
    """
    Writes the progress values in a special format that can be intercepted by
    the panel during load.

    :param value: A float (0-1) value representing startup progress percentage.
    :param message: A message that indicates what is happening during startup.
    """

    # A three part message separated by "|" to help indicate boundaries. The
    # panel will intercept logged strings of this format and translate them
    # to the display.
    sys.stdout.write("|PLUGIN_BOOTSTRAP_PROGRESS,%s,%s|" % (value, message))
    sys.stdout.flush()


def toolkit_plugin_bootstrap(plugin_root_path):
    """
    Business logic for bootstrapping toolkit as a plugin.

    :param plugin_root_path: Path to the root of the plugin
    """

    # import sgtk
    tk_core_python_path = manifest.get_sgtk_pythonpath(plugin_root_path)
    sys.path.insert(0, tk_core_python_path)
    import sgtk

    logger = sgtk.LogManager.get_logger(__name__)
    logger.debug("Imported sgtk core from '%s'" % tk_core_python_path)

    # ---- setup logging
    log_handler = log.get_sgtk_logger(sgtk)
    logger.debug("Added bootstrap log hander to root logger...")

    # set up the toolkit bootstrap manager

    # todo: For standalone workflows, need to handle authentication here
    #       this includes workflows for logging in and out (see maya plugin).
    #       For now, assume that we are correctly authenticated.
    #       Also, need to check that the SHOTGUN_SITE env var matches
    #       the currently logged in site.

    toolkit_mgr = sgtk.bootstrap.ToolkitManager()
    # run the default init which sets plugin id, base config and bundle cache path
    manifest.initialize_manager(toolkit_mgr, plugin_root_path)

    # set up progress reporting
    toolkit_mgr.progress_callback = _progress_handler
    logger.debug("Toolkit Manager: %s" % toolkit_mgr)

    entity = toolkit_mgr.get_entity_from_environment()
    logger.debug("Will launch the engine with entity: %s" % entity)

    logger.info("Bootstrapping toolkit...")
    engine_to_start = os.getenv("SHOTGUN_ENGINE", None)
    if engine_to_start is None:
        logger.error(
            "No engine to start is specified. Make shure SHOTGUN_ENGINE is set in the bootstrap of your engine."
        )
        return

    toolkit_mgr.bootstrap_engine(engine_to_start, entity=entity)

    # ---- tear down logging
    sgtk.LogManager().root_logger.removeHandler(log_handler)
    logger.debug("Removed bootstrap log handler from root logger...")

    logger.info("Toolkit Bootstrapped!")
