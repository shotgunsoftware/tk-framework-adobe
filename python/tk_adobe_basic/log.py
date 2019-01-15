# Copyright (c) 2016 Shotgun Software Inc.
#
# CONFIDENTIAL AND PROPRIETARY
#
# This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
# Source Code License included in this distribution package. See LICENSE.
# By accessing, using, copying or modifying this work you indicate your
# agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
# not expressly granted therein are reserved by Shotgun Software Inc.

import logging


class BootstrapLogHandler(logging.StreamHandler):
    """
    Manually flushes emitted records for js to pickup.
    """

    def emit(self, record):
        """
        Forwards the record back to to js via the engine communicator.

        :param record: The record to log.
        """

        # can't use super here because in python 2.6, logging.StreamHandler is
        # not a new style class.
        logging.StreamHandler.emit(self, record)

        # always flush to ensure its seen by the js process
        self.flush()


def get_sgtk_logger(sgtk):
    """
    Sets up a std log handler for toolkit

    :param sgtk: An sgtk module reference.

    :returns: A log handler.
    """
    # add a custom handler to the root logger so that all toolkit log messages
    # are forwarded back to python via the communicator
    bootstrap_log_formatter = logging.Formatter("[%(levelname)s]: %(message)s")
    bootstrap_log_handler = BootstrapLogHandler()
    bootstrap_log_handler.setFormatter(bootstrap_log_formatter)

    if sgtk.LogManager().global_debug:
        bootstrap_log_handler.setLevel(logging.DEBUG)
    else:
        bootstrap_log_handler.setLevel(logging.INFO)

    # now get a logger to use during bootstrap
    sgtk.LogManager().initialize_custom_handler(bootstrap_log_handler)

    # initializes the file where logging output will go
    sgtk.LogManager().initialize_base_file_handler("tk-photoshopcc")

    return bootstrap_log_handler


