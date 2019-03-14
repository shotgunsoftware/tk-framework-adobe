.. _contibuting:

Contributing
============

Setup development environment
-----------------------------

To setup the development environment for this project, you will need to obtain the *ZXPSignCmd* tool provided by Adobe, which can be found `here`_. Once you have logged in using your existing Adobe user account, download the *CC Extensions Signing Toolkit*, which will provide you with the necessary executable.

.. _here: https://labs.adobe.com/downloads/extensionbuilder3.html

If you are developing on a *Mac* please set all necessary variables in `dev/env.mk`.

On *Windows* please fill all necessary variables in `dev\env.cmd`

From now on you may test and sign with the following targets:

.. note::
    Be sure to run all of the following commands from the top-level directory of this project.

To install the CEP extension for testing without signing
........................................................

.. code-block:: shell

    cd dev
    make test

To sign the CEP extension
.........................

.. code-block:: shell

    cd dev
    make sign

To create a certificate for use when signing the CEP extension
..............................................................

.. code-block:: shell

    cd dev
    make create_certificate

.. note::
    In the case where the configured CERTIFICATE_FILE does not exist, the create_certificate command will be automatically run as part of the _sign_ target.


To remove the latest signed zxp file
....................................

.. code-block:: shell

    cd dev
    make clean

Notes on editing the env files (env.mk/env.cmd)
...............................................

Changes to the env files (env.mk and env.cmd) will typically not be tracked in git. The information contained in these files is specific to a particular development environment, so tracking changes to that data in git is undesirable.

If you need to make changes to these files, you can use the following commands::

    git update-index --no-skip-worktree dev/env.mk dev/env.cmd
    git add dev\env.*
    git commit -m "your message"
    git update-index --skip-worktree dev/env.mk dev/env.cmd

Please be aware that these files contain potentially-sensitive information, such as a certificate password. When making changes to these files and pushing them to a git repository, be sure that you've removed any data that might be considered confidential.


