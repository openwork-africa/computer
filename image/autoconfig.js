// Firefox reads this from defaults/pref/ and runs openwork.cfg at startup with Firefox's own rights (not sandboxed):
// that is how the recorder add-on, which is not signed by Mozilla, is loaded. Both files are in the image, owned by
// root; nothing in the profile can change them.
pref("general.config.filename", "openwork.cfg");
pref("general.config.obscure_value", 0);
pref("general.config.sandbox_enabled", false);
