package ru.shalter.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import java.util.Map;

/** Message push with native actions. Copied into generated Android builds with Firebase. */
final class MessageNotifier {
    static final String CHANNEL = "messages";
    static final String ACTION = "ru.shalter.app.MESSAGE_ACTION";
    static final String EXTRA_ACTION = "action";
    static final String EXTRA_CHAT_ID = "chatId";
    static final String EXTRA_MESSAGE_ID = "messageId";
    static final String EXTRA_URL = "url";
    static final String ACTION_REPLY = "reply";
    static final String ACTION_READ = "read";
    static final String ACTION_DELETE = "delete";
    static final String REPLY_KEY = "reply";

    private MessageNotifier() {}

    private static int notificationId(String chatId) {
        return 0x4D00_0000 | (chatId.hashCode() & 0x00FF_FFFF);
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Сообщения", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Новые сообщения Shalter");
        nm.createNotificationChannel(channel);
    }

    private static PendingIntent action(Context ctx, String action, String chatId, String messageId, int requestCode) {
        Intent intent = new Intent(ctx, MessageNotificationReceiver.class)
            .setAction(ACTION)
            .putExtra(EXTRA_ACTION, action)
            .putExtra(EXTRA_CHAT_ID, chatId)
            .putExtra(EXTRA_MESSAGE_ID, messageId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        // Android 12 requires a mutable PendingIntent for inline RemoteInput.
        // The receiver is explicit, so mutability is limited to this one action.
        if (ACTION_REPLY.equals(action) && Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        else if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        // RemoteInput is added to the reply PendingIntent by NotificationCompat itself.
        return PendingIntent.getBroadcast(ctx, requestCode, intent, flags);
    }

    private static PendingIntent open(Context ctx, String url, int requestCode) {
        Intent intent = new Intent(ctx, MainActivity.class)
            .putExtra(CallNotifier.EXTRA_URL, url)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(ctx, requestCode, intent, flags);
    }

    static void show(Context ctx, Map<String, String> data) {
        String chatId = data.get(EXTRA_CHAT_ID);
        String messageId = data.get(EXTRA_MESSAGE_ID);
        if (chatId == null || chatId.isEmpty() || messageId == null || messageId.isEmpty()) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        int icon = ctx.getResources().getIdentifier("ic_stat_shalter", "drawable", ctx.getPackageName());
        if (icon == 0) return;
        try {
            ensureChannel(ctx);
            int id = notificationId(chatId);
            String url = data.get(EXTRA_URL);
            if (url == null || url.isEmpty()) url = "/chat/" + chatId;
            NotificationCompat.Action reply = new NotificationCompat.Action.Builder(
                0,
                "Ответить",
                action(ctx, ACTION_REPLY, chatId, messageId, id + 1)
            ).addRemoteInput(new RemoteInput.Builder(REPLY_KEY).setLabel("Сообщение…").build()).build();
            NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(icon)
                .setContentTitle(data.get("title") == null ? "Shalter" : data.get("title"))
                .setContentText(data.get("body") == null ? "Новое сообщение" : data.get("body"))
                .setContentIntent(open(ctx, url, id))
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setGroup(data.get("tag"))
                .addAction(reply)
                .addAction(0, "Прочитано", action(ctx, ACTION_READ, chatId, messageId, id + 2))
                .addAction(0, "Удалить", action(ctx, ACTION_DELETE, chatId, messageId, id + 3));
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(id, builder.build());
        } catch (RuntimeException ignored) {
            // OEM notification restrictions must not crash Firebase's service.
        }
    }

    static void cancel(Context ctx, String chatId) {
        if (chatId == null || chatId.isEmpty()) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(notificationId(chatId));
    }
}
