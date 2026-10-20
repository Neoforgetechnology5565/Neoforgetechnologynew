// The side panel opens when the toolbar icon is clicked. Everything else runs in the side panel and the Fiverr page: no AI, no network calls.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
