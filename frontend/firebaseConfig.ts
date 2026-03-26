import { initializeApp } from "firebase/app";
// @ts-ignore
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyCdliv4S59iCknXSYsEy2L6F672RHixrBY",
  authDomain: "mindsync-a34e3.firebaseapp.com",
  projectId: "mindsync-a34e3",
  storageBucket: "mindsync-a34e3.firebasestorage.app",
  messagingSenderId: "503344530777",
  appId: "1:503344530777:web:a6d468aca0d498c6c0f848"
};

const app = initializeApp(firebaseConfig);

// @ts-ignore
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const storage = getStorage(app);
