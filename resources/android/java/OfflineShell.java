package ru.shalter.app;

import android.net.Uri;
import android.os.Build;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

// Запуск без интернета. Приложение открывает https://shalter.ru (server.url), и без
// связи WebView показывал свою страницу ошибки. Теперь, если главную страницу загрузить
// не удалось (и service worker не отдал её из кэша), открываем сборку, вшитую в APK
// (assets/public = public/dist), но под адресом сервера: тот же origin — те же
// localStorage, IndexedDB, куки и кэш service worker'а, то есть приложение запускается
// с сохранёнными данными, а когда сеть вернётся, запросы к API пойдут на сервер.
//
// Файлы сборки из APK отдаём только по точному адресу из build.json (chunk-ХЕШ.js,
// app.js?v=ХЕШ …): адрес однозначно задаёт содержимое, так что подмешать старый файл к
// новой версии с сервера нельзя — с той же версией это просто те же байты без сети.
// Файл копирует scripts/apply-native-resources.js — android/ генерируется заново.
final class OfflineShell extends BridgeWebViewClient {
    private static final String ASSETS = "public/";

    private final Bridge bridge;
    private final String host;
    private final Set<String> bundled = new HashSet<>();

    static void install(Bridge bridge) {
        OfflineShell shell = new OfflineShell(bridge);
        bridge.setWebViewClient(shell);
        // Запросы самого service worker'а Capacitor направляет в свой обработчик — оборачиваем и его.
        if (Build.VERSION.SDK_INT >= 24 && bridge.getConfig().isResolveServiceWorkerRequests()) {
            ServiceWorkerController.getInstance().setServiceWorkerClient(
                new ServiceWorkerClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                        WebResourceResponse res = bridge.getLocalServer().shouldInterceptRequest(request);
                        return res != null ? res : shell.bundledFile(request);
                    }
                }
            );
        }
    }

    private OfflineShell(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        String url = bridge.getServerUrl();
        this.host = url != null ? Uri.parse(url).getHost() : null;
        try {
            JSONArray precache = new JSONObject(readAsset("build.json")).getJSONArray("precache");
            for (int i = 0; i < precache.length(); i++) bundled.add(precache.getString(i));
        } catch (Exception e) {
            Logger.warn("OfflineShell: в APK нет build.json — офлайн-запуск без файлов сборки");
        }
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse res = super.shouldInterceptRequest(view, request);
        return res != null ? res : bundledFile(request);
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request.isForMainFrame() && isOurs(request.getUrl())) openBundled(view, request.getUrl().toString());
    }

    // Сервер лежит (502 от прокси и т. п.) — тоже открываем вшитую копию, а не страницу ошибки.
    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        super.onReceivedHttpError(view, request, response);
        if (request.isForMainFrame() && isOurs(request.getUrl()) && response.getStatusCode() >= 500) {
            openBundled(view, request.getUrl().toString());
        }
    }

    private boolean isOurs(Uri url) {
        return host != null && host.equalsIgnoreCase(url.getHost());
    }

    WebResourceResponse bundledFile(WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!"GET".equals(request.getMethod()) || !isOurs(url)) return null;
        String path = url.getEncodedPath();
        String query = url.getEncodedQuery();
        if (path == null || !path.startsWith("/dist/") || !bundled.contains(query == null ? path : path + "?" + query)) return null;
        try {
            InputStream in = bridge.getContext().getAssets().open(ASSETS + path.substring("/dist/".length()));
            return new WebResourceResponse(mimeType(path), "UTF-8", in);
        } catch (IOException e) {
            return null;
        }
    }

    private static String mimeType(String path) {
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    // Вшитый index.html под адресом, который не открылся (роутер покажет тот же экран),
    // со скриптом моста Capacitor — иначе нативные плагины на этой странице не работают.
    private void openBundled(WebView view, String url) {
        String html;
        try {
            html = readAsset("index.html");
        } catch (IOException e) {
            return; // без вшитой сборки остаётся обычная страница ошибки
        }
        String bridgeJs = capacitorScript();
        int head = html.indexOf("<head>");
        if (bridgeJs != null && head >= 0) {
            int at = head + "<head>".length();
            html = html.substring(0, at) + "\n<script type=\"text/javascript\">" + bridgeJs + "</script>\n" + html.substring(at);
        }
        Logger.info("OfflineShell: нет связи с сервером — открываю сборку из APK");
        view.loadDataWithBaseURL(url, html, "text/html", "UTF-8", url);
    }

    // Скрипт моста Capacitor — тот, что он сам вставляет в страницы сервера. JSInjector
    // у него закрыт пакетом, поэтому берём его у локального сервера через рефлексию.
    private String capacitorScript() {
        try {
            Field field = bridge.getLocalServer().getClass().getDeclaredField("jsInjector");
            field.setAccessible(true);
            Object injector = field.get(bridge.getLocalServer());
            Method script = injector.getClass().getDeclaredMethod("getScriptString");
            script.setAccessible(true);
            return (String) script.invoke(injector);
        } catch (Exception e) {
            Logger.warn("OfflineShell: не нашёл скрипт моста Capacitor — плагины на офлайн-странице недоступны");
            return null;
        }
    }

    private String readAsset(String name) throws IOException {
        try (InputStream in = bridge.getContext().getAssets().open(ASSETS + name)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) != -1; ) out.write(buf, 0, n);
        return out.toByteArray();
    }
}
