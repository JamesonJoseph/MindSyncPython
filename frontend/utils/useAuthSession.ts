import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';

type AuthSession = {
  user: any;
  isAuthReady: boolean;
};

export function useAuthSession(): AuthSession {
  const [user, setUser] = useState<any>(() => auth.currentUser ?? null);
  const [isAuthReady, setIsAuthReady] = useState(() => Boolean(auth.currentUser));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setIsAuthReady(true);
      },
      () => {
        setUser(null);
        setIsAuthReady(true);
      }
    );

    return unsubscribe;
  }, []);

  return { user, isAuthReady };
}
