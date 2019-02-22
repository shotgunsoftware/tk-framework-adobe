import sys

try:
    from . import tk_framework_adobe
    from . import tk_framework_adobe_utils
except ImportError:
    pass


from tk_framework_adobe import adobe_bridge


if sys.platform == "win32":
    import tk_framework_adobe_utils.win_32_api


