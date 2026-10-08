package ru.shalter.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Регистрирует свой плагин SystemBars (цвет полос под системными панелями).
// Файл копирует scripts/apply-native-resources.js поверх сгенерированного `cap add`.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
