package com.madwind.voyager;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Lets the web app play a whole music folder: the user picks a folder with the system chooser, and every audio file
 * below it (sub-folders included) is found through MediaStore and returned as a file path the web view can load.
 */
@CapacitorPlugin(
    name = "FolderMusic",
    permissions = {
        @Permission(strings = {Manifest.permission.READ_MEDIA_AUDIO}, alias = "audio33"),
        @Permission(strings = {Manifest.permission.READ_EXTERNAL_STORAGE}, alias = "audio")
    }
)
public class FolderMusicPlugin extends Plugin {
    private static final char BACKSLASH = (char) 92;

    /** Escapes a path for a SQL LIKE pattern (a folder name may contain % or _). */
    private static String like(String s) {
        return s.replace("" + BACKSLASH, "" + BACKSLASH + BACKSLASH).replace("%", BACKSLASH + "%").replace("_", BACKSLASH + "_");
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        startActivityForResult(call, new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri tree = result.getData().getData();
        String id = DocumentsContract.getTreeDocumentId(tree); // for example "primary:Music/Jazz"
        int colon = id.indexOf(':');
        String path = colon >= 0 ? id.substring(colon + 1) : id;
        if (!path.isEmpty() && !path.endsWith("/")) path += "/";
        JSObject out = new JSObject();
        out.put("path", path); // relative to the storage root, with a trailing slash ("" = everything)
        call.resolve(out);
    }

    @PluginMethod
    public void listAudio(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= 33 ? "audio33" : "audio";
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "afterPermission");
            return;
        }
        list(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= 33 ? "audio33" : "audio";
        if (getPermissionState(alias) == PermissionState.GRANTED) list(call);
        else call.reject("permission denied");
    }

    private void list(PluginCall call) {
        String rel = call.getString("path", "");
        String column;
        String prefix;
        if (Build.VERSION.SDK_INT >= 29) {
            column = MediaStore.Audio.Media.RELATIVE_PATH;
            prefix = like(rel);
        } else {
            column = MediaStore.Audio.Media.DATA;
            prefix = like(Environment.getExternalStorageDirectory().getAbsolutePath() + "/" + rel);
        }
        JSArray files = new JSArray();
        String[] projection = {MediaStore.Audio.Media.DATA};
        String order = column + ", " + MediaStore.Audio.Media.DISPLAY_NAME;
        try (Cursor c = getContext().getContentResolver().query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, projection,
            column + " LIKE ? ESCAPE '" + BACKSLASH + "' AND " + MediaStore.Audio.Media.IS_RINGTONE + " = 0 AND " + MediaStore.Audio.Media.IS_NOTIFICATION + " = 0 AND " + MediaStore.Audio.Media.IS_ALARM + " = 0",
            new String[]{prefix + "%"}, order)) {
            if (c != null) while (c.moveToNext()) files.put(c.getString(0));
        } catch (Exception e) {
            call.reject("could not read music: " + e.getMessage());
            return;
        }
        JSObject out = new JSObject();
        out.put("files", files);
        call.resolve(out);
    }
}
