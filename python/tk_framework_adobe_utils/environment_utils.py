import os
import sys


# keeping the old name of the adobe extension to keep the
# upgrade path clean
EXTENSION_NAME = "com.sg.basic.ps"


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

