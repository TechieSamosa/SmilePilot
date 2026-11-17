package app.dentalos.clinic;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Native multi-threaded X-ray AI (see NativeOnnxPlugin)
        registerPlugin(NativeOnnxPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
