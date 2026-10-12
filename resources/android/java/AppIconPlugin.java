package ru.shalter.app;

import android.content.ComponentName;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Иконка приложения на рабочем столе (Настройки → Внешний вид → Иконка приложения).
// Каждая иконка — activity-alias ".Icon_<id>" на MainActivity (их дописывает в манифест
// scripts/apply-native-resources.js): включённый алиас и есть значок в лаунчере.
// JS: Capacitor.Plugins.AppIcon.set({ name: "gold" }).
// Файл копирует scripts/apply-native-resources.js — android/ генерируется заново.
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    private static final String PREFIX = ".Icon_";

    @PluginMethod
    public void set(PluginCall call) {
        String name = call.getString("name", "classic");
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        String wanted = pkg + PREFIX + name;
        ActivityInfo[] aliases;
        try {
            PackageInfo info = pm.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES | PackageManager.MATCH_DISABLED_COMPONENTS);
            aliases = info.activities;
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("package not found");
            return;
        }
        boolean found = false;
        for (ActivityInfo a : aliases) if (a.name.equals(wanted)) found = true;
        if (!found) {
            call.reject("unknown icon: " + name);
            return;
        }
        // Сначала включаем новую, потом выключаем остальные: иначе на миг у приложения
        // не остаётся ни одного значка, и часть лаунчеров убирает его с рабочего стола.
        // DONT_KILL_APP — приложение не перезапускается посреди работы.
        pm.setComponentEnabledSetting(new ComponentName(pkg, wanted), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (ActivityInfo a : aliases) {
            if (a.name.equals(wanted) || !a.name.startsWith(pkg + PREFIX)) continue;
            pm.setComponentEnabledSetting(new ComponentName(pkg, a.name), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
        JSObject result = new JSObject();
        result.put("name", name);
        call.resolve(result);
    }
}
