"""
Utilities for installing the CEP extension in case this is out of date
"""
import os
import traceback
import shutil
import tempfile
import contextlib
import zipfile


import sgtk
from sgtk.util.filesystem import (
    backup_folder,
    ensure_folder_exists,
    move_folder,
)

from . import environment_utils


def ensure_extension_up_to_date(logger):
    """
    Carry out the necessary operations needed in order for the
    Adobe extension to be recognized.

    This inlcudes copying the extension from the engine location
    to a OS-specific location.
    """

    # the basic plugin needs to be installed in order to launch the Adobe
    # engine. we need to make sure the plugin is installed and up-to-date.
    # will only run if SHOTGUN_ADOBE_DISABLE_AUTO_INSTALL is not set.
    if "SHOTGUN_ADOBE_DISABLE_AUTO_INSTALL" not in os.environ:
        logger.debug("Ensuring Adobe extension is up-to-date...")
        try:
            __ensure_extension_up_to_date(logger)
        except Exception:
            exc = traceback.format_exc()
            raise sgtk.TankError(
                "There was a problem ensuring the Adobe integration extension "
                "was up-to-date with your toolkit engine. If this is a "
                "recurring issue please contact us via %s. "
                "The specific error message encountered was:\n'%s'."
                % (sgtk.support_url, exc,)
            )


def __ensure_extension_up_to_date(logger):
    """
    Ensure the basic Adobe extension is installed in the OS-specific location
    and that it matches the extension bundled with the installed engine.
    """
    extension_name = environment_utils.EXTENSION_NAME

    # the Adobe CEP install directory. This is where the extension is stored.
    adobe_cep_dir = environment_utils.get_adobe_cep_dir()
    logger.debug("Adobe CEP extension dir: %s" % (adobe_cep_dir,))

    installed_ext_dir = environment_utils.get_extension_install_directory()

    # make sure the directory exists. create it if not.
    if not os.path.exists(adobe_cep_dir):
        logger.debug("Extension folder does not exist. Creating it.")
        ensure_folder_exists(adobe_cep_dir)

    # get the path to the installed engine's .zxp file.
    bundled_ext_path = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            os.path.pardir,
            os.path.pardir,
            "%s.zxp" % (extension_name,),
        )
    )

    if not os.path.exists(bundled_ext_path):
        raise sgtk.TankError(
            "Could not find bundled extension. Expected: '%s'" % (bundled_ext_path,)
        )

    # now get the version of the bundled extension
    version_file = "%s.version" % (extension_name,)

    bundled_version_file_path = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__), os.path.pardir, os.path.pardir, version_file
        )
    )

    if not os.path.exists(bundled_version_file_path):
        raise sgtk.TankError(
            "Could not find bundled version file. Expected: '%s'"
            % (bundled_version_file_path,)
        )

    # get the bundled version from the version file
    with open(bundled_version_file_path, "r") as bundled_version_file:
        bundled_version = bundled_version_file.read().strip()

    # check to see if the extension is installed in the CEP extensions directory
    # if not installed, install it
    if not os.path.exists(installed_ext_dir):
        logger.debug("Extension not installed. Installing it!")
        __install_extension(bundled_ext_path, installed_ext_dir, logger)
        return

    # ---- already installed, check for udpate

    logger.debug("Bundled extension's version is: %s" % (bundled_version,))

    # get the version from the installed extension's build_version.txt file
    installed_version_file_path = os.path.join(installed_ext_dir, version_file)

    logger.debug(
        "The installed version file path is: %s" % (installed_version_file_path,)
    )

    if not os.path.exists(installed_version_file_path):
        logger.debug(
            "Could not find installed version file '%s'. Reinstalling"
            % (installed_version_file_path,)
        )
        __install_extension(bundled_ext_path, installed_ext_dir, logger)
        return

    # the version of the installed extension
    installed_version = None

    # get the installed version from the installed version info file
    with open(installed_version_file_path, "r") as installed_version_file:
        logger.debug("Extracting the version from the installed extension.")
        installed_version = installed_version_file.read().strip()

    if installed_version is None:
        logger.debug(
            "Could not determine version for the installed extension. Reinstalling"
        )
        __install_extension(bundled_ext_path, installed_ext_dir, logger)
        return

    logger.debug("Installed extension's version is: %s" % (installed_version,))

    from sgtk.util.version import is_version_older

    if bundled_version != "dev" and installed_version != "dev":
        if bundled_version == installed_version or is_version_older(
            bundled_version, installed_version
        ):

            # the bundled version is the same or older. or it is a 'dev' build
            # which means always install that one.
            logger.debug(
                "Installed extension is equal to or newer than the bundled "
                "build. Nothing to do!"
            )
            return

    # ---- extension in engine is newer. update!

    if bundled_version == "dev":
        logger.debug("Installing the bundled 'dev' version of the extension.")
    else:
        logger.debug(
            (
                "Bundled extension build is newer than the installed extension "
                "build! Updating..."
            )
        )

    # install the bundled .zxp file
    __install_extension(bundled_ext_path, installed_ext_dir, logger)


def __install_extension(ext_path, dest_dir, logger):
    """
    Installs the supplied extension path by unzipping it directly into the
    supplied destination directory.

    :param ext_path: The path to the .zxp extension.
    :param dest_dir: The CEP extension's destination
    :return:
    """

    # move the installed extension to the backup directory
    if os.path.exists(dest_dir):
        backup_ext_dir = tempfile.mkdtemp()
        logger.debug("Backing up the installed extension to: %s" % (backup_ext_dir,))
        try:
            backup_folder(dest_dir, backup_ext_dir)
        except Exception:
            shutil.rmtree(backup_ext_dir)
            raise sgtk.TankError("Unable to create backup during extension update.")

        # now remove the installed extension
        logger.debug("Removing the installed extension directory...")
        try:
            shutil.rmtree(dest_dir)
        except Exception:
            # try to restore the backup
            move_folder(backup_ext_dir, dest_dir)
            raise sgtk.TankError("Unable to remove the old extension during update.")

    logger.debug("Installing bundled extension: '%s' to '%s'" % (ext_path, dest_dir))

    # make sure the bundled extension exists
    if not os.path.exists(ext_path):
        # retrieve backup before aborting install
        move_folder(backup_ext_dir, dest_dir)
        raise sgtk.TankError(
            "Expected CEP extension does not exist. Looking for %s" % (ext_path,)
        )

    # extract the .zxp file into the destination dir
    with contextlib.closing(zipfile.ZipFile(ext_path, "r")) as ext_zxp:
        ext_zxp.extractall(dest_dir)

    # if we're here, the install was successful. remove the backup
    try:
        logger.debug("Install success. Removing the backed up extension.")
        shutil.rmtree(backup_ext_dir)
    except Exception:
        # can't remove temp dir. no biggie.
        pass
