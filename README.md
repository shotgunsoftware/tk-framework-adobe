# tk-framework-adobe

A framework for Adobe engines


# Contributing

## Setup development environment

To setup the development environment for this project, you need to have the ZXPSignCmd tool from Adobe in order to sign the extension before release.

To setup the development environment for this project, you will need to obtain the _**ZXPSignCmd**_ tool provided by Adobe, which can be found [here](https://labs.adobe.com/downloads/extensionbuilder3.html). Once you have logged in using your existing Adobe user account, download the _**CC Extensions Signing Toolkit**_, which will provide you with the necessary executable

If you are developing on a ***Mac*** please set all necessary variables in `dev/env.mk`.

On ***Windows*** please fill all necessary variables in `dev\env.cmd`

From now on you may test and sign with the following targets:

---
***Note***
Be sure to run all of the following commands from the top-level directory of this project.
---


### To install the cep-extension for testing without signing:
```
cd dev
make test
```

### To sign the CEP extension
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


### To remove the latest signed zxp file
```
cd dev
make clean
```

### Notes on editing the env file (env.mk/env.cmd)

Changes to the env files (env.mk/env.cmd) will not be tracked in git, because they were configured to be skipped using `git update-index --skip-worktree`.
This is because changes done to these files will most likely be specific to your development environment and not apply to any others environment.

If you need to change these files - because you added a feature to the build process or something else - you can follow the following commands:

```
git update-index --no-skip-worktree dev/env.mk dev/env.cmd
git add dev\env.*
git commit -m "your message"
git update-index --skip-worktree dev/env.mk dev/env.cmd
```

Please make sure, that when doing so you don't accidentally commit environment specific values like the certificate file path or even your certificate password.


