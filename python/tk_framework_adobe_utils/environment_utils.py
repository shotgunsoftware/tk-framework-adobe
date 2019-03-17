# Copyright (c) 2019 Shotgun Software Inc.
#
# CONFIDENTIAL AND PROPRIETARY
#
# This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
# Source Code License included in this distribution package. See LICENSE.
# By accessing, using, copying or modifying this work you indicate your
# agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
# not expressly granted therein are reserved by Shotgun Software Inc.

import os
import sys


EXTENSION_NAME = "com.sg.basic.adobe"


def get_adobe_cep_dir():

    # the CEP install directory is OS-specific
    if sys.platform == "win32":
        app_data = os.getenv("APPDATA")
    elif sys.platform == "darwin":
        app_data = os.path.expanduser("~/Library/Application Support")
    else:
        raise Exception("This engine only runs on OSX & Windows.")

    # the adobe CEP install directory. This is where the extension is stored.
    return os.path.join(app_data, "Adobe", "CEP", "extensions")


def get_extension_install_directory():
    return os.path.join(get_adobe_cep_dir(), EXTENSION_NAME)


