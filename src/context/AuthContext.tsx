import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  auth,
  db,
  isFirebaseConfigured,
  handleFirestoreError,
  OperationType,
} from "@/lib/firebase";
import type { CivicRole } from "@/lib/civic-data";

export interface CivicUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: CivicRole;
  department?: string | undefined;
  ward?: string | undefined;
  phone?: string | undefined;
  isDemo?: boolean | undefined;
}

const DEMO_USERS: Record<CivicRole, CivicUserProfile> = {
  citizen: {
    uid: "demo-citizen-rahul",
    email: "citizen.rahul@civicpulse.org",
    displayName: "Rahul Sharma",
    role: "citizen",
    ward: "Ward K-04",
    isDemo: true,
  },
  officer: {
    uid: "demo-officer-deshmukh",
    email: "officer.deshmukh@kopargaon.gov.in",
    displayName: "P. Deshmukh (Municipal Officer)",
    role: "officer",
    department: "Water Supply",
    ward: "Ward K-04",
    isDemo: true,
  },
  admin: {
    uid: "demo-admin-city",
    email: "admin@civicpulse.org",
    displayName: "Municipal Administrator",
    role: "admin",
    isDemo: true,
  },
};

interface AuthContextType {
  user: User | null;
  profile: CivicUserProfile;
  role: CivicRole;
  loading: boolean;
  isFirebaseConnected: boolean;
  signInWithGoogle: () => Promise<void>;
  switchDemoRole: (role: CivicRole) => void;
  updateRole: (role: CivicRole, department?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CivicUserProfile>(DEMO_USERS.citizen);
  const [loading, setLoading] = useState(true);

  const isUserSuperAdmin = (email?: string | null) =>
    email === "tanujabhagade11@gmail.com" || email === "bhagadetanuja5@gmail.com";

  // Load persistent user profile from Firestore or set defaults
  const loadOrCreateUserProfile = async (fbUser: User): Promise<CivicUserProfile> => {
    if (!isFirebaseConfigured || !db) {
      return {
        uid: fbUser.uid,
        email: fbUser.email || "citizen@civicpulse.org",
        displayName: fbUser.displayName || "Civic Citizen",
        role: isUserSuperAdmin(fbUser.email) ? "admin" : "citizen",
        isDemo: false,
      };
    }

    const userDocRef = doc(db, "users", fbUser.uid);
    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        let role = (data["role"] as CivicRole) || "citizen";
        if (isUserSuperAdmin(fbUser.email)) {
          role = "admin";
        }
        return {
          uid: fbUser.uid,
          email: fbUser.email || (data["email"] as string) || "",
          displayName: fbUser.displayName || (data["displayName"] as string) || "Civic Citizen",
          role,
          department: data["department"] as string | undefined,
          ward: data["ward"] as string | undefined,
          phone: data["phone"] as string | undefined,
          isDemo: false,
        };
      } else {
        // Create initial profile in Firestore
        const isSuperAdmin = isUserSuperAdmin(fbUser.email);
        const newProfile: CivicUserProfile = {
          uid: fbUser.uid,
          email: fbUser.email || "",
          displayName: fbUser.displayName || "Civic Citizen",
          role: isSuperAdmin ? "admin" : "citizen",
          department: isSuperAdmin ? "Administration" : undefined,
          isDemo: false,
        };

        await setDoc(userDocRef, {
          id: fbUser.uid,
          email: fbUser.email || "",
          displayName: newProfile.displayName,
          role: newProfile.role,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // If super admin, ensure admin lookup document exists
        if (isSuperAdmin) {
          await setDoc(doc(db, "admins", fbUser.uid), {
            id: fbUser.uid,
            email: fbUser.email,
            createdAt: new Date().toISOString(),
          });
        }

        return newProfile;
      }
    } catch (err) {
      console.warn(
        "[CivicPulse Auth] Firestore profile fetch error, using local fallback profile:",
        err,
      );
      return {
        uid: fbUser.uid,
        email: fbUser.email || "citizen@civicpulse.org",
        displayName: fbUser.displayName || "Civic Citizen",
        role: isUserSuperAdmin(fbUser.email) ? "admin" : "citizen",
        isDemo: false,
      };
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const p = await loadOrCreateUserProfile(currentUser);
        setProfile(p);
      } else {
        setUser(null);
        // Retain or restore demo profile so demo experience is never interrupted
        setProfile((prev) => (prev.isDemo ? prev : DEMO_USERS.citizen));
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error("Firebase Authentication is not configured.");
    }
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const p = await loadOrCreateUserProfile(result.user);
      setUser(result.user);
      setProfile(p);
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      if (errorObj?.code === "auth/unauthorized-domain") {
        const domain = typeof window !== "undefined" ? window.location.hostname : "current host";
        console.warn(
          `[CivicPulse Auth] Domain "${domain}" is not authorized in Firebase Console. Add "${domain}" to Firebase Console > Authentication > Settings > Authorized Domains.`,
        );
        const domainError = new Error(
          `Domain "${domain}" is not authorized in Firebase Authentication. Add it in Firebase Console > Authentication > Settings > Authorized domains, or use one of the Demo Perspectives below to continue testing immediately.`,
        );
        (domainError as Error & { code: string }).code = "auth/unauthorized-domain";
        throw domainError;
      }
      throw err;
    }
  };

  const switchDemoRole = (role: CivicRole) => {
    setProfile(DEMO_USERS[role] || DEMO_USERS.citizen);
  };

  const updateRole = async (newRole: CivicRole, department?: string) => {
    if (user && isFirebaseConfigured && db) {
      try {
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(
          userDocRef,
          {
            role: newRole,
            department: department || profile.department,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
    setProfile((prev) => ({
      ...prev,
      role: newRole,
      department: department ?? prev.department,
    }));
  };

  const logout = async () => {
    if (user && isFirebaseConfigured && auth) {
      await signOut(auth);
    }
    setUser(null);
    setProfile(DEMO_USERS.citizen);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: profile.role,
        loading,
        isFirebaseConnected: isFirebaseConfigured,
        signInWithGoogle,
        switchDemoRole,
        updateRole,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
