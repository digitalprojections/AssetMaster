package link.created.assetmaster;

import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Color;
import android.os.Bundle;

import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(
                this,
                SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT, MainActivity::isDarkMode),
                SystemBarStyle.auto(0xE6FFFFFF, 0x801B1B1B, MainActivity::isDarkMode)
        );
        registerPlugin(PlayIntegrityPlugin.class);
        registerPlugin(PlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }

    private static boolean isDarkMode(Resources resources) {
        int nightMode = resources.getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }
}
