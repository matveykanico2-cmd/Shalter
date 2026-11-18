package ru.shalter.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Скачивает APK обновления и передаёт его системному установщику. */
@CapacitorPlugin(name = "AppUpdate")
public final class AppUpdatePlugin extends Plugin {
    private long downloadId = -1L;
    private BroadcastReceiver receiver;

    @PluginMethod
    public void install(PluginCall call) {
        String raw = call.getString("url");
        if (raw == null || !raw.startsWith("https://") || Uri.parse(raw).getHost() == null) {
            call.reject("Некорректный адрес обновления");
            return;
        }
        try {
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                call.reject("Системный загрузчик недоступен");
                return;
            }
            unregisterReceiver();
            registerReceiver(manager);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(raw))
                .setTitle("Обновление Shalter")
                .setDescription("Скачиваем новую версию")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
                .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, "Shalter-update.apk");
            downloadId = manager.enqueue(request);
            JSObject result = new JSObject();
            result.put("status", "downloading");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Не удалось начать скачивание обновления", error);
        }
    }

    private void registerReceiver(DownloadManager manager) {
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction()) || intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != downloadId) return;
                Uri uri = manager.getUriForDownloadedFile(downloadId);
                if (uri == null) return;
                Intent install = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                context.startActivity(install);
                unregisterReceiver();
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(receiver, filter);
    }

    private void unregisterReceiver() {
        if (receiver == null) return;
        try { getContext().unregisterReceiver(receiver); } catch (IllegalArgumentException ignored) {}
        receiver = null;
    }

    @Override
    protected void handleOnDestroy() {
        unregisterReceiver();
        super.handleOnDestroy();
    }
}
