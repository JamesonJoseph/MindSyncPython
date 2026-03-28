import { initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyCdliv4S59iCknXSYsEy2L6F672RHixrBY",
  authDomain: "mindsync-a34e3.firebaseapp.com",
  projectId: "mindsync-a34e3",
  storageBucket: "mindsync-a34e3.firebasestorage.app",
  messagingSenderId: "503344530777",
  appId: "1:503344530777:web:a6d468aca0d498c6c0f848",
};

const app = initializeApp(firebaseConfig);

let auth;
if (Platform.OS === "web") {
  auth = getAuth(app);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
}

export { auth };
export const storage = getStorage(app);
