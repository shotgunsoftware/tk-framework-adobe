# Copyright (c) 2016 Shotgun Software Inc.
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

def toolkit_classic_bootstrap():
    """
    Business logic for bootstrapping toolkit as a traditional setup.
    """
    import sgtk
    logger = sgtk.LogManager.get_logger(__name__)

    # ---- setup logging
    log_handler = log.get_sgtk_logger(sgtk)
    logger.info("Launching Toolkit in classic mode.")
    logger.debug("TANK_CONTEXT and TANK_ENGINE variables found.")

    # Deserialize the Context object and use that when starting
    # the engine.
    context = sgtk.context.deserialize(os.environ["TANK_CONTEXT"])
    engine_name = os.environ["TANK_ENGINE"]

    logger.info("Starting %s using context %s..." % (engine_name, context))
    engine = sgtk.platform.start_engine(engine_name, context.tank, context)

    # ---- tear down logging
    sgtk.LogManager().root_logger.removeHandler(log_handler)
    logger.debug("Removed bootstrap log handler from root logger...")
    logger.info("Toolkit Bootstrapped!")


