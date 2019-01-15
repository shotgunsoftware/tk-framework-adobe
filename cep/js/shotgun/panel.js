// Copyright (c) 2016 Shotgun Software Inc.
//
// CONFIDENTIAL AND PROPRIETARY
//
// This work is provided "AS IS" and subject to the Shotgun Pipeline Toolkit
// Source Code License included in this distribution package. See LICENSE.
// By accessing, using, copying or modifying this work you indicate your
// agreement to the Shotgun Pipeline Toolkit Source Code License. All rights
// not expressly granted therein are reserved by Shotgun Software Inc.

"use strict";

// namespace. not to be confused with the Shotgun Panel app.
var sg_panel = sg_panel || {};

// ---------------------------------------------------------------------------
// The panel

// A singleton "class" to manage the state of the extension's panel display.
sg_panel.Panel = new function() {

    // ---- private vars

    // adobe interface
    const _cs_interface = new CSInterface();

    // keep track of timeout ids for showing and hiding tooltips. these will be
    // used over and over during session.
    var _show_tooltip_timeout_id = undefined;
    var _hide_tooltip_timeout_id = undefined;

    // we keep track of mouse position to make tooltips easier to manage
    var _cur_mouse_pos = {
        x: undefined,
        y: undefined
    };

    // when context menu items are triggered this will be our lookup to know
    // what we need to do
    var _context_menu_lookup = {};

    // tells us whether the thumbnail data has already been retrieved for the
    // current context.
    var _context_thumbnail_data = undefined;

    var _previous_log_level = "debug";

    var _log_file_path = undefined;

    // ---- public methods

    this.clear = function() {
        // clears any state for the current context.

        _context_thumbnail_data = undefined;
        _build_flyout_menu([]);
        _clear_messages();
    };

    // Clears the panel's contents and resets it to the loading state.
    this.set_panel_loading_state = function() {

        this.clear();

        _set_bg_color("#222222");

        _show_header(false);
        _set_contents(
            "<img id='loading_img' src='../images/sg_logo_with_text.png'>");

        _show_info(true);
        _set_info(
            "Loading Shotgun Integration..."
        );
    };

    // Clears the panel's contents and displays a message that it is disabled
    this.set_unknown_context_state = function() {

        this.clear();

        _set_bg_color("#222222");

        _show_header(false);
        _clear_messages();

        var app_name = _cs_interface.getHostEnvironment().appName;
        const app_display_name = sg_constants.product_info[app_name].display_name;

        _set_contents(
            `<table id='sg_unknown_context_table'>
              <tr>
                <td style='vertical-align:top;'>
                  <img src='../images/sg_logo.png' height='85px'>
                </td>
                <td style='vertical-align:top;'>
                  <table>
                    <tr>
                      <td id='sg_unknown_context_title'>
                        <strong><big>Integration Disabled</big></strong>
                      </td>
                    </tr>
                    <tr>
                      <td id='sg_unknown_context_details'>
                        The currently active file can't be associated with a
                        Shotgun context. Try switching to another file or
                        restarting ${app_display_name}.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>`
        );

    };

    // Clears the current context and displays it as loading a new one.
    this.set_context_loading_state = function() {

        this.clear();

        _set_bg_color("#4D4D4D");

        var header_html = `<div class='sg_context_header'>
                              <div id='context_thumbnail_data'>
                                <img id='context_thumbnail' src='../images/default_Site_thumb_dark.png'>
                              </div>
                              <div id='context_field_data'>
                                Loading context...
                              </div>
                            </tr>
                          </div>`;

        _set_header(header_html);
        _show_header(true);

        var contents_html = "Loading commands...";

        _set_contents(contents_html);
        _show_contents(true);
        _clear_messages();
    };

    // Need to display a tooltip with the supplied info
    this.show_command_help = function(title, help, favorite) {

        // clear any existing tooltip hide timeout so that it doesn't disappear
        // prematurely
        if (_hide_tooltip_timeout_id !== undefined) {
            clearTimeout(_hide_tooltip_timeout_id);
        }

        // slight delay to mimic typical tooltip display
        _show_tooltip_timeout_id = setTimeout(
            function(){_on_show_command_help_timeout(help)}, 1500);

        // update the text in the favorite header with this command's title
        if (favorite) {
            const fav_header_div = document.getElementById("sg_panel_favorites_header");
            fav_header_div.innerHTML = title;
        }
    };

    // Need to hide the tooltip
    this.hide_command_help = function() {

        // clear any existing timeouts for showing the tooltip.
        if (_show_tooltip_timeout_id !== undefined) {
            clearTimeout(_show_tooltip_timeout_id);
        }

        // turn off the command help div
        _show_command_help(false);

        // reset the favorite header text
        const fav_header_div = document.getElementById("sg_panel_favorites_header");
        if (fav_header_div) {
            fav_header_div.innerHTML = "Run a command";
        }
    };

    // Open an email in default email client.
    this.email_support = function(subject, body) {

        const mailto_url = `mailto:support@shotgunsoftware.com?subject=${subject}&body=${body}`;

        sg_logging.debug("Emailing support: " + mailto_url);

        _clear_info();
        _set_progress_info(100, "Composing SG support email...");
        setTimeout(_clear_info, 2000);

        this.open_external_url(mailto_url);
    };

    // Setup the Shotgun integration within the app.
    this.on_load = function() {

        try {

            // ensure the panel is in its loading state.
            this.set_panel_loading_state();

            // build the flyout menu. always do this first so we can have access
            // to the debug console no matter what happens during bootstrap.
            _build_flyout_menu([]);

            // Listen for the Flyout menu clicks
            _cs_interface.addEventListener(
                "com.adobe.csxs.events.flyoutMenuClicked",
                _on_flyout_menu_clicked
            );

            // setup event listeners first so we can react to various events
            _setup_event_listeners();

            // If the current Adobe application is photoshop, turn on persistence.
            // This isn't required, but provides a better user experience by not
            // trying to reload the panel whenever it regains focus.
            const photoshop_ids = ["PHSP", "PHXS"];
            if (photoshop_ids.indexOf(_cs_interface.getApplicationID()) > -1) {
                sg_logging.debug("Making panel persistent.");
                _make_persistent(true);
            }

            // track the mouse
            document.onmousemove = _on_mouse_move;

        } catch(error) {
            sg_logging.error("Manager startup error: " + error.stack);
            alert("Manager startup error: " + error.stack);
        }

        // Here we send the "AppOnline" event strictly in the event of a manual
        // reload/restart of the SG extension. For initial launch of PS, this
        // will be a no-op since the manager will already be running. For the
        // reload scenario, this is the jumpstart that the manager requires to
        // start up.
        const event_type = "com.adobe.csxs.events.AppOnline";
        var event = new CSEvent(event_type, "APPLICATION");
        event.extensionId = _cs_interface.getExtensionID();
        _cs_interface.dispatchEvent(event);

    }.bind(this);

    // Code to run when the extension panel is unloaded
    this.on_unload = function() {
        sg_logging.debug("Panel unloaded.");
    };

    // Open the supplied url in the default browser
    this.open_external_url = function(url) {
        sg_logging.debug("Opening external url: " + url);
        _cs_interface.openURLInDefaultBrowser(url);
    };

    // Request reload of the manager.
    //
    // After requesting manager reload, simply shuts down this extension
    // since the manager will restart it.
    this.reload = function() {

        sg_logging.debug("Closing the panel.");

        // turn off persistence so we can close the panel
        _make_persistent(false);

        // close the panel
        this.on_unload();

        // request manager reload and close the panel
        sg_panel.REQUEST_MANAGER_RELOAD.emit();
        _cs_interface.closeExtension();
    };

    // Copy selection to the clipboard
    this.selection_to_clipboard = function() {
        var selected_text = "";
        if (window.getSelection){
            selected_text = window.getSelection().toString()
        }

        if (!selected_text) {
            sg_logging.warn("Nothing selected to copy.")
        }

        try{
            document.execCommand("copy");
        } catch(e){
            sg_logging.error(`Failed to copy selection to clipboard!\n${e}`);
        }
    };

    // Select all the text within the provided div
    this.select_text = function(div_id) {

        document.getElementById(div_id).focus();

        if (document.selection) {
            const range = document.body.createTextRange();
            range.moveToElementText(document.getElementById(div_id));
            range.select();
        } else if (window.getSelection) {
            const range = document.createRange();
            range.selectNodeContents(document.getElementById(div_id));
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    };


    // Given thumbnail from python, display it in the header
    this.set_context_thumbnail = function(context_thumbnail_data) {

        sg_logging.debug("Setting thumbnail.");

        // keep the thumbnail data around in case this runs before the context
        // fields display is returned
        _context_thumbnail_data = context_thumbnail_data;

        const thumb_path = context_thumbnail_data["thumb_path"];
        const url = context_thumbnail_data["url"];

        var thumb_html = `<a href='#' onclick='sg_panel.Panel.open_external_url(\"${url}\")'>
                            <img id='context_thumbnail' src='${thumb_path}'>
                         </a>`;

        _set_div_html("context_thumbnail_data", thumb_html);
    };

    // Given context display from python, display it in the header.
    this.set_context_display = function(context_display) {

        sg_logging.debug("Setting context.");

        var context_thumb = "<img id='context_thumbnail' src='../images/default_Site_thumb_dark.png'>";

        // if we already have the thumbnail data, display that instead of the default
        if (_context_thumbnail_data !== undefined) {
            const thumb_path = _context_thumbnail_data["thumb_path"];
            context_thumb = `<img id='context_thumbnail' src='${thumb_path}'>`;
        }

        var header_html = `<div class='sg_context_header'>
                              <div id='context_thumbnail_data'>
                                ${context_thumb}
                              </div>
                              <div id='context_field_data'>
                                ${context_display}
                              </div>
                            </tr>
                          </div>`;

        _set_header(header_html);
        _show_header(true);
    };

    // Display the registered commands for the current context
    this.set_commands = function(all_commands) {

        sg_logging.debug("Setting commands.");

        // Favorite commands

        const favorites = all_commands["favorites"];
        var favorites_html = "";

        if (favorites.length > 0) {

            favorites_html = `<div id='sg_panel_favorites'>
                              <div id='sg_panel_favorites_header'>Run a command</div>
                              <div id='sg_panel_favorites_shelf'>`;

            // loop over favorites here
            favorites.forEach(function(favorite) {
                if (favorite.hasOwnProperty("uid") &&
                    favorite.hasOwnProperty("display_name") &&
                    favorite.hasOwnProperty("icon_path")) {

                    const command_id = favorite["uid"];
                    const display_name = favorite["display_name"];
                    const icon_path = favorite["icon_path"];
                    const description = favorite["description"];

                    favorites_html +=
                        `<a href='#' onClick='sg_panel.Panel.trigger_command(\"${command_id}\", \"${display_name}\")'>
                            <div class='sg_command_button'
                                onmouseover='sg_panel.Panel.show_command_help(\"${display_name}\", \"${description}\", true)'
                                onmouseout='sg_panel.Panel.hide_command_help()'>
                                <center>
                                    <img class='sg_panel_command_img' src='${icon_path}'>
                                </center>
                            </div>
                         </a>`
                } else {
                    sg_logging.warn("Favorite command missing required info: " + favorite);
                }
            });

            favorites_html += "</div></div>";
        }

        // Now process the non-favorite commands

        const commands = all_commands["commands"];
        var commands_html = "";

        if (commands.length > 0) {

            commands_html = "<div id='sg_panel_commands'>";

            commands.forEach(function(command) {
                if (command.hasOwnProperty("uid") &&
                    command.hasOwnProperty("display_name") &&
                    command.hasOwnProperty("icon_path")) {

                    const command_id = command["uid"];
                    const display_name = command["display_name"];
                    const icon_path = command["icon_path"];
                    const description = command["description"];

                    commands_html +=
                        `<a href='#' onClick='sg_panel.Panel.trigger_command(\"${command_id}\", \"${display_name}\")'>
                        <div class='sg_panel_command'
                            onmouseover='sg_panel.Panel.show_command_help(\"\", \"${description}\", false)'
                            onmouseout='sg_panel.Panel.hide_command_help()'>
                        <table>
                          <!-- trick to allow text elide within td -->
                          <colgroup>
                            <col width="0%" />
                            <col width="100%" />
                          </colgroup>
                          <tr>
                            <td style='white-space: nowrap;'>
                                <img class='sg_panel_command_other_img' src='${icon_path}'>
                            </td>
                            <td class='sg_panel_command_td'>
                                ${display_name}
                            </td>
                          </tr>
                        </table>
                        </div>
                        </a>`;
                } else {
                    sg_logging.warn("Command missing required info: " + command);
                }
            });

            commands_html += "</div>";
        }

        _set_contents(favorites_html + commands_html);
        _show_contents(true);

        // make sure the progress bar and info is hidden
        _show_progress(false);
        _show_info(false);

        // now build the context menu with the context menu commands
        const context_menu_cmds = all_commands["context_menu_cmds"];
        _build_flyout_menu(context_menu_cmds);

    };

    // Show or hide the console.
    this.show_console = function(show) {

        const console_div_id = sg_constants.panel_div_ids["console"];
        const console_log_div_id = sg_constants.panel_div_ids["console_log"];

        _show_div(console_div_id, show);

        if (show) {
            _scroll_to_log_bottom();
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'visible';
        }
    };

    // Emits the signal to launch the supplied command id.
    // Also shows a tmp message to confirm user click
    this.trigger_command = function(command_id, command_display) {

        // show the progress message temporarily
        _set_info("Launching: " + command_display);
        setTimeout(_clear_info, 2000);

        // trigger the command
        sg_panel.REGISTERED_COMMAND_TRIGGERED.emit(command_id);
    };

    // ---- private methods

    // Builds the flyout menu with the debug/reload options.
    const _build_flyout_menu = function(context_menu_cmds) {

        // clear the context menu lookup
        _context_menu_lookup = {};

        // the xml that defines the flyout menu
        var flyout_xml = "<Menu>";

        context_menu_cmds.forEach(function(command) {
            if (command.hasOwnProperty("uid") &&
                command.hasOwnProperty("display_name") &&
                command.hasOwnProperty("icon_path")) {

                const command_id = command["uid"];
                const display_name = command["display_name"];

                _context_menu_lookup[command_id] = display_name;

                flyout_xml +=
                    '<MenuItem Id="' + command_id + '" \
                               Label="'+ display_name + '" \
                               Enabled="true" \
                               Checked="false"/>';
            }
        });

        flyout_xml += '<MenuItem Label="---" /> \
                <MenuItem Id="sg_console" \
                          Label="Console" \
                          Enabled="true" \
                          Checked="false"/>';

        if (process.env.SHOTGUN_ADOBE_NETWORK_DEBUG ||
            process.env.SHOTGUN_ADOBE_TESTS_ROOT ||
            process.env.TK_DEBUG) {

            flyout_xml += '<MenuItem Id="sg_dev_debug" \
                              Label="Chrome Console..." \
                              Enabled="true" \
                              Checked="false"/>';

            flyout_xml += '<MenuItem Id="sg_dev_reload" \
                              Label="Reload Shotgun Extension" \
                              Enabled="true" \
                              Checked="false"/>';
        }

        if (process.env.SHOTGUN_ADOBE_TESTS_ROOT) {
            flyout_xml += '   <MenuItem Id="sg_dev_tests" \
                                        Label="Run Tests" \
                                        Enabled="true" \
                                        Checked="false"/>'
        }
        flyout_xml += '</Menu>';

        // build the menu
        _cs_interface.setPanelFlyoutMenu(flyout_xml);
    };

    // Provides a way to make the panel persistent.
    //
    // Only valid for Photoshop.
    const _make_persistent = function(persistent) {

        var event_type = persistent ?
            'com.adobe.PhotoshopPersistent' :
            'com.adobe.PhotoshopUnPersistent';

        var event = new CSEvent(event_type, "APPLICATION");
        event.extensionId = _cs_interface.getExtensionID();
        _cs_interface.dispatchEvent(event);
    };

    // Handles flyout menu clicks
    const _on_flyout_menu_clicked = function(event) {

        const cmd_id = event.data.menuId;
        const cmd_name = event.data.menuName;

        switch (cmd_id) {

            // NOTE: Looks like you can't use `const` in the switch cases.
            // The panel won't even load if you do. Perhaps some type of failed
            // optimization when doing the menu callback? No obvious errors
            // are displayed. Leaving this here as a warning.

            // debug console
            case "sg_dev_debug":
                sg_logging.debug("Opening debugger in default browser.");
                var app_name = _cs_interface.getHostEnvironment().appName;
                var debug_url = sg_constants.product_info[app_name].debug_url;
                this.open_external_url(debug_url);
                break;

            // reload extension
            case "sg_dev_reload":
                this.reload();
                break;

            // about the extension
            case "sg_console":
                this.show_console(true);
                break;

            // run test suite
            case "sg_dev_tests":
                sg_logging.debug("Emitting RUN_TESTS panel event.");
                sg_panel.RUN_TESTS.emit();
                break;

            default:

                // see if the command id matches one of the context menu ids
                if (cmd_id in _context_menu_lookup) {
                    this.trigger_command(cmd_id, cmd_name);

                // can't determine what this is
                } else {
                    sg_logging.warn(
                        "Unhandled menu event '" + cmd_name + "' clicked.");
                }
        }
    }.bind(this);

    // Display critical error in the panel
    const _on_critical_error = function(message, stack) {

        _set_bg_color("#222222");
        _clear_messages();

        sg_logging.error("Critical: " + message);

        _show_header(false);

        var contents_html = `<div class='sg_error_message'>${message}</div>`;

        contents_html +=
            `<br>
              You can try link below to attempt a full restart of the Adobe integration.
            <br><br>
            <center>
              <a href='#' onclick='sg_panel.Panel.reload()'>
                Restart Shotgun Integration
              </a>
            </center>
            <br>`;

        const subject = encodeURIComponent("Adobe Integration Error");
        const body = _format_email_error_message(message, stack);

        if (typeof stack !== "undefined") {
            contents_html +=
                `<br>
                If you encounter this problem consistently or have any other
                questions, please send the following error and a description
                of the steps to reproduce the problem to
                <a href='#' onClick='sg_panel.Panel.email_support(\"${subject}\", \"${body}\")'>
                  support@shotgunsoftware.com
                </a>.
                <br><br>
                <center>
                  <div class='sg_error'><pre>${stack}</pre></div>
                </center>`;
        } else {
            contents_html +=
                `<br>
                  If you encounter this problem consistently or have any other
                  questions, please send the steps to reproduce to
                  <a href='#' onClick='sg_panel.Panel.email_support(\"${subject}\", \"${body}\")'>
                    support@shotgunsoftware.com
                  </a>.`;
        }

        if (typeof _log_file_path !== "undefined") {
            contents_html +=
                `<br><br>
                Please attach a copy of the this log file when emailing the
                support team:<br><br>
                <tt><a href='#' onClick='sg_panel.Panel.open_external_url(\"file://${_log_file_path}\")'>${_log_file_path}</a></tt>
                <br>
                `
        }

        contents_html = `<div class='sg_container'>${contents_html}</div>`;

        _set_contents(contents_html);
        _set_error(
            "Uh oh! Something went wrong."
        );
    };

    // store the mouse position always
    const _on_mouse_move = function(event) {
        _cur_mouse_pos = {
            x: event.clientX,
            y: event.clientY
        };
    };

    // Display pyside unavailable error in the panel
    const _on_pyside_unavailable = function(event) {

        _set_bg_color("#222222");
        _clear_messages();

        sg_logging.error("Critical: PySide is unavailable");

        _show_header(false);

        var python_display = "system <samp>python</samp>";
        if (process.env.SHOTGUN_ADOBE_PYTHON) {
            python_display = "<samp>" + process.env.SHOTGUN_ADOBE_PYTHON + "</samp>";
        }

        var contents_html = `<div class='sg_error_message'>
                The Shotgun integration failed to load because <samp>PySide
                </samp> is not installed (Running ${python_display}).
                </div>`;

        contents_html +=
            `<br>
            In order for the Shotgun integration to work properly,
            <samp>PySide</samp> must be installed on your system.
            <br><br>
            For information about <samp>PySide</samp> and how to install it,
            please click the image below:
            <br><br><br>
            <center>
              <a href='#' onclick='sg_panel.Panel.open_external_url(\"${sg_constants.pyside_url}\")'>
                <img src='../images/PySideLogo1.png' width='150px'>
              </a>
            </center>
            <br>`;

        const subject = encodeURIComponent("Adobe Integration Error");
        const body = encodeURIComponent(
            "Greetings Shotgun Support Team!\n\n" +
            "We have some questions about the Photoshop CC Integration.\n\n" +
            "*** Please enter your questions here... ***\n\n"
        );

        var app_name = _cs_interface.getHostEnvironment().appName;
        const app_display_name = sg_constants.product_info[app_name].display_name;

        contents_html +=
            `<br>
            Once you have <samp>PySide</samp> installed, restart
            ${app_display_name} to load the Shotgun integration.
            <br><br>
            If you believe the error is incorrect or you have any further
            questions, please contact
            <a href='#' onClick='sg_panel.Panel.email_support(\"${subject}\", \"${body}\")'>
              support@shotgunsoftware.com
            </a>.`;

        contents_html = "<div class='sg_container'>" + contents_html + "</div>";

        _set_contents(contents_html);
        _set_error(
            "Uh Oh! Could not find <samp>PySide</samp>."
        );
    };

    // Handles incoming log messages
    const _on_logged_message = function(event) {

        var level = event.data.level;
        var message = event.data.message;
        var from_python = event.data.from_python;

        // Some things are sent via log signal because there's no other
        // way to get access to them. For example, during toolkit
        // bootstrap, we can only gain access to progress via stdio pipe
        // maintained between js process and the spawned python process.
        // So we intercept messages formatted to relay progress.
        if (message.includes("PLUGIN_BOOTSTRAP_PROGRESS")) {

            // It is possible that the message contains multiple
            // progress messages packaged together. Identify all of them
            // and update the progress bar.
            var regex_str = "\\|PLUGIN_BOOTSTRAP_PROGRESS,(\\d+(\\.\\d+)?),([^|]+)\\|";

            const multi_regex = new RegExp(regex_str, "gm");

            var matches = message.match(multi_regex);

            if (!matches) {
                return;
            }

            matches.forEach(function (match) {
                const single_regex = new RegExp(regex_str, "m");
                const msg_parts = match.match(single_regex);
                // the regex returns the progress value as a float at
                // position 1 of the match. position 3 is the message
                _set_progress_info(msg_parts[1] * 100, msg_parts[3]);
            });

            return;
        }

        var log_source = from_python ? "py" : "js";

        var messages = undefined;

        if (from_python) {
            messages = message.split("\n")
        } else {
            messages = [message]
        }

        messages.forEach(function(msg) {

            // strip newlines
            msg = msg.replace(/^\n/, "");
            msg = msg.replace(/\n$/, "");

            if (msg.startsWith("[DEBUG]: ")) {
                msg = msg.replace("[DEBUG]: ", "");
                level = "debug";
            } else if (msg.startsWith("[INFO]: ")) {
                msg = msg.replace("[INFO]: ", "");
                level = "info";
            } else if (msg.startsWith("[WARNING]: ")) {
                msg = msg.replace("[WARNING]: ", "");
                level = "warn";
            } else if (msg.startsWith("[ERROR]: ")) {
                msg = msg.replace("[ERROR]: ", "");
                level = "error";
            } else if (msg.startsWith("[CRITICAL]: ")) {
                msg = msg.replace("[ERROR]: ", "");
                level = "error";
            } else if (from_python) {
                // account for multi-line log messages from python that may not
                // have the expected format
                level = _previous_log_level;
            }

            if (!msg) {
                // continue
                return;
            }

            // forward message to the panel console
            _forward_to_panel_console(level, msg, log_source);

            // forward to the chrome console
            console[level](msg);

            _previous_log_level = level;
        });
    };

    // Make the message pretty and add it to the panel's console log
    const _forward_to_panel_console = function(level, message, log_source) {

        // figure out which div id to use for style/color
        var div_id = "sg_log_message";
        if (level == "debug") {
            div_id = "sg_log_message_debug"
        } else if (level == "warn") {
            div_id = "sg_log_message_warn"
        } else if (level == "error") {
            div_id = "sg_log_message_error"
        }

        // append the <pre> element to the log div
        const log = document.getElementById("sg_panel_console_log");

        message.split("\n").forEach(function(msg) {

            if (!msg) {
                // continue
                return;
            }

            // just a little indicator so that we know if the log message came from
            // (javascript or python) when looking in the panel console.
            const tag = document.createElement("pre");
            tag.setAttribute("id", "sg_panel_console_tag");
            tag.appendChild(document.createTextNode(log_source + " "));

            // create a <pre> element and insert the msg
            const node = document.createElement("pre");
            node.setAttribute("id", div_id);
            node.appendChild(document.createTextNode(msg));

            log.appendChild(tag);
            log.appendChild(node);
            log.appendChild(document.createElement("br"));

            // scroll to the bottom if an error occurs
            if (["error", "critical"].indexOf(level) >= 0) {
                _scroll_to_log_bottom();
            }
        });
    };

    // Scroll to the bottom of the div
    const _scroll_to_log_bottom = function() {

        const console_log_div_id = sg_constants.panel_div_ids["console_log"];
        const log = document.getElementById(console_log_div_id);
        log.scrollTop = log.scrollHeight;
    };

    // Delay happened, still need to show the command
    const _on_show_command_help_timeout = function(help) {

        // if no help, display a default message
        if (!help || help === "null") {
            help = "Could not find a description for this command. " +
                   "Please check with the author of the app to see about " +
                   "making a description available."
        }

        // mouse pos. always align left to right from mouse position.
        // if help div will go past right and/or bottom border, adjust accordingly.

        const mouse_x = _cur_mouse_pos.x;
        const mouse_y = _cur_mouse_pos.y;

        const command_div = document.elementFromPoint(mouse_x, mouse_y);

        const offset = 8;
        const margin = 8;

        // ---- calculate where to display the help message

        const help_div_id = sg_constants.panel_div_ids["command_help"];
        const help_div = document.getElementById(help_div_id);

        // reset to the top left to allow it to grow as needed when contest set
        help_div.style.left = "0px";
        help_div.style.top = "0px";

        _set_command_help(help);

        const help_div_rect = help_div.getBoundingClientRect();

        const help_width = help_div_rect.width;
        const help_height = help_div_rect.height;

        const far_right = mouse_x + offset + margin + help_width;
        const far_bottom = mouse_y + offset + margin + help_height;

        const win_width = window.innerWidth;
        const win_height = window.innerHeight;

        const beyond_right = far_right - win_width + margin;
        const beyond_bottom = far_bottom - win_height + margin;

        var adjust_left = 0;
        var adjust_top = 0;

        if (beyond_right > 0) {
            adjust_left = -beyond_right;
        }

        if (beyond_bottom > 0) {
            adjust_top = -beyond_bottom;
        }

        const new_left = mouse_x + offset + adjust_left + window.scrollX;
        const new_top = mouse_y + offset + adjust_top + window.scrollY;

        help_div.style.left = new_left + "px";
        help_div.style.top = new_top + "px";

        const new_help_div_rect = help_div.getBoundingClientRect();

        if (_point_in_rect(_cur_mouse_pos, new_help_div_rect)) {
            // the mouse is now inside the help div. need to adjust more

            var additional_offset_y = 0;

            if (beyond_bottom > 0) {
                // we already adjusted up, keep going. we know we need to get
                // at least `offset` pixels past the mouse. then it's just the
                // difference
                additional_offset_y = -1 * (offset + new_help_div_rect.bottom - mouse_y);
            }

            help_div.style.top = new_top + additional_offset_y + "px";
        }

        _show_command_help(true);

        _hide_tooltip_timeout_id = setTimeout(
            function(){
                this.hide_command_help()
            }.bind(this),
            5000
        )

    }.bind(this);

    // Returns a boolean indicating if the point is in the rect
    const _point_in_rect = function(point, rect) {

        return ((point.x >= rect.left) && (point.x <= rect.right) &&
                (point.y >= rect.top)  && (point.y <= rect.bottom));
    };

    // Sets up all the event handling callbacks.
    const _setup_event_listeners = function() {

        // Handle python process disconnected
        sg_manager.CRITICAL_ERROR.connect(
            function(event) {
                const message = event.data.message;
                const stack = event.data.stack;
                _on_critical_error(message, stack);
            }
        );

        // Handle pyside not being installed
        sg_manager.PYSIDE_NOT_AVAILABLE.connect(_on_pyside_unavailable);

        // Updates the panel with the current commands from python
        sg_manager.UPDATE_COMMANDS.connect(
            function(event) {
                this.set_commands(event.data);
            }.bind(this)
        );

        // Updates the panel with the current context fields from python
        sg_manager.UPDATE_CONTEXT_DISPLAY.connect(
            function(event) {
                this.set_context_display(event.data);
            }.bind(this)
        );

        // Updates the panel with the current context thumb path from python
        sg_manager.UPDATE_CONTEXT_THUMBNAIL.connect(
            function(event) {
                this.set_context_thumbnail(event.data);
            }.bind(this)
        );

        // Updates the panel with the current log file path
        sg_manager.UPDATE_LOG_FILE_PATH.connect(
            function(event) {
                _log_file_path = event.data;
            }
        );

        // Sets the panel into a state where the context is not known
        sg_manager.UNKNOWN_CONTEXT.connect(
            function(event) {
                this.set_unknown_context_state();
            }.bind(this)
        );

        // Clears the current context
        sg_manager.CONTEXT_ABOUT_TO_CHANGE.connect(
            function(event) {
                this.set_context_loading_state();
            }.bind(this)
        );

        // Handle the manager shutting down.
        sg_manager.SHUTTING_DOWN.connect(
            function(event) {
                _cs_interface.closeExtension();
            }
        );

        // Handle log messages from python process
        sg_logging.LOG_MESSAGE.connect(_on_logged_message);

    }.bind(this);

    // set html for div
    const _set_div_html = function(div_id, html) {
        // Updates the inner HTML of the supplied div with the supplied HTML
        _show_div(div_id, true);
        document.getElementById(div_id).innerHTML = html;
    };

    const _set_div_html_by_id = function(div_id) {
        return function(html) {
            // Convenience method for updating panel contents with supplied html
            _set_div_html(sg_constants.panel_div_ids[div_id], html);
        };
    };

    // convenience methods for updating the various panel components
    const _set_contents = _set_div_html_by_id("contents");
    const _set_header = _set_div_html_by_id("header");
    const _set_info = _set_div_html_by_id("info");
    const _set_error = _set_div_html_by_id("error");
    const _set_warning = _set_div_html_by_id("warning");
    const _set_command_help = _set_div_html_by_id("command_help");

    // ---- progress bar methods

    // Update the progress section with a % and a message.
    const _set_progress_info = function(progress, message) {

        if (progress == 100) {
            // progress is complete. nothing to do
            _clear_info();
        } else {
            _show_progress(true);
            _show_info(true);
            var elem = document.getElementById(
                sg_constants.panel_div_ids["progress_bar"]);
            elem.style.width = progress + '%';
            _set_info(message);
        }
    };

    // Show or hide a div
    const _show_div = function(div_id, show_or_hide) {
        var display = "none";  // hide
        if (show_or_hide) {
            display = "block"; // show
        }
        var elem = document.getElementById(div_id);
        elem.style.display = display;
    };

    const _show_div_by_id = function(div_id) {
        return function(show_or_hide) {
            // Convenience method for showing/hiding divs
            _show_div(sg_constants.panel_div_ids[div_id], show_or_hide);
        }
    };

    // convenience methods for showing/hiding status divs
    const _show_header = _show_div_by_id("header");
    const _show_contents = _show_div_by_id("contents");
    const _show_info = _show_div_by_id("info");
    const _show_error = _show_div_by_id("error");
    const _show_warning = _show_div_by_id("warning");
    const _show_progress = _show_div_by_id("progress");
    const _show_command_help = _show_div_by_id("command_help");

    // sets bg to supplied color
    const _set_bg_color = function(color) {
        document.body.style.background = color;
    };

    // hide all transient divs
    const _clear_messages = function() {
        _show_info(false);
        _show_error(false);
        _show_warning(false);
        _show_progress(false);
        _show_command_help(false);
    };

    // clears the info related divs
    const _clear_info = function() {
        _show_info(false);
        _show_progress(false);
    };

    // format an email message to help client get started
    const _format_email_error_message = function(message, stack) {

        return encodeURIComponent(
            "Greetings Shotgun Support Team!\n\n" +
            "We are experiencing some difficulties with the Photoshop CC Integration. " +
            "The details are included below.\n\n" +
            "Summary of the issue:\n\n" +
            "*** Please enter a summary of the issue here... ***\n\n" +
            "Steps to reproduce:\n\n" +
            "*** Please enter the steps you took to reach this error here. ***\n\n" +
            "Error displayed to the user:\n\n" +
            message + "\n\n" +
            "Stack trace:\n\n" +
            stack + "\n\n"
        );
    };

};

