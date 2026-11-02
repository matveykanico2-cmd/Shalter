package ru.shalter.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Последние фото галереи — лента над кнопками в шторке скрепки (apps/web
// features/send-message/lib/recent-photos.ts, ui/recent-photos-strip.tsx), как в Telegram.
// JS: Capacitor.Plugins.RecentPhotos.list({ limit: 30 }) → { photos: [{ id, uri, thumb, mime, name }] }
// (thumb — JPEG ~256px в base64), read({ id }) → { data (base64 оригинала), mime, name }.
// Без разрешения на фото list отдаёт { photos: [], denied: true } — лента не показывается.
// Файл копирует scripts/apply-native-resources.js — android/ генерируется заново.
@CapacitorPlugin(
    name = "RecentPhotos",
    permissions = {
        // Android 13+: READ_MEDIA_IMAGES; 14+ — ещё «выбранные фото» (частичный доступ).
        @Permission(strings = { "android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VISUAL_USER_SELECTED" }, alias = RecentPhotosPlugin.MEDIA),
        @Permission(strings = { "android.permission.READ_MEDIA_IMAGES" }, alias = RecentPhotosPlugin.MEDIA_33),
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = RecentPhotosPlugin.STORAGE),
    }
)
public class RecentPhotosPlugin extends Plugin {
    static final String MEDIA = "media";
    static final String MEDIA_33 = "media33";
    static final String STORAGE = "storage";
    private static final int THUMB = 256;
    private static final int MAX_LIMIT = 100;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private String alias() {
        if (Build.VERSION.SDK_INT >= 34) return MEDIA;
        if (Build.VERSION.SDK_INT >= 33) return MEDIA_33;
        return STORAGE;
    }

    private boolean granted(String perm) {
        return ContextCompat.checkSelfPermission(getContext(), perm) == PackageManager.PERMISSION_GRANTED;
    }

    // Частичный доступ («выбрать фото» на Android 14) — тоже доступ: MediaStore отдаст выбранные.
    private boolean canRead() {
        if (Build.VERSION.SDK_INT >= 33) {
            return granted("android.permission.READ_MEDIA_IMAGES")
                || (Build.VERSION.SDK_INT >= 34 && granted("android.permission.READ_MEDIA_VISUAL_USER_SELECTED"));
        }
        return granted(Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (canRead()) {
            listAsync(call);
            return;
        }
        requestPermissionForAlias(alias(), call, "photosPermission");
    }

    @PermissionCallback
    private void photosPermission(PluginCall call) {
        if (canRead()) {
            listAsync(call);
            return;
        }
        JSObject result = new JSObject();
        result.put("photos", new JSArray());
        result.put("denied", true);
        call.resolve(result);
    }

    private void listAsync(PluginCall call) {
        int limit = Math.max(1, Math.min(MAX_LIMIT, call.getInt("limit", 30)));
        executor.execute(() -> {
            try {
                call.resolve(query(limit));
            } catch (Exception e) {
                call.reject("list failed: " + e.getMessage());
            }
        });
    }

    private JSObject query(int limit) {
        ContentResolver cr = getContext().getContentResolver();
        String[] projection = { MediaStore.Images.Media._ID, MediaStore.Images.Media.MIME_TYPE, MediaStore.Images.Media.DISPLAY_NAME };
        JSArray photos = new JSArray();
        try (Cursor c = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection, null, null, MediaStore.Images.Media.DATE_ADDED + " DESC")) {
            if (c != null) {
                int idCol = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int mimeCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE);
                int nameCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                while (c.moveToNext() && photos.length() < limit) {
                    long id = c.getLong(idCol);
                    Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                    String thumb = thumbnail(cr, uri, id);
                    if (thumb == null) continue; // битый или недоступный файл — пропускаем
                    JSObject p = new JSObject();
                    p.put("id", String.valueOf(id));
                    p.put("uri", uri.toString());
                    p.put("thumb", thumb);
                    p.put("mime", c.getString(mimeCol));
                    p.put("name", c.getString(nameCol));
                    photos.put(p);
                }
            }
        }
        JSObject result = new JSObject();
        result.put("photos", photos);
        return result;
    }

    @SuppressWarnings("deprecation")
    private String thumbnail(ContentResolver cr, Uri uri, long id) {
        try {
            Bitmap bmp = Build.VERSION.SDK_INT >= 29
                ? cr.loadThumbnail(uri, new Size(THUMB, THUMB), null)
                : MediaStore.Images.Thumbnails.getThumbnail(cr, id, MediaStore.Images.Thumbnails.MINI_KIND, null);
            if (bmp == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 80, out);
            bmp.recycle();
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        String raw = call.getString("id");
        long id;
        try {
            id = Long.parseLong(raw == null ? "" : raw);
        } catch (NumberFormatException e) {
            call.reject("bad id");
            return;
        }
        if (!canRead()) {
            call.reject("permission denied");
            return;
        }
        executor.execute(() -> {
            ContentResolver cr = getContext().getContentResolver();
            Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
            String mime = cr.getType(uri);
            String name = "photo-" + id + ".jpg";
            String[] projection = { MediaStore.Images.Media.DISPLAY_NAME };
            try (Cursor c = cr.query(uri, projection, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
            } catch (Exception ignored) {
                // имя по умолчанию
            }
            try (InputStream in = cr.openInputStream(uri)) {
                if (in == null) {
                    call.reject("not found");
                    return;
                }
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                result.put("mime", mime == null ? "image/jpeg" : mime);
                result.put("name", name);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("read failed: " + e.getMessage());
            }
        });
    }
}
