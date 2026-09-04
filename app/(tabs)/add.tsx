import { Redirect } from 'expo-router';
import React from 'react';

/**
 * The centre tab never renders — its button opens the camera modal directly.
 * This exists so expo-router has a route to register.
 */
export default function AddTabPlaceholder() {
  return <Redirect href="/(tabs)" />;
}
