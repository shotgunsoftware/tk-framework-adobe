.. _development:

Framework Development
==========================

This section covers how to make changes to as well as how to deploy the Adobe framework.

Setting up your dev environment
-------------------------------

To setup the development environment for this project, you will need to obtain the
`ZXPSignCmd <https://labs.adobe.com/downloads/extensionbuilder3.html>`_ tool provided
by Adobe. Once you have logged in using your existing Adobe user account,
download the **CC Extensions Signing Toolkit**, which will provide you with the necessary executables.

- If you are developing on a *Mac* please set all necessary variables in `dev/env.mk`.
- On *Windows* please fill all necessary variables in `dev\env.cmd`


Building and signing the extension
----------------------------------

Once set up, you can test and sign with the following targets:

.. note::
    Be sure to run all of the following commands from the top-level directory of this project.

- To install the CEP extension for testing without signing:

    .. code-block:: shell

        cd dev
        make test

- To sign the CEP extension:

    .. code-block:: shell

        cd dev
        make sign

- To create a certificate for use when signing the CEP extension:

    .. code-block:: shell

        cd dev
        make create_certificate

    .. note::
        In the case where the configured ``CERTIFICATE_FILE`` does not exist, the ``create_certificate``
        command will be automatically run as part of the process.


- To remove the latest signed zxp file:

    .. code-block:: shell

        cd dev
        make clean



