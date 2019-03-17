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

try:
    from . import tk_framework_adobe
    from . import tk_framework_adobe_utils
except ImportError:
    pass


from tk_framework_adobe import adobe_bridge


if sys.platform == "win32":
    import tk_framework_adobe_utils.win_32_api


