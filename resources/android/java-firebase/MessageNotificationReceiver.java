package ru.shalter.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.webkit.CookieManager;
import androidx.core.app.RemoteInput;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONObject;

/** Executes message notification actions without opening the WebView. */
public final class MessageNotificationReceiver extends BroadcastReceiver {
    // Keep this in sync with capacitor.config.json. The server can reject the request
    // normally if the cookie is missing or the account was revoked.
    private static final String API_ORIGIN = "https://shalter.ru";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !MessageNotifier.ACTION.equals(intent.getAction())) return;
        BroadcastReceiver.PendingResult pending = goAsync();
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                String action = intent.getStringExtra(MessageNotifier.EXTRA_ACTION);
                String chatId = intent.getStringExtra(MessageNotifier.EXTRA_CHAT_ID);
                String messageId = intent.getStringExtra(MessageNotifier.EXTRA_MESSAGE_ID);
                if (chatId == null || chatId.isEmpty()) return;
                boolean ok;
                if (MessageNotifier.ACTION_READ.equals(action)) {
                    ok = request("POST", "/api/chats/" + encode(chatId) + "/read", null);
                } else if (MessageNotifier.ACTION_DELETE.equals(action)) {
                    JSONObject body = new JSONObject().put("forEveryone", false);
                    ok = messageId != null && request("DELETE", "/api/chats/" + encode(chatId) + "/messages/" + encode(messageId), body.toString());
                } else if (MessageNotifier.ACTION_REPLY.equals(action)) {
                    CharSequence input = RemoteInput.getResultsFromIntent(intent) == null
                        ? null
                        : RemoteInput.getResultsFromIntent(intent).getCharSequence(MessageNotifier.REPLY_KEY);
                    String text = input == null ? "" : input.toString().trim();
                    if (text.isEmpty()) {
                        openChat(app, chatId, messageId);
                        return;
                    }
                    JSONObject body = new JSONObject().put("text", text).put("clientId", "native_" + UUID.randomUUID());
                    if (messageId != null && !messageId.isEmpty()) body.put("replyToId", messageId);
                    ok = request("POST", "/api/chats/" + encode(chatId) + "/messages", body.toString());
                    if (ok) request("POST", "/api/chats/" + encode(chatId) + "/read", null);
                } else {
                    return;
                }
                if (ok) MessageNotifier.cancel(app, chatId);
                else openChat(app, chatId, messageId);
            } catch (Exception ignored) {
                openChat(app, intent.getStringExtra(MessageNotifier.EXTRA_CHAT_ID), intent.getStringExtra(MessageNotifier.EXTRA_MESSAGE_ID));
            } finally {
                pending.finish();
            }
        }, "shalter-push-action").start();
    }

    private static boolean request(String method, String path, String body) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(API_ORIGIN + path).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(7000);
            connection.setReadTimeout(7000);
            connection.setDoInput(true);
            connection.setRequestProperty("Accept", "application/json");
            String cookies = CookieManager.getInstance().getCookie(API_ORIGIN);
            if (cookies != null && !cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            return status >= 200 && status < 300;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static void openChat(Context context, String chatId, String messageId) {
        if (chatId == null || chatId.isEmpty()) return;
        Intent intent = new Intent(context, MainActivity.class)
            .putExtra(CallNotifier.EXTRA_URL, "/chat/" + encode(chatId) + (messageId == null ? "" : "?reply=" + encode(messageId)))
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        context.startActivity(intent);
    }
}
