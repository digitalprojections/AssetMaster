package link.created.assetmaster;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;

import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PlayIntegrity")
public class PlayIntegrityPlugin extends Plugin {
    private StandardIntegrityManager integrityManager;
    private StandardIntegrityManager.StandardIntegrityTokenProvider tokenProvider;

    @PluginMethod
    public void prepare(PluginCall call) {
        Long cloudProjectNumber = readCloudProjectNumber(call);
        if (cloudProjectNumber == null || cloudProjectNumber <= 0) {
            call.reject("A valid cloudProjectNumber is required.", "cloud_project_number_required");
            return;
        }

        StandardIntegrityManager.PrepareIntegrityTokenRequest request =
                StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                        .setCloudProjectNumber(cloudProjectNumber)
                        .build();

        getIntegrityManager().prepareIntegrityToken(request)
                .addOnSuccessListener(provider -> {
                    tokenProvider = provider;
                    JSObject result = new JSObject();
                    result.put("prepared", true);
                    call.resolve(result);
                })
                .addOnFailureListener(exception ->
                        call.reject("Play Integrity provider preparation failed.", "prepare_failed", exception));
    }

    @PluginMethod
    public void requestToken(PluginCall call) {
        String requestHash = call.getString("requestHash");
        if (requestHash == null || requestHash.trim().isEmpty()) {
            call.reject("A requestHash is required.", "request_hash_required");
            return;
        }

        if (requestHash.getBytes(StandardCharsets.UTF_8).length > 500) {
            call.reject("requestHash must be 500 bytes or less.", "request_hash_too_long");
            return;
        }

        if (tokenProvider == null) {
            call.reject("Play Integrity token provider is not prepared.", "provider_not_prepared");
            return;
        }

        StandardIntegrityManager.StandardIntegrityTokenRequest request =
                StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
                        .setRequestHash(requestHash)
                        .build();

        tokenProvider.request(request)
                .addOnSuccessListener(response -> {
                    JSObject result = new JSObject();
                    result.put("token", response.token());
                    call.resolve(result);
                })
                .addOnFailureListener(exception ->
                        call.reject("Play Integrity token request failed.", "request_failed", exception));
    }

    private StandardIntegrityManager getIntegrityManager() {
        if (integrityManager == null) {
            integrityManager = IntegrityManagerFactory.createStandard(getContext().getApplicationContext());
        }

        return integrityManager;
    }

    private Long readCloudProjectNumber(PluginCall call) {
        String value = call.getString("cloudProjectNumber");
        if (value == null) {
            return null;
        }

        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
