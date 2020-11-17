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
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile


def zip_recursively(zip_file, root_dir, folder_name):
    for root, _, files in os.walk(root_dir / folder_name):
        for file in files:
            full_file_path = Path(os.path.join(root, file))
            zip_file.write(full_file_path, full_file_path.relative_to(root_dir))


with TemporaryDirectory() as temp_dir:
    temp_dir = Path(temp_dir)

    # Pip install everything and capture everything that was installed.
    subprocess.run(
        [
            "python2",
            "-m",
            "pip",
            "install",
            "-r",
            "requirements.txt",
            "--no-compile",
            # The combination of --target and --upgrade forces pip to install
            # all packages to the temporary directory, even if an already existing
            # version is installed
            "--target",
            temp_dir,
            "--upgrade",
        ]
    )
    subprocess.run(
        ["python2", "-m", "pip", "freeze", "--path", temp_dir],
        stdout=open("frozen_requirements.txt", "w"),
    )

    # Quickly compute the number of requirements we have.
    nb_dependencies = len([_ for _ in open("frozen_requirements.txt", "rt")])

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
    pkgsZip = ZipFile(Path(__file__).parent / "pkgs.zip", "w")
    # For every single package
    for package_name in package_names:
        print(f"Zipping {package_name}...")
        # If we have a .py file to zip, simple write it
        full_package_path = temp_dir / package_name
        if full_package_path.suffix == ".py":
            pkgsZip.write(full_package_path, full_package_path.relative_to(temp_dir))
        else:
            # Otherwise zip package folders recursively.
            zip_recursively(pkgsZip, temp_dir, package_name)
