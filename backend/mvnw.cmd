@REM ----------------------------------------------------------------------------
@REM Maven Wrapper startup batch script for Windows
@REM ----------------------------------------------------------------------------

@if "%DEBUG%" == "" @echo off
@classworlds.conf.path=%~dp0.mvn\wrapper\maven-wrapper.properties

set ERROR_CODE=0
set MAVEN_PROJECTBASEDIR=%~dp0

if NOT "%JAVA_HOME%" == "" goto OkJHome
echo.
echo ERROR: JAVA_HOME not found in your environment.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
echo.
goto error

:OkJHome
if exist "%JAVA_HOME%\bin\java.exe" goto init

echo.
echo ERROR: JAVA_HOME is set to an invalid directory.
echo JAVA_HOME = "%JAVA_HOME%"
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
echo.
goto error

:init
set MAVEN_CMD_LINE_ARGS=%*

@REM Execute Maven using Java directly or Maven Wrapper
"%JAVA_HOME%\bin\java.exe" -Dmaven.multiModuleProjectDirectory="%MAVEN_PROJECTBASEDIR%" -jar "%~dp0.mvn\wrapper\maven-wrapper.jar" %*
if ERRORLEVEL 1 goto error
goto end

:error
set ERROR_CODE=1

:end
@endlocal & exit /b %ERROR_CODE%
