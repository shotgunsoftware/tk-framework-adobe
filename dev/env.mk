
# set this to the target version you want to set this to
TARGET_VERSION=9.0.0

# set this to the core you are working with. eg:0.18.160
# TKCORE_VERSION=0.18.160
# if you want to use tk-core from a non default bundle-cache location,
# uncomment the following line and set your path accordingly.
TKCORE_FOLDER=/Users/beelanj/git/tk-core

ZXP_SIGN_TOOL=/Users/beelanj/bin/ZXPSignCmd
PYTHON_EXE=python

# DO NOT COMMIT THE FOLLOWING LINES TO THE REPO
# set this to your certificate file, that you created / will create
CERTIFICATE_FILE=/Users/beelanj/bin/test2.p12
# set this to the password that you chose/want to chose for your certificate file
# the following options are needed, when you want to create a new certificate
CERTIFICATE_PASS=123456
CERT_COUNTRY=US
CERT_STATE=WA
CERT_ORG=Autodesk
CERT_CN=SGTK

# optional certificate fields (uncomment if desired)
# CERT_LOCALITY:=
# CERT_ORG_UNIT:=
# CERT_EMAIL:=
# CERT_VALIDITY_DAYS:=
