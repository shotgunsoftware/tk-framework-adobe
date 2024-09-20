
rem set this to the target version you want to set this to
set "TARGET_VERSION=0.0.1"

rem set this to the core you are working with. eg:0.18.160
rem set "TKCORE_VERSION=0.18.160"
rem if you want to use tk-core from a non default bundle-cache location,
rem uncomment the following line and set your path accordingly.
set "TKCORE_FOLDER=C:\Users\chaucae\Documents\projects\tk-core"

set "ZXP_SIGN_TOOL=C:\Users\chaucae\Documents\projects\CEP-Resources\ZXPSignCMD\4.1.1\win64\ZXPSignCmd.exe"
set "PYTHON_EXE=python"

rem DO NOT COMMIT THE FOLLOWING LINES TO THE REPO
rem set this to your certificate file, that you created / will create
set "CERTIFICATE_FILE=C:\Users\chaucae\cert.p12"
rem set this to the password that you chose/want to chose for your certificate file
rem the following options are needed, when you want to create a new certificate
set "CERTIFICATE_PASS=zxcvbnm"
set "CERT_COUNTRY=Peru"
set "CERT_STATE=Arequipa"
set "CERT_ORG=Autodesk"
set "CERT_CN=Arequipa"

rem optional certificate fields (uncomment if desired)
set "CERT_LOCALITY="
set "CERT_ORG_UNIT="
set "CERT_EMAIL="
set "CERT_VALIDITY_DAYS="