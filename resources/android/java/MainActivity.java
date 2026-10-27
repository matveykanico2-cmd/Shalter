package ru.shalter.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

// Регистрирует свои плагины SystemBars (цвет полос под системными панелями) и AppIcon
// (иконка на рабочем столе), запуск без интернета из сборки в APK (OfflineShell)
// и системную кнопку «Назад» (handleBack).
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
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBack();
            }
        });
    }

    // Системная «Назад»: без обработчика Android просто закрывал приложение — из чата, из
    // открытого окна, с любого экрана. Сначала спрашиваем страницу (window.__shalterBack в
    // apps/web, use-back-button.ts): она закрывает окно или меню, уходит на экран назад и
    // отвечает true; на главном экране — false, и приложение уходит в фон (как «Домой»: сокет
    // и фоновая служба уведомлений живут). Страница без моста (/download и т. п.) — назад
    // по истории WebView, а если некуда — в фон.
    private void handleBack() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript(
            "(function(){try{return window.__shalterBack?(window.__shalterBack()?'handled':'root'):'none'}catch(e){return 'none'}})()",
            (result) -> {
                if ("\"handled\"".equals(result)) return;
                if (!"\"root\"".equals(result) && webView.canGoBack()) webView.goBack();
                else moveTaskToBack(true);
            }
        );
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

    // Куда перейти: экран звонка из уведомления (CallNotifier) или ссылка shalter://chat/… /
    // https://<сервер>/chat/… (фильтры — scripts/apply-native-resources.js, wireAndroidDeepLinks).
    private String pathFromIntent(Intent intent) {
        String path = intent.getStringExtra(CallNotifier.EXTRA_URL);
        if (path != null) {
            intent.removeExtra(CallNotifier.EXTRA_URL);
            return path.startsWith("/") ? path : null;
        }
        Uri data = intent.getData();
        if (data == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        intent.setData(null);
        String rest = data.getEncodedPath() == null ? "" : data.getEncodedPath();
        if ("shalter".equalsIgnoreCase(data.getScheme())) {
            String host = data.getEncodedAuthority() == null ? "" : data.getEncodedAuthority();
            path = ("/" + host + rest).replaceAll("/{2,}", "/");
        } else {
            Uri server = Uri.parse(bridge.getServerUrl());
            if (!"https".equalsIgnoreCase(data.getScheme()) || server.getHost() == null || !server.getHost().equalsIgnoreCase(data.getHost())) return null;
            path = rest.isEmpty() ? "/" : rest;
        }
        if (data.getEncodedQuery() != null) path += "?" + data.getEncodedQuery();
        if (data.getEncodedFragment() != null) path += "#" + data.getEncodedFragment();
        return path;
    }

    private void openPathFrom(Intent intent, boolean warm) {
        if (intent == null || bridge == null || bridge.getWebView() == null) return;
        String path = pathFromIntent(intent);
        if (path == null) return;
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
