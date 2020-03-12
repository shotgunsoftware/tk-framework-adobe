import sys

try:
    from . import tk_framework_adobe
    from . import tk_framework_adobe_utils
except ImportError:
    pass


from .tk_framework_adobe import adobe_bridge

from sgtk import util


if util.is_windows():
    from .tk_framework_adobe_utils import win_32_api
