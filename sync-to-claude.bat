@echo off
REM Sprint-Loop: Sync source files to .claude/ directory
REM Copies agents/, skills/ into .claude/ for workspace-level testing
REM Run this after editing source files to reflect changes

setlocal
set "ROOT=%~dp0"
set "DEST=%ROOT%.claude"

echo [sprint-loop] Syncing to .claude/ ...

REM agents
if exist "%DEST%\agents" rmdir /s /q "%DEST%\agents"
xcopy /s /i /q "%ROOT%agents" "%DEST%\agents"

REM skills
if exist "%DEST%\skills" rmdir /s /q "%DEST%\skills"
xcopy /s /i /q "%ROOT%skills" "%DEST%\skills"

REM hooks.json is already in .claude/ (edit it directly)

echo [sprint-loop] Done. Synced:
echo   agents\  -^> .claude\agents\
echo   skills\  -^> .claude\skills\
echo   hooks.json already in .claude\

endlocal
