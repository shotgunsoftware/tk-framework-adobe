#!/usr/bin/env python3
# Copyright (c) 2020 Shotgun Software Inc.
#
# CONFIDENTIAL AND PROPRIETARY
#
# This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
# Source Code License included in this distribution package. See LICENSE.
# By accessing, using, copying or modifying this work you indicate your
# agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
# not expressly granted therein are reserved by Shotgun Software Inc.

import subprocess
import os
import re
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile


def main():
    COMPONENT_EXCLUDE = {
        "charset_normalizer": [
            re.compile("md.*\\.(pyd|so)"),
        ],
    }

    PYTHON_VERSION = f"{sys.version_info.major}.{sys.version_info.minor}"

    with TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)

        # Make sure the requirements folder exists
        if not os.path.exists(f"requirements/{PYTHON_VERSION}/requirements.txt"):
            raise RuntimeError(f"Python {PYTHON_VERSION} requirements not found.")

        # Pip install everything and capture everything that was installed.
        print(f"Installing Python {PYTHON_VERSION} requirements...")
        subprocess.run(
            [
                "python",
                "-m",
                "pip",
                "install",
                "-r",
                f"requirements/{PYTHON_VERSION}/requirements.txt",
                "--no-compile",
                # The combination of --target and --upgrade forces pip to install
                # all packages to the temporary directory, even if an already existing
                # version is installed
                "--target",
                str(temp_dir),
                "--upgrade",
            ]
        )
        print("Writing out frozen requirements...")
        subprocess.run(
            ["python", "-m", "pip", "freeze", "--path", str(temp_dir)],
            stdout=open(f"requirements/{PYTHON_VERSION}/frozen_requirements.txt", "w"),
        )

        # Quickly compute the number of requirements we have.
        nb_dependencies = len(
            [
                _
                for _ in open(
                    f"requirements/{PYTHON_VERSION}/frozen_requirements.txt", "rt"
                )
            ]
        )

        # Figure out if those packages were installed as single file packages or folders.
        package_names = [
            package_name
            for package_name in os.listdir(temp_dir)
            if "info" not in package_name and package_name != "bin"
        ]

        # Make sure we found as many Python packages as there
        # are packages listed inside frozen_requirements.txt
        assert len(package_names) == nb_dependencies

        # Write out the zip file
        pkgsZip = ZipFile(
            Path(__file__).parent / "requirements" / PYTHON_VERSION / "pkgs.zip", "w"
        )
        # For every single package
        for package_name in package_names:
            print(f"Zipping {package_name}...")
            # If we have a .py file to zip, simple write it
            full_package_path = temp_dir / package_name
            if full_package_path.suffix == ".py":
                pkgsZip.write(
                    full_package_path, full_package_path.relative_to(temp_dir)
                )
            else:
                # Otherwise zip package folders recursively.
                zip_recursively(
                    pkgsZip,
                    temp_dir,
                    package_name,
                    excludes=COMPONENT_EXCLUDE.get(package_name),
                )


def zip_recursively(zip_file, root_dir, folder_name, excludes=None):
    for root, _, files in os.walk(root_dir / folder_name):
        for file in files:
            full_file_path = Path(os.path.join(root, file))
            if is_filename_excluded(file, excludes):
                continue

            zip_file.write(full_file_path, full_file_path.relative_to(root_dir))


def is_filename_excluded(filename, excludes):
    if not isinstance(excludes, list):
        return False

    for regex in excludes:
        if regex.match(filename):
            return True

    return False


if __name__ == "__main__":
    main()
