# Installing and updating scripts

You can install scripts other people have written, as well as writing your own.

::: warning Only install scripts you trust
A userscript can read and change everything on the sites it runs on, including what you type. Before installing, check who wrote it, read its reviews, and look at which sites and permissions it asks for (see the [checklist](#before-you-save) below).
:::

## From Greasy Fork

[Greasy Fork](https://greasyfork.org/) is the largest free collection of userscripts.

1. Find a script on greasyfork.org and click its **Install this script** button.
2. CodeTweak catches the install and opens the script in the editor instead of downloading it.
3. Review the code and the settings in the sidebar panels.
4. Save to install it. The script is switched on straight away, unless you've turned off **Enable scripts by default** in the [dashboard settings](/guide/dashboard#general).

Scripts installed this way update automatically (see below).

## From other websites

CodeTweak catches install links on greasyfork.org only. To install a script from another site:

1. Open the `.user.js` file in your browser and copy its contents.
2. Click **New Script** in the dashboard, paste the code over the template, and save.

Scripts pasted this way update automatically only if their metadata block includes `@updateURL` or `@downloadURL`.

## From a file

Drag `.js` or `.txt` userscript files onto the [dashboard](/guide/dashboard#import-scripts-from-files) to add them all at once.

## Before you save

- **`@match` and `@include`:** does it run only on the sites it needs? A script that runs on every site (`*://*/*`) deserves extra care.
- **`@grant`:** does it ask only for the APIs it needs? `GM_xmlhttpRequest` lets it send data to other servers.
- **`@connect`:** which servers can it contact? An empty list or `*` means any server.
- **`@require`:** does it load code from addresses you recognise, such as a well-known CDN?

## Automatic updates

Once a day, CodeTweak checks each installed script for a newer version, using its `@updateURL`, `@downloadURL`, or the Greasy Fork page it came from. A version is newer when its `@version` number is higher.

Most updates are applied without asking. An update waits for your review instead if:

- it asks for **more permissions**: new `@grant` APIs, new sites in `@match` or `@include`, or new servers in `@connect`; or
- you **edited the script yourself** since installing it, so applying the update would overwrite your changes.

### Reviewing an update

A script with an update waiting shows a circular-arrows button in the [dashboard](/guide/dashboard). Click it to see why the update is waiting and what it adds:

- **Added grants:** new GM APIs the script wants.
- **Added URL matches:** new pages the script wants to run on.
- **Expanded @connect:** new servers it wants to contact.

Then click **Apply update** or **Discard update**. Your current version is saved in the editor's [Version History](/guide/editor#version-history) before an update replaces it, so you can go back if something breaks.

## Turning a script off or removing it

- To pause a script, turn off its switch in the popup or dashboard.
- To remove it, click the trash can next to it in the dashboard. Its saved data and version history are deleted with it.
