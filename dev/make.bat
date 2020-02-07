@echo off
rem ------------------------------------------
rem this file exposes 4 commands
rem     clean - deletes the zxp file generated
rem     create_certificate - creates a new certificate using the configured ZXP_SIGN_TOOL
rem     sign - signs the cep extension using the configured ZXP_SIGN_TOOL and the CERTIFICATE_FILE
rem     test - installs the current cep without signing it
rem ------------------------------------------

call "env.cmd"

set "PLUGIN_NAME=com.sg.basic.adobe"
set "BUNDLE_CACHE_FOLDER=%APPDATA%\Shotgun\bundle_cache\app_store\tk-core"
set "ADOBE_CEP_FOLDER=%APPDATA%\Adobe\CEP\extensions"
set "ZXP_FILE=%~dp1\..\%PLUGIN_NAME%.zxp"
set "TKCORE_FOLDER_DEFAULT=%BUNDLE_CACHE_FOLDER%\v%TKCORE_VERSION%"

if "%TKCORE_FOLDER%"=="" (set "TKCORE_FOLDER=%TKCORE_FOLDER_DEFAULT%") else (echo using tk-core-folder: %TKCORE_FOLDER%)
if "%CERT_LOCALITY%"=="" (set CERT_LOCALITY=) else (set "CERT_LOCALITY=-locality "%CERT_LOCALITY%" ")
if "%CERT_ORG_UNIT%"=="" (set CERT_ORG_UNIT=) else (set "CERT_ORG_UNIT=-orgUnit "%CERT_ORG_UNIT%" ")
if "%CERT_EMAIL%"=="" (set CERT_EMAIL=) else (set "CERT_EMAIL=-email "%CERT_EMAIL%" ")
if "%CERT_VALIDITY_DAYS%"=="" (set CERT_VALIDITY_DAYS=) else (set "CERT_VALIDITY_DAYS=-validityDays "%CERT_VALIDITY_DAYS%" ")

rem check the tk-core version
if not exist "%TKCORE_FOLDER%" (goto :missing_tk_core)

set "JUMP_TO="

set "CHECKED_CERT="
set "CHECKED_ZXP="

rem check the incoming command
if "%1"=="clean" (goto :clean) else (
if "%1"=="create_certificate" (goto :create_certificate) else (
if "%1"=="sign" (goto :sign) else (
if "%1"=="test" (goto :test) else (
echo "The target %1 is not valid. Please chose one of: clean, create_certificate, sign, test"
goto :eof
))))

goto :end

rem -------------TARGETS------------------

:create_certificate
echo create_certificate
"%ZXP_SIGN_TOOL%" -selfSignedCert "%CERT_COUNTRY%" "%CERT_STATE%" "%CERT_ORG%" "%CERT_CN%" "%CERTIFICATE_PASS%" "%CERTIFICATE_FILE%" %CERT_LOCALITY% %CERT_ORG_UNIT% %CERT_EMAIL% %CERT_VALIDITY_DAYS%
goto :jumpto

:clean
echo clean
del "%ZXP_FILE%"
goto :jumpto

:sign
echo sign
if not "%CHECKED_CERT%"=="1" (
    if not exist "%CERTIFICATE_FILE%" (
        set "CHECKED_CERT=1"
        set "JUMP_TO=:sign"
        goto :create_certificate
    )
)
if not "%CHECKED_ZXP%"=="1" (
    if exist "%~dp1/../%PLUGIN_NAME%.zxp" (
        set "CHECKED_ZXP=1"
        set "JUMP_TO=:sign"
        goto :clean
    )
)
"%PYTHON_EXE%" "%~dp1\build_extension.py" -c "%TKCORE_FOLDER%" -p basic -e "%PLUGIN_NAME%" -s  "%ZXP_SIGN_TOOL%" "%CERTIFICATE_FILE%" "%CERTIFICATE_PASS%" -v v"%TARGET_VERSION%"
goto :jumpto

:test
echo test
if not exist "%ADOBE_CEP_FOLDER%" (
    mkdir "%ADOBE_CEP_FOLDER%"
)
"%PYTHON_EXE%" "%~dp1\build_extension.py" -c "%TKCORE_FOLDER%" -p basic -e "%PLUGIN_NAME%" -o  "%ADOBE_CEP_FOLDER%"
goto :jumpto

rem -------------HELPER JUMPMARKS------------------

:jumpto
if "%JUMP_TO%"=="" (goto :eof)
set "TMP_JMP=%JUMP_TO%"
set "JUMP_TO="
goto %TMP_JMP%

:missing_tk_core
echo "The tk-core version given '%TKCORE_VERSION%' does not exist in disk. Please choose a version existing in the folder: '%BUNDLE_CACHE_FOLDER%'"
goto :eof
