package ru.shalter.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;

// Входящий звонок, как в Telegram: на заблокированном или погасшем экране — сразу
// экран звонка (full-screen intent), иначе — уведомление-звонок поверх всего, с
// рингтоном по кругу и кнопками «Ответить» / «Отклонить». Работает и когда приложение
// закрыто: показывает его ShalterMessagingService по push от сервера.
// Файл копирует scripts/apply-native-resources.js — android/ генерируется заново.
final class CallNotifier {
    static final String CHANNEL = "incoming_calls";
    static final String EXTRA_URL = "shalterUrl";
    private static final long RING_TIMEOUT_MS = 45_000;

    private CallNotifier() {}

    static int notificationId(String callId) {
        return 0x5A00_0000 | (callId.hashCode() & 0x00FF_FFFF);
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Входящие звонки", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Экран входящего звонка и рингтон");
        Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        ch.setSound(ring, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] {0, 800, 600, 800, 600});
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private static PendingIntent open(Context ctx, String path, int requestCode) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.putExtra(EXTRA_URL, path);
        intent.putExtra("fromCall", true);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(ctx, requestCode, intent, flags);
    }

    static void show(Context ctx, String callId, String callerName, boolean video) {
        if (callId == null || callId.isEmpty()) return;
        ensureChannel(ctx);
        int id = notificationId(callId);
        String base = "/call/" + Uri.encode(callId);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(ctx.getResources().getIdentifier("ic_stat_shalter", "drawable", ctx.getPackageName()))
            .setContentTitle(callerName == null || callerName.isEmpty() ? "Входящий звонок" : callerName)
            .setContentText(video ? "Входящий видеозвонок" : "Входящий звонок")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setTimeoutAfter(RING_TIMEOUT_MS)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
            .setContentIntent(open(ctx, base, id))
            .setFullScreenIntent(open(ctx, base, id + 1), true)
            .addAction(0, "Отклонить", open(ctx, base + "?decline=1", id + 2))
            .addAction(0, "Ответить", open(ctx, base + "?answer=1", id + 3));
        Notification n = b.build();
        // Рингтон по кругу, пока звонок не приняли/отклонили (или не истёк таймаут).
        n.flags |= Notification.FLAG_INSISTENT;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, n);
    }

    static void hide(Context ctx, String callId) {
        if (callId == null || callId.isEmpty()) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(notificationId(callId));
    }
}
