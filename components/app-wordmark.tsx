import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const salonProLogo = require('../assets/images/salon-pro-logo-ui.png');

export function AppWordmark() {
  return (
    <View style={styles.wrap}>
      <Image
        source={salonProLogo}
        style={styles.wordmark}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
    marginBottom: -26,
  },
  wordmark: {
    width: 378,
    height: 102,
  },
});
