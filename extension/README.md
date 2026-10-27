# HCC SOPs browser extension

A Chrome/Edge extension (Manifest V3) for HCC Production.

- **For this page:** the toolbar icon shows how many SOPs are about the site you're on, and the popup lists them. Link an SOP to sites under its ⋯ menu → *Owner, folder, tags & review* → **Web pages** (for example `studio.youtube.com/*`).
- **Search** SOPs from any tab.
- **Record a new SOP:** press *Start recording*, do the task in the page, then *Stop*. Each click becomes a numbered step with a screenshot marking where you clicked. Typing becomes "Type in …": what you typed is never recorded, and typing steps get no screenshot. Review and rename the steps, pick a folder, and *Create draft SOP* opens it in the editor. Nothing is published until you publish it. Use the editor's **Annotate image** to blur anything sensitive a screenshot caught.

## Install

1. In HCC Production, open your **Profile** and create an API key. Choose *Read and write SOPs* if you'll record.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose this `extension` folder.
3. Open the extension's **Settings**, enter your HCC address (e.g. `https://hcc.example.org`) and the key, then **Save and test**.

To give it to the team without Developer mode, zip this folder (`cd extension && zip -r ../hcc-sops-extension.zip .`) and publish it to the Chrome Web Store as an unlisted item, or install it through your Google Workspace or Microsoft Edge admin policy.

## Permissions

- *Read and change all your data on websites* (`<all_urls>`): needed to match the current page, record clicks, and take screenshots while recording. Apart from the page address used to find matching SOPs, nothing is read or sent unless you're recording or the popup is open.
- *Storage*: your settings, and the steps being recorded until you create the SOP or discard them. Kept on this computer only.
