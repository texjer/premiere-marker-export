// Host-side ExtendScript for the Marker Export CEP panel.
// Entry points called by the panel via evalScript:
//   chooseFolder()                            -> prompts for an export folder
//   choosePreset()                            -> prompts for a .epr (opens in AME Presets)
//   exportMarkersAsClips(folderPath, preset)  -> exports ranges between sequence markers
//   exportTimelineClips(folderPath, preset)   -> exports every timeline video clip
// Uses marker duration if present; otherwise marker-to-next-marker.

// AME can take a little time to become available after launch.  Starting the
// batch before AME has acknowledged a queued job silently loses that job on
// some Premiere/AME versions, so start it from AME's queued-job event instead.
var markerExportEncoderEventsBound = false;
var markerExportLastEncoderError = "";

function markerExportOnEncoderJobQueued(jobID) {
    app.encoder.startBatch();
}

function markerExportOnEncoderJobError(jobID, errorMessage) {
    markerExportLastEncoderError = "ERROR: Adobe Media Encoder could not queue job " +
        jobID + (errorMessage ? ": " + errorMessage : ".");
}

function bindMarkerExportEncoderEvents() {
    if (markerExportEncoderEventsBound) return;

    app.encoder.bind("onEncoderJobQueued", markerExportOnEncoderJobQueued);
    app.encoder.bind("onEncoderJobError", markerExportOnEncoderJobError);
    markerExportEncoderEventsBound = true;
}

// Called when the panel loads, and again immediately before queueing.  It
// starts AME early so the user does not have to race its launch at export time.
function prepareEncoder() {
    bindMarkerExportEncoderEvents();

    if (typeof BridgeTalk !== "undefined") {
        var encoderStatus = BridgeTalk.getStatus("ame");
        if (encoderStatus === "ISNOTINSTALLED") {
            return "ERROR: Adobe Media Encoder is not installed.";
        }
        if (encoderStatus === "ISNOTRUNNING") {
            app.encoder.launchEncoder();
            return "STARTING";
        }
    } else {
        app.encoder.launchEncoder();
    }

    return "READY";
}

// Find the newest "Adobe Media Encoder/<version>/Presets" folder, if any.
function amePresetsDir() {
    var base = new Folder(Folder.myDocuments.fsName + "/Adobe/Adobe Media Encoder");
    if (!base.exists) return null;

    var entries = base.getFiles();
    var best = null;
    var bestVer = -1;

    for (var i = 0; i < entries.length; i++) {
        if (entries[i] instanceof Folder) {
            var ver = parseFloat(entries[i].name);
            var presets = new Folder(entries[i].fsName + "/Presets");
            if (presets.exists && !isNaN(ver) && ver > bestVer) {
                bestVer = ver;
                best = presets;
            }
        }
    }
    return best;
}

function chooseFolder() {
    var outputFolder = Folder.selectDialog("Choose export folder");
    if (!outputFolder) return "CANCELLED";
    return "OK\t" + outputFolder.fsName;
}

function choosePreset() {
    var startDir = amePresetsDir();
    var chosen;

    if (startDir) {
        // An instance openDlg opens the dialog in the file/folder's location,
        // so the user's saved AME presets are right there.
        chosen = (new File(startDir.fsName + "/")).openDlg(
            "Choose Adobe Media Encoder preset (.epr)", "*.epr", false);
    } else {
        chosen = File.openDialog("Choose Adobe Media Encoder preset (.epr)", "*.epr");
    }

    if (!chosen) return "CANCELLED";
    return "OK\t" + chosen.fsName;
}

function validateExportOptions(folderPath, presetPath) {
    if (!folderPath || !presetPath) {
        return { error: "ERROR: Set both an export folder and a preset first." };
    }

    var presetFile = new File(presetPath);
    if (!presetFile.exists) {
        return { error: "ERROR: Preset file not found:\n" + presetPath };
    }
    var outFolder = new Folder(folderPath);
    if (!outFolder.exists) {
        return { error: "ERROR: Export folder not found:\n" + folderPath };
    }

    return { presetFile: presetFile, outFolder: outFolder };
}

// Premiere Pro 25.5+ disallows scripted HEVC generation, even though the same
// preset works through the Export UI. EPR files store their output format as a
// decimal FourCC; 1212503619 is "HEVC".
function presetUsesHevc(presetFile) {
    if (!presetFile || !presetFile.exists || !presetFile.open("r")) return false;

    var contents = presetFile.read();
    presetFile.close();
    return /<ExporterFileType>\s*1212503619\s*<\/ExporterFileType>/i.test(contents);
}

function getPresetExportMethod(presetPath) {
    if (!presetPath) return "ERROR: Choose an export preset first.";

    var presetFile = new File(presetPath);
    if (!presetFile.exists) return "ERROR: Preset file not found:\n" + presetPath;
    return presetUsesHevc(presetFile) ? "HEVC_UNSUPPORTED" : "AME";
}

