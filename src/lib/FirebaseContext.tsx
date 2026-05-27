import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  getDocFromServer, 
  setDoc, 
  query, 
  writeBatch 
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { Student, SubjectInfo, DetailedSubjectStats, CollegeAdmission } from '../types';
import { SUBJECTS as LOCAL_SUBJECTS, STUDENTS as LOCAL_STUDENTS, ALL_STATS } from '../data';
import { HISTORICAL_GPAS as LOCAL_HISTORY } from '../historical_data';
import { ADMISSIONS_DATA as LOCAL_ADMISSIONS } from '../admissions_data';

// Connection test as per guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'config', 'subjects'));
    console.log("Firebase connection established.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.warn("Firestore client is offline.");
    }
  }
}
testConnection();

interface FirebaseContextType {
  students: Student[];
  subjects: SubjectInfo[];
  historicalGpas: { [key: string]: any };
  admissions: CollegeAdmission[];
  allStats: { [key: string]: DetailedSubjectStats };
  isLoading: boolean;
  user: User | null;
  isLegacyAdmin: boolean;
  signIn: () => Promise<void>;
  adminLogin: (id: string, pw: string) => boolean;
  signOut: () => Promise<void>;
  updateStudent: (student: Student) => Promise<void>;
  updateSubject: (subject: SubjectInfo) => Promise<void>;
  updateAdmission: (admission: CollegeAdmission) => Promise<void>;
  updateHistory: (studentId: string, history: any) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>(LOCAL_STUDENTS);
  const [subjects, setSubjects] = useState<SubjectInfo[]>(LOCAL_SUBJECTS);
  const [historicalGpas, setHistoricalGpas] = useState<{ [key: string]: any }>(LOCAL_HISTORY);
  const [admissions, setAdmissions] = useState<CollegeAdmission[]>(LOCAL_ADMISSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(true); // Set to true by default since we have local data
  const [user, setUser] = useState<User | null>(null);
  const [isLegacyAdmin, setIsLegacyAdmin] = useState(() => {
    return localStorage.getItem('isLegacyAdmin') === 'true';
  });

  const fetchIdRef = React.useRef(0);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  const adminLogin = (id: string, pw: string) => {
    if (id === "여수고1학년실" && pw === "123456789") {
      setIsLegacyAdmin(true);
      localStorage.setItem('isLegacyAdmin', 'true');
      return true;
    }
    return false;
  };

  const signOut = async () => {
    try {
      await auth.signOut();
      setIsLegacyAdmin(false);
      localStorage.removeItem('isLegacyAdmin');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const updateStudent = async (student: Student) => {
    try {
      await setDoc(doc(db, 'students', student.id), student);
      setStudents(prev => prev.map(s => s.id === student.id ? student : s));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${student.id}`);
    }
  };

  const updateSubject = async (subject: SubjectInfo) => {
    try {
      await setDoc(doc(db, 'config/subjects/list', subject.id), subject);
      setSubjects(prev => prev.map(s => s.id === subject.id ? subject : s));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `config/subjects/list/${subject.id}`);
    }
  };

  const updateAdmission = async (admission: CollegeAdmission) => {
    try {
      await setDoc(doc(db, 'college_admissions', admission.id), admission);
      setAdmissions(prev => prev.map(a => a.id === admission.id ? admission : a));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `college_admissions/${admission.id}`);
    }
  };

  const updateHistory = async (studentId: string, history: any) => {
    try {
      await setDoc(doc(db, 'historical_data', studentId), history);
      setHistoricalGpas(prev => ({ ...prev, [studentId]: history }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `historical_data/${studentId}`);
    }
  };

  const allStats = useMemo(() => {
    const stats: { [key: string]: DetailedSubjectStats } = {};
    if (subjects.length === 0 || students.length === 0) return ALL_STATS; // Fallback to ALL_STATS if empty

    subjects.forEach(sub => {
      const scores = students.map(s => s.scores[sub.id]).filter((s): s is number => s !== null);
      const sortedScores = [...scores].sort((a, b) => b - a);
      const total = scores.length;
      const avg = total > 0 ? (scores.reduce((a, b) => a + b, 0) / total).toFixed(1) : "0";

      const getCut = (sorted: number[], total: number, pct: number) => {
        if (total === 0) return 0;
        const idx = Math.min(Math.ceil(total * (pct / 100)) - 1, total - 1);
        return sorted[idx];
      };

      const cuts5 = {
        1: getCut(sortedScores, total, 10),
        2: getCut(sortedScores, total, 34),
        3: getCut(sortedScores, total, 66),
        4: getCut(sortedScores, total, 90),
        5: getCut(sortedScores, total, 100),
      };

      const cuts9 = {
        1: getCut(sortedScores, total, 4),
        2: getCut(sortedScores, total, 11),
        3: getCut(sortedScores, total, 23),
        4: getCut(sortedScores, total, 40),
        5: getCut(sortedScores, total, 60),
        6: getCut(sortedScores, total, 77),
        7: getCut(sortedScores, total, 89),
        8: getCut(sortedScores, total, 96),
        9: getCut(sortedScores, total, 100),
      };

      const studentStats: { [studentId: string]: any } = {};
      students.forEach(student => {
        const score = student.scores[sub.id];
        if (score !== null && score !== undefined) {
          const rank = sortedScores.filter(s => s > score).length + 1;
          const sameScoreCount = sortedScores.filter(s => s === score).length;
          const midRank = rank + (sameScoreCount - 1) / 2;

          const getGrade = (mRank: number, totalCount: number, boundaries: number[]) => {
            for (let i = 0; i < boundaries.length; i++) {
              if (mRank <= Math.ceil((totalCount * boundaries[i]) / 100)) {
                return i + 1;
              }
            }
            return boundaries.length + 1;
          };

          const grade9Boundaries = [4, 11, 23, 40, 60, 77, 89, 96];
          const grade5Boundaries = [10, 34, 66, 90];

          const grade = getGrade(midRank, total, grade9Boundaries);
          const grade5 = getGrade(midRank, total, grade5Boundaries);

          studentStats[student.id] = {
            score,
            rank,
            percentile: parseFloat(((midRank / total) * 100).toFixed(1)),
            grade,
            grade5,
          };
        } else {
          studentStats[student.id] = {
            score: null,
            rank: null,
            percentile: null,
            grade: null,
            grade5: null,
          };
        }
      });

      stats[sub.id] = {
        id: sub.id,
        name: sub.name,
        average: parseFloat(avg),
        totalStudents: total,
        cuts5,
        cuts9,
        studentStats,
      };
    });
    return stats;
  }, [students, subjects]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const currentFetchId = ++fetchIdRef.current;
    
    async function fetchData() {
      console.log("Starting data fetch...");
      try {
        let needsResetAndReseed = false;
        
        // 1. Check if the current database has old 2nd-grade data
        const subjectPath = 'config/subjects/list';
        const studentPath = 'students';
        const historyPath = 'historical_data';
        
        let fetchedSubjectsSnapshot = await getDocs(collection(db, subjectPath));
        let fetchedStudentsSnapshot = await getDocs(collection(db, studentPath));
        
        if (!fetchedSubjectsSnapshot.empty) {
          const ids = fetchedSubjectsSnapshot.docs.map(d => d.id);
          if (ids.includes('lit')) {
            needsResetAndReseed = true;
          }
        }
        if (!fetchedStudentsSnapshot.empty) {
          const firstStudent = fetchedStudentsSnapshot.docs[0]?.data();
          if (firstStudent && firstStudent.class && firstStudent.class.startsWith('2학년')) {
            needsResetAndReseed = true;
          }
          const hasOldNamesSuffix = fetchedStudentsSnapshot.docs.some(d => {
            const data = d.data();
            return data.name === "이규성2" || data.name === "박준서4" || data.name === "이규성7" || data.name === "박준서8";
          });
          if (hasOldNamesSuffix) {
            needsResetAndReseed = true;
          }
        }
        
        // Clean up database if 2nd-grade data detected
        if (needsResetAndReseed) {
          console.log("Old 2nd-grade data detected in Firestore. Resetting and seeding 1st-grade data...");
          
          const deleteBatch1 = writeBatch(db);
          if (!fetchedSubjectsSnapshot.empty) {
            fetchedSubjectsSnapshot.docs.forEach(d => deleteBatch1.delete(d.ref));
          }
          if (!fetchedStudentsSnapshot.empty) {
            fetchedStudentsSnapshot.docs.forEach(d => deleteBatch1.delete(d.ref));
          }
          const historySnap = await getDocs(collection(db, historyPath));
          if (!historySnap.empty) {
            historySnap.docs.forEach(d => deleteBatch1.delete(d.ref));
          }
          try {
            await deleteBatch1.commit();
            console.log("Deleted old data successfully. Now seeding...");
          } catch (err) {
            console.error("Failed to delete old data:", err);
          }
          
          // Seed new 1st-grade data
          const seedBatch = writeBatch(db);
          LOCAL_SUBJECTS.forEach(sub => {
            seedBatch.set(doc(db, subjectPath, sub.id), sub);
          });
          LOCAL_STUDENTS.forEach(s => {
            seedBatch.set(doc(db, studentPath, s.id), s);
          });
          
          try {
            await seedBatch.commit();
            console.log("Seeded new 1st-grade subjects and students successfully.");
          } catch (err) {
            console.error("Failed to seed new data:", err);
          }
          
          // Refresh snapshots
          fetchedSubjectsSnapshot = await getDocs(collection(db, subjectPath));
          fetchedStudentsSnapshot = await getDocs(collection(db, studentPath));
        }

        const batch = writeBatch(db);
        let needsSeeding = false;

        // Fetch Subjects
        let fetchedSubjects: SubjectInfo[] = [];
        if (fetchedSubjectsSnapshot.empty) {
          needsSeeding = true;
          for (const sub of LOCAL_SUBJECTS) { batch.set(doc(db, subjectPath, sub.id), sub); }
          fetchedSubjects = LOCAL_SUBJECTS;
        } else {
          fetchedSubjects = fetchedSubjectsSnapshot.docs.map(d => d.data() as SubjectInfo);
        }

        // Fetch Students
        let fetchedStudents: Student[] = [];
        if (fetchedStudentsSnapshot.empty) {
          needsSeeding = true;
          for (const s of LOCAL_STUDENTS) { batch.set(doc(db, studentPath, s.id), s); }
          fetchedStudents = LOCAL_STUDENTS;
        } else {
          fetchedStudents = fetchedStudentsSnapshot.docs.map(d => d.data() as Student);
        }

        // History: 1st grade has no history, so fetchedHistory is empty
        let fetchedHistory: any = {};

        // 4. Fetch Admissions
        const admissionsPath = 'college_admissions';
        let fetchedAdmissions: CollegeAdmission[] = [];
        try {
          const admissionsSnap = await getDocs(collection(db, admissionsPath));
          if (admissionsSnap.empty) {
            needsSeeding = true;
            for (const adm of LOCAL_ADMISSIONS) { batch.set(doc(db, admissionsPath, adm.id), adm); }
            fetchedAdmissions = LOCAL_ADMISSIONS;
          } else {
            fetchedAdmissions = admissionsSnap.docs.map(d => d.data() as CollegeAdmission);
          }
        } catch (error) {
          console.warn("Using local admissions:", error);
          fetchedAdmissions = LOCAL_ADMISSIONS;
        }

        if (currentFetchId === fetchIdRef.current) {
          setSubjects(fetchedSubjects);
          setStudents(fetchedStudents.sort((a,b) => a.id.localeCompare(b.id)));
          setHistoricalGpas(fetchedHistory);
          setAdmissions(fetchedAdmissions);
          setDataLoaded(true);

          if (needsSeeding && auth.currentUser && !auth.currentUser.isAnonymous) {
            batch.commit().catch(e => console.error("Seeding failed:", e));
          }
        }
      } catch (error) {
        console.error("General Fetching Error:", error);
        if (currentFetchId === fetchIdRef.current) {
          setSubjects(LOCAL_SUBJECTS);
          setStudents(LOCAL_STUDENTS);
          setHistoricalGpas({});
          setAdmissions(LOCAL_ADMISSIONS);
          setDataLoaded(true);
        }
      } finally {
        if (currentFetchId === fetchIdRef.current) {
          setIsLoading(false);
        }
      }
    }

    fetchData();
  }, [user]);

  return (
    <FirebaseContext.Provider value={{ 
      students, 
      subjects, 
      historicalGpas, 
      admissions, 
      allStats, 
      isLoading: !dataLoaded, 
      user, 
      isLegacyAdmin,
      signIn, 
      adminLogin,
      signOut,
      updateStudent,
      updateSubject,
      updateAdmission,
      updateHistory
    }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}
