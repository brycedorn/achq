@echo off
rem Try a design in Minecraft in one go: write it, copy it into the HQ world, start the game,
rem place it, apply its atmosphere, and take a screenshot from the deck.
rem
rem   play                         snowy-chalet, latest version, at 40,64,40
rem   play --version 6             a particular version
rem   play --origin 600,64,40      somewhere else in the world
rem   play --no-launch             only write and copy the files
rem   play --no-shot               skip the screenshot
rem   play --save                  open a generated world save instead (your HQ world is set aside, not deleted)
rem   play --restore               put your HQ world back after --save
rem
rem Close Minecraft first: the anchors file is only read when the world loads.
call npm.cmd --prefix "%~dp0generator" run --silent play -- %*
