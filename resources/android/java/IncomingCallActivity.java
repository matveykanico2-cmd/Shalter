package ru.shalter.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Нативный экран звонка поверх lock screen. WebView открывается только после unlock. */
public final class IncomingCallActivity extends Activity {
    static final String EXTRA_CALL_ID = "callId";
    static final String EXTRA_CALLER = "callerName";
    static final String EXTRA_VIDEO = "video";
    static final String EXTRA_URL = "shalterUrl";
    static final String EXTRA_AUTO_OPEN = "autoOpen";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOnLockedScreen();
        render();
        if (getIntent().getBooleanExtra(EXTRA_AUTO_OPEN, false)) {
            requestUnlockAndOpen();
        }
    }

    private void showOnLockedScreen() {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void render() {
        String caller = getIntent().getStringExtra(EXTRA_CALLER);
        if (caller == null || caller.isEmpty()) caller = "Входящий звонок";
        boolean video = getIntent().getBooleanExtra(EXTRA_VIDEO, false);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(44, 48, 44, 48);
        root.setBackgroundColor(Color.rgb(22, 28, 38));

        TextView type = text(video ? "Входящий видеозвонок" : "Входящий звонок", 18, Color.LTGRAY);
        TextView name = text(caller, 32, Color.WHITE);
        name.setGravity(Gravity.CENTER);
        root.addView(type, widthWrap());
        root.addView(name, widthWrapWithTop(22));

        TextView hint = text("Разблокируйте телефон, чтобы ответить", 16, Color.LTGRAY);
        hint.setGravity(Gravity.CENTER);
        root.addView(hint, widthWrapWithTop(18));

        Button answer = new Button(this);
        answer.setText("Разблокировать и ответить");
        answer.setOnClickListener((View ignored) -> requestUnlockAndOpen());
        root.addView(answer, widthWrapWithTop(34));

        Button close = new Button(this);
        close.setText("Оставить звонок в уведомлении");
        close.setOnClickListener((View ignored) -> finish());
        root.addView(close, widthWrapWithTop(10));
        setContentView(root);
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private LinearLayout.LayoutParams widthWrap() {
        return new LinearLayout.LayoutParams(-1, -2);
    }

    private LinearLayout.LayoutParams widthWrapWithTop(int top) {
        LinearLayout.LayoutParams params = widthWrap();
        params.topMargin = top;
        return params;
    }

    private void requestUnlockAndOpen() {
        KeyguardManager keyguard = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguard != null && keyguard.isKeyguardLocked() && Build.VERSION.SDK_INT >= 26) {
            keyguard.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override public void onDismissSucceeded() { openCall(); }
            });
            return;
        }
        openCall();
    }

    private void openCall() {
        String url = getIntent().getStringExtra(EXTRA_URL);
        if (url == null || url.isEmpty()) return;
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra(CallNotifier.EXTRA_URL, url);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
}
