# SillyTavern desktop app (Windows .exe)

Gives SillyTavern its own window, with no browser tab. It starts the local server for you and stops it when you close the window.

Needs Node.js installed (nodejs.org) and `npm install` already run once in the main SillyTavern folder.

## Build the exe (once)

From the main SillyTavern folder:

    cd desktop
    npm install
    npm run build

The app appears at `desktop\dist\SillyTavern-win32-x64\SillyTavern.exe`.
Right-click it, choose "Send to > Desktop (create shortcut)", and launch it from there.

## Notes

- Keep the exe where it was built, inside your SillyTavern folder. It looks for `server.js` in the folders above it.
- To try it without building: `npm start` inside `desktop`.
- After `git pull` you do not need to rebuild. The exe always runs the current SillyTavern files.
- Your chats and characters still live in the main folder's `data` directory.
