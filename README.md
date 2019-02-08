# tk-framework-adobe

A framework for adobe engines


# Contributing

## Setup development environment

To setup the development environment for this project, you need to have the ZXPSignCmd tool from adobe in order to sign the extension before release.

To get the signing tool, please go to https://labs.adobe.com/downloads/extensionbuilder3.html (you need to be logged into your adobe-account) and download the ***CC Extensions Signing Toolkit***. This will contain an executable called: ***ZXPSignCmd***

If you are developing on a ***Mac*** please set all neccessary variables in `dev/env.mk`.

On ***Windows*** please fill all neccessary variables in `dev\env.cmd`

From now on you may test and sign with the following targets:

---
***Note***
When using the following commands, make sure you are cd'ed into the base folder of this project.
---


### To install the cep-extension for testing without signing:
```
cd dev
make test
```

### To sign the cep-extension
```
cd dev
make sign
```


### To create a certificate in for signing the cep-extension
```
cd dev
make create_certificate
```

---
***Note***
In case the configured CERTIFICATE_FILE is not existing this command will
automatically be evaluated if using the *sign* target.
---


### To create remove the latest signed zxp file
```
cd dev
make clean
```

### Notes on editing the env-file (env.sh/env.cmd)

Please be aware, that you should not commit any changes to the repo. Especially not the certificate password.


