[![Python 2.6 2.7 3.7](https://img.shields.io/badge/python-2.6%20%7C%202.7%20%7C%203.7-blue.svg)](https://www.python.org/)
[![Build Status](https://dev.azure.com/shotgun-ecosystem/Toolkit/_apis/build/status/Frameworks/tk-framework-adobe?branchName=master)](https://dev.azure.com/shotgun-ecosystem/Toolkit/_build/latest?definitionId=62&branchName=master)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)
[![Linting](https://img.shields.io/badge/PEP8%20by-Hound%20CI-a873d1.svg)](https://houndci.com)


# tk-framework-adobe

A framework for Adobe engines


## Development

### How to set up your development environment

- To setup the development environment for this project, you will need to obtain the [**ZXPSignCmd**](https://labs.adobe.com/downloads/extensionbuilder3.html) tool provided by Adobe.
- Once you have logged in using your existing Adobe user account, download the **CC Extensions Signing Toolkit**, which will provide you with the necessary executable.
- If you are developing on a **Mac**, please set all necessary variables in `dev/env.mk`.
- If you are developing on **Windows**, please set all necessary variables in `dev\env.cmd`


### To install the CEP extension for testing without signing:

```
cd path/to/tk-adobe-framework
cd dev
make test
```

### To sign the CEP extension

```
cd path/to/tk-adobe-framework
cd dev
make sign
```


### To create a certificate for use when signing the CEP extension

```
cd path/to/tk-adobe-framework
cd dev
make create_certificate
```

**Note:** In the case where the configured `CERTIFICATE_FILE` does not exist, the create_certificate command will be automatically run as part of the _sign_ target.


### To remove the latest signed zxp file

```
cd path/to/tk-adobe-framework
cd dev
make clean
```

### Notes on editing the env files (`env.mk` and `env.cmd`)

Changes to the env files (`env.mk` and `env.cmd`) will typically not be tracked in git. The information contained in these files is specific to a particular development environment, so tracking changes to that data in git is undesirable.

If you need to make changes to these files, you can use the following commands:

```
git update-index --no-skip-worktree dev/env.mk dev/env.cmd
git add dev\env.*
git commit -m "your message"
git update-index --skip-worktree dev/env.mk dev/env.cmd
```

Please be aware that these files contain potentially-sensitive information, such as a certificate password. When making changes to these files and pushing them to a git repository, be sure that you've removed any data that might be considered confidential.
