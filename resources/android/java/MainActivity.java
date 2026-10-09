package ru.shalter.app;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

// Регистрирует свой плагин SystemBars (цвет полос под системными панелями) и запуск
// без интернета из сборки в APK (OfflineShell).
// Файл копирует scripts/apply-native-resources.js поверх сгенерированного `cap add`.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        super.load();
        OfflineShell.install(bridge);
        fitWebViewToInsets(bridge.getWebView());
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
