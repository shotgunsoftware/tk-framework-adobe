include env.mk

PLUGIN_NAME=com.sg.basic.adobe
BUNDLE_CACHE_FOLDER=~/Library/Caches/Shotgun/bundle_cache/app_store/tk-core
ADOBE_CEP_FOLDER=~/Library/Application\ Support/Adobe/CEP/extensions

ifndef TKCORE_FOLDER
TKCORE_FOLDER=${BUNDLE_CACHE_FOLDER}/v${TKCORE_VERSION}
endif

ifndef CERT_LOCALITY
	CERT_LOCALITY:=
else
	CERT_LOCALITY:=-locality ${CERT_LOCALITY}
endif

ifndef CERT_ORG_UNIT
	CERT_ORG_UNIT:=
else
	CERT_ORG_UNIT:=-orgUnit ${CERT_ORG_UNIT}
endif

ifndef CERT_EMAIL
	CERT_EMAIL:=
else
	CERT_EMAIL:=-email ${CERT_EMAIL}
endif

ifndef CERT_VALIDITY_DAYS
	CERT_VALIDITY_DAYS:=
else
	CERT_VALIDITY_DAYS:=-validityDays ${CERT_VALIDITY_DAYS}
endif


${CERTIFICATE_FILE}:
	@"${ZXP_SIGN_TOOL}" -selfSignedCert "${CERT_COUNTRY}" "${CERT_STATE}" "${CERT_ORG}" "${CERT_CN}" "${CERTIFICATE_PASS}" "${CERTIFICATE_FILE}" ${CERT_LOCALITY} ${CERT_ORG_UNIT} ${CERT_EMAIL} ${CERT_VALIDITY_DAYS}

${TKCORE_FOLDER}:
	$(error The tk-core version given "${TKCORE_VERSION}" does not exist in disk. Please choose a version existing in the folder: "${BUNDLE_CACHE_FOLDER}")

${ADOBE_CEP_FOLDER}:
	@mkdir "$@"

../${PLUGIN_NAME}.zxp: ${CERTIFICATE_FILE} ${TKCORE_FOLDER}
	"${PYTHON_EXE}" "./build_extension.py" -c "${TKCORE_FOLDER}" -p basic -e "${PLUGIN_NAME}" -s  "${ZXP_SIGN_TOOL}" "${CERTIFICATE_FILE}" "${CERTIFICATE_PASS}" -v "v${TARGET_VERSION}"

create_certificate: ${CERTIFICATE_FILE}

clean:
	rm ../${PLUGIN_NAME}.zxp

sign: ../${PLUGIN_NAME}.zxp create_certificate


test: ${ADOBE_CEP_FOLDER}
	@"${PYTHON_EXE}" "./build_extension.py" -c "${TKCORE_FOLDER}" -p basic -e "${PLUGIN_NAME}" -o  "${ADOBE_CEP_FOLDER}"
