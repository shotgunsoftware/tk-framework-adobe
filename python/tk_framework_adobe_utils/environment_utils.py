import os

from sgtk import util

EXTENSION_NAME = "com.sg.basic.adobe"


def get_adobe_cep_dir():

    # the CEP install directory is OS-specific
    if util.is_windows():
        app_data = os.getenv("APPDATA")
    elif util.is_macos():
        app_data = os.path.expanduser("~/Library/Application Support")
    else:
        raise Exception("This engine only runs on OSX & Windows.")

    # the adobe CEP install directory. This is where the extension is stored.
    return os.path.join(app_data, "Adobe", "CEP", "extensions")


def get_extension_install_directory():
    return os.path.join(get_adobe_cep_dir(), EXTENSION_NAME)
