package ru.shalter.app;

import android.os.Bundle;
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
    }
}