function safeExportName(name) {
    if (!name || name === "") name = "clip";
    return name
        .replace(/[\/\\:*?"<>|]/g, "_")
        .replace(/\s+/g, " ")
        .replace(/^\s+|\s+$/g, "");
}

function padExportNumber(num, size) {
    var s = String(num);
    while (s.length < size) s = "0" + s;
    return s;
}

function exportPathSeparator() {
    return Folder.fs === "Windows" ? "\\" : "/";
}

function stripSourceExtension(name) {
    return name.replace(/\.[A-Za-z0-9]{1,8}$/i, "");
}

function uniqueOutputPath(outFolder, baseName, ext) {
    var sep = exportPathSeparator();
    var path = outFolder.fsName + sep + baseName + "." + ext;
    var suffix = 2;

    while ((new File(path)).exists) {
        path = outFolder.fsName + sep + baseName + "_" + suffix + "." + ext;
        suffix++;
    }
    return path;
}

function queueRanges(seq, ranges, folderPath, presetPath, description) {
    var options = validateExportOptions(folderPath, presetPath);
    if (options.error) return options.error;

    if (presetUsesHevc(options.presetFile)) {
        return "ERROR: Premiere Pro 25.5+ blocks scripted HEVC/H.265 export. " +
            "Choose an H.264 or ProRes preset, or export HEVC manually.";
    }

    var encoderState = prepareEncoder();
    if (encoderState.indexOf("ERROR:") === 0) return encoderState;
    if (encoderState === "STARTING") {
        return "ERROR: Adobe Media Encoder is still starting. Wait until it has opened, then export again.";
    }

    var ext = seq.getExportFileExtension(options.presetFile.fsName);
    if (!ext || ext === "") ext = "mp4";
    markerExportLastEncoderError = "";

    var oldInPoint = seq.getInPointAsTime ? seq.getInPointAsTime() : null;
    var oldOutPoint = seq.getOutPointAsTime ? seq.getOutPointAsTime() : null;
    var completed = 0;

    try {
        for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i];
            if (range.end <= range.start) continue;

            seq.setInPoint(range.start);
            seq.setOutPoint(range.end);

            var rangeName = safeExportName(range.name);
            if (range.stripExtension) rangeName = stripSourceExtension(rangeName);

            var baseName = padExportNumber(i + 1, 3) + "_" + rangeName;
            var outputPath = uniqueOutputPath(options.outFolder, baseName, ext);

            // 1 = ENCODE_IN_TO_OUT
            // 1 = remove job from AME queue after completion
            var jobID = app.encoder.encodeSequence(
                seq,
                outputPath,
                options.presetFile.fsName,
                1,
                1
            );

            if (jobID && jobID !== "0") completed++;
        }
    } finally {
        if (oldInPoint) seq.setInPoint(oldInPoint.seconds);
        if (oldOutPoint) seq.setOutPoint(oldOutPoint.seconds);
    }

    if (completed > 0) {
        return "Queued " + completed + " " + description +
            " export(s). Adobe Media Encoder will start when it receives them.";
    }
    return "ERROR: No valid " + description + " ranges found.";
}

function exportMarkersAsClips(folderPath, presetPath) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return "ERROR: No active sequence open.";
    }

    var markers = seq.markers;
    if (!markers || markers.numMarkers === 0) {
        return "ERROR: No sequence markers found.";
    }

    function getMarkerArray() {
        var arr = [];
        var marker = markers.getFirstMarker();
        while (marker) {
            arr.push(marker);
            marker = markers.getNextMarker(marker);
        }
        return arr;
    }

    function markerHasDuration(marker) {
        return marker.end.seconds > marker.start.seconds;
    }

    var markerArray = getMarkerArray();
    var ranges = [];

    for (var i = 0; i < markerArray.length; i++) {
        var marker = markerArray[i];
        var inSeconds = marker.start.seconds;
        var outSeconds;

        if (markerHasDuration(marker)) {
            outSeconds = marker.end.seconds;
        } else if (i < markerArray.length - 1) {
            outSeconds = markerArray[i + 1].start.seconds;
        } else {
            // Last plain marker has no next marker, so skip it.
            continue;
        }

        ranges.push({
            start: inSeconds,
            end: outSeconds,
            name: marker.name || marker.comments || "marker"
        });
    }

    return queueRanges(seq, ranges, folderPath, presetPath, "marker");
}

function exportTimelineClips(folderPath, presetPath) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return "ERROR: No active sequence open.";
    }

    var ranges = [];
    for (var trackIndex = 0; trackIndex < seq.videoTracks.numTracks; trackIndex++) {
        var track = seq.videoTracks[trackIndex];
        for (var clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
            var clip = track.clips[clipIndex];
            ranges.push({
                start: clip.start.seconds,
                end: clip.end.seconds,
                name: "V" + (trackIndex + 1) + "_" + (clip.name || "clip"),
                stripExtension: true,
                trackIndex: trackIndex,
                clipIndex: clipIndex
            });
        }
    }

    if (ranges.length === 0) {
        return "ERROR: No video clips found in the active sequence.";
    }

    // A sequence can have clips on multiple tracks; make filename numbering
    // predictable by exporting chronologically, then from lower to higher tracks.
    ranges.sort(function (a, b) {
        if (a.start !== b.start) return a.start - b.start;
        if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
        return a.clipIndex - b.clipIndex;
    });

    return queueRanges(seq, ranges, folderPath, presetPath, "timeline clip");
}
