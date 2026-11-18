---
title: Display Panel
description: See the artifacts, files, and Ptah UI blocks that the agent sends to the Display panel, and open the panel in a separate window.
sidebar:
  order: 10
---

# Display Panel

The **Display** panel shows the visual output that the agent sends during a session. It opens in a separate Display window by default. Each session has its own Display items.

## What the panel shows

The panel can show these items:

- **Artifacts**: a self-contained visual page, for example a dashboard, a report, or a prototype. An artifact cannot use the network.
- **Files**: a Markdown file, an image, or a PDF file.
- **Ptah UI blocks**: short visual summaries that the agent writes in its message.

When the panel has no items, it shows **Nothing to show yet**.

## Open the panel

The Display window opens when the agent sends Display items. Automatic updates refresh it without taking focus.

Click a display chip in the transcript to select its item and focus the window. Select other items in the tab strip. Use the **Left Arrow** and **Right Arrow** keys to move between items.

A dot on an item tab tells you that the item is new.

## Keep the current view

When the agent sends a new or updated item, the panel can change to that item. To stop this, click **Keep current view**. New or updated items then do not change the selected item or scroll the panel. Click **Keep current view** again to turn it off.

## Artifacts in the transcript

Each artifact also shows as a card in the transcript. The card shows the title and the time that the agent made it.

- Click **Open** to select the artifact in the Display panel.
- Click **Full screen** to show the artifact in the full-screen viewer.

## Ptah UI blocks in the transcript

A Ptah UI block that the agent sends to the panel has a chip in the transcript. The chip shows the state of the block:

| State                    | Meaning                                                    |
| ------------------------ | ---------------------------------------------------------- |
| **Pending display**      | The block is not in the panel yet.                         |
| **In display**           | The block is in the panel.                                 |
| **Updated later**        | A newer version of the block is in the panel.              |
| **No longer in display** | The block left the panel.                                  |
| **Not in display**       | The block is not valid, so the panel cannot show it.       |

Click **Open in display** to select the block in the panel. For an updated block, click **Open latest**.

## The Display window

Displays open in a separate **PtahCode - Display** window by default. Automatic updates refresh it without taking focus. Click a display chip to bring it to the front.

**Keep current view** and **Close** are in that window. Closing it stops automatic reopen for the rest of the current turn. A new turn or session can open it again.

The Display window closes when the main window closes. PtahCode remembers its size and position.

## Next steps

- [Sending messages](/chat/sending-messages/)
- [Composer and turn summary](/chat/composer-and-turn-summary/)
- [Orchestra Canvas](/canvas/)
