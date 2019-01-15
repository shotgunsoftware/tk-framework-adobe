import sys
from . import environment_utils
try:
    from . import tk_adobe_basic
except ImportError:
    pass

if sys.platform == "win32":
    import win_32_api
