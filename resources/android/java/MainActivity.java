package ru.shalter.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

// Регистрирует свои плагины SystemBars (цвет полос под системными панелями) и AppIcon
// (иконка на рабочем столе), и запуск
// без интернета из сборки в APK (OfflineShell).
// Файл копирует scripts/apply-native-resources.js поверх сгенерированного `cap add`.
public class MainActivity extends BridgeActivity {
    // Приложение на экране — входящий звонок показывает сама страница (свой баннер),
    // нативный экран звонка из push не нужен (ShalterMessagingService).
    static volatile boolean inForeground = false;

    @Override
    public void onResume() {
        super.onResume();
        inForeground = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        inForeground = false;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemBarsPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(IncomingCallPlugin.class);
        super.onCreate(savedInstanceState);
        showOverLockScreenIfCall(getIntent());
    }

    // Нажали на уведомление-звонок (или он сам открылся на весь экран): ведём в экран
    // звонка. Приложение уже открыто — переходим внутри страницы, без перезагрузки.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        showOverLockScreenIfCall(intent);
        openPathFrom(intent, true);
    }

    // Экран звонка — поверх экрана блокировки и с включением экрана, как у «Телефона».
    private void showOverLockScreenIfCall(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("fromCall", false)) return;
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }

    private void openPathFrom(Intent intent, boolean warm) {
        if (intent == null || bridge == null || bridge.getWebView() == null) return;
        String path = intent.getStringExtra(CallNotifier.EXTRA_URL);
        if (path == null || !path.startsWith("/")) return;
        intent.removeExtra(CallNotifier.EXTRA_URL);
        String js = "(function(p){if(window.__shalterOpen){window.__shalterOpen(p)}else{location.href=p}})(" + org.json.JSONObject.quote(path) + ")";
        if (warm) bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
        else bridge.getWebView().loadUrl(bridge.getServerUrl() + path);
    }

    @Override
    protected void load() {
        super.load();
        OfflineShell.install(bridge);
        fitWebViewToInsets(bridge.getWebView());
        // Холодный запуск из уведомления-звонка — сразу экран звонка.
        openPathFrom(getIntent(), false);
    }

    // Окно во весь экран (Android 15): WebView сам отступает от строки состояния,
    // навигации и выреза — и от клавиатуры. Capacitor учитывал только системные полосы,
    // а клавиатуру — плагин Keyboard, и лишь по анимации её появления: на части
    // телефонов клавиатура закрывала поле ввода, а если свернуть приложение с открытой
    // клавиатурой, после возврата WebView оставался ужатым — пол-экрана белое. Здесь
    // отступы пересчитываются на каждое изменение (в том числе при возврате в приложение),
    // так что застрять не могут. На старых Android окно не во весь экран, система сама
    // ужимает его под клавиатуру (adjustResize), и сюда приходят нули.
    private static void fitWebViewToInsets(View webView) {
        if (webView == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            int bottom = Math.max(bars.bottom, ime.bottom);
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            if (mlp.leftMargin != bars.left || mlp.topMargin != bars.top || mlp.rightMargin != bars.right || mlp.bottomMargin != bottom) {
                mlp.leftMargin = bars.left;
                mlp.topMargin = bars.top;
                mlp.rightMargin = bars.right;
                mlp.bottomMargin = bottom;
                v.setLayoutParams(mlp);
            }
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
