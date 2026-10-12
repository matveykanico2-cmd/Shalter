package ru.shalter.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// JS: Capacitor.Plugins.IncomingCall.show({ callId, name, video }) / hide({ callId }).
// Вызывается из lib/nativeNotify.js, когда звонок пришёл по сокету, а приложение свёрнуто.
@CapacitorPlugin(name = "IncomingCall")
public class IncomingCallPlugin extends Plugin {
    @PluginMethod
    public void show(PluginCall call) {
        CallNotifier.show(getContext(), call.getString("callId"), call.getString("name"), Boolean.TRUE.equals(call.getBoolean("video", false)));
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void hide(PluginCall call) {
        CallNotifier.hide(getContext(), call.getString("callId"));
        call.resolve(new JSObject());
    }
}
