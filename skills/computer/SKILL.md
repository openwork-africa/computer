---
name: computer
description: Drive the person's Computer, a Firefox in a Linux VM on their Mac that stays signed in to their sites. Use it when asked to do something on a website as them (read their mail, check LinkedIn, fill a form), or to follow a task they recorded. Commands are `computer list`, `computer screenshot`, `computer click`, `computer type` and so on.
---

# Computer

Computer is a Firefox in a small Linux VM on the person's Mac, signed in to the sites they signed in to there. You
drive it with the `computer` command. The person can watch and take over at http://127.0.0.1:41800.
(Not installed? `curl -fsSL https://github.com/openwork-africa/computer/releases/latest/download/install.sh | sh`;
the person also needs Apple's `container`. See https://github.com/openwork-africa/computer.)

## Before you start

Run `computer list`. Each line is `<id>  <state>  <label>`, and you need one whose state is `running`.

- **None running, but one is `stopped`** (saved): `computer --id <id> resume` boots it with its sign-ins and tabs
  (about 10 s).
- **None at all**: `computer create` makes and boots a new one, then prints its id. It is signed in to nothing yet.
  Ask the person to sign in at http://127.0.0.1:41800.
- **Several running**: add `--id <id>` to every command.

The `computer` command works on its own; the page (for the person) needs `computer serve` running. If a command fails
with a `container` error, run `container system start` and try again.

## The loop: look, act, look

1. `computer screenshot /tmp/screen.png`, then look at the image. The screen is 1024x640, and pixels in the image
   are the coordinates to click. (You need to be able to view images. `computer title` and `computer url` give the
   page's title and address as text.)
2. Do one action:

   | | |
   |---|---|
   | `computer open URL` | Go to an address (`--new-tab` for a new tab) |
   | `computer click X Y` | Click (also `doubleclick`, `rightclick`, `move`) |
   | `computer type "TEXT"` | Type into what is focused; click the field first |
   | `computer key KEYS` | `enter`, `escape`, `tab`, `ctrl+l`, `pagedown`, `ctrl+shift+t`… |
   | `computer scroll down 3` | Wheel clicks where the mouse is (`up` too) |
   | `computer tabs` / `computer tab NAME` | List tabs (* = in front); bring one forward by title, address or index |
   | `computer clipboard` | Read the computer's clipboard (after `key ctrl+c`) |

3. Pages take a moment: wait 2–3 seconds after opening or clicking a link, then screenshot again. If the page
   still loads, wait and look again. Repeat.

`computer help` lists every command.

## Rules

- **Ask the person first** before typing a password, paying, sending or posting anything, accepting terms, or
  deleting anything. Read-only by default: look and report unless told to act.
- **Sign-ins are the person's job.** If a page asks you to sign in or for a code, stop and ask them to do it in the
  page.
- **Don't run `computer save` unless asked.** It shuts the computer down (sign-ins and tabs are kept, and `resume`
  brings it back).

## Recorded tasks

The person can record a task for you. Each one is a folder in `~/.openwork-computer/recordings/<name>/`.
`steps.md` has one line per step, and `NNNN.jpg` is the screen at each step. Follow the steps by what they name (link
text, field label, page address); the coordinates are where things were, and pages change. A
"Note from the person recording" says why: follow it. `•••` marks a password they typed, so stop and ask.
