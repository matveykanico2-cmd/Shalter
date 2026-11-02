package ru.shalter.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Прокси приложения («Настройки → Прокси → Прокси приложения», apps/web
// features/proxy-settings/lib/native-proxy.ts): весь трафик WebView — страница, API,
// сокет, файлы — идёт через http:// или socks5:// прокси. Адрес хранится в
// SharedPreferences и ставится при каждом запуске (MainActivity.onCreate), смена
// действует сразу. Логин и пароль HTTP-прокси отдаёт OfflineShell.onReceivedHttpAuthRequest;
// SOCKS5 с паролем WebView не умеет — для него только без пароля.
// JS: Capacitor.Plugins.AppProxy.set({ url: "socks5://user:pass@1.2.3.4:1080" | null }), get().
// Файл копирует scripts/apply-native-resources.js — android/ генерируется заново.
@CapacitorPlugin(name = "AppProxy")
public class AppProxyPlugin extends Plugin {
    private static final String PREFS = "shalter_proxy";
    private static final String KEY = "url";

    static String saved(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
    }

    /** Ставит сохранённый прокси (или снимает), без ожидания. */
    static void apply(Context ctx) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) return;
        String url = saved(ctx);
        Runnable done = () -> {};
        if (url == null) {
            ProxyController.getInstance().clearProxyOverride(Runnable::run, done);
            return;
        }
        Uri u = Uri.parse(url);
        String rule = u.getScheme() + "://" + u.getHost() + ":" + u.getPort();
        ProxyConfig config = new ProxyConfig.Builder().addProxyRule(rule).build();
        ProxyController.getInstance().setProxyOverride(config, Runnable::run, done);
    }

    /** Логин и пароль для запроса авторизации от прокси host, иначе null. */
    static String[] credentialsFor(Context ctx, String host) {
        String url = saved(ctx);
        if (url == null || host == null) return null;
        Uri u = Uri.parse(url);
        String info = u.getUserInfo();
        if (info == null || !host.equalsIgnoreCase(u.getHost())) return null;
        int i = info.indexOf(':');
        String user = Uri.decode(i < 0 ? info : info.substring(0, i));
        String pass = i < 0 ? "" : Uri.decode(info.substring(i + 1));
        return new String[] { user, pass };
    }

    @PluginMethod
    public void set(PluginCall call) {
        String url = call.getString("url", null);
        if (url != null && !url.isEmpty()) {
            Uri u = Uri.parse(url);
            String scheme = u.getScheme();
            if (!("http".equals(scheme) || "socks5".equals(scheme)) || u.getHost() == null || u.getPort() <= 0) {
                call.reject("Неверный адрес прокси");
                return;
            }
        } else {
            url = null;
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            call.reject("Этот WebView не поддерживает прокси — обновите Android System WebView");
            return;
        }
        SharedPreferences.Editor e = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (url == null) e.remove(KEY); else e.putString(KEY, url);
        e.apply();
        apply(getContext());
        call.resolve();
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject res = new JSObject();
        res.put("url", saved(getContext()));
        call.resolve(res);
    }
}
