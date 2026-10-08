package ru.shalter.app;

import android.graphics.Color;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Цвет полос под строкой состояния и навигацией (на Android 15 окно во весь экран,
// и в отступах виден фон окна) — под тему приложения, а не системы: иначе тёмное
// приложение на светлом телефоне получало белые полосы сверху и снизу.
// JS: Capacitor.Plugins.SystemBars.setColor({ color: "#212121", light: false }).
// Файл копирует scripts/apply-native-resources.js — android/ генерируется заново.
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
    @PluginMethod
    public void setColor(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", "#ffffff"));
        } catch (IllegalArgumentException e) {
            call.reject("bad color");
            return;
        }
        // light = светлый фон → тёмные значки времени/батареи.
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", true));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View decor = window.getDecorView();
            decor.setBackgroundColor(color);
            View content = getActivity().findViewById(android.R.id.content);
            if (content != null) content.setBackgroundColor(color);
            if (getBridge().getWebView() != null && getBridge().getWebView().getParent() instanceof View) {
                ((View) getBridge().getWebView().getParent()).setBackgroundColor(color);
            }
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            call.resolve(new JSObject());
        });
    }
}
