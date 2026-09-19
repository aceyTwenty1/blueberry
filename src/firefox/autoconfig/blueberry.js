// Blueberry autoconfig — runs at Firefox startup (privileged)
// Place in $INSTALL_DIR/defaults/pref/autoconfig.js + blueberry.js
// Enables vertical tabs, hides horizontal tab bar, sets Blueberry homepage

pref("browser.tabs.drawInTitlebar", true);
pref("sidebar.verticalTabs", true);
pref("browser.tabs.firefox-view", false);
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("extensions.pocket.enabled", false);
pref("toolkit.legacyUserProfileCustomizations.stylesheets", true); // for userChrome.css vertical tabs
