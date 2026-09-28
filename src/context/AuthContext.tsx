import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  updatePassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, set, get } from 'firebase/database';
import { auth, db, rtdb, handleFirestoreError, OperationType } from '../lib/firebase';
import { CustomerUser, UserRole } from '../types';

export interface SignUpData {
  username?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  age?: number;
  password?: string;
}

export interface GoogleAuthResult {
  isNewUser: boolean;
  user: User;
  profile?: CustomerUser;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthContextType {
  user: User | null;
  profile: CustomerUser | null;
  role: UserRole | null;
  loading: boolean;
  signInWithGoogle: () => Promise<GoogleAuthResult>;
  completeGoogleSignUp: (data: {
    uid: string;
    username?: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    password?: string;
    age?: number;
  }) => Promise<CustomerUser>;
  signUp: (data: SignUpData) => Promise<void>;
  logIn: (email: string, password: string) => Promise<CustomerUser>;
  logOut: () => Promise<void>;
  updateCustomerProfile: (data: Partial<CustomerUser> & { password?: string }) => Promise<void>;
  authenticateAsRole: (targetRole: 'customer' | 'owner') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_SESSION_KEY = 'lypetal_customer_session';

// Safe firestore write wrapper to guarantee operations never hang the UI
export const safeFirestoreWrite = async (promise: Promise<any>, timeoutMs = 2500): Promise<void> => {
  try {
    await Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (err) {
    console.warn('safeFirestoreWrite notice:', err);
  }
};

// Safe firestore read wrapper
export const safeFirestoreRead = async <T,>(promise: Promise<T>, timeoutMs = 2500): Promise<T | null> => {
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch (err) {
    console.warn('safeFirestoreRead notice:', err);
    return null;
  }
};

// Strips undefined fields so Firestore setDoc never throws 'Unsupported field value: undefined'
export const cleanUserObject = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const cleaned: Record<string, any> = {};
  if (!obj || typeof obj !== 'object') return cleaned as Partial<T>;
  Object.keys(obj).forEach((key) => {
    const val = obj[key];
    if (val !== undefined) {
      cleaned[key] = val;
    }
  });
  return cleaned as Partial<T>;
};

export const addCustomOwnerEmail = (email: string): void => {
  if (!email || !email.includes('@')) return;
  const norm = email.trim().toLowerCase();
  try {
    const existing = localStorage.getItem('lypetal_custom_owner_emails') || '';
    const set = new Set(existing.toLowerCase().split(/[,;]+/).map(s => s.trim()).filter(Boolean));
    set.add(norm);
    localStorage.setItem('lypetal_custom_owner_emails', Array.from(set).join(', '));
  } catch {}
};

export const checkIsOwnerEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  if (norm === 'colum00r@gmail.com' || norm === 'hanzgonzales125@gmail.com' || norm === 'allyson@lypetal.com') return true;
  if (norm.endsWith('@lypetal.com')) return true;
  try {
    const customOwners = localStorage.getItem('lypetal_custom_owner_emails');
    if (customOwners) {
      const list = customOwners.toLowerCase().split(/[,;]+/).map(s => s.trim());
      if (list.includes(norm)) return true;
    }
  } catch {}
  return false;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const inFlightRegistrationRef = useRef<CustomerUser | null>(null);

  const fetchProfileAndRole = async (currentUser: User) => {
    try {
      const emailNorm = (currentUser.email || '').trim().toLowerCase();
      const isOwner = checkIsOwnerEmail(emailNorm);

      // Fast-path: If user is actively signing up, use in-flight profile immediately without slow remote trips
      if (inFlightRegistrationRef.current && (inFlightRegistrationRef.current.email.toLowerCase() === emailNorm)) {
        const completed: CustomerUser = {
          ...inFlightRegistrationRef.current,
          id: currentUser.uid,
        };
        setUser(currentUser);
        setProfile(completed);
        setRole(completed.role || 'customer');
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(completed));
        setLoading(false);
        safeFirestoreWrite(setDoc(doc(db, 'customers', currentUser.uid), cleanUserObject(completed), { merge: true }), 2500).catch(() => {});
        try {
          set(ref(rtdb, `customers/${currentUser.uid}`), cleanUserObject(completed)).catch(() => {});
        } catch {}
        inFlightRegistrationRef.current = null;
        return;
      }

      const custRef = doc(db, 'customers', currentUser.uid);
      const adminRef = doc(db, 'admins', currentUser.uid);
      const settingsRef = doc(db, 'studioSettings', 'content');

      // Check existing local session first so completed profiles are NEVER wiped
      const savedSession = localStorage.getItem(LOCAL_SESSION_KEY);
      let localData: CustomerUser | null = null;
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession) as CustomerUser;
          if (parsed && (parsed.id === currentUser.uid || (parsed.email && parsed.email.toLowerCase() === emailNorm))) {
            localData = parsed;
          }
        } catch {}
      }

      const [custSnap, adminSnap, settingsSnap] = await Promise.all([
        safeFirestoreRead(getDoc(custRef), 2200),
        safeFirestoreRead(getDoc(adminRef), 2200),
        safeFirestoreRead(getDoc(settingsRef), 2200),
      ]);

      let isListedInSettings = false;
      if (settingsSnap && settingsSnap.exists()) {
        const sData = settingsSnap.data() as any;
        const configuredEmails = [sData?.twoFactorEmails, sData?.adminEmails, sData?.contactEmail]
          .filter(Boolean)
          .join(',')
          .toLowerCase()
          .split(/[,;]+/)
          .map((s: string) => s.trim());
        if (configuredEmails.includes(emailNorm)) {
          isListedInSettings = true;
        }
      }

      const isOwnerDetected = isOwner || 
        isListedInSettings ||
        (adminSnap && adminSnap.exists()) || 
        (custSnap && custSnap.exists() && custSnap.data()?.role === 'owner') ||
        (localData?.role === 'owner');

      if (isOwnerDetected) {
        setRole('owner');
        if (custSnap && custSnap.exists()) {
          const ownerData = { ...custSnap.data(), id: currentUser.uid, role: 'owner' } as CustomerUser;
          // Ensure real Google / customer names are preserved over generic fallback names
          const names = (currentUser.displayName || '').trim().split(' ');
          if (names[0] && ownerData.firstName === 'Studio' && ownerData.lastName === 'Owner') {
            ownerData.firstName = names[0];
            ownerData.lastName = names.slice(1).join(' ') || '';
          }
          setProfile(ownerData);
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(ownerData));
          safeFirestoreWrite(setDoc(adminRef, { email: currentUser.email || emailNorm, role: 'owner', createdAt: new Date().toISOString() }, { merge: true }), 2000).catch(() => {});
        } else {
          const names = (currentUser.displayName || '').trim().split(' ');
          const realFirstName = names[0] || (currentUser.email ? currentUser.email.split('@')[0] : 'Customer');
          const realLastName = names.slice(1).join(' ') || '';
          const isRealAllyson = emailNorm === 'allyson@lypetal.com' || (currentUser.displayName && currentUser.displayName.toLowerCase().includes('allyson'));
          
          const ownerProfile: CustomerUser = {
            id: currentUser.uid,
            firstName: isRealAllyson ? 'Allyson' : realFirstName,
            lastName: isRealAllyson ? '(Studio Owner)' : realLastName,
            email: currentUser.email || emailNorm,
            phone: localData?.phone || '+63 912 345 6789',
            address: localData?.address || 'LYPetal Studio, San Pedro, Laguna',
            role: 'owner',
            createdAt: new Date().toISOString(),
          };
          safeFirestoreWrite(setDoc(custRef, cleanUserObject(ownerProfile), { merge: true }), 2000).catch(() => {});
          safeFirestoreWrite(setDoc(adminRef, { email: ownerProfile.email, role: 'owner', createdAt: new Date().toISOString() }, { merge: true }), 2000).catch(() => {});
          try {
            set(ref(rtdb, `customers/${currentUser.uid}`), cleanUserObject(ownerProfile)).catch(() => {});
          } catch {}
          setProfile(ownerProfile);
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(ownerProfile));
        }
      } else if (custSnap && custSnap.exists()) {
        const firestoreData = custSnap.data() as CustomerUser;
        // Merge with localData so newly entered phone/address is preserved
        const activeProfile: CustomerUser = {
          ...firestoreData,
          id: currentUser.uid,
          firstName: firestoreData.firstName || localData?.firstName || 'Customer',
          lastName: firestoreData.lastName || localData?.lastName || 'Guest',
          phone: firestoreData.phone || localData?.phone || '',
          address: firestoreData.address || localData?.address || '',
          role: (firestoreData.role as UserRole) || 'customer',
        };
        if (firestoreData.age !== undefined && firestoreData.age !== null) {
          activeProfile.age = firestoreData.age;
        } else if (localData?.age !== undefined && localData?.age !== null) {
          activeProfile.age = localData.age;
        }
        setProfile(activeProfile);
        setRole(activeProfile.role || 'customer');
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(activeProfile));
        // Backfill to RTDB in case it wasn't there
        try {
          set(ref(rtdb, `customers/${currentUser.uid}`), cleanUserObject(activeProfile)).catch(() => {});
        } catch {}
      } else if (localData && (localData.address || localData.phone)) {
        // PRESERVE the user's completed profile from local storage!
        const restoredProfile: CustomerUser = {
          ...localData,
          id: currentUser.uid,
          email: emailNorm,
          role: 'customer',
        };
        setProfile(restoredProfile);
        setRole('customer');
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(restoredProfile));
        // Persist to Firestore & Realtime Database
        safeFirestoreWrite(setDoc(custRef, cleanUserObject(restoredProfile), { merge: true }), 2500).catch(() => {});
        try {
          set(ref(rtdb, `customers/${currentUser.uid}`), cleanUserObject(restoredProfile)).catch(() => {});
        } catch {}
      } else {
        // Fallback: check Realtime Database before falling back to empty fields
        let rtdbData: CustomerUser | null = null;
        try {
          const rtdbSnap = await Promise.race([
            get(ref(rtdb, `customers/${currentUser.uid}`)),
            new Promise<null>((res) => setTimeout(() => res(null), 1500))
          ]);
          if (rtdbSnap && (rtdbSnap as any).exists?.()) {
            rtdbData = (rtdbSnap as any).val() as CustomerUser;
          }
        } catch {}

        if (rtdbData && (rtdbData.address || rtdbData.phone)) {
          const synced: CustomerUser = { ...rtdbData, id: currentUser.uid, role: 'customer' };
          setProfile(synced);
          setRole('customer');
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(synced));
          safeFirestoreWrite(setDoc(custRef, cleanUserObject(synced), { merge: true }), 2000).catch(() => {});
          return;
        }

        // User has no existing database record or local profile -> leave profile null until registration is completed
        setProfile(null);
        setRole(null);
      }
    } catch (error) {
      console.error('Error fetching profile and role:', error);
      setRole('customer');
    }
  };

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!mounted) return;
      setUser(currentUser);

      if (currentUser) {
        await fetchProfileAndRole(currentUser);
      } else {
        // Check if we have a saved local session
        const savedSession = localStorage.getItem(LOCAL_SESSION_KEY);
        if (savedSession) {
          try {
            const parsed = JSON.parse(savedSession) as CustomerUser;
            if (parsed && parsed.id) {
              setProfile(parsed);
              setRole(parsed.role || (checkIsOwnerEmail(parsed.email) ? 'owner' : 'customer'));
              // Background refresh against Firestore
              safeFirestoreRead(getDoc(doc(db, 'customers', parsed.id)), 2000).then((snap) => {
                if (mounted && snap && snap.exists()) {
                  const data = snap.data() as CustomerUser;
                  // Only replace if Firestore has actual content
                  if (data.address || data.phone) {
                    setProfile(data);
                    setRole(data.role || (checkIsOwnerEmail(data.email) ? 'owner' : 'customer'));
                    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(data));
                  }
                }
              }).catch(() => {});
            }
          } catch {
            localStorage.removeItem(LOCAL_SESSION_KEY);
            setProfile(null);
            setRole(null);
          }
        } else {
          setProfile(null);
          setRole(null);
        }
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  /**
   * Sign In or Sign Up with Google.
   * Checks if an account already exists with full details.
   */
  const signInWithGoogle = async (): Promise<GoogleAuthResult> => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;
      const emailNorm = (googleUser.email || '').trim().toLowerCase();

      // Check existing customer record in Firestore, LocalStorage, and RTDB
      let existingProfile: CustomerUser | null = null;
      try {
        const custRef = doc(db, 'customers', googleUser.uid);
        const custSnap = await safeFirestoreRead(getDoc(custRef), 2200);
        if (custSnap && custSnap.exists()) {
          existingProfile = { ...custSnap.data(), id: googleUser.uid } as CustomerUser;
        } else {
          const q = query(collection(db, 'customers'), where('email', '==', emailNorm));
          const qSnap = await safeFirestoreRead(getDocs(q), 2200);
          if (qSnap && !qSnap.empty) {
            existingProfile = { ...qSnap.docs[0].data(), id: qSnap.docs[0].id } as CustomerUser;
          }
        }
      } catch (checkErr) {
        console.warn('Error checking existing customer profile in Firestore:', checkErr);
      }

      // Check LocalStorage fallback
      if (!existingProfile) {
        const savedSession = localStorage.getItem(LOCAL_SESSION_KEY);
        if (savedSession) {
          try {
            const parsed = JSON.parse(savedSession) as CustomerUser;
            if (parsed && (parsed.id === googleUser.uid || (parsed.email && parsed.email.toLowerCase() === emailNorm))) {
              existingProfile = parsed;
            }
          } catch {}
        }
      }

      // Check RTDB fallback
      if (!existingProfile) {
        try {
          const rtdbSnap = await Promise.race([
            get(ref(rtdb, `customers/${googleUser.uid}`)),
            new Promise<null>((res) => setTimeout(() => res(null), 1500))
          ]);
          if (rtdbSnap && (rtdbSnap as any).exists?.()) {
            existingProfile = (rtdbSnap as any).val() as CustomerUser;
          }
        } catch {}
      }

      const displayName = googleUser.displayName || '';
      const nameParts = displayName.trim().split(' ');
      const firstName = existingProfile?.firstName || nameParts[0] || '';
      const lastName = existingProfile?.lastName || nameParts.slice(1).join(' ') || '';

      const isAccountExisted = !!(
        existingProfile &&
        (existingProfile.username || existingProfile.phone || existingProfile.address || existingProfile.createdAt)
      );

      if (isAccountExisted) {
        // Account already exists in database -> log in directly without showing signup form
        await fetchProfileAndRole(googleUser);
        return {
          isNewUser: false,
          user: googleUser,
          profile: existingProfile || undefined,
          email: emailNorm,
          firstName,
          lastName,
        };
      } else {
        // Account does not exist in database yet -> direct user to complete registration form (username, phone, address)
        return {
          isNewUser: true,
          user: googleUser,
          profile: undefined,
          email: emailNorm,
          firstName,
          lastName,
        };
      }
    } catch (error: any) {
      console.error('Google Sign-In failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Complete sign up after authenticating with Google
   */
  const completeGoogleSignUp = async (data: {
    uid: string;
    username?: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    password?: string;
    age?: number;
  }): Promise<CustomerUser> => {
    setLoading(true);
    const emailNorm = data.email.trim().toLowerCase();
    const isOwner = checkIsOwnerEmail(emailNorm);
    const userRole: UserRole = isOwner ? 'owner' : 'customer';

    try {
      const customerRecord: CustomerUser & { passwordHash?: string } = {
        id: data.uid,
        username: data.username ? data.username.trim().toLowerCase() : undefined,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: emailNorm,
        phone: data.phone.trim(),
        address: data.address.trim(),
        passwordHash: data.password || undefined,
        age: data.age,
        role: userRole,
        createdAt: new Date().toISOString(),
      };

      // 1. Immediately update localStorage and state so user can proceed right away
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(customerRecord));
      setProfile(customerRecord);
      setRole(userRole);

      // 2. Resilient Firestore sync with safety timeout
      try {
        await safeFirestoreWrite(
          setDoc(doc(db, 'customers', data.uid), cleanUserObject(customerRecord), { merge: true }),
          2500
        );
        if (isOwner) {
          safeFirestoreWrite(
            setDoc(doc(db, 'admins', data.uid), {
              email: emailNorm,
              role: 'owner',
              createdAt: new Date().toISOString(),
            }, { merge: true }),
            2000
          ).catch(() => {});
        }
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.CREATE, `customers/${data.uid}`);
      }

      // 3. Also sync to Realtime Database
      try {
        set(ref(rtdb, `customers/${data.uid}`), cleanUserObject(customerRecord)).catch(() => {});
      } catch {
        // ignore
      }

      return customerRecord;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (data: SignUpData) => {
    setLoading(true);
    const emailNorm = data.email.trim().toLowerCase();
    const isOwner = checkIsOwnerEmail(emailNorm);
    const userRole: UserRole = isOwner ? 'owner' : 'customer';
    const password = data.password || 'petalPassword123!';

    const initialRecord: CustomerUser = {
      id: 'pending',
      username: data.username ? data.username.trim().toLowerCase() : undefined,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: emailNorm,
      phone: data.phone.trim(),
      address: data.address.trim(),
      role: userRole,
      createdAt: new Date().toISOString(),
    };
    if (data.age !== undefined && data.age !== null) {
      initialRecord.age = Number(data.age);
    }
    inFlightRegistrationRef.current = initialRecord;

    try {
      // 1. Try Firebase Auth first
      let firebaseUid: string | null = null;
      try {
        const cred = await createUserWithEmailAndPassword(auth, emailNorm, password);
        firebaseUid = cred.user.uid;
        try {
          await updateProfile(cred.user, {
            displayName: `${data.firstName} ${data.lastName}`,
          });
        } catch {
          // ignore profile update error
        }
      } catch (authErr: any) {
        console.warn('Firebase Auth direct signup notice:', authErr?.code || authErr?.message);
        if (authErr?.code === 'auth/email-already-in-use') {
          throw new Error('This email address is already registered. Please log in instead.');
        }
        if (
          authErr?.code !== 'auth/configuration-not-found' &&
          authErr?.code !== 'auth/operation-not-allowed' &&
          !authErr?.message?.includes('configuration-not-found') &&
          !authErr?.message?.includes('operation-not-allowed')
        ) {
          throw authErr;
        }
      }

      // 2. Generate unique Customer ID (from Firebase Auth UID or formatted ID)
      const customerId = firebaseUid || `cust_${(emailNorm || '').replace(/[^a-z0-9]/g, '_')}`;

      // 3. Create Customer Record
      const newCustomer: CustomerUser & { passwordHash?: string } = {
        id: customerId,
        username: data.username ? data.username.trim().toLowerCase() : undefined,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: emailNorm,
        phone: data.phone.trim(),
        address: data.address.trim(),
        age: data.age,
        role: userRole,
        passwordHash: password,
        createdAt: new Date().toISOString(),
      };

      // 4. Save local session immediately
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(newCustomer));
      setProfile(newCustomer);
      setRole(userRole);

      // 5. Sync to Firestore in non-blocking background
      safeFirestoreWrite(
        setDoc(doc(db, 'customers', customerId), cleanUserObject(newCustomer), { merge: true }),
        3000
      ).catch((dbErr) => {
        handleFirestoreError(dbErr, OperationType.CREATE, `customers/${customerId}`);
      });
      if (isOwner) {
        safeFirestoreWrite(
          setDoc(doc(db, 'admins', customerId), {
            email: emailNorm,
            role: 'owner',
            createdAt: new Date().toISOString(),
          }, { merge: true }),
          2000
        ).catch(() => {});
      }

      // 6. Also sync to Realtime Database
      try {
        set(ref(rtdb, `customers/${customerId}`), cleanUserObject(newCustomer)).catch(() => {});
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
    }
  };

  const logIn = async (identifier: string, password: string): Promise<CustomerUser> => {
    setLoading(true);
    const identifierNorm = identifier.trim().toLowerCase();
    const isOwner = checkIsOwnerEmail(identifierNorm);

    try {
      // 1. Try Firebase Auth if identifier contains @
      let firebaseUser: User | null = null;
      if (identifierNorm.includes('@')) {
        try {
          const cred = await signInWithEmailAndPassword(auth, identifierNorm, password);
          firebaseUser = cred.user;
          await fetchProfileAndRole(cred.user);
          const custRef = doc(db, 'customers', cred.user.uid);
          const custSnap = await safeFirestoreRead(getDoc(custRef), 2200);
          if (custSnap && custSnap.exists()) {
            const profileData = { id: cred.user.uid, ...custSnap.data() } as CustomerUser;
            localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(profileData));
            return profileData;
          }
        } catch (authErr: any) {
          if (authErr?.code === 'auth/wrong-password') {
            throw new Error('Incorrect password. Please try again.');
          }
        }
      }

      // 2. Query Firestore customers collection by email OR username
      const custDocId = `cust_${identifierNorm.replace(/[^a-z0-9]/g, '_')}`;
      let customerRecord: CustomerUser & { passwordHash?: string } | null = null;

      try {
        const qEmail = query(collection(db, 'customers'), where('email', '==', identifierNorm));
        const qSnapEmail = await safeFirestoreRead(getDocs(qEmail), 2200);
        if (qSnapEmail && !qSnapEmail.empty) {
          customerRecord = qSnapEmail.docs[0].data() as CustomerUser & { passwordHash?: string };
        } else {
          const qUser = query(collection(db, 'customers'), where('username', '==', identifierNorm));
          const qSnapUser = await safeFirestoreRead(getDocs(qUser), 2200);
          if (qSnapUser && !qSnapUser.empty) {
            customerRecord = qSnapUser.docs[0].data() as CustomerUser & { passwordHash?: string };
          } else {
            const directSnap = await safeFirestoreRead(getDoc(doc(db, 'customers', custDocId)), 2200);
            if (directSnap && directSnap.exists()) {
              customerRecord = directSnap.data() as CustomerUser & { passwordHash?: string };
            }
          }
        }
      } catch (queryErr) {
        console.warn('Customer query notice:', queryErr);
      }

      if (customerRecord) {
        if (customerRecord.passwordHash && customerRecord.passwordHash !== password) {
          throw new Error('Incorrect password. Please try again.');
        }

        const roleToAssign: UserRole = isOwner ? 'owner' : (customerRecord.role || 'customer');
        const activeProfile: CustomerUser = {
          ...customerRecord,
          role: roleToAssign,
        };

        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(activeProfile));
        setProfile(activeProfile);
        setRole(roleToAssign);
        return activeProfile;
      }

      // If user is owner logging in for the first time
      if (isOwner) {
        const ownerProfile: CustomerUser = {
          id: firebaseUser?.uid || custDocId,
          firstName: 'Allyson',
          lastName: '(Studio Owner)',
          email: identifierNorm,
          phone: '+63 912 345 6789',
          address: 'LYPetal Studio, San Pedro, Laguna',
          role: 'owner',
          createdAt: new Date().toISOString(),
        };

        safeFirestoreWrite(setDoc(doc(db, 'customers', ownerProfile.id), ownerProfile, { merge: true }), 2000).catch(() => {});
        safeFirestoreWrite(setDoc(doc(db, 'admins', ownerProfile.id), { email: identifierNorm, role: 'owner' }, { merge: true }), 2000).catch(() => {});

        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(ownerProfile));
        setProfile(ownerProfile);
        setRole('owner');
        return ownerProfile;
      }

      // 3. Check LocalStorage fallback
      const savedSession = localStorage.getItem(LOCAL_SESSION_KEY);
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession) as CustomerUser & { passwordHash?: string };
          if (parsed && (
            (parsed.email && parsed.email.toLowerCase() === identifierNorm) ||
            (parsed.username && parsed.username.toLowerCase() === identifierNorm)
          )) {
            if (parsed.passwordHash && parsed.passwordHash !== password) {
              throw new Error('Incorrect password. Please try again.');
            }
            setProfile(parsed);
            setRole(parsed.role || 'customer');
            return parsed;
          }
        } catch (e: any) {
          if (e?.message?.includes('Incorrect password')) throw e;
        }
      }

      throw new Error('NO_ACCOUNT_FOUND: No registered account found for this email or username.');
    } finally {
      setLoading(false);
    }
  };

  const logOut = async () => {
    setLoading(true);
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch {
          // ignore
        }
      }
      setUser(null);
      setProfile(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  const updateCustomerProfile = async (data: Partial<CustomerUser> & { password?: string }) => {
    const currentId = user?.uid || profile?.id;
    if (!currentId) return;

    const { password, ...profileFields } = data;

    // Immediately merge and update local profile and localStorage
    const updated = {
      ...(profile || {}),
      ...profileFields,
      id: currentId,
      email: profileFields.email || profile?.email || user?.email || '',
      role: profile?.role || 'customer',
      ...(password ? { passwordHash: password } : {}),
    } as CustomerUser & { passwordHash?: string };

    setProfile(updated);
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(updated));

    if (password && auth.currentUser) {
      try {
        await updatePassword(auth.currentUser, password);
      } catch (passErr) {
        console.warn('Firebase Auth password update notice:', passErr);
      }
    }

    try {
      const custRef = doc(db, 'customers', currentId);
      await safeFirestoreWrite(setDoc(custRef, cleanUserObject(updated), { merge: true }), 2500);
      try {
        set(ref(rtdb, `customers/${currentId}`), cleanUserObject(updated)).catch(() => {});
      } catch {
        // ignore
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `customers/${currentId}`);
    }
  };

  const authenticateAsRole = async (targetRole: 'customer' | 'owner') => {
    setLoading(true);
    try {
      if (targetRole === 'owner') {
        setRole('owner');
        if (!user) {
          const ownerProfile: CustomerUser = {
            id: 'owner_demo_allyson',
            firstName: 'Allyson',
            lastName: '(Studio Owner)',
            email: 'allyson@lypetal.com',
            phone: '+63 912 345 6789',
            address: 'LYPetal Studio, San Pedro, Laguna',
            role: 'owner',
            createdAt: new Date().toISOString(),
          };
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(ownerProfile));
          setProfile(ownerProfile);
        }
      } else {
        sessionStorage.removeItem('lypetal_owner_2fa_verified');
        if (user) {
          await fetchProfileAndRole(user);
        } else {
          const demoCustomer: CustomerUser = {
            id: 'customer_demo_maria',
            firstName: 'Maria',
            lastName: 'Santos',
            email: 'customer.lypetal@example.com',
            phone: '+63 917 555 1234',
            address: '14 Acacia Lane, Makati City, Metro Manila',
            age: 24,
            role: 'customer',
            createdAt: new Date().toISOString(),
          };
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(demoCustomer));
          setRole('customer');
          setProfile(demoCustomer);
        }
      }
    } catch (err) {
      console.warn('Fast auth evaluation notice:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        loading,
        signInWithGoogle,
        completeGoogleSignUp,
        signUp,
        logIn,
        logOut,
        updateCustomerProfile,
        authenticateAsRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
