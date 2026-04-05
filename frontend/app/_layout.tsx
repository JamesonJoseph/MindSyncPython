import { useEffect } from "react";
import { Stack } from "expo-router";
import { VaultProvider } from "./contexts/VaultContext";
import { registerForPushNotificationsAsync } from "../utils/notifications";
import { auth } from "../firebaseConfig";
import { getApiBaseUrl } from "../utils/api";
import { onAuthStateChanged } from "firebase/auth";

export default function RootLayout() {
  useEffect(() => {
    // Handle auth state changes to register token when user logs in
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            const { authFetch } = await import("../utils/api");
            await authFetch(`${getApiBaseUrl()}/api/users/push-token`, {
              method: "POST",
              body: JSON.stringify({ token }),
            });
            console.log("Push token registered with backend");
          }
        } catch (error) {
          console.error("Failed to register push token with backend:", error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <VaultProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </VaultProvider>
  );
}
