package ru.shalter.app;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

// Push от Firebase, в том числе когда приложение закрыто. Звонок сервер шлёт без
// блока notification (только data) — Android сам его не показывает, и мы показываем
// экран входящего звонка (CallNotifier). Остальное — как у плагина Capacitor.
// Подключается scripts/apply-native-resources.js только в сборках с Firebase.
public class ShalterMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String kind = data.get("kind");
        if ("call".equals(kind) && !MainActivity.inForeground) {
            CallNotifier.show(this, data.get("callId"), data.get("title"), "1".equals(data.get("video")));
        } else if ("call-cancelled".equals(kind) || "call-missed".equals(kind)) {
            CallNotifier.hide(this, data.get("callId"));
        }
        super.onMessageReceived(message);
    }
}
