(function () {
    var cs = new CSInterface();
    var folderBtn = document.getElementById("folderBtn");
    var presetBtn = document.getElementById("presetBtn");
    var exportBtn = document.getElementById("exportBtn");
    var modeEl = document.getElementById("modeSelect");
    var hintEl = document.getElementById("modeHint");
    var status = document.getElementById("status");
    var folderEl = document.getElementById("folderVal");
    var presetEl = document.getElementById("presetVal");

    var settings = { folder: null, preset: null, mode: "markers" };
    var hevcUnsupportedMessage = "Premiere Pro 25.5+ blocks scripted HEVC/H.265 export. " +
        "Choose an H.264 or ProRes preset, or export HEVC manually.";

    function setStatus(text, kind) {
        status.textContent = text || "";
        status.className = kind || "";
    }

    function baseName(p) {
        if (!p) return "—";
        // Handle both POSIX (/) and Windows (\) separators.
        return p.replace(/[\/\\]+$/, "").split(/[\/\\]/).pop();
    }

    // Escape a string so it can be embedded in an evalScript("...") argument.
    function esc(s) {
        return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    }

    function renderSettings() {
        if (settings.mode !== "timelineClips") settings.mode = "markers";
        folderEl.textContent = settings.folder ? baseName(settings.folder) : "not set";
        folderEl.title = settings.folder || "";
        presetEl.textContent = settings.preset ? baseName(settings.preset) : "not set";
        presetEl.title = settings.preset || "";
        modeEl.value = settings.mode;
        exportBtn.textContent = settings.mode === "timelineClips" ?
            "Export Timeline Clips" : "Export Marker Spans";
        hintEl.textContent = settings.mode === "timelineClips" ?
            "Queues one file for every video clip on every video track. " +
            "Overlapping clips become separate exports." :
            "Exports one video clip for the span between each pair of markers. " +
            "With markers at every cut, 4 markers → 3 clips.";
        exportBtn.disabled = !(settings.folder && settings.preset);
    }

    function loadSettings() {
        try {
            var raw = localStorage.getItem("markerExportSettings");
            if (raw) settings = JSON.parse(raw);
        } catch (e) { /* ignore */ }
        renderSettings();
        prepareForPreset();
    }

    function prepareForPreset() {
        if (!settings.preset) return;

        cs.evalScript('getPresetExportMethod("' + esc(settings.preset) + '")', function (method) {
            if (/^ERROR/i.test(method)) {
                setStatus(method, "err");
            } else if (method === "HEVC_UNSUPPORTED") {
                setStatus(hevcUnsupportedMessage, "err");
            } else if (method === "AME") {
                // Launch AME while the user is choosing other options.  The
                // host refuses to queue until AME has finished launching.
                cs.evalScript("prepareEncoder()", function (result) {
                    if (/^ERROR/i.test(result)) setStatus(result, "err");
                    else if (result === "STARTING") {
                        setStatus("Starting Adobe Media Encoder…", "");
                    }
                });
            }
        });
    }

    function saveSettings() {
        try {
            localStorage.setItem("markerExportSettings", JSON.stringify(settings));
        } catch (e) { /* ignore */ }
    }

    // Run a host chooser, store the result into settings[key], update UI.
    function choose(hostFn, key, label) {
        setStatus("Choose " + label + "…", "");
        cs.evalScript(hostFn + "()", function (result) {
            if (result === "CANCELLED") {
                setStatus(label + " unchanged.", "");
                return;
            }
            var parts = (result || "").split("\t");
            if (parts[0] !== "OK" || parts.length < 2) {
                setStatus("Could not read " + label + ":\n" + result, "err");
                return;
            }
            settings[key] = parts[1];
            saveSettings();
            renderSettings();
            if (key === "preset") prepareForPreset();
            setStatus(label + " set.", "ok");
        });
    }

    folderBtn.addEventListener("click", function () {
        choose("chooseFolder", "folder", "export folder");
    });

    presetBtn.addEventListener("click", function () {
        choose("choosePreset", "preset", "preset");
    });

    modeEl.addEventListener("change", function () {
        settings.mode = modeEl.value;
        saveSettings();
        renderSettings();
    });

    exportBtn.addEventListener("click", function () {
        if (!settings.folder || !settings.preset) return;
        exportBtn.disabled = true;

        var hostFn = settings.mode === "timelineClips" ?
            "exportTimelineClips" : "exportMarkersAsClips";
        var call = hostFn + '("' + esc(settings.folder) +
                   '", "' + esc(settings.preset) + '")';

        cs.evalScript('getPresetExportMethod("' + esc(settings.preset) + '")', function (method) {
            if (/^ERROR/i.test(method)) {
                renderSettings();
                setStatus(method, "err");
                return;
            }

            if (method === "HEVC_UNSUPPORTED") {
                renderSettings();
                setStatus(hevcUnsupportedMessage, "err");
                return;
            }

            setStatus("Queuing exports in Adobe Media Encoder…", "");

            cs.evalScript(call, function (result) {
                renderSettings(); // re-enables export button if settings still valid
                var isError = /^ERROR/i.test(result) || /^EvalScript error/i.test(result);
                setStatus(result || "No response from host script.", isError ? "err" : "ok");
            });
        });
    });

    loadSettings();
})();
