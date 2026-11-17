# a1ry Dash

A small round launcher for [Torn](https://www.torn.com) that works at desktop width, in the mobile
layout and in TornPDA.

A grey martini-glass button floats over the page. Tap it and a vertical menu of shortcut buttons
opens: upwards when the martini is in the bottom half of the screen, downwards when it is in the
top half. If the screen is too short for one column, the rest go in a second column beside it.

- **Messages**: faction messages from the officers of Naughty Souls (this is not Torn's own
  mail). A red number on the martini and on Messages shows how many are new. Some messages ask
  questions (pick one, pick several, or write an answer): fill them in and press **Save**. You
  can change your answers until the message closes. A slim list at the top shows every
  message (closed envelope = new, open envelope = read, green arrow = answered), with the time left (e.g.
  `29h 5m`, ticking down each minute) on messages that have a deadline; tap one to open it below. The open
  message's row is highlighted. The martini flashes gold while a new message
  is waiting for your answers. Needs your API key in Settings.
  **Admins** also get an **Admin** button here: the open messages (with **Close now** and an
  **Open sheet** link to the sheet's Messages tab) and
  **Create message**: title, message, when it closes (1-168 hours, or no expiry), then
  optional questions one at a time (one choice, several choices or a written answer; options
  one per line), a final check, and **Confirm and send**. Messages get an ID like `1116_01`
  (TCT date and a number) and go to all members.
- **Going offline** (bed): the top shows your revive setting (from Torn, with your key): *off*
  or *friends and faction only*, or, if revives are on for everyone, a flashing link to the
  hospital page so you can change it before you go. Set how many hours you'll be away (1-12)
  and pick one request:
  **Request a bounty** ($100k-$1m), or **Request a merc hit**: regular ($3m) or Stricken
  ($3.5m). The request goes to the faction sheet (Offline tab, with the type of hit and a link
  to Torn's add-bounty page or your profile) for an officer to action. You can cancel it until
  they do. Your 5 latest requests are listed at the top with their status.

  **Admin** (only for player IDs on the sheet's Admins tab, who also get an **Open sheet** link
  to a read-only view of the Offline tab): every request not yet actioned, with an **Open
  sheet** link to the Offline tab in the editor.
  **Place bounty** opens Torn's add-bounty page for that player. **Place merc** shows the
  request it would send to the C39 mercs and a toggle to confirm (*testing: nothing is sent
  yet*). **Mark placed** records it as done (status "placed by" you); it's a separate step on
  purpose. Merc orders use a Public API key you save in the Admin panel itself, separate from
  the key in Settings; it is sent only to C39.
- **War** (crossed swords) and **Items** (box): tap one and two more bubbles pop out sideways from it,
  towards the middle of the screen.
  War: **Faction war** (flag) and **Chain** (chain). Items: **Items** (backpack) and **Faction
  armory** (locker). Tap the group again, or anything else, to fold them away. These are fixed.
- **Your shortcuts**: one button per link, showing its icon: up to 3 letters (the first
  letter of its name if you don't choose).
- **+**: add a shortcut. Tap a suggestion (Hospital, Gym), or give a name, an
  icon of up to 3 letters (e.g. `Itm`) and a URL: a full `https://` link, or a Torn path such as
  `/gym.php`. **Current page URL** fills in the page you're on.
- **Settings** (gear):
  - **Limited API key**: paste a Limited key and press **Save**. Save checks the key with Torn
    and says whether it works and what access level it has (it warns if it's below Limited). The
    *Create a Limited key* link opens Torn's new-key form already filled in. The key stays in
    your browser. For faction messages (explained under **Help**), it is sent once to the faction's a1ry Dash server
    (a Google Apps Script app), which asks Torn who you are and checks you're in the faction;
    the server doesn't keep the key. Your answers are saved in a faction Google Sheet with your
    name and player ID.
  - The button's size (75-200%), and whether shortcuts open in a new tab.
  - Your shortcuts, each with a **Remove** button.
  - **Reset position**, **Help** (how things work and what happens to your key), **Update** (opens the script's
    [Greasy Fork page](https://greasyfork.org/en/scripts/603980-a1ry-dash), where **Install**
    gets you the latest version), **Close**.

While the fan is open, the script's version shows in faint grey under the martini. To close
the fan, tap the martini again, tap anywhere else, or press Esc.

Drag the martini to move it. It remembers where you put it, relative to the nearest corner of the
screen, so it stays in place when the window is resized or the phone rotates.

Settings and shortcuts are saved in the browser (`localStorage`) and shared by every Torn tab.
Each browser or device has its own copy.

## Install

- **Desktop / mobile browser:** install a userscript manager (Tampermonkey, Violentmonkey,
  Userscripts on iOS Safari), then press **Install** on the script's
  [Greasy Fork page](https://greasyfork.org/en/scripts/603980-a1ry-dash).
- **TornPDA:** Settings → Userscripts → add a new script, and paste in the script from Greasy
  Fork, or point it at the script's URL.

To update later, open **Settings** in the fan and press **Update**.

## Status

Early work in progress (v0.14): the launcher, the fan, adding and removing shortcuts, the API key
in Settings, faction messages with answers, and the Update button.

The script asks your userscript manager for `GM_xmlhttpRequest` access to `script.google.com`
(the faction server). Torn's page blocks ordinary requests to it.
