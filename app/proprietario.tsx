import { Redirect } from 'expo-router';
import React from 'react';
import { useAppContext } from '../src/context/AppContext';
import { OwnerAccessScreen } from '../src/screens/OwnerAccessScreen';

export default function ProprietarioScreen() {
  const { isAuthenticated } = useAppContext();

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <OwnerAccessScreen />;
}
