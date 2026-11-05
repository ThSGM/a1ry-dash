# a1ry Dash

A small round launcher for [Torn](https://www.torn.com) that works at desktop width, in the mobile
layout and in TornPDA.

A grey martini-glass button floats over the page. Tap it and a fan of shortcut buttons opens
towards the middle of the screen:

- **Messages**: opens your inbox.
- **Wars**: opens your faction's war page.
- **Your shortcuts**: one button per link you added, showing the first letter of its name.
- **+**: add a shortcut. Give it a name and a URL: a full `https://` link, or a Torn path such as
  `/gym.php`. Tick **Use this page** to add the page you're on.
- **Settings** (gear):
  - **Limited API key**: paste a Limited key and press **Save**. Save checks the key with Torn
    and says whether it works and what access level it has (it warns if it's below Limited). The
    *Create a Limited key* link opens Torn's new-key form already filled in. The key stays in
    your browser.
  - The button's size (75-200%), and whether shortcuts open in a new tab.
  - Your shortcuts, each with a **Remove** button.
  - **Reset position**, **Update** (opens the install page for the latest version), **Close**.

To close the fan, tap the martini again, tap anywhere else, or press Esc.

Drag the martini to move it. It remembers where you put it, relative to the nearest corner of the
screen, so it stays in place when the window is resized or the phone rotates.

Settings and shortcuts are saved in the browser (`localStorage`) and shared by every Torn tab.
Each browser or device has its own copy.

## Install

- **Desktop / mobile browser:** install a userscript manager (Tampermonkey, Violentmonkey,
  Userscripts on iOS Safari), then open `a1ry-dash.user.js` and install it.
- **TornPDA:** Settings → Userscripts → add a new script, and paste in the contents of
  `a1ry-dash.user.js`, or point it at the script's URL.

## Status

Early work in progress (v0.3): the launcher, the fan, adding and removing shortcuts, and the
API key in Settings (nothing uses the key yet). The Update button is greyed out until the script
has an install page.
