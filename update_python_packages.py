#!/usr/bin/env python3

import subprocess
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile


def zip_recursively(zip_file, root_dir, folder_name):
    for root, dirs, files in os.walk(root_dir / folder_name):
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
            "--target",
            temp_dir,
            "--no-compile",
            "--upgrade",
        ]
    )
    subprocess.run(
        ["python2", "-m", "pip", "freeze", "--path", temp_dir],
        stdout=open("frozen_requirements.txt", "w"),
    )

    # Figure out if those modules were installed as single file modules or folders.
    module_names = [
        module
        for module in os.listdir(temp_dir)
        if "info" not in module and module != "bin"
    ]

    # Write out the zip file
    pkgsZip = ZipFile(Path(__file__).parent / "pkgs.zip", "w")
    # For every single module
    for module_name in module_names:
        print(f"Zipping {module_name}...")
        # If we have a .py file to zip, simple write it
        full_module_path = temp_dir / module_name
        if full_module_path.suffix == ".py":
            pkgsZip.write(full_module_path, full_module_path.relative_to(temp_dir))
        else:
            # Otherwise zip folders recursively.
            zip_recursively(pkgsZip, temp_dir, module_name)
