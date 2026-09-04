import { Stack } from 'expo-router';
import React from 'react';

import { NavHeader } from '@/components/domain/NavHeader';
import { ListingDraftProvider } from '@/features/listing/draft';

export default function ListLayout() {
  return (
    <ListingDraftProvider>
      <Stack
        screenOptions={{
          header: (props) => <NavHeader canGoBack={props.navigation.canGoBack()} />,
          animation: 'slide_from_right',
        }}
      >
        {/* Draws its own header, with the photo actions in it. */}
        <Stack.Screen name="confirm" options={{ headerShown: false }} />
        {/* The camera is full-bleed; a bar over it would cover the viewfinder. */}
        <Stack.Screen name="camera" options={{ headerShown: false }} />
      </Stack>
    </ListingDraftProvider>
  );
}
