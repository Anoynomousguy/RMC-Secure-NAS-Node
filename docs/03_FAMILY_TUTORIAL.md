# 03 — Family Tutorial

A plain-language guide for everyone using the NAS. No server knowledge needed.

## What you have

A private family "cloud" for photos and files. It looks and works a lot like
Microsoft OneDrive, but it lives on a small computer at home. Nothing is
stored with a big cloud company.

You can use it two ways:

- **On a computer** — a website in your browser.
- **On a phone** — the NAS Photo Manager app (Android).

## Before you start: join the tailnet

The NAS is private. It is only reachable if your device is signed in to the
family **Tailscale** network (a free app that creates a private tunnel).

1. Install **Tailscale** from your device's app store.
2. Sign in with the family account (ask the administrator for the invitation).
3. Make sure the toggle says **Connected**.

Without Tailscale, the website simply will not load. This is normal — it is
how the NAS stays private.

## Using the website (computer)

1. Open your browser and go to: `https://YOUR_NAS_HOST:3000`
2. You will see a sign-in page. Enter your username and password.
3. The first screen looks like this:
   - **Left column** — Home, My Files, Recent, Shared, Recycle Bin.
   - **Top bar** — "Create or upload" on the right, plus Sort and the
     list/tiles view switcher.
   - **Middle** — your files, with Name, Modified, and Size columns.
4. Click a folder to open it. Use the breadcrumb at the top to go back.
5. **Upload files**: click **Create or upload → Upload files**, or drag files
   from your computer onto the page.
6. **Download a file**: click the **…** next to it and choose **Download**.
7. **Rename or delete**: click **…** and choose **Rename** or **Delete**.
   Deleted items ask for confirmation first.
8. **Select several items**: point at the left edge of the rows and tick the
   circles, or use the header checkbox to select everything.

## Using the phone app (Android)

1. Install the app your administrator provided (APK), or ask them to install
   it for you.
2. Open **Settings** (bottom bar) and check:
   - **WebDAV URL**: `https://YOUR_NAS_HOST:8443/dav`
   - **Username**: `admin`
   - **Password**: ask the administrator (it is not written in this guide).
3. Tap **Save**. The app tests the connection and shows a green message when
   it works.
4. **NAS Photos** tab — photos stored on the NAS. Tap one to open it full
   screen.
5. **Local Photos** tab — photos on your phone. Tap to select (a tick
   appears), choose several, then tap **Upload Selected**. They go to the
   `/uploads` folder on the NAS.
6. **Tutorial** and **Help** tabs contain a step-by-step walkthrough and
   answers to common problems.
7. **Settings** tab — change the URL, username, or password, and press Save
   again. Your password is stored only in your phone's secure storage.

## Where should I put my files?

- `user1/` and `user2/` are private folders. Only that person and the
  administrator can open them.
- `/uploads` is the shared drop-off folder used by the mobile app.
- Everyone has a 50 GB limit. The portal shows how much you have used
  (admins can see everyone's usage).

## Simple rules

- **Do not share your password.** The administrator can reset it for you.
- **Keep Tailscale connected** when using the NAS.
- **Deleted is not always gone**: check **Recycle Bin** in the portal before
  asking for help.
- **Big uploads**: photos and videos are fine, but a very large video may
  fail on a weak connection. Try again on Wi-Fi.
- **The NAS is only as safe as its passwords** — do not reuse your email or
  bank password here.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| The website does not open | Is Tailscale connected? Is the address exactly `https://YOUR_NAS_HOST:3000`? |
| "Wrong username or password" | Check caps-lock. Ask the administrator to reset it if needed. |
| The app says "Could not connect" | Open Settings, tap Save again to re-test. Make sure Tailscale is on. |
| Upload fails halfway | Check the 50 GB quota and your connection; retry with fewer photos. |
| I deleted something by mistake | Open **Recycle Bin** in the website (or ask the administrator to restore it). |
| A file opens in the wrong app | Download it first, then open it from your Downloads folder. |

If something is still broken, send the administrator a screenshot **without
passwords visible**.
