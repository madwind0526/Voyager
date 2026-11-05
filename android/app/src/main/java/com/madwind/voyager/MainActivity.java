package com.madwind.voyager;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FolderMusicPlugin.class); // before super: the bridge reads the list while it starts
        super.onCreate(savedInstanceState);
    }
}
