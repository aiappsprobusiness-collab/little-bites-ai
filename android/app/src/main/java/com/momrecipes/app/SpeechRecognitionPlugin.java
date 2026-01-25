package com.momrecipes.app;

import android.Manifest;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "SpeechRecognition",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias = "microphone"
        )
    }
)
public class SpeechRecognitionPlugin extends Plugin {

    private SpeechRecognizer speechRecognizer;
    private static final int REQUEST_CODE_SPEECH_INPUT = 1000;
    private PluginCall currentCall;

    @Override
    public void load() {
        super.load();
        if (SpeechRecognizer.isRecognitionAvailable(getContext())) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        // Проверяем разрешение
        if (!hasRequiredPermissions()) {
            requestPermissionForAlias("microphone", call, "permissionCallback");
            return;
        }

        // Проверяем доступность распознавания речи
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition not available on this device");
            return;
        }

        if (speechRecognizer == null) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        }

        currentCall = call;

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU"); // Русский язык
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

        try {
            startActivityForResult(call, intent, REQUEST_CODE_SPEECH_INPUT);
        } catch (Exception e) {
            call.reject("Failed to start speech recognition: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (speechRecognizer != null) {
            speechRecognizer.cancel();
            cleanup();
        }
        call.resolve();
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean hasPermission = hasRequiredPermissions();
        JSObject result = new JSObject();
        result.put("granted", hasPermission);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasRequiredPermissions()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            requestPermissionForAlias("microphone", call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (hasRequiredPermissions()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            call.reject("Microphone permission denied");
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_CODE_SPEECH_INPUT && currentCall != null) {
            if (resultCode == getActivity().RESULT_OK && data != null) {
                java.util.ArrayList<String> results = data.getStringArrayListExtra(
                    RecognizerIntent.EXTRA_RESULTS
                );
                if (results != null && !results.isEmpty()) {
                    JSObject result = new JSObject();
                    result.put("text", results.get(0));
                    result.put("language", "ru-RU");
                    result.put("isFinal", true);
                    currentCall.resolve(result);
                } else {
                    currentCall.reject("No speech recognized");
                }
            } else {
                currentCall.reject("Speech recognition failed");
            }
            currentCall = null;
        }
    }

    @Override
    public boolean hasRequiredPermissions() {
        return ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
    }

    public void cleanup() {
        if (speechRecognizer != null) {
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
    }
}
